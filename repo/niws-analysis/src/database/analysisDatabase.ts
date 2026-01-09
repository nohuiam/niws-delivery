/**
 * Analysis Database
 *
 * SQLite storage for article analyses, comparative analyses, and bias lexicon.
 */

import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';
import type {
  ArticleAnalysis,
  ComparativeAnalysis,
  BiasResult,
  FramingDifference,
  BiasLexiconEntry,
  AnalysisType,
  AnalysisStatus,
} from '../types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SERVER_ROOT = path.join(__dirname, '..', '..');

// Database row types
interface ArticleAnalysisRow {
  id: string;
  article_id: string;
  analysis_type: string;
  status: string;
  result: string | null;
  confidence: number | null;
  error_message: string | null;
  processing_time_ms: number | null;
  model_used: string | null;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  created_at: string;
  completed_at: string | null;
}

interface ComparativeAnalysisRow {
  id: string;
  story_id: string;
  article_ids: string;
  status: string;
  comparison_result: string | null;
  framing_differences: string | null;
  overall_assessment: string | null;
  error_message: string | null;
  processing_time_ms: number | null;
  created_at: string;
  completed_at: string | null;
}

interface BiasLexiconRow {
  id: string;
  word: string;
  category: string;
  lean: string | null;
  severity: number;
  alternatives: string;
  created_at: string;
}

export class AnalysisDatabase {
  private db: Database.Database;

