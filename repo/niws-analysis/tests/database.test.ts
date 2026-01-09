/**
 * Database Tests
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { AnalysisDatabase } from '../src/database/analysisDatabase.js';
import path from 'path';
import fs from 'fs';
import os from 'os';

describe('AnalysisDatabase', () => {
  let db: AnalysisDatabase;
  let dbPath: string;

  beforeAll(() => {
    dbPath = path.join(os.tmpdir(), `niws-analysis-test-${Date.now()}.sqlite`);
    db = new AnalysisDatabase(dbPath);
  });

  afterAll(() => {
    db.close();
    if (fs.existsSync(dbPath)) {
      fs.unlinkSync(dbPath);
    }
  });

  describe('Article Analyses', () => {
    it('should create analysis', () => {
      const analysis = db.createAnalysis('article-1', 'bias');
      expect(analysis.id).toBeDefined();
      expect(analysis.articleId).toBe('article-1');
      expect(analysis.analysisType).toBe('bias');
      expect(analysis.status).toBe('pending');
    });

    it('should update analysis status', () => {
      const analysis = db.createAnalysis('article-2', 'framing');
      db.updateAnalysisStatus(analysis.id, 'processing');

      const updated = db.getAnalysisById(analysis.id);
      expect(updated?.status).toBe('processing');
    });

    it('should complete analysis', () => {
      const analysis = db.createAnalysis('article-3', 'bias');
      const result = {
        biasScore: 0.3,
        framingIndicators: ['emphasis on economy'],
        loadedLanguage: ['radical'],
        neutralAlternatives: { radical: 'progressive' },
        summary: 'Article shows moderate right lean',
        confidence: 0.85,
      };

      db.completeAnalysis(analysis.id, result, 'claude-sonnet-4-20250514', 1500);

      const completed = db.getAnalysisById(analysis.id);
      expect(completed?.status).toBe('complete');
      expect(completed?.result?.biasScore).toBe(0.3);
      expect(completed?.modelUsed).toBe('claude-sonnet-4-20250514');
      expect(completed?.processingTimeMs).toBe(1500);
    });

    it('should fail analysis', () => {
      const analysis = db.createAnalysis('article-4', 'bias');
      db.failAnalysis(analysis.id, 'API error');

      const failed = db.getAnalysisById(analysis.id);
      expect(failed?.status).toBe('failed');
      expect(failed?.errorMessage).toBe('API error');
    });

    it('should get analysis by article ID', () => {
      const analysis = db.createAnalysis('article-5', 'neutral');
      const found = db.getAnalysisByArticleId('article-5');
      expect(found?.id).toBe(analysis.id);
    });

    it('should list pending analyses', () => {
      db.createAnalysis('pending-1', 'bias');
      db.createAnalysis('pending-2', 'bias');

      const pending = db.getPendingAnalyses();
      expect(pending.length).toBeGreaterThanOrEqual(2);
      expect(pending.every(a => a.status === 'pending')).toBe(true);
    });
  });

  describe('Comparative Analyses', () => {
    it('should create comparison', () => {
      const comparison = db.createComparison('story-1', ['a1', 'a2', 'a3']);
      expect(comparison.id).toBeDefined();
      expect(comparison.storyId).toBe('story-1');
      expect(comparison.articleIds).toEqual(['a1', 'a2', 'a3']);
      expect(comparison.status).toBe('pending');
    });

    it('should complete comparison', () => {
      const comparison = db.createComparison('story-2', ['a1', 'a2']);
      const differences = [
        {
          topic: 'Economic policy',
          leftFraming: 'Investment in infrastructure',
          rightFraming: 'Government spending increase',
          neutralFraming: 'Proposed budget allocation',
        },
      ];

      db.completeComparison(comparison.id, differences, 'Coverage differs on framing of spending', 2500);

      const completed = db.getComparisonById(comparison.id);
      expect(completed?.status).toBe('complete');
      expect(completed?.framingDifferences.length).toBe(1);
      expect(completed?.overallAssessment).toContain('Coverage differs');
    });

    it('should get comparison by story ID', () => {
      const comparison = db.createComparison('story-3', ['a1', 'a2']);
      const found = db.getComparisonByStoryId('story-3');
      expect(found?.id).toBe(comparison.id);
    });
  });

  describe('Bias Lexicon', () => {
    it('should have seeded lexicon entries', () => {
      const all = db.getAllLexicon();
      expect(all.length).toBeGreaterThan(0);
    });

    it('should get lexicon entry by word', () => {
      const entry = db.getLexiconEntry('radical');
      expect(entry).toBeDefined();
      expect(entry?.category).toBe('loaded');
      expect(entry?.alternatives.length).toBeGreaterThan(0);
    });

    it('should get lexicon by category', () => {
      const loaded = db.getLexiconByCategory('loaded');
      expect(loaded.length).toBeGreaterThan(0);
      expect(loaded.every(e => e.category === 'loaded')).toBe(true);
    });

    it('should add new lexicon entry', () => {
      const entry = db.addLexiconEntry({
        word: 'testword',
        category: 'emotional',
        lean: 'neutral',
        severity: 0.5,
        alternatives: ['alternative1', 'alternative2'],
      });

      expect(entry.id).toBeDefined();
      expect(entry.word).toBe('testword');

      const found = db.getLexiconEntry('testword');
      expect(found?.alternatives).toEqual(['alternative1', 'alternative2']);
    });
  });

  describe('Stats', () => {
    it('should return stats', () => {
      const stats = db.getStats();
      expect(stats.totalArticleAnalyses).toBeGreaterThanOrEqual(0);
      expect(stats.totalComparisons).toBeGreaterThanOrEqual(0);
      expect(stats.lexiconSize).toBeGreaterThan(0);
    });
  });
});
