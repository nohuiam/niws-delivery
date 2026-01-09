/**
 * Script Database
 *
 * SQLite storage for generated scripts, sections, revisions, and patterns.
 */

import Database from 'better-sqlite3';
import { randomUUID } from 'crypto';
import { existsSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import type {
  Script,
  ScriptSection,
  ScriptRevision,
  LearnedPattern,
  ProhibitedPattern
} from '../types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DEFAULT_DB_PATH = join(__dirname, '../../data/scripts.sqlite');

// ============================================
// ROW TYPE INTERFACES
// ============================================

interface ScriptRow {
  id: string;
  story_id: string | null;
  brief_id: string | null;
  title: string;
  status: string;
  content: string | null;
  word_count: number | null;
  estimated_duration_seconds: number | null;
  generation_params: string | null;
  created_at: string;
  updated_at: string;
}

interface SectionRow {
  id: string;
  script_id: string;
  section_type: string;
  content: string;
  position: number;
  word_count: number | null;
  notes: string | null;
  created_at: string;
}

interface RevisionRow {
  id: string;
  script_id: string;
  revision_number: number;
  previous_content: string | null;
  new_content: string | null;
  diff: string | null;
  reason: string | null;
  edited_by: string | null;
  created_at: string;
}

interface LearnedPatternRow {
  id: string;
  pattern_type: string;
  original: string;
  replacement: string;
  frequency: number;
  confidence: number;
  is_active: number;
  created_at: string;
  last_used_at: string | null;
}

interface ProhibitedPatternRow {
  id: string;
  pattern: string;
  pattern_type: string;
  reason: string;
  severity: string;
  alternatives: string | null;
  is_active: number;
  created_at: string;
}

interface CountRow {
  count: number;
}

interface TotalRow {
  total: number;
}

interface MaxRevisionRow {
  max: number | null;
}

interface StatusCountRow {
  status: string;
  count: number;
}

export class ScriptDatabase {
  private db: Database.Database;

  constructor(dbPath: string = DEFAULT_DB_PATH) {
    const dir = dirname(dbPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.initSchema();
  }

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS scripts (
        id TEXT PRIMARY KEY,
        story_id TEXT,
        brief_id TEXT,
        title TEXT NOT NULL,
        status TEXT DEFAULT 'draft' CHECK(status IN ('draft', 'review', 'approved', 'archived')),
        content TEXT,
        word_count INTEGER,
        estimated_duration_seconds INTEGER,
        generation_params TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS script_sections (
        id TEXT PRIMARY KEY,
        script_id TEXT NOT NULL REFERENCES scripts(id) ON DELETE CASCADE,
        section_type TEXT NOT NULL CHECK(section_type IN ('intro', 'story', 'analysis', 'opinion', 'transition', 'close', 'bumper')),
        content TEXT NOT NULL,
        position INTEGER NOT NULL,
        word_count INTEGER,
        notes TEXT,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS script_revisions (
        id TEXT PRIMARY KEY,
        script_id TEXT NOT NULL REFERENCES scripts(id) ON DELETE CASCADE,
        revision_number INTEGER NOT NULL,
        previous_content TEXT,
        new_content TEXT,
        diff TEXT,
        reason TEXT,
        edited_by TEXT,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS learned_patterns (
        id TEXT PRIMARY KEY,
        pattern_type TEXT NOT NULL,
        original TEXT NOT NULL,
        replacement TEXT NOT NULL,
        frequency INTEGER DEFAULT 1,
        confidence REAL DEFAULT 0.5,
        is_active INTEGER DEFAULT 1,
        created_at TEXT NOT NULL,
        last_used_at TEXT
      );

      CREATE TABLE IF NOT EXISTS prohibited_patterns (
        id TEXT PRIMARY KEY,
        pattern TEXT NOT NULL,
        pattern_type TEXT NOT NULL,
        reason TEXT NOT NULL,
        severity TEXT DEFAULT 'warning' CHECK(severity IN ('warning', 'block')),
        alternatives TEXT,
        is_active INTEGER DEFAULT 1,
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_scripts_story ON scripts(story_id);
      CREATE INDEX IF NOT EXISTS idx_scripts_status ON scripts(status);
      CREATE INDEX IF NOT EXISTS idx_sections_script ON script_sections(script_id);
      CREATE INDEX IF NOT EXISTS idx_revisions_script ON script_revisions(script_id);
    `);
  }

  // ============================================
  // SCRIPT OPERATIONS
  // ============================================

  createScript(data: Omit<Script, 'id' | 'createdAt' | 'updatedAt'>): Script {
    const id = `script_${randomUUID().slice(0, 8)}`;
    const now = new Date().toISOString();

    const stmt = this.db.prepare(`
      INSERT INTO scripts (id, story_id, brief_id, title, status, content, word_count, estimated_duration_seconds, generation_params, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      data.storyId || null,
      data.briefId || null,
      data.title,
      data.status,
      data.content,
      data.wordCount,
      data.estimatedDurationSeconds,
      data.generationParams ? JSON.stringify(data.generationParams) : null,
      now,
      now
    );

    // Create sections
    if (data.sections && data.sections.length > 0) {
      for (const section of data.sections) {
        this.createSection({ ...section, scriptId: id });
      }
    }

    return this.getScript(id)!;
  }

  getScript(id: string): Script | null {
    const row = this.db.prepare('SELECT * FROM scripts WHERE id = ?').get(id) as ScriptRow | undefined;
    if (!row) return null;

    const sections = this.getSections(id);
    return this.rowToScript(row, sections);
  }

  listScripts(options: {
    storyId?: string;
    status?: string;
    limit?: number;
    offset?: number;
  } = {}): { scripts: Script[]; total: number } {
    const conditions: string[] = ['1=1'];
    const params: (string | number)[] = [];

    if (options.storyId) {
      conditions.push('story_id = ?');
      params.push(options.storyId);
    }
    if (options.status) {
      conditions.push('status = ?');
      params.push(options.status);
    }

    const countSql = `SELECT COUNT(*) as total FROM scripts WHERE ${conditions.join(' AND ')}`;
    const total = (this.db.prepare(countSql).get(...params) as TotalRow).total;

    const limit = options.limit || 50;
    const offset = options.offset || 0;
    params.push(limit, offset);

    const sql = `
      SELECT * FROM scripts
      WHERE ${conditions.join(' AND ')}
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `;

    const rows = this.db.prepare(sql).all(...params) as ScriptRow[];
    const scripts = rows.map(row => {
      const sections = this.getSections(row.id);
      return this.rowToScript(row, sections);
    });

    return { scripts, total };
  }

  updateScript(id: string, updates: Partial<Script>): Script | null {
    const script = this.getScript(id);
    if (!script) return null;

    const fields: string[] = [];
    const values: (string | number)[] = [];

    if (updates.title !== undefined) {
      fields.push('title = ?');
      values.push(updates.title);
    }
    if (updates.status !== undefined) {
      fields.push('status = ?');
      values.push(updates.status);
    }
    if (updates.content !== undefined) {
      fields.push('content = ?');
      values.push(updates.content);
    }
    if (updates.wordCount !== undefined) {
      fields.push('word_count = ?');
      values.push(updates.wordCount);
    }
    if (updates.estimatedDurationSeconds !== undefined) {
      fields.push('estimated_duration_seconds = ?');
      values.push(updates.estimatedDurationSeconds);
    }

    fields.push('updated_at = ?');
    values.push(new Date().toISOString());
    values.push(id);

    this.db.prepare(`UPDATE scripts SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    return this.getScript(id);
  }

  deleteScript(id: string): boolean {
    const result = this.db.prepare('DELETE FROM scripts WHERE id = ?').run(id);
    return result.changes > 0;
  }

  // ============================================
  // SECTION OPERATIONS
  // ============================================

  createSection(data: Omit<ScriptSection, 'id' | 'createdAt'>): ScriptSection {
    const id = `section_${randomUUID().slice(0, 8)}`;
    const now = new Date().toISOString();

    this.db.prepare(`
      INSERT INTO script_sections (id, script_id, section_type, content, position, word_count, notes, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, data.scriptId, data.sectionType, data.content, data.position, data.wordCount, data.notes || null, now);

    return this.getSection(id)!;
  }

  getSection(id: string): ScriptSection | null {
    const row = this.db.prepare('SELECT * FROM script_sections WHERE id = ?').get(id) as SectionRow | undefined;
    if (!row) return null;
    return this.rowToSection(row);
  }

  getSections(scriptId: string): ScriptSection[] {
    const rows = this.db.prepare('SELECT * FROM script_sections WHERE script_id = ? ORDER BY position').all(scriptId) as SectionRow[];
    return rows.map(row => this.rowToSection(row));
  }

  updateSection(id: string, updates: Partial<ScriptSection>): ScriptSection | null {
    const section = this.getSection(id);
    if (!section) return null;

    const fields: string[] = [];
    const values: (string | number)[] = [];

    if (updates.content !== undefined) {
      fields.push('content = ?');
      values.push(updates.content);
    }
    if (updates.position !== undefined) {
      fields.push('position = ?');
      values.push(updates.position);
    }
    if (updates.wordCount !== undefined) {
      fields.push('word_count = ?');
      values.push(updates.wordCount);
    }
    if (updates.notes !== undefined) {
      fields.push('notes = ?');
      values.push(updates.notes);
    }

    if (fields.length === 0) return section;

    values.push(id);
    this.db.prepare(`UPDATE script_sections SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    return this.getSection(id);
  }

  // ============================================
  // REVISION OPERATIONS
  // ============================================

  createRevision(data: Omit<ScriptRevision, 'id' | 'createdAt'>): ScriptRevision {
    const id = `rev_${randomUUID().slice(0, 8)}`;
    const now = new Date().toISOString();

    this.db.prepare(`
      INSERT INTO script_revisions (id, script_id, revision_number, previous_content, new_content, diff, reason, edited_by, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, data.scriptId, data.revisionNumber, data.previousContent, data.newContent, data.diff || null, data.reason || null, data.editedBy, now);

    return this.getRevision(id)!;
  }

  getRevision(id: string): ScriptRevision | null {
    const row = this.db.prepare('SELECT * FROM script_revisions WHERE id = ?').get(id) as RevisionRow | undefined;
    if (!row) return null;
    return this.rowToRevision(row);
  }

  getRevisions(scriptId: string): ScriptRevision[] {
    const rows = this.db.prepare('SELECT * FROM script_revisions WHERE script_id = ? ORDER BY revision_number').all(scriptId) as RevisionRow[];
    return rows.map(row => this.rowToRevision(row));
  }

  getNextRevisionNumber(scriptId: string): number {
    const result = this.db.prepare('SELECT MAX(revision_number) as max FROM script_revisions WHERE script_id = ?').get(scriptId) as MaxRevisionRow;
    return (result.max || 0) + 1;
  }

  // ============================================
  // PATTERN OPERATIONS
  // ============================================

  getLearnedPatterns(category?: string, minFrequency = 1): LearnedPattern[] {
    let sql = 'SELECT * FROM learned_patterns WHERE is_active = 1 AND frequency >= ?';
    const params: (string | number)[] = [minFrequency];

    if (category) {
      sql += ' AND pattern_type = ?';
      params.push(category);
    }

    sql += ' ORDER BY frequency DESC, confidence DESC';

    const rows = this.db.prepare(sql).all(...params) as LearnedPatternRow[];
    return rows.map(row => this.rowToLearnedPattern(row));
  }

  addLearnedPattern(data: Omit<LearnedPattern, 'id' | 'createdAt'>): LearnedPattern {
    const id = `pattern_${randomUUID().slice(0, 8)}`;
    const now = new Date().toISOString();

    this.db.prepare(`
      INSERT INTO learned_patterns (id, pattern_type, original, replacement, frequency, confidence, is_active, created_at, last_used_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, data.patternType, data.original, data.replacement, data.frequency, data.confidence, data.isActive ? 1 : 0, now, data.lastUsedAt || null);

    return this.getLearnedPattern(id)!;
  }

  getLearnedPattern(id: string): LearnedPattern | null {
    const row = this.db.prepare('SELECT * FROM learned_patterns WHERE id = ?').get(id) as LearnedPatternRow | undefined;
    if (!row) return null;
    return this.rowToLearnedPattern(row);
  }

  getProhibitedPatterns(active = true): ProhibitedPattern[] {
    const sql = active
      ? 'SELECT * FROM prohibited_patterns WHERE is_active = 1'
      : 'SELECT * FROM prohibited_patterns';
    const rows = this.db.prepare(sql).all() as ProhibitedPatternRow[];
    return rows.map(row => this.rowToProhibitedPattern(row));
  }

  addProhibitedPattern(data: Omit<ProhibitedPattern, 'id' | 'createdAt'>): ProhibitedPattern {
    const id = `prohibited_${randomUUID().slice(0, 8)}`;
    const now = new Date().toISOString();

    this.db.prepare(`
      INSERT INTO prohibited_patterns (id, pattern, pattern_type, reason, severity, alternatives, is_active, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, data.pattern, data.patternType, data.reason, data.severity, data.alternatives ? JSON.stringify(data.alternatives) : null, data.isActive ? 1 : 0, now);

    return this.getProhibitedPattern(id)!;
  }

  getProhibitedPattern(id: string): ProhibitedPattern | null {
    const row = this.db.prepare('SELECT * FROM prohibited_patterns WHERE id = ?').get(id) as ProhibitedPatternRow | undefined;
    if (!row) return null;
    return this.rowToProhibitedPattern(row);
  }

  // ============================================
  // STATISTICS
  // ============================================

  getStats(): {
    totalScripts: number;
    byStatus: Record<string, number>;
    totalRevisions: number;
    learnedPatterns: number;
    prohibitedPatterns: number;
  } {
    const total = (this.db.prepare('SELECT COUNT(*) as count FROM scripts').get() as CountRow).count;

    const statusCounts = this.db.prepare('SELECT status, COUNT(*) as count FROM scripts GROUP BY status').all() as StatusCountRow[];
    const byStatus: Record<string, number> = {};
    for (const row of statusCounts) {
      byStatus[row.status] = row.count;
    }

    const revisions = (this.db.prepare('SELECT COUNT(*) as count FROM script_revisions').get() as CountRow).count;
    const learned = (this.db.prepare('SELECT COUNT(*) as count FROM learned_patterns WHERE is_active = 1').get() as CountRow).count;
    const prohibited = (this.db.prepare('SELECT COUNT(*) as count FROM prohibited_patterns WHERE is_active = 1').get() as CountRow).count;

    return {
      totalScripts: total,
      byStatus,
      totalRevisions: revisions,
      learnedPatterns: learned,
      prohibitedPatterns: prohibited
    };
  }

  // ============================================
  // ROW CONVERTERS
  // ============================================

  private rowToScript(row: ScriptRow, sections: ScriptSection[]): Script {
    return {
      id: row.id,
      storyId: row.story_id || '',
      briefId: row.brief_id || '',
      title: row.title,
      status: row.status as Script['status'],
      content: row.content || '',
      sections,
      wordCount: row.word_count || 0,
      estimatedDurationSeconds: row.estimated_duration_seconds || 0,
      generationParams: row.generation_params ? JSON.parse(row.generation_params) : undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  private rowToSection(row: SectionRow): ScriptSection {
    return {
      id: row.id,
      scriptId: row.script_id,
      sectionType: row.section_type as ScriptSection['sectionType'],
      content: row.content,
      position: row.position,
      wordCount: row.word_count || 0,
      notes: row.notes || undefined,
      createdAt: row.created_at
    };
  }

  private rowToRevision(row: RevisionRow): ScriptRevision {
    return {
      id: row.id,
      scriptId: row.script_id,
      revisionNumber: row.revision_number,
      previousContent: row.previous_content || '',
      newContent: row.new_content || '',
      diff: row.diff || undefined,
      reason: row.reason || undefined,
      editedBy: (row.edited_by as ScriptRevision['editedBy']) || 'ai',
      createdAt: row.created_at
    };
  }

  private rowToLearnedPattern(row: LearnedPatternRow): LearnedPattern {
    return {
      id: row.id,
      patternType: row.pattern_type as LearnedPattern['patternType'],
      original: row.original,
      replacement: row.replacement,
      frequency: row.frequency,
      confidence: row.confidence,
      isActive: row.is_active === 1,
      createdAt: row.created_at,
      lastUsedAt: row.last_used_at || undefined
    };
  }

  private rowToProhibitedPattern(row: ProhibitedPatternRow): ProhibitedPattern {
    return {
      id: row.id,
      pattern: row.pattern,
      patternType: row.pattern_type as ProhibitedPattern['patternType'],
      reason: row.reason,
      severity: row.severity as ProhibitedPattern['severity'],
      alternatives: row.alternatives ? JSON.parse(row.alternatives) : undefined,
      isActive: row.is_active === 1,
      createdAt: row.created_at
    };
  }

  close(): void {
    this.db.close();
  }
}

// Singleton instance with path tracking
let instance: ScriptDatabase | null = null;
let instancePath: string | null = null;

export function getScriptDatabase(dbPath?: string): ScriptDatabase {
  const resolvedPath = dbPath ?? DEFAULT_DB_PATH;

  if (instance) {
    // Allow if paths match, or if either is :memory: (for testing)
    if (instancePath !== resolvedPath && instancePath !== ':memory:' && resolvedPath !== ':memory:') {
      throw new Error(
        `ScriptDatabase already initialized with path "${instancePath}", ` +
        `cannot reinitialize with "${resolvedPath}"`
      );
    }
    return instance;
  }

  instance = new ScriptDatabase(resolvedPath);
  instancePath = resolvedPath;
  return instance;
}

/**
 * Reset the singleton instance (for testing only)
 */
export function resetScriptDatabaseInstance(): void {
  if (instance) {
    instance.close();
    instance = null;
    instancePath = null;
  }
}
