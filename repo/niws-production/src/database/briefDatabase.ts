/**
 * Brief Database
 *
 * SQLite storage for story briefs, quotes, legislation, and Christ-Oh-Meter ratings.
 */

import Database from 'better-sqlite3';
import { randomUUID } from 'crypto';
import { existsSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import type {
  StoryBrief,
  OutletPerspective,
  Quote,
  BriefSource,
  Legislation,
  ChristOhMeterResult,
  MoralAlignment,
  Verdict
} from '../types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DEFAULT_DB_PATH = join(__dirname, '../../data/briefs.sqlite');

// ============================================
// ROW TYPE INTERFACES
// ============================================

interface BriefRow {
  id: string;
  story_id: string;
  title: string;
  summary: string | null;
  key_facts: string | null;
  perspectives: string | null;
  christ_oh_meter_score: number | null;
  moral_alignment: string | null;
  moral_explanation: string | null;
  recommendation: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

interface SourceRow {
  id: string;
  brief_id: string;
  article_id: string;
  outlet_id: string;
  relevance_score: number | null;
  added_at: string;
}

interface QuoteRow {
  id: string;
  brief_id: string;
  article_id: string | null;
  outlet_id: string | null;
  outlet_name: string | null;
  quote_text: string;
  attribution: string | null;
  context: string | null;
  position: number | null;
  is_key_quote: number;
  created_at: string;
}

interface LegislationRow {
  id: string;
  brief_id: string;
  bill_number: string | null;
  title: string;
  summary: string | null;
  status: string | null;
  sponsors: string | null;
  impact_assessment: string | null;
  moral_implications: string | null;
  created_at: string;
}

interface RatingRow {
  id: string;
  brief_id: string | null;
  action: string;
  subject: string;
  affected: string;
  tenet_scores: string;
  spectrum_score: number;
  verdict: string;
  strongest_christ_tenets: string | null;
  strongest_evil_tenets: string | null;
  counterfeits_detected: string | null;
  tenets_evaluation_id: string | null;
  reasoning: string;
  created_at: string;
}

interface CountRow {
  count: number;
}

interface TotalRow {
  total: number;
}

interface StatusCountRow {
  status: string;
  count: number;
}

interface AlignmentCountRow {
  moral_alignment: string;
  count: number;
}

interface AvgRow {
  avg: number | null;
}

export type BriefStatus = 'draft' | 'reviewed' | 'approved' | 'used';

export interface BriefQuery {
  storyId?: string;
  status?: BriefStatus;
  moralAlignment?: MoralAlignment;
  limit?: number;
  offset?: number;
}

export class BriefDatabase {
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
      CREATE TABLE IF NOT EXISTS story_briefs (
        id TEXT PRIMARY KEY,
        story_id TEXT NOT NULL,
        title TEXT NOT NULL,
        summary TEXT,
        key_facts TEXT,
        perspectives TEXT,
        christ_oh_meter_score REAL,
        moral_alignment TEXT,
        moral_explanation TEXT,
        recommendation TEXT,
        status TEXT DEFAULT 'draft',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS brief_sources (
        id TEXT PRIMARY KEY,
        brief_id TEXT NOT NULL REFERENCES story_briefs(id) ON DELETE CASCADE,
        article_id TEXT NOT NULL,
        outlet_id TEXT NOT NULL,
        relevance_score REAL,
        added_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS quotes (
        id TEXT PRIMARY KEY,
        brief_id TEXT NOT NULL REFERENCES story_briefs(id) ON DELETE CASCADE,
        article_id TEXT,
        outlet_id TEXT,
        outlet_name TEXT,
        quote_text TEXT NOT NULL,
        attribution TEXT,
        context TEXT,
        position INTEGER,
        is_key_quote INTEGER DEFAULT 0,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS legislation (
        id TEXT PRIMARY KEY,
        brief_id TEXT NOT NULL REFERENCES story_briefs(id) ON DELETE CASCADE,
        bill_number TEXT,
        title TEXT NOT NULL,
        summary TEXT,
        status TEXT,
        sponsors TEXT,
        impact_assessment TEXT,
        moral_implications TEXT,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS christ_oh_meter_ratings (
        id TEXT PRIMARY KEY,
        brief_id TEXT REFERENCES story_briefs(id) ON DELETE SET NULL,
        action TEXT NOT NULL,
        subject TEXT NOT NULL,
        affected TEXT NOT NULL,
        tenet_scores TEXT NOT NULL,
        spectrum_score REAL NOT NULL,
        verdict TEXT NOT NULL,
        strongest_christ_tenets TEXT,
        strongest_evil_tenets TEXT,
        counterfeits_detected TEXT,
        tenets_evaluation_id TEXT,
        reasoning TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_briefs_story ON story_briefs(story_id);
      CREATE INDEX IF NOT EXISTS idx_briefs_status ON story_briefs(status);
      CREATE INDEX IF NOT EXISTS idx_briefs_moral ON story_briefs(moral_alignment);
      CREATE INDEX IF NOT EXISTS idx_sources_brief ON brief_sources(brief_id);
      CREATE INDEX IF NOT EXISTS idx_quotes_brief ON quotes(brief_id);
      CREATE INDEX IF NOT EXISTS idx_legislation_brief ON legislation(brief_id);
      CREATE INDEX IF NOT EXISTS idx_ratings_brief ON christ_oh_meter_ratings(brief_id);
    `);
  }

  // ============================================
  // BRIEF OPERATIONS
  // ============================================

  createBrief(data: Omit<StoryBrief, 'id' | 'status' | 'createdAt' | 'updatedAt'>): StoryBrief {
    const id = `brief_${randomUUID().slice(0, 8)}`;
    const now = new Date().toISOString();

    this.db.prepare(`
      INSERT INTO story_briefs (id, story_id, title, summary, key_facts, perspectives, christ_oh_meter_score, moral_alignment, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?)
    `).run(
      id,
      data.storyId,
      data.title,
      data.summary || null,
      data.keyFacts ? JSON.stringify(data.keyFacts) : null,
      data.perspectives ? JSON.stringify(data.perspectives) : null,
      data.christOhMeterScore || null,
      data.moralAlignment || null,
      now,
      now
    );

    return this.getBrief(id)!;
  }

  getBrief(id: string): StoryBrief | null {
    const row = this.db.prepare('SELECT * FROM story_briefs WHERE id = ?').get(id) as BriefRow | undefined;
    if (!row) return null;
    return this.rowToBrief(row);
  }

  getBriefByStoryId(storyId: string): StoryBrief | null {
    // Use rowid as tiebreaker for same-millisecond inserts
    const row = this.db.prepare('SELECT * FROM story_briefs WHERE story_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1').get(storyId) as BriefRow | undefined;
    if (!row) return null;
    return this.rowToBrief(row);
  }

  listBriefs(query: BriefQuery = {}): { briefs: StoryBrief[]; total: number } {
    const conditions: string[] = ['1=1'];
    const params: (string | number)[] = [];

    if (query.storyId) {
      conditions.push('story_id = ?');
      params.push(query.storyId);
    }
    if (query.status) {
      conditions.push('status = ?');
      params.push(query.status);
    }
    if (query.moralAlignment) {
      conditions.push('moral_alignment = ?');
      params.push(query.moralAlignment);
    }

    const countSql = `SELECT COUNT(*) as total FROM story_briefs WHERE ${conditions.join(' AND ')}`;
    const total = (this.db.prepare(countSql).get(...params) as TotalRow).total;

    const limit = query.limit || 50;
    const offset = query.offset || 0;
    params.push(limit, offset);

    const sql = `
      SELECT * FROM story_briefs
      WHERE ${conditions.join(' AND ')}
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `;

    const rows = this.db.prepare(sql).all(...params) as BriefRow[];
    const briefs = rows.map(row => this.rowToBrief(row));

    return { briefs, total };
  }

  updateBrief(id: string, updates: Partial<StoryBrief>): StoryBrief | null {
    const brief = this.getBrief(id);
    if (!brief) return null;

    const fields: string[] = [];
    const values: (string | number)[] = [];

    if (updates.title !== undefined) {
      fields.push('title = ?');
      values.push(updates.title);
    }
    if (updates.summary !== undefined) {
      fields.push('summary = ?');
      values.push(updates.summary);
    }
    if (updates.keyFacts !== undefined) {
      fields.push('key_facts = ?');
      values.push(JSON.stringify(updates.keyFacts));
    }
    if (updates.perspectives !== undefined) {
      fields.push('perspectives = ?');
      values.push(JSON.stringify(updates.perspectives));
    }
    if (updates.christOhMeterScore !== undefined) {
      fields.push('christ_oh_meter_score = ?');
      values.push(updates.christOhMeterScore);
    }
    if (updates.moralAlignment !== undefined) {
      fields.push('moral_alignment = ?');
      values.push(updates.moralAlignment);
    }

    fields.push('updated_at = ?');
    values.push(new Date().toISOString());
    values.push(id);

    this.db.prepare(`UPDATE story_briefs SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    return this.getBrief(id);
  }

  updateBriefStatus(id: string, status: BriefStatus): boolean {
    const result = this.db.prepare('UPDATE story_briefs SET status = ?, updated_at = ? WHERE id = ?')
      .run(status, new Date().toISOString(), id);
    return result.changes > 0;
  }

  deleteBrief(id: string): boolean {
    const result = this.db.prepare('DELETE FROM story_briefs WHERE id = ?').run(id);
    return result.changes > 0;
  }

  // ============================================
  // SOURCES OPERATIONS
  // ============================================

  addSource(data: Omit<BriefSource, 'id' | 'addedAt'>): BriefSource {
    const id = `source_${randomUUID().slice(0, 8)}`;
    const now = new Date().toISOString();

    this.db.prepare(`
      INSERT INTO brief_sources (id, brief_id, article_id, outlet_id, relevance_score, added_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, data.briefId, data.articleId, data.outletId, data.relevanceScore, now);

    return { id, ...data, addedAt: now };
  }

  getSources(briefId: string): BriefSource[] {
    const rows = this.db.prepare('SELECT * FROM brief_sources WHERE brief_id = ? ORDER BY relevance_score DESC').all(briefId) as SourceRow[];
    return rows.map(row => ({
      id: row.id,
      briefId: row.brief_id,
      articleId: row.article_id,
      outletId: row.outlet_id,
      relevanceScore: row.relevance_score || 0,
      addedAt: row.added_at
    }));
  }

  // ============================================
  // QUOTES OPERATIONS
  // ============================================

  addQuote(briefId: string, quote: Quote & { articleId?: string; outletId?: string; position?: number; isKeyQuote?: boolean }): string {
    const id = `quote_${randomUUID().slice(0, 8)}`;
    const now = new Date().toISOString();

    this.db.prepare(`
      INSERT INTO quotes (id, brief_id, article_id, outlet_id, outlet_name, quote_text, attribution, context, position, is_key_quote, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      briefId,
      quote.articleId || null,
      quote.outletId || null,
      null,
      quote.text,
      quote.attribution,
      quote.context,
      quote.position || 0,
      quote.isKeyQuote ? 1 : 0,
      now
    );

    return id;
  }

  getQuotes(briefId: string): Quote[] {
    const rows = this.db.prepare('SELECT * FROM quotes WHERE brief_id = ? ORDER BY position').all(briefId) as QuoteRow[];
    return rows.map(row => ({
      text: row.quote_text,
      attribution: row.attribution || '',
      context: row.context || ''
    }));
  }

  // ============================================
  // LEGISLATION OPERATIONS
  // ============================================

  addLegislation(data: Omit<Legislation, 'id' | 'createdAt'>): Legislation {
    const id = `leg_${randomUUID().slice(0, 8)}`;
    const now = new Date().toISOString();

    this.db.prepare(`
      INSERT INTO legislation (id, brief_id, bill_number, title, summary, status, sponsors, impact_assessment, moral_implications, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      data.briefId,
      data.billNumber || null,
      data.title,
      data.summary || null,
      data.status || null,
      data.sponsors ? JSON.stringify(data.sponsors) : null,
      data.impactAssessment || null,
      data.moralImplications || null,
      now
    );

    return this.getLegislation(id)!;
  }

  getLegislation(id: string): Legislation | null {
    const row = this.db.prepare('SELECT * FROM legislation WHERE id = ?').get(id) as LegislationRow | undefined;
    if (!row) return null;
    return this.rowToLegislation(row);
  }

  getLegislationForBrief(briefId: string): Legislation[] {
    const rows = this.db.prepare('SELECT * FROM legislation WHERE brief_id = ?').all(briefId) as LegislationRow[];
    return rows.map(row => this.rowToLegislation(row));
  }

  // ============================================
  // CHRIST-OH-METER OPERATIONS
  // ============================================

  saveRating(rating: ChristOhMeterResult, briefId?: string): string {
    const id = `rating_${randomUUID().slice(0, 8)}`;
    const now = new Date().toISOString();

    this.db.prepare(`
      INSERT INTO christ_oh_meter_ratings (
        id, brief_id, action, subject, affected, tenet_scores, spectrum_score, verdict,
        strongest_christ_tenets, strongest_evil_tenets, counterfeits_detected, tenets_evaluation_id, reasoning, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      briefId || null,
      rating.action,
      rating.subject,
      JSON.stringify(rating.affected),
      JSON.stringify(rating.tenetScores),
      rating.spectrumScore,
      rating.verdict,
      JSON.stringify(rating.strongestChristTenets),
      JSON.stringify(rating.strongestEvilTenets),
      rating.counterfeitsDetected ? JSON.stringify(rating.counterfeitsDetected) : null,
      rating.tenetsEvaluationId || null,
      rating.reasoning,
      now
    );

    // Update brief if specified
    if (briefId) {
      const alignment = this.verdictToAlignment(rating.verdict);
      this.db.prepare(`
        UPDATE story_briefs SET christ_oh_meter_score = ?, moral_alignment = ?, updated_at = ? WHERE id = ?
      `).run(rating.spectrumScore, alignment, now, briefId);
    }

    return id;
  }

  getRating(id: string): ChristOhMeterResult | null {
    const row = this.db.prepare('SELECT * FROM christ_oh_meter_ratings WHERE id = ?').get(id) as RatingRow | undefined;
    if (!row) return null;
    return this.rowToRating(row);
  }

  getRatingsForBrief(briefId: string): ChristOhMeterResult[] {
    // Use rowid as tiebreaker for same-millisecond inserts
    const rows = this.db.prepare('SELECT * FROM christ_oh_meter_ratings WHERE brief_id = ? ORDER BY created_at DESC, rowid DESC').all(briefId) as RatingRow[];
    return rows.map(row => this.rowToRating(row));
  }

  // ============================================
  // STATISTICS
  // ============================================

  getStats(): {
    totalBriefs: number;
    byStatus: Record<string, number>;
    byMoralAlignment: Record<string, number>;
    totalRatings: number;
    averageScore: number | null;
  } {
    const total = (this.db.prepare('SELECT COUNT(*) as count FROM story_briefs').get() as CountRow).count;

    const statusCounts = this.db.prepare('SELECT status, COUNT(*) as count FROM story_briefs GROUP BY status').all() as StatusCountRow[];
    const byStatus: Record<string, number> = {};
    for (const row of statusCounts) {
      byStatus[row.status] = row.count;
    }

    const alignmentCounts = this.db.prepare('SELECT moral_alignment, COUNT(*) as count FROM story_briefs WHERE moral_alignment IS NOT NULL GROUP BY moral_alignment').all() as AlignmentCountRow[];
    const byMoralAlignment: Record<string, number> = {};
    for (const row of alignmentCounts) {
      byMoralAlignment[row.moral_alignment] = row.count;
    }

    const totalRatings = (this.db.prepare('SELECT COUNT(*) as count FROM christ_oh_meter_ratings').get() as CountRow).count;
    const avgScore = (this.db.prepare('SELECT AVG(spectrum_score) as avg FROM christ_oh_meter_ratings').get() as AvgRow).avg;

    return {
      totalBriefs: total,
      byStatus,
      byMoralAlignment,
      totalRatings,
      averageScore: avgScore ? Math.round(avgScore * 100) / 100 : null
    };
  }

  // ============================================
  // HELPERS
  // ============================================

  private verdictToAlignment(verdict: Verdict): MoralAlignment {
    switch (verdict) {
      case 'strongly_christ':
      case 'leans_christ':
        return 'christ';
      case 'strongly_evil':
      case 'leans_evil':
        return 'anti-christ';
      case 'neutral':
        return 'neutral';
      default:
        return 'mixed';
    }
  }

  private rowToBrief(row: BriefRow): StoryBrief {
    return {
      id: row.id,
      storyId: row.story_id,
      title: row.title,
      summary: row.summary || '',
      keyFacts: row.key_facts ? JSON.parse(row.key_facts) : [],
      perspectives: row.perspectives ? JSON.parse(row.perspectives) : [],
      christOhMeterScore: row.christ_oh_meter_score || 0,
      moralAlignment: (row.moral_alignment || '') as MoralAlignment,
      status: row.status as StoryBrief['status'],
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  private rowToLegislation(row: LegislationRow): Legislation {
    return {
      id: row.id,
      briefId: row.brief_id,
      billNumber: row.bill_number || undefined,
      title: row.title,
      summary: row.summary || undefined,
      status: row.status || undefined,
      sponsors: row.sponsors ? JSON.parse(row.sponsors) : undefined,
      impactAssessment: row.impact_assessment || undefined,
      moralImplications: row.moral_implications || undefined,
      createdAt: row.created_at
    };
  }

  private rowToRating(row: RatingRow): ChristOhMeterResult {
    return {
      action: row.action,
      subject: row.subject,
      affected: JSON.parse(row.affected),
      tenetScores: JSON.parse(row.tenet_scores),
      spectrumScore: row.spectrum_score,
      verdict: row.verdict as Verdict,
      strongestChristTenets: row.strongest_christ_tenets ? JSON.parse(row.strongest_christ_tenets) : [],
      strongestEvilTenets: row.strongest_evil_tenets ? JSON.parse(row.strongest_evil_tenets) : [],
      counterfeitsDetected: row.counterfeits_detected ? JSON.parse(row.counterfeits_detected) : undefined,
      tenetsEvaluationId: row.tenets_evaluation_id || undefined,
      reasoning: row.reasoning
    };
  }

  close(): void {
    this.db.close();
  }
}

// Singleton instance with path tracking
let instance: BriefDatabase | null = null;
let instancePath: string | null = null;

export function getBriefDatabase(dbPath?: string): BriefDatabase {
  const resolvedPath = dbPath ?? DEFAULT_DB_PATH;

  if (instance) {
    if (instancePath !== resolvedPath && instancePath !== ':memory:') {
      throw new Error(
        `BriefDatabase already initialized with path "${instancePath}", ` +
        `cannot reinitialize with "${resolvedPath}"`
      );
    }
    return instance;
  }

  instance = new BriefDatabase(resolvedPath);
  instancePath = resolvedPath;
  return instance;
}

/**
 * Reset the singleton instance (for testing only)
 */
export function resetBriefDatabaseInstance(): void {
  if (instance) {
    instance.close();
    instance = null;
    instancePath = null;
  }
}