  constructor(dbPath?: string) {
    const defaultPath = path.join(SERVER_ROOT, 'data', 'analyses.sqlite');
    const actualPath = dbPath || defaultPath;

    // Ensure data directory exists
    const dir = path.dirname(actualPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    this.db = new Database(actualPath);
    this.db.pragma('journal_mode = WAL');
    this.initSchema();
    this.seedBiasLexicon();
  }

  private initSchema(): void {
    // Article analyses table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS article_analyses (
        id TEXT PRIMARY KEY,
        article_id TEXT NOT NULL,
        analysis_type TEXT NOT NULL CHECK(analysis_type IN ('bias', 'framing', 'neutral', 'comprehensive')),
        status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'processing', 'complete', 'failed')),
        result TEXT,
        confidence REAL,
        error_message TEXT,
        processing_time_ms INTEGER,
        model_used TEXT,
        prompt_tokens INTEGER,
        completion_tokens INTEGER,
        created_at TEXT NOT NULL,
        completed_at TEXT
      )
    `);

    // Comparative analyses table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS comparative_analyses (
        id TEXT PRIMARY KEY,
        story_id TEXT NOT NULL,
        article_ids TEXT NOT NULL,
        status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'processing', 'complete', 'failed')),
        comparison_result TEXT,
        framing_differences TEXT,
        overall_assessment TEXT,
        error_message TEXT,
        processing_time_ms INTEGER,
        created_at TEXT NOT NULL,
        completed_at TEXT
      )
    `);

    // Bias lexicon table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS bias_lexicon (
        id TEXT PRIMARY KEY,
        word TEXT UNIQUE NOT NULL,
        category TEXT NOT NULL CHECK(category IN ('loaded', 'partisan', 'emotional', 'absolutist')),
        lean TEXT CHECK(lean IN ('left', 'right', 'neutral', NULL)),
        severity REAL NOT NULL,
        alternatives TEXT NOT NULL,
        created_at TEXT NOT NULL
      )
    `);

    // Create indexes
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_analyses_article ON article_analyses(article_id);
      CREATE INDEX IF NOT EXISTS idx_analyses_status ON article_analyses(status);
      CREATE INDEX IF NOT EXISTS idx_analyses_type ON article_analyses(analysis_type);
      CREATE INDEX IF NOT EXISTS idx_comparative_story ON comparative_analyses(story_id);
      CREATE INDEX IF NOT EXISTS idx_comparative_status ON comparative_analyses(status);
      CREATE INDEX IF NOT EXISTS idx_lexicon_category ON bias_lexicon(category);
      CREATE INDEX IF NOT EXISTS idx_lexicon_word ON bias_lexicon(word);
    `);
  }

  private seedBiasLexicon(): void {
    // Check if already seeded
    const count = this.db.prepare('SELECT COUNT(*) as count FROM bias_lexicon').get() as { count: number };
    if (count.count > 0) return;

    const seedData: Array<Omit<BiasLexiconEntry, 'id' | 'createdAt'>> = [
      // Loaded political terms
      { word: 'radical', category: 'loaded', lean: 'right', severity: 0.7, alternatives: ['progressive', 'reform-minded'] },
      { word: 'extreme', category: 'loaded', lean: 'neutral', severity: 0.6, alternatives: ['significant', 'substantial'] },
      { word: 'regime', category: 'loaded', lean: 'right', severity: 0.8, alternatives: ['government', 'administration'] },
      { word: 'socialist', category: 'partisan', lean: 'right', severity: 0.5, alternatives: ['progressive', 'left-leaning'] },
      { word: 'fascist', category: 'loaded', lean: 'left', severity: 0.8, alternatives: ['authoritarian', 'far-right'] },

      // Emotional amplifiers
      { word: 'slammed', category: 'emotional', lean: 'neutral', severity: 0.5, alternatives: ['criticized', 'responded to'] },
      { word: 'destroyed', category: 'emotional', lean: 'neutral', severity: 0.7, alternatives: ['refuted', 'challenged'] },
      { word: 'outrage', category: 'emotional', lean: 'neutral', severity: 0.6, alternatives: ['criticism', 'concern'] },
      { word: 'blasted', category: 'emotional', lean: 'neutral', severity: 0.5, alternatives: ['criticized', 'condemned'] },
      { word: 'ripped', category: 'emotional', lean: 'neutral', severity: 0.5, alternatives: ['criticized', 'challenged'] },

      // Absolutist terms
      { word: 'always', category: 'absolutist', lean: 'neutral', severity: 0.4, alternatives: ['often', 'frequently'] },
      { word: 'never', category: 'absolutist', lean: 'neutral', severity: 0.4, alternatives: ['rarely', 'seldom'] },
      { word: 'everyone', category: 'absolutist', lean: 'neutral', severity: 0.3, alternatives: ['many people', 'most'] },
      { word: 'nobody', category: 'absolutist', lean: 'neutral', severity: 0.3, alternatives: ['few people', 'almost no one'] },
      { word: 'completely', category: 'absolutist', lean: 'neutral', severity: 0.3, alternatives: ['largely', 'substantially'] },

      // Additional partisan terms
      { word: 'woke', category: 'partisan', lean: 'right', severity: 0.6, alternatives: ['progressive', 'socially conscious'] },
      { word: 'elitist', category: 'loaded', lean: 'right', severity: 0.5, alternatives: ['educated', 'affluent'] },
      { word: 'bigot', category: 'loaded', lean: 'left', severity: 0.7, alternatives: ['critic', 'opponent'] },
      { word: 'snowflake', category: 'partisan', lean: 'right', severity: 0.5, alternatives: ['sensitive person', 'critic'] },
      { word: 'conspiracy', category: 'loaded', lean: 'neutral', severity: 0.6, alternatives: ['theory', 'claim'] },
    ];

    const stmt = this.db.prepare(`
      INSERT INTO bias_lexicon (id, word, category, lean, severity, alternatives, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const now = new Date().toISOString();
    for (const entry of seedData) {
      stmt.run(
        uuidv4(),
        entry.word,
        entry.category,
        entry.lean || null,
        entry.severity,
        JSON.stringify(entry.alternatives),
        now
      );
    }
  }

  // === Article Analysis Methods ===

  createAnalysis(articleId: string, analysisType: AnalysisType): ArticleAnalysis {
    const id = uuidv4();
    const now = new Date().toISOString();

    this.db.prepare(`
      INSERT INTO article_analyses (id, article_id, analysis_type, status, created_at)
      VALUES (?, ?, ?, 'pending', ?)
    `).run(id, articleId, analysisType, now);

    return {
      id,
      articleId,
      analysisType,
      status: 'pending',
      confidence: 0,
      processingTimeMs: 0,
      createdAt: now,
      modelUsed: '',
    };
  }

  updateAnalysisStatus(id: string, status: AnalysisStatus): void {
    this.db.prepare('UPDATE article_analyses SET status = ? WHERE id = ?').run(status, id);
  }

  completeAnalysis(
    id: string,
    result: BiasResult,
    modelUsed: string,
    processingTimeMs: number,
    promptTokens?: number,
    completionTokens?: number
  ): void {
    const now = new Date().toISOString();
    this.db.prepare(`
      UPDATE article_analyses
      SET status = 'complete',
          result = ?,
          confidence = ?,
          model_used = ?,
          processing_time_ms = ?,
          prompt_tokens = ?,
          completion_tokens = ?,
          completed_at = ?
      WHERE id = ?
    `).run(
      JSON.stringify(result),
      result.confidence || 0.8,
      modelUsed,
      processingTimeMs,
      promptTokens || null,
      completionTokens || null,
      now,
      id
    );
  }

  failAnalysis(id: string, errorMessage: string): void {
    const now = new Date().toISOString();
    this.db.prepare(`
      UPDATE article_analyses
      SET status = 'failed', error_message = ?, completed_at = ?
      WHERE id = ?
    `).run(errorMessage, now, id);
  }

  /**
   * Reset a failed analysis to pending for retry
   */
  resetAnalysisForRetry(id: string): boolean {
    const result = this.db.prepare(`
      UPDATE article_analyses
      SET status = 'pending', error_message = NULL, completed_at = NULL
      WHERE id = ? AND status = 'failed'
    `).run(id);
    return result.changes > 0;
  }

  getAnalysisById(id: string): ArticleAnalysis | null {
    const row = this.db.prepare('SELECT * FROM article_analyses WHERE id = ?').get(id) as ArticleAnalysisRow | undefined;
    return row ? this.rowToArticleAnalysis(row) : null;
  }

  getAnalysisByArticleId(articleId: string): ArticleAnalysis | null {
    const row = this.db.prepare(
      'SELECT * FROM article_analyses WHERE article_id = ? ORDER BY created_at DESC LIMIT 1'
    ).get(articleId) as ArticleAnalysisRow | undefined;
    return row ? this.rowToArticleAnalysis(row) : null;
  }

  getAnalyses(options: {
    articleId?: string;
    storyId?: string;
    type?: AnalysisType;
    status?: AnalysisStatus;
    limit?: number;
    offset?: number;
  } = {}): { analyses: ArticleAnalysis[]; total: number } {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (options.articleId) {
      conditions.push('article_id = ?');
      params.push(options.articleId);
    }
    if (options.type) {
      conditions.push('analysis_type = ?');
      params.push(options.type);
    }
    if (options.status) {
      conditions.push('status = ?');
      params.push(options.status);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = options.limit || 50;
    const offset = options.offset || 0;

    const countRow = this.db.prepare(`SELECT COUNT(*) as count FROM article_analyses ${where}`).get(...params) as { count: number };
    const rows = this.db.prepare(`
      SELECT * FROM article_analyses ${where}
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset) as ArticleAnalysisRow[];

    return {
      analyses: rows.map(r => this.rowToArticleAnalysis(r)),
      total: countRow.count,
    };
  }

  getPendingAnalyses(limit = 10): ArticleAnalysis[] {
    const rows = this.db.prepare(`
      SELECT * FROM article_analyses
      WHERE status = 'pending'
      ORDER BY created_at ASC
      LIMIT ?
    `).all(limit) as ArticleAnalysisRow[];
    return rows.map(r => this.rowToArticleAnalysis(r));
  }

  private rowToArticleAnalysis(row: ArticleAnalysisRow): ArticleAnalysis {
    return {
      id: row.id,
      articleId: row.article_id,
      analysisType: row.analysis_type as AnalysisType,
      status: row.status as AnalysisStatus,
      result: row.result ? JSON.parse(row.result) : undefined,
      confidence: row.confidence || 0,
      processingTimeMs: row.processing_time_ms || 0,
      createdAt: row.created_at,
      completedAt: row.completed_at || undefined,
      modelUsed: row.model_used || '',
      promptTokens: row.prompt_tokens || undefined,
      completionTokens: row.completion_tokens || undefined,
      errorMessage: row.error_message || undefined,
    };
  }

  // === Comparative Analysis Methods ===

  createComparison(storyId: string, articleIds: string[]): ComparativeAnalysis {
    const id = uuidv4();
    const now = new Date().toISOString();

    this.db.prepare(`
      INSERT INTO comparative_analyses (id, story_id, article_ids, status, created_at)
      VALUES (?, ?, ?, 'pending', ?)
    `).run(id, storyId, JSON.stringify(articleIds), now);

    return {
      id,
      storyId,
      articleIds,
      status: 'pending',
      framingDifferences: [],
      overallAssessment: '',
      createdAt: now,
    };
  }

  completeComparison(
    id: string,
    framingDifferences: FramingDifference[],
    overallAssessment: string,
    processingTimeMs: number
  ): void {
    const now = new Date().toISOString();
    this.db.prepare(`
      UPDATE comparative_analyses
      SET status = 'complete',
          framing_differences = ?,
          overall_assessment = ?,
          processing_time_ms = ?,
          completed_at = ?
      WHERE id = ?
    `).run(
      JSON.stringify(framingDifferences),
      overallAssessment,
      processingTimeMs,
      now,
      id
    );
  }

  failComparison(id: string, errorMessage: string): void {
    const now = new Date().toISOString();
    this.db.prepare(`
      UPDATE comparative_analyses
      SET status = 'failed', error_message = ?, completed_at = ?
      WHERE id = ?
    `).run(errorMessage, now, id);
  }

  getComparisonById(id: string): ComparativeAnalysis | null {
    const row = this.db.prepare('SELECT * FROM comparative_analyses WHERE id = ?').get(id) as ComparativeAnalysisRow | undefined;
    return row ? this.rowToComparativeAnalysis(row) : null;
  }

  getComparisonByStoryId(storyId: string): ComparativeAnalysis | null {
    const row = this.db.prepare(
      'SELECT * FROM comparative_analyses WHERE story_id = ? ORDER BY created_at DESC LIMIT 1'
    ).get(storyId) as ComparativeAnalysisRow | undefined;
    return row ? this.rowToComparativeAnalysis(row) : null;
  }

  getAnalysesByStoryId(storyId: string): { analyses: ArticleAnalysis[]; comparative: ComparativeAnalysis | null } {
    // Get comparison first
    const comparison = this.getComparisonByStoryId(storyId);

    // Get individual analyses for articles in the comparison
    let analyses: ArticleAnalysis[] = [];
    if (comparison && comparison.articleIds.length > 0) {
      const placeholders = comparison.articleIds.map(() => '?').join(',');
      const rows = this.db.prepare(`
        SELECT * FROM article_analyses
        WHERE article_id IN (${placeholders})
        ORDER BY created_at DESC
      `).all(...comparison.articleIds) as ArticleAnalysisRow[];
      analyses = rows.map(r => this.rowToArticleAnalysis(r));
    }

    return { analyses, comparative: comparison };
  }

  private rowToComparativeAnalysis(row: ComparativeAnalysisRow): ComparativeAnalysis {
    return {
      id: row.id,
      storyId: row.story_id,
      articleIds: JSON.parse(row.article_ids),
      status: row.status as AnalysisStatus,
      framingDifferences: row.framing_differences ? JSON.parse(row.framing_differences) : [],
      overallAssessment: row.overall_assessment || '',
      createdAt: row.created_at,
      completedAt: row.completed_at || undefined,
      processingTimeMs: row.processing_time_ms || undefined,
      errorMessage: row.error_message || undefined,
    };
  }

  // === Bias Lexicon Methods ===

  getLexiconEntry(word: string): BiasLexiconEntry | null {
    const row = this.db.prepare('SELECT * FROM bias_lexicon WHERE word = ?').get(word.toLowerCase()) as BiasLexiconRow | undefined;
    return row ? this.rowToLexiconEntry(row) : null;
  }

  getLexiconByCategory(category: string): BiasLexiconEntry[] {
    const rows = this.db.prepare('SELECT * FROM bias_lexicon WHERE category = ?').all(category) as BiasLexiconRow[];
    return rows.map(r => this.rowToLexiconEntry(r));
  }

  getAllLexicon(): BiasLexiconEntry[] {
    const rows = this.db.prepare('SELECT * FROM bias_lexicon ORDER BY word').all() as BiasLexiconRow[];
    return rows.map(r => this.rowToLexiconEntry(r));
  }

  addLexiconEntry(entry: Omit<BiasLexiconEntry, 'id' | 'createdAt'>): BiasLexiconEntry {
    const id = uuidv4();
    const now = new Date().toISOString();

    this.db.prepare(`
      INSERT INTO bias_lexicon (id, word, category, lean, severity, alternatives, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      entry.word.toLowerCase(),
      entry.category,
      entry.lean || null,
      entry.severity,
      JSON.stringify(entry.alternatives),
      now
    );

    return { id, createdAt: now, ...entry };
  }

  private rowToLexiconEntry(row: BiasLexiconRow): BiasLexiconEntry {
    return {
      id: row.id,
      word: row.word,
      category: row.category as BiasLexiconEntry['category'],
      lean: row.lean as BiasLexiconEntry['lean'],
      severity: row.severity,
      alternatives: JSON.parse(row.alternatives),
      createdAt: row.created_at,
    };
  }

  // === Stats ===

  getStats(): {
    totalArticleAnalyses: number;
    totalComparisons: number;
    pendingCount: number;
    failedCount: number;
    lexiconSize: number;
  } {
    const articles = this.db.prepare('SELECT COUNT(*) as count FROM article_analyses').get() as { count: number };
    const comparisons = this.db.prepare('SELECT COUNT(*) as count FROM comparative_analyses').get() as { count: number };
    const pending = this.db.prepare("SELECT COUNT(*) as count FROM article_analyses WHERE status = 'pending'").get() as { count: number };
    const failed = this.db.prepare("SELECT COUNT(*) as count FROM article_analyses WHERE status = 'failed'").get() as { count: number };
    const lexicon = this.db.prepare('SELECT COUNT(*) as count FROM bias_lexicon').get() as { count: number };

    return {
      totalArticleAnalyses: articles.count,
      totalComparisons: comparisons.count,
      pendingCount: pending.count,
      failedCount: failed.count,
      lexiconSize: lexicon.count,
    };
  }

  close(): void {
    this.db.close();
  }
}

// Singleton instance
let dbInstance: AnalysisDatabase | null = null;
let dbInstancePath: string | undefined;

export function getAnalysisDatabase(dbPath?: string): AnalysisDatabase {
  if (!dbInstance) {
    dbInstance = new AnalysisDatabase(dbPath);
    dbInstancePath = dbPath;
  } else if (dbPath !== undefined && dbPath !== dbInstancePath) {
    console.warn(`[AnalysisDatabase] Singleton already initialized with different path. Ignoring new path: ${dbPath}`);
  }
  return dbInstance;
}
