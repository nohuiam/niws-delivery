/**
 * HTTP Server Tests
 *
 * Tests for all REST API endpoints including validation,
 * error handling, and CORS.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { createServer, IncomingMessage, ServerResponse } from 'http';
import { HttpServer } from '../src/http/server.js';
import { resetScriptDatabaseInstance } from '../src/database/scriptDatabase.js';
import { resetBriefDatabaseInstance } from '../src/database/briefDatabase.js';
import { resetScriptGeneratorInstance } from '../src/services/scriptGenerator.js';

// Test port to avoid conflicts
const TEST_PORT = 18035;
const BASE_URL = `http://localhost:${TEST_PORT}`;

// Helper to make HTTP requests
async function request(
  method: string,
  path: string,
  body?: unknown
): Promise<{ status: number; data: unknown }> {
  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await response.text();
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }

  return { status: response.status, data };
}

describe('HttpServer', () => {
  let server: HttpServer;

  beforeAll(async () => {
    resetScriptDatabaseInstance();
    resetBriefDatabaseInstance();
    resetScriptGeneratorInstance();
    server = new HttpServer(TEST_PORT);
    await server.start();
  });

  afterAll(() => {
    server.stop();
    resetScriptDatabaseInstance();
    resetBriefDatabaseInstance();
    resetScriptGeneratorInstance();
  });

  // ============================================
  // HEALTH & STATUS
  // ============================================

  describe('Health & Status', () => {
    it('should return health status', async () => {
      const { status, data } = await request('GET', '/health');

      expect(status).toBe(200);
      expect(data).toMatchObject({
        status: 'ok',
        server: 'niws-production',
      });
    });

    it('should return server status', async () => {
      const { status, data } = await request('GET', '/api/status');

      expect(status).toBe(200);
      const result = data as Record<string, unknown>;
      expect(result.server).toBe('niws-production');
      expect(result.uptime).toBeDefined();
      expect(result.ports).toBeDefined();
      expect(result.databases).toBeDefined();
    });
  });

  // ============================================
  // SCRIPTS
  // ============================================

  describe('Scripts API', () => {
    let testScriptId: string;

    it('should create a script', async () => {
      const { status, data } = await request('POST', '/api/scripts', {
        story_id: 'story_http_test',
        story_topic: 'HTTP Test Story',
      });

      expect(status).toBe(201);
      const result = data as Record<string, unknown>;
      expect(result.script_id).toMatch(/^script_/);
      expect(result.title).toBe('HTTP Test Story');
      testScriptId = result.script_id as string;
    });

    it('should list scripts', async () => {
      const { status, data } = await request('GET', '/api/scripts');

      expect(status).toBe(200);
      const result = data as Record<string, unknown>;
      expect(result.total).toBeDefined();
      expect(Array.isArray(result.scripts)).toBe(true);
    });

    it('should list scripts with filters', async () => {
      const { status, data } = await request(
        'GET',
        '/api/scripts?story_id=story_http_test&limit=10'
      );

      expect(status).toBe(200);
      const result = data as Record<string, unknown>;
      expect(result.total).toBeGreaterThan(0);
    });

    it('should get a script by id', async () => {
      const { status, data } = await request('GET', `/api/scripts/${testScriptId}`);

      expect(status).toBe(200);
      const result = data as Record<string, unknown>;
      expect(result.script).toBeDefined();
    });

    it('should return 404 for non-existent script', async () => {
      const { status, data } = await request('GET', '/api/scripts/script_nonexistent');

      expect(status).toBe(404);
      const result = data as Record<string, unknown>;
      expect(result.error).toContain('not found');
    });

    it('should update script status', async () => {
      const { status, data } = await request('PUT', `/api/scripts/${testScriptId}`, {
        status: 'review',
      });

      expect(status).toBe(200);
      const result = data as Record<string, unknown>;
      expect(result.success).toBe(true);
    });

    it('should fail update with missing status', async () => {
      const { status, data } = await request('PUT', `/api/scripts/${testScriptId}`, {});

      expect(status).toBe(400);
      const result = data as Record<string, unknown>;
      expect(result.error).toBeDefined();
    });

    it('should validate a script', async () => {
      const { status, data } = await request('POST', `/api/scripts/${testScriptId}/validate`, {});

      expect(status).toBe(200);
      const result = data as Record<string, unknown>;
      expect(result.script_id).toBe(testScriptId);
      expect(result.qa).toBeDefined();
    });

    it('should export a script as markdown', async () => {
      const { status, data } = await request('POST', `/api/scripts/${testScriptId}/export`, {
        format: 'markdown',
      });

      expect(status).toBe(200);
      const result = data as Record<string, unknown>;
      expect(result.format).toBe('markdown');
      expect(result.content).toBeDefined();
    });

    it('should export a script as json', async () => {
      const { status, data } = await request('POST', `/api/scripts/${testScriptId}/export`, {
        format: 'json',
      });

      expect(status).toBe(200);
      const result = data as Record<string, unknown>;
      expect(result.format).toBe('json');
    });

    it('should delete a script', async () => {
      // Create a script to delete
      const createRes = await request('POST', '/api/scripts', {
        story_id: 'story_to_delete',
        story_topic: 'Delete Test',
      });
      const id = (createRes.data as Record<string, unknown>).script_id;

      const { status, data } = await request('DELETE', `/api/scripts/${id}`);

      expect(status).toBe(200);
      const result = data as Record<string, unknown>;
      expect(result.success).toBe(true);
    });

    it('should return 404 when deleting non-existent script', async () => {
      const { status } = await request('DELETE', '/api/scripts/script_fake');
      expect(status).toBe(404);
    });
  });

  // ============================================
  // BRIEFS
  // ============================================

  describe('Briefs API', () => {
    let testBriefId: string;

    it('should create a brief', async () => {
      const { status, data } = await request('POST', '/api/briefs', {
        story_id: 'story_brief_test',
        title: 'HTTP Brief Test',
        summary: 'Test summary',
        key_facts: ['Fact 1', 'Fact 2'],
      });

      expect(status).toBe(201);
      const result = data as Record<string, unknown>;
      expect(result.brief_id).toMatch(/^brief_/);
      expect(result.title).toBe('HTTP Brief Test');
      testBriefId = result.brief_id as string;
    });

    it('should list briefs', async () => {
      const { status, data } = await request('GET', '/api/briefs');

      expect(status).toBe(200);
      const result = data as Record<string, unknown>;
      expect(result.total).toBeDefined();
      expect(Array.isArray(result.briefs)).toBe(true);
    });

    it('should list briefs with status filter', async () => {
      const { status, data } = await request('GET', '/api/briefs?status=draft&limit=5');

      expect(status).toBe(200);
      const result = data as Record<string, unknown>;
      expect(result.total).toBeDefined();
    });

    it('should get a brief by id', async () => {
      const { status, data } = await request('GET', `/api/briefs/${testBriefId}`);

      expect(status).toBe(200);
      const result = data as Record<string, unknown>;
      expect(result.brief).toBeDefined();
      expect(result.quotes).toBeDefined();
      expect(result.legislation).toBeDefined();
      expect(result.ratings).toBeDefined();
    });

    it('should return 404 for non-existent brief', async () => {
      const { status, data } = await request('GET', '/api/briefs/brief_nonexistent');

      expect(status).toBe(404);
      const result = data as Record<string, unknown>;
      expect(result.error).toContain('not found');
    });

    it('should update brief status', async () => {
      const { status, data } = await request('PUT', `/api/briefs/${testBriefId}/status`, {
        status: 'reviewed',
      });

      expect(status).toBe(200);
      const result = data as Record<string, unknown>;
      expect(result.success).toBe(true);
      expect(result.status).toBe('reviewed');
    });

    it('should return 404 when updating non-existent brief', async () => {
      const { status } = await request('PUT', '/api/briefs/brief_fake/status', {
        status: 'approved',
      });
      expect(status).toBe(404);
    });
  });

  // ============================================
  // CHRIST-OH-METER
  // ============================================

  describe('Christ-Oh-Meter API', () => {
    it('should rate an action', async () => {
      const { status, data } = await request('POST', '/api/christ-oh-meter/rate', {
        action: 'Help someone in need',
        subject: 'Good Samaritan',
        affected: ['Person in need', 'Community'],
        context: 'During a crisis',
      });

      expect(status).toBe(200);
      const result = data as Record<string, unknown>;
      expect(result.rating_id).toBeDefined();
      expect(result.spectrum_score).toBeDefined();
      expect(result.verdict).toBeDefined();
      expect(result.reasoning).toBeDefined();
    });

    it('should fail with missing required fields', async () => {
      const { status, data } = await request('POST', '/api/christ-oh-meter/rate', {
        action: 'Test',
        // Missing subject and affected
      });

      expect(status).toBe(400);
      const result = data as Record<string, unknown>;
      expect(result.error).toBeDefined();
    });

    it('should get ratings for brief', async () => {
      // First create a brief
      const briefRes = await request('POST', '/api/briefs', {
        story_id: 'story_ratings_test',
        title: 'Ratings Test Brief',
      });
      const briefId = (briefRes.data as Record<string, unknown>).brief_id;

      // Rate with brief_id
      await request('POST', '/api/christ-oh-meter/rate', {
        action: 'Test action',
        subject: 'Subject',
        affected: ['Group'],
        brief_id: briefId,
      });

      const { status, data } = await request('GET', `/api/christ-oh-meter/ratings/${briefId}`);

      expect(status).toBe(200);
      const result = data as Record<string, unknown>;
      expect(result.ratings).toBeDefined();
    });
  });

  // ============================================
  // STATS
  // ============================================

  describe('Stats API', () => {
    it('should return script stats', async () => {
      const { status, data } = await request('GET', '/api/stats/scripts');

      expect(status).toBe(200);
      const result = data as Record<string, unknown>;
      expect(result.stats).toBeDefined();
    });

    it('should return brief stats', async () => {
      const { status, data } = await request('GET', '/api/stats/briefs');

      expect(status).toBe(200);
      const result = data as Record<string, unknown>;
      expect(result.stats).toBeDefined();
    });
  });

  // ============================================
  // ERROR HANDLING
  // ============================================

  describe('Error Handling', () => {
    it('should return 404 for unknown routes', async () => {
      const { status, data } = await request('GET', '/api/unknown');

      expect(status).toBe(404);
      const result = data as Record<string, unknown>;
      expect(result.error).toBe('Not found');
    });

    it('should return 400 for invalid JSON', async () => {
      const response = await fetch(`${BASE_URL}/api/scripts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{ invalid json }',
      });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toContain('Invalid JSON');
    });

    it('should handle missing required fields', async () => {
      const { status, data } = await request('POST', '/api/scripts', {
        // Missing story_id and story_topic
      });

      expect(status).toBe(400);
      const result = data as Record<string, unknown>;
      expect(result.error).toBeDefined();
    });
  });

  // ============================================
  // CORS
  // ============================================

  describe('CORS', () => {
    it('should handle OPTIONS preflight', async () => {
      const response = await fetch(`${BASE_URL}/api/scripts`, {
        method: 'OPTIONS',
      });

      expect(response.status).toBe(204);
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
      expect(response.headers.get('Access-Control-Allow-Methods')).toContain('GET');
      expect(response.headers.get('Access-Control-Allow-Methods')).toContain('POST');
    });

    it('should include CORS headers on all responses', async () => {
      const response = await fetch(`${BASE_URL}/health`);

      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
    });
  });

  // ============================================
  // VALIDATION
  // ============================================

  describe('Input Validation', () => {
    it('should validate script creation input', async () => {
      // story_topic is required
      const { status, data } = await request('POST', '/api/scripts', {
        story_id: 'test',
        // Missing story_topic
      });

      expect(status).toBe(400);
    });

    it('should validate export format', async () => {
      // Create a script first
      const createRes = await request('POST', '/api/scripts', {
        story_id: 'validation_test',
        story_topic: 'Validation Test',
      });
      const scriptId = (createRes.data as Record<string, unknown>).script_id;

      const { status, data } = await request('POST', `/api/scripts/${scriptId}/export`, {
        format: 'invalid_format',
      });

      expect(status).toBe(400);
    });

    it('should validate brief status values', async () => {
      // Create a brief first
      const createRes = await request('POST', '/api/briefs', {
        story_id: 'status_validation',
        title: 'Status Validation',
      });
      const briefId = (createRes.data as Record<string, unknown>).brief_id;

      const { status, data } = await request('PUT', `/api/briefs/${briefId}/status`, {
        status: 'invalid_status',
      });

      expect(status).toBe(400);
    });
  });
});
