/**
 * SQLite database for niws-delivery persistence.
 *
 * Stores:
 * - Workflow runs and their logs
 * - Pending actions (approvals, notifications)
 * - Video jobs and their status
 */

import Database from 'better-sqlite3';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { mkdirSync, existsSync } from 'fs';
import type { WorkflowRun, VideoJob, WorkflowLog, PendingAction } from '../types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Safely parse JSON with fallback on error.
 * Prevents server crashes from malformed database data.
 */
function safeJsonParse<T>(json: string | null, fallback: T): T {
  if (!json) return fallback;
  try {
    return JSON.parse(json);
  } catch {
    console.warn('[Database] Failed to parse JSON, using fallback');
    return fallback;
  }
}

export class DatabaseManager {
  private db: Database.Database;

  constructor(dbPath?: string) {
    // Compute final path with fallback
    const finalPath = dbPath || join(__dirname, '..', '..', 'data', 'niws-delivery.db');

    // Ensure data directory exists
    const dbDir = dirname(finalPath);
    if (!existsSync(dbDir)) {
      mkdirSync(dbDir, { recursive: true });
    }

    // Initialize database
    this.db = new Database(finalPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('cache_size = 2000');
    this.db.pragma('foreign_keys = ON');

    this.initializeSchema();
  }

  private initializeSchema(): void {
    const schema = `
      -- Workflow runs
      CREATE TABLE IF NOT EXISTS workflow_runs (
        id TEXT PRIMARY KEY,
        workflow_type TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        current_step TEXT,
        started_at INTEGER NOT NULL,
        completed_at INTEGER,
        error TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_workflow_runs_status ON workflow_runs(status);
      CREATE INDEX IF NOT EXISTS idx_workflow_runs_type ON workflow_runs(workflow_type);

      -- Workflow logs
      CREATE TABLE IF NOT EXISTS workflow_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        run_id TEXT NOT NULL,
        level TEXT NOT NULL,
        message TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        FOREIGN KEY (run_id) REFERENCES workflow_runs(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_workflow_logs_run_id ON workflow_logs(run_id);

      -- Pending actions (approvals, notifications)
      CREATE TABLE IF NOT EXISTS pending_actions (
        id TEXT PRIMARY KEY,
        run_id TEXT,
        type TEXT NOT NULL,
        description TEXT NOT NULL,
        story_id TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        created_at INTEGER NOT NULL,
        resolved_at INTEGER,
        FOREIGN KEY (run_id) REFERENCES workflow_runs(id) ON DELETE SET NULL
      );

      CREATE INDEX IF NOT EXISTS idx_pending_actions_status ON pending_actions(status);
      CREATE INDEX IF NOT EXISTS idx_pending_actions_run_id ON pending_actions(run_id);

      -- Video jobs
      CREATE TABLE IF NOT EXISTS video_jobs (
        id TEXT PRIMARY KEY,
        script_id TEXT,
        story_id TEXT,
        status TEXT NOT NULL DEFAULT 'queued',
        progress INTEGER NOT NULL DEFAULT 0,
        platforms TEXT,
        config TEXT,
        output_path TEXT,
        error TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        completed_at INTEGER
      );

      CREATE INDEX IF NOT EXISTS idx_video_jobs_status ON video_jobs(status);
      CREATE INDEX IF NOT EXISTS idx_video_jobs_script_id ON video_jobs(script_id);
    `;

    this.db.exec(schema);
  }

  // ==================== Workflow Runs ====================

  insertWorkflowRun(run: Omit<WorkflowRun, 'logs'>): void {
    const stmt = this.db.prepare(`
      INSERT INTO workflow_runs (id, workflow_type, status, current_step, started_at, completed_at, error)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      run.id,
      run.workflowType,
      run.status,
      run.currentStep || null,
      new Date(run.startedAt).getTime(),
      run.completedAt ? new Date(run.completedAt).getTime() : null,
      run.error || null
    );
  }

  getWorkflowRun(id: string): WorkflowRun | undefined {
    const stmt = this.db.prepare('SELECT * FROM workflow_runs WHERE id = ?');
    const row = stmt.get(id) as DatabaseWorkflowRun | undefined;

    if (!row) return undefined;

    return this.rowToWorkflowRun(row);
  }

  getActiveWorkflowRun(): WorkflowRun | undefined {
    const stmt = this.db.prepare(
      "SELECT * FROM workflow_runs WHERE status IN ('running', 'paused') ORDER BY started_at DESC LIMIT 1"
    );
    const row = stmt.get() as DatabaseWorkflowRun | undefined;

    if (!row) return undefined;

    return this.rowToWorkflowRun(row);
  }

  updateWorkflowRun(id: string, updates: Partial<Pick<WorkflowRun, 'status' | 'currentStep' | 'completedAt' | 'error'>>): boolean {
    const fields: string[] = [];
    const values: unknown[] = [];

    if (updates.status !== undefined) {
      fields.push('status = ?');
      values.push(updates.status);
    }
    if (updates.currentStep !== undefined) {
      fields.push('current_step = ?');
      values.push(updates.currentStep);
    }
    if (updates.completedAt !== undefined) {
      fields.push('completed_at = ?');
      values.push(new Date(updates.completedAt).getTime());
    }
    if (updates.error !== undefined) {
      fields.push('error = ?');
      values.push(updates.error);
    }

    if (fields.length === 0) return false;

    values.push(id);
    const stmt = this.db.prepare(
      `UPDATE workflow_runs SET ${fields.join(', ')} WHERE id = ?`
    );
    const result = stmt.run(...values);
    return result.changes > 0;
  }

  listWorkflowRuns(limit: number = 50, status?: string): WorkflowRun[] {
    let query = 'SELECT * FROM workflow_runs WHERE 1=1';
    const params: (string | number)[] = [];

    if (status) {
      query += ' AND status = ?';
      params.push(status);
    }

    query += ' ORDER BY started_at DESC LIMIT ?';
    params.push(limit);

    const stmt = this.db.prepare(query);
    const rows = stmt.all(...params) as DatabaseWorkflowRun[];

    return rows.map(row => this.rowToWorkflowRun(row));
  }

  private rowToWorkflowRun(row: DatabaseWorkflowRun): WorkflowRun {
    const logs = this.getWorkflowLogs(row.id);
    return {
      id: row.id,
      workflowType: row.workflow_type as 'overnight' | 'morning',
      status: row.status as WorkflowRun['status'],
      currentStep: row.current_step || undefined,
      startedAt: new Date(row.started_at).toISOString(),
      completedAt: row.completed_at ? new Date(row.completed_at).toISOString() : undefined,
      error: row.error || undefined,
      logs
    };
  }

  // ==================== Workflow Logs ====================

  insertWorkflowLog(runId: string, level: WorkflowLog['level'], message: string): void {
    const stmt = this.db.prepare(`
      INSERT INTO workflow_logs (run_id, level, message, timestamp)
      VALUES (?, ?, ?, ?)
    `);
    stmt.run(runId, level, message, Date.now());
  }

  getWorkflowLogs(runId: string): WorkflowLog[] {
    const stmt = this.db.prepare(
      'SELECT * FROM workflow_logs WHERE run_id = ? ORDER BY timestamp ASC'
    );
    const rows = stmt.all(runId) as DatabaseWorkflowLog[];

    return rows.map(row => ({
      level: row.level as WorkflowLog['level'],
      message: row.message,
      timestamp: new Date(row.timestamp).toISOString()
    }));
  }

  // ==================== Pending Actions ====================

  insertPendingAction(action: PendingAction): void {
    const stmt = this.db.prepare(`
      INSERT INTO pending_actions (id, run_id, type, description, story_id, status, created_at, resolved_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      action.id,
      action.runId || null,
      action.type,
      action.description,
      action.storyId || null,
      action.status,
      new Date(action.createdAt).getTime(),
      action.resolvedAt ? new Date(action.resolvedAt).getTime() : null
    );
  }

  getPendingAction(id: string): PendingAction | undefined {
    const stmt = this.db.prepare('SELECT * FROM pending_actions WHERE id = ?');
    const row = stmt.get(id) as DatabasePendingAction | undefined;

    if (!row) return undefined;

    return this.rowToPendingAction(row);
  }

  listPendingActions(status: string = 'pending'): PendingAction[] {
    const stmt = this.db.prepare(
      'SELECT * FROM pending_actions WHERE status = ? ORDER BY created_at DESC'
    );
    const rows = stmt.all(status) as DatabasePendingAction[];

    return rows.map(row => this.rowToPendingAction(row));
  }

  updatePendingAction(id: string, status: string, resolvedAt?: string): boolean {
    const stmt = this.db.prepare(`
      UPDATE pending_actions SET status = ?, resolved_at = ? WHERE id = ?
    `);
    const result = stmt.run(status, resolvedAt ? new Date(resolvedAt).getTime() : null, id);
    return result.changes > 0;
  }

  private rowToPendingAction(row: DatabasePendingAction): PendingAction {
    return {
      id: row.id,
      runId: row.run_id || undefined,
      type: row.type as PendingAction['type'],
      description: row.description,
      storyId: row.story_id || undefined,
      status: row.status as PendingAction['status'],
      createdAt: new Date(row.created_at).toISOString(),
      resolvedAt: row.resolved_at ? new Date(row.resolved_at).toISOString() : undefined
    };
  }

  // ==================== Video Jobs ====================

  insertVideoJob(job: VideoJob): void {
    const stmt = this.db.prepare(`
      INSERT INTO video_jobs (id, script_id, story_id, status, progress, platforms, config, output_path, error, created_at, updated_at, completed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      job.id,
      job.scriptId || null,
      job.storyId || null,
      job.status,
      job.progress || 0,
      job.platforms ? JSON.stringify(job.platforms) : null,
      job.config ? JSON.stringify(job.config) : null,
      job.outputPath || null,
      job.error || null,
      new Date(job.createdAt).getTime(),
      Date.now(),
      job.completedAt ? new Date(job.completedAt).getTime() : null
    );
  }

  getVideoJob(id: string): VideoJob | undefined {
    const stmt = this.db.prepare('SELECT * FROM video_jobs WHERE id = ?');
    const row = stmt.get(id) as DatabaseVideoJob | undefined;

    if (!row) return undefined;

    return this.rowToVideoJob(row);
  }

  updateVideoJob(id: string, updates: Partial<Pick<VideoJob, 'status' | 'progress' | 'outputPath' | 'error' | 'completedAt'>>): boolean {
    const fields: string[] = ['updated_at = ?'];
    const values: unknown[] = [Date.now()];

    if (updates.status !== undefined) {
      fields.push('status = ?');
      values.push(updates.status);
    }
    if (updates.progress !== undefined) {
      fields.push('progress = ?');
      values.push(updates.progress);
    }
    if (updates.outputPath !== undefined) {
      fields.push('output_path = ?');
      values.push(updates.outputPath);
    }
    if (updates.error !== undefined) {
      fields.push('error = ?');
      values.push(updates.error);
    }
    if (updates.completedAt !== undefined) {
      fields.push('completed_at = ?');
      values.push(new Date(updates.completedAt).getTime());
    }

    values.push(id);
    const stmt = this.db.prepare(
      `UPDATE video_jobs SET ${fields.join(', ')} WHERE id = ?`
    );
    const result = stmt.run(...values);
    return result.changes > 0;
  }

  listVideoJobs(limit: number = 50, status?: string): VideoJob[] {
    let query = 'SELECT * FROM video_jobs WHERE 1=1';
    const params: (string | number)[] = [];

    if (status) {
      query += ' AND status = ?';
      params.push(status);
    }

    query += ' ORDER BY created_at DESC LIMIT ?';
    params.push(limit);

    const stmt = this.db.prepare(query);
    const rows = stmt.all(...params) as DatabaseVideoJob[];

    return rows.map(row => this.rowToVideoJob(row));
  }

  getIncompleteVideoJobs(): VideoJob[] {
    const stmt = this.db.prepare(
      "SELECT * FROM video_jobs WHERE status IN ('queued', 'processing') ORDER BY created_at ASC"
    );
    const rows = stmt.all() as DatabaseVideoJob[];

    return rows.map(row => this.rowToVideoJob(row));
  }

  private rowToVideoJob(row: DatabaseVideoJob): VideoJob {
    return {
      id: row.id,
      scriptId: row.script_id || undefined,
      storyId: row.story_id || undefined,
      status: row.status as VideoJob['status'],
      progress: row.progress,
      platforms: safeJsonParse<string[] | undefined>(row.platforms, undefined),
      config: safeJsonParse<Record<string, unknown> | undefined>(row.config, undefined),
      outputPath: row.output_path || undefined,
      error: row.error || undefined,
      createdAt: new Date(row.created_at).toISOString(),
      completedAt: row.completed_at ? new Date(row.completed_at).toISOString() : undefined
    };
  }

  // ==================== Stats & Cleanup ====================

  getStats(): {
    workflow_runs: { total: number; by_status: Record<string, number> };
    video_jobs: { total: number; by_status: Record<string, number> };
    pending_actions: { total: number; by_status: Record<string, number> };
  } {
    const workflowTotal = (this.db.prepare('SELECT COUNT(*) as count FROM workflow_runs').get() as { count: number }).count;
    const workflowByStatus: Record<string, number> = {};
    const workflowStatuses = this.db.prepare('SELECT status, COUNT(*) as count FROM workflow_runs GROUP BY status').all() as Array<{ status: string; count: number }>;
    for (const s of workflowStatuses) {
      workflowByStatus[s.status] = s.count;
    }

    const videoTotal = (this.db.prepare('SELECT COUNT(*) as count FROM video_jobs').get() as { count: number }).count;
    const videoByStatus: Record<string, number> = {};
    const videoStatuses = this.db.prepare('SELECT status, COUNT(*) as count FROM video_jobs GROUP BY status').all() as Array<{ status: string; count: number }>;
    for (const s of videoStatuses) {
      videoByStatus[s.status] = s.count;
    }

    const actionTotal = (this.db.prepare('SELECT COUNT(*) as count FROM pending_actions').get() as { count: number }).count;
    const actionByStatus: Record<string, number> = {};
    const actionStatuses = this.db.prepare('SELECT status, COUNT(*) as count FROM pending_actions GROUP BY status').all() as Array<{ status: string; count: number }>;
    for (const s of actionStatuses) {
      actionByStatus[s.status] = s.count;
    }

    return {
      workflow_runs: { total: workflowTotal, by_status: workflowByStatus },
      video_jobs: { total: videoTotal, by_status: videoByStatus },
      pending_actions: { total: actionTotal, by_status: actionByStatus }
    };
  }

  cleanupOldData(retentionDays: number = 30): { deleted_runs: number; deleted_jobs: number } {
    const cutoff = Date.now() - (retentionDays * 24 * 60 * 60 * 1000);

    // Delete old completed workflow runs (cascades to logs)
    const runResult = this.db.prepare(
      "DELETE FROM workflow_runs WHERE status IN ('complete', 'failed', 'cancelled') AND started_at < ?"
    ).run(cutoff);

    // Delete old completed video jobs
    const jobResult = this.db.prepare(
      "DELETE FROM video_jobs WHERE status IN ('complete', 'failed') AND created_at < ?"
    ).run(cutoff);

    return {
      deleted_runs: runResult.changes,
      deleted_jobs: jobResult.changes
    };
  }

  close(): void {
    this.db.close();
  }
}

// Database row types
interface DatabaseWorkflowRun {
  id: string;
  workflow_type: string;
  status: string;
  current_step: string | null;
  started_at: number;
  completed_at: number | null;
  error: string | null;
}

interface DatabaseWorkflowLog {
  id: number;
  run_id: string;
  level: string;
  message: string;
  timestamp: number;
}

interface DatabasePendingAction {
  id: string;
  run_id: string | null;
  type: string;
  description: string;
  story_id: string | null;
  status: string;
  created_at: number;
  resolved_at: number | null;
}

interface DatabaseVideoJob {
  id: string;
  script_id: string | null;
  story_id: string | null;
  status: string;
  progress: number;
  platforms: string | null;
  config: string | null;
  output_path: string | null;
  error: string | null;
  created_at: number;
  updated_at: number;
  completed_at: number | null;
}

// Singleton pattern
let dbInstance: DatabaseManager | null = null;

export function getDatabase(dbPath?: string): DatabaseManager {
  if (!dbInstance) {
    dbInstance = new DatabaseManager(dbPath);
  } else if (dbPath) {
    console.warn('[Database] getDatabase called with dbPath after initialization - ignoring. Call closeDatabase() first to reinitialize.');
  }
  return dbInstance;
}

export function closeDatabase(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}

export function initDatabase(dbPath?: string): DatabaseManager {
  return getDatabase(dbPath);
}
