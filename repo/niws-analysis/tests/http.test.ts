/**
 * HTTP API Tests
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createHttpServer } from '../src/http/server.js';
import type { Express } from 'express';
import request from 'supertest';

describe('HTTP Server', () => {
  let app: Express;

  beforeAll(() => {
    // Use in-memory database for tests
    process.env.DB_PATH = ':memory:';
    app = createHttpServer();
  });

  describe('GET /api/health', () => {
    it('should return health status', async () => {
      const response = await request(app).get('/api/health');
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('status');
      expect(['healthy', 'degraded', 'unhealthy']).toContain(response.body.status);
      expect(response.body).toHaveProperty('timestamp');
      expect(response.body).toHaveProperty('checks');
    });

    it('should return degraded when API key is not configured', async () => {
      const response = await request(app).get('/api/health');
      // Without ANTHROPIC_API_KEY, status should be degraded
      expect(response.body.status).toBe('degraded');
      expect(response.body.checks.claudeApi.configured).toBe(false);
    });

    it('should support deep health check', async () => {
      const response = await request(app).get('/api/health?deep=true');
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('checks');
      expect(response.body.checks).toHaveProperty('database');
      expect(response.body.checks).toHaveProperty('intake');
      expect(response.body.checks).toHaveProperty('claudeApi');
    });
  });

  describe('GET /api/analyses', () => {
    it('should return analyses list', async () => {
      const response = await request(app).get('/api/analyses');
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('analyses');
      expect(response.body).toHaveProperty('total');
      expect(Array.isArray(response.body.analyses)).toBe(true);
    });

    it('should support pagination', async () => {
      const response = await request(app).get('/api/analyses?limit=5&offset=0');
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('analyses');
    });
  });

  describe('GET /api/analyses/:id', () => {
    it('should return 404 for non-existent analysis', async () => {
      const response = await request(app).get('/api/analyses/non-existent-id');
      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('POST /api/analyze', () => {
    it('should require articleId', async () => {
      const response = await request(app)
        .post('/api/analyze')
        .send({});
      expect(response.status).toBe(400);
      expect(response.body.error).toContain('articleId');
    });

    it('should accept inline content and return analysis', async () => {
      const response = await request(app)
        .post('/api/analyze')
        .send({
          articleId: 'test-inline-1',
          inline: {
            title: 'Test Article',
            content: 'This is test article content for bias analysis.',
            outletName: 'Test Outlet',
            outletLean: 'center',
            publishedAt: new Date().toISOString(),
          },
        });
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('analysisId');
      expect(response.body).toHaveProperty('status');
    });
  });

  describe('POST /api/compare', () => {
    it('should require storyId', async () => {
      const response = await request(app)
        .post('/api/compare')
        .send({
          articleIds: ['a1', 'a2'],
        });
      expect(response.status).toBe(400);
      expect(response.body.error).toContain('storyId');
    });

    it('should require at least 2 articles', async () => {
      const response = await request(app)
        .post('/api/compare')
        .send({
          storyId: 'story-1',
          articleIds: ['a1'], // Only 1 article
        });
      expect(response.status).toBe(400);
      expect(response.body.error).toContain('At least 2');
    });

    it('should accept inline articles for comparison', async () => {
      const response = await request(app)
        .post('/api/compare')
        .send({
          storyId: 'story-test-1',
          storyTopic: 'Test Story Topic',
          articles: [
            {
              articleId: 'article-left',
              title: 'Left Perspective',
              content: 'Content from left perspective.',
              outletName: 'Left News',
              outletLean: 'left',
              publishedAt: new Date().toISOString(),
            },
            {
              articleId: 'article-right',
              title: 'Right Perspective',
              content: 'Content from right perspective.',
              outletName: 'Right News',
              outletLean: 'right',
              publishedAt: new Date().toISOString(),
            },
          ],
        });
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('comparisonId');
    });
  });

  describe('GET /api/lexicon', () => {
    it('should return lexicon entries', async () => {
      const response = await request(app).get('/api/lexicon');
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('entries');
      expect(response.body).toHaveProperty('count');
      expect(Array.isArray(response.body.entries)).toBe(true);
      // Should have seeded entries
      expect(response.body.count).toBeGreaterThan(0);
    });

    it('should filter by category', async () => {
      const response = await request(app).get('/api/lexicon?category=loaded');
      expect(response.status).toBe(200);
      expect(response.body.entries.every((e: { category: string }) => e.category === 'loaded')).toBe(true);
    });
  });

  describe('GET /api/lexicon/:word', () => {
    it('should return specific lexicon entry', async () => {
      const response = await request(app).get('/api/lexicon/radical');
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('word', 'radical');
      expect(response.body).toHaveProperty('category');
      expect(response.body).toHaveProperty('alternatives');
    });

    it('should return 404 for unknown word', async () => {
      const response = await request(app).get('/api/lexicon/unknownword12345');
      expect(response.status).toBe(404);
    });
  });

  describe('POST /api/lexicon', () => {
    it('should add new lexicon entry', async () => {
      // Use unique word to avoid UNIQUE constraint conflicts across test runs
      const uniqueWord = `testword_${Date.now()}`;
      const response = await request(app)
        .post('/api/lexicon')
        .send({
          word: uniqueWord,
          category: 'loaded',
          severity: 0.5,
          alternatives: ['neutral1', 'neutral2'],
        });
      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('id');
      expect(response.body).toHaveProperty('word', uniqueWord);
    });

    it('should require all fields', async () => {
      const response = await request(app)
        .post('/api/lexicon')
        .send({
          word: 'incomplete',
        });
      expect(response.status).toBe(400);
      expect(response.body.error).toContain('required');
    });
  });

  describe('GET /api/stats', () => {
    it('should return statistics', async () => {
      const response = await request(app).get('/api/stats');
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('totalArticleAnalyses');
      expect(response.body).toHaveProperty('totalComparisons');
      expect(response.body).toHaveProperty('pendingCount');
      expect(response.body).toHaveProperty('failedCount');
      expect(response.body).toHaveProperty('lexiconSize');
    });
  });

  describe('CORS', () => {
    it('should include CORS headers', async () => {
      const response = await request(app).get('/api/health');
      expect(response.headers['access-control-allow-origin']).toBe('*');
    });
  });
});
