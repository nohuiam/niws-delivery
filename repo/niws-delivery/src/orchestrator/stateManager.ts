/**
 * Workflow state manager with SQLite persistence.
 *
 * Persists workflow runs, logs, and pending actions to database
 * so state survives server restarts.
 */

import type { WorkflowRun, WorkflowLog, PendingAction } from '../types.js';
import { getDatabase } from '../database/schema.js';

class StateManager {
  private currentRunId: string | null = null;
  private pausePromise: { resolve: () => void } | null = null;

  /**
   * Initialize state manager and restore any active workflow from database.
   */
  initialize(): void {
    const db = getDatabase();
    const activeRun = db.getActiveWorkflowRun();

    if (activeRun) {
      console.log(`[StateManager] Found active workflow: ${activeRun.id} (${activeRun.status})`);
      this.currentRunId = activeRun.id;

      if (activeRun.status === 'running') {
        // Running workflows become failed on restart - they were interrupted
        this.fail('Server restarted during workflow execution');
      } else if (activeRun.status === 'paused') {
        // Paused workflows remain paused - user can resume later
        console.log(`[StateManager] Workflow ${activeRun.id} is paused - can be resumed`);
      }
    }
  }

  startRun(workflowType: 'overnight' | 'morning'): WorkflowRun {
    const db = getDatabase();

    // Check for existing active run
    const existingRun = db.getActiveWorkflowRun();
    if (existingRun && existingRun.status === 'running') {
      throw new Error('A workflow is already running');
    }

    const run: Omit<WorkflowRun, 'logs'> = {
      id: `run_${Date.now()}`,
      workflowType,
      status: 'running',
      currentStep: 'init',
      startedAt: new Date().toISOString()
    };

    db.insertWorkflowRun(run);
    db.insertWorkflowLog(run.id, 'info', 'Workflow started');

    this.currentRunId = run.id;

    return { ...run, logs: [] };
  }

  getCurrentRun(): WorkflowRun | null {
    if (!this.currentRunId) return null;

    const db = getDatabase();
    return db.getWorkflowRun(this.currentRunId) || null;
  }

  updateStep(step: string): void {
    if (!this.currentRunId) return;

    const db = getDatabase();
    db.updateWorkflowRun(this.currentRunId, { currentStep: step });
  }

  log(level: 'info' | 'warn' | 'error', message: string, _data?: unknown): void {
    if (!this.currentRunId) return;

    const db = getDatabase();
    db.insertWorkflowLog(this.currentRunId, level, message);
  }

  async pauseIfRequested(): Promise<void> {
    const run = this.getCurrentRun();
    if (run?.status === 'paused') {
      await new Promise<void>((resolve) => {
        this.pausePromise = { resolve };
      });
    }
  }

  pause(): boolean {
    if (!this.currentRunId) return false;

    const db = getDatabase();
    const run = db.getWorkflowRun(this.currentRunId);

    if (run && run.status === 'running') {
      db.updateWorkflowRun(this.currentRunId, { status: 'paused' });
      db.insertWorkflowLog(this.currentRunId, 'info', 'Workflow paused');
      return true;
    }
    return false;
  }

  resume(): boolean {
    if (!this.currentRunId) return false;

    const db = getDatabase();
    const run = db.getWorkflowRun(this.currentRunId);

    if (run && run.status === 'paused') {
      db.updateWorkflowRun(this.currentRunId, { status: 'running' });
      db.insertWorkflowLog(this.currentRunId, 'info', 'Workflow resumed');

      if (this.pausePromise) {
        this.pausePromise.resolve();
        this.pausePromise = null;
      }
      return true;
    }
    return false;
  }

  complete(): void {
    if (!this.currentRunId) return;

    const db = getDatabase();
    const completedAt = new Date().toISOString();

    db.insertWorkflowLog(this.currentRunId, 'info', 'Workflow completed');
    db.updateWorkflowRun(this.currentRunId, {
      status: 'complete',
      completedAt
    });

    this.currentRunId = null;
  }

  fail(error: string): void {
    if (!this.currentRunId) return;

    const db = getDatabase();
    const completedAt = new Date().toISOString();

    db.insertWorkflowLog(this.currentRunId, 'error', `Workflow failed: ${error}`);
    db.updateWorkflowRun(this.currentRunId, {
      status: 'failed',
      completedAt,
      error
    });

    this.currentRunId = null;
  }

  cancel(): boolean {
    if (!this.currentRunId) return false;

    const db = getDatabase();
    const run = db.getWorkflowRun(this.currentRunId);

    if (run && (run.status === 'running' || run.status === 'paused')) {
      const completedAt = new Date().toISOString();

      db.insertWorkflowLog(this.currentRunId, 'info', 'Workflow cancelled');
      db.updateWorkflowRun(this.currentRunId, {
        status: 'cancelled',
        completedAt
      });

      if (this.pausePromise) {
        this.pausePromise.resolve();
        this.pausePromise = null;
      }

      this.currentRunId = null;
      return true;
    }
    return false;
  }

  getHistory(limit: number = 50): WorkflowRun[] {
    const db = getDatabase();
    return db.listWorkflowRuns(limit);
  }

  // ==================== Pending Actions ====================

  addPendingAction(action: Omit<PendingAction, 'id' | 'createdAt' | 'status'>): string {
    const db = getDatabase();

    const id = `action_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const pendingAction: PendingAction = {
      ...action,
      id,
      runId: this.currentRunId || undefined,
      status: 'pending',
      createdAt: new Date().toISOString()
    };

    db.insertPendingAction(pendingAction);
    return id;
  }

  getPendingActions(): PendingAction[] {
    const db = getDatabase();
    return db.listPendingActions('pending');
  }

  approveAction(actionId: string): boolean {
    const db = getDatabase();
    const action = db.getPendingAction(actionId);

    if (action && action.status === 'pending') {
      db.updatePendingAction(actionId, 'approved', new Date().toISOString());
      this.log('info', `Action approved: ${actionId}`);
      return true;
    }
    return false;
  }

  rejectAction(actionId: string): boolean {
    const db = getDatabase();
    const action = db.getPendingAction(actionId);

    if (action && action.status === 'pending') {
      db.updatePendingAction(actionId, 'rejected', new Date().toISOString());
      this.log('info', `Action rejected: ${actionId}`);
      return true;
    }
    return false;
  }

  getMetrics(): {
    totalRuns: number;
    successfulRuns: number;
    failedRuns: number;
    averageDuration: number;
  } {
    const db = getDatabase();
    const stats = db.getStats();
    const history = db.listWorkflowRuns(1000);

    const completed = history.filter(r => r.completedAt);
    const successful = completed.filter(r => r.status === 'complete');
    const durations = completed
      .map(r => new Date(r.completedAt!).getTime() - new Date(r.startedAt).getTime())
      .filter(d => d > 0);

    return {
      totalRuns: stats.workflow_runs.total,
      successfulRuns: successful.length,
      failedRuns: completed.length - successful.length,
      averageDuration: durations.length > 0
        ? durations.reduce((a, b) => a + b, 0) / durations.length
        : 0
    };
  }

  /**
   * Cleanup old data from database.
   */
  cleanup(retentionDays: number = 30): { deleted_runs: number; deleted_jobs: number } {
    const db = getDatabase();
    return db.cleanupOldData(retentionDays);
  }
}

export const stateManager = new StateManager();
