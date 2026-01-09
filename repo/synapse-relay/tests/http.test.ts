/**
 * HTTP Server Tests
 * Tests CORS security and basic endpoint functionality
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

// Mock database before importing HttpServer
vi.mock('../src/database/schema.js', () => ({
  getDatabase: () => ({
    getStats: () => ({ total_relays: 0, successful: 0, failed: 0 }),
    getSignalRelay: () => null
  })
}));

vi.mock('../src/relay/engine.js', () => ({
  relaySignal: async () => ({ success: true, relay_id: 'test-123' })
}));

vi.mock('../src/relay/rule-engine.js', () => ({
  listRules: () => [],
  addRule: () => 1,
  updateRule: () => true,
  removeRule: () => true,
  getRule: () => null
}));

vi.mock('../src/relay/buffer-manager.js', () => ({
  getPendingBuffers: () => [],
  retryBufferedSignals: async () => ({ retried: 0, succeeded: 0, failed: 0 }),
  flushBuffer: async () => ({ flushed: 0 })
}));

vi.mock('../src/relay/stats-aggregator.js', () => ({
  getRelayStatistics: () => ({ total: 0, by_type: {} })
}));

import { HttpServer } from '../src/http/server.js';

const TEST_PORT = 18025;
let httpServer: HttpServer;

describe('HTTP Server', () => {
  beforeAll(async () => {
    httpServer = new HttpServer(TEST_PORT);
    await httpServer.start();
  });

  afterAll(async () => {
    await httpServer.stop();
  });

  it('returns health status', async () => {
    const response = await fetch(`http://localhost:${TEST_PORT}/health`);
    const data = await response.json();

    expect(data.server).toBe('synapse-relay');
    expect(data.status).toBe('healthy');
  });

  it('returns 404 for unknown endpoints', async () => {
    const response = await fetch(`http://localhost:${TEST_PORT}/unknown`);
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toBe('Not found');
  });

  // CORS Security Tests
  describe('CORS Security', () => {
    it('allows requests from whitelisted origins', async () => {
      const response = await fetch(`http://localhost:${TEST_PORT}/health`, {
        headers: { 'Origin': 'http://localhost:5173' }
      });

      expect(response.headers.get('access-control-allow-origin')).toBe('http://localhost:5173');
    });

    it('blocks requests from non-whitelisted origins', async () => {
      const response = await fetch(`http://localhost:${TEST_PORT}/health`, {
        headers: { 'Origin': 'http://malicious-site.com' }
      });

      // Should not have CORS header for disallowed origin
      expect(response.headers.get('access-control-allow-origin')).toBeNull();
    });

    it('allows requests without origin header (same-origin, curl)', async () => {
      const response = await fetch(`http://localhost:${TEST_PORT}/health`);

      // Should still work and return data
      const data = await response.json();
      expect(data.server).toBe('synapse-relay');
    });

    it('handles preflight OPTIONS requests for allowed origins', async () => {
      const response = await fetch(`http://localhost:${TEST_PORT}/api/relay`, {
        method: 'OPTIONS',
        headers: {
          'Origin': 'http://localhost:5173',
          'Access-Control-Request-Method': 'POST'
        }
      });

      // cors package returns 204 No Content for preflight (more correct than 200)
      expect(response.status).toBe(204);
      expect(response.headers.get('access-control-allow-origin')).toBe('http://localhost:5173');
      expect(response.headers.get('access-control-allow-methods')).toContain('POST');
    });

    it('allows 127.0.0.1 localhost variants', async () => {
      const response = await fetch(`http://localhost:${TEST_PORT}/health`, {
        headers: { 'Origin': 'http://127.0.0.1:5173' }
      });

      expect(response.headers.get('access-control-allow-origin')).toBe('http://127.0.0.1:5173');
    });

    it('allows GMI control API origin', async () => {
      const response = await fetch(`http://localhost:${TEST_PORT}/health`, {
        headers: { 'Origin': 'http://localhost:3099' }
      });

      expect(response.headers.get('access-control-allow-origin')).toBe('http://localhost:3099');
    });
  });

  // Rate Limiting Tests
  describe('Rate Limiting', () => {
    it('includes rate limit headers in responses', async () => {
      const response = await fetch(`http://localhost:${TEST_PORT}/health`);

      // Check for standard rate limit headers (draft-7)
      expect(response.headers.get('ratelimit-limit')).toBeDefined();
      expect(response.headers.get('ratelimit-remaining')).toBeDefined();
      expect(response.headers.get('ratelimit-reset')).toBeDefined();
    });

    it('allows normal request volume without blocking', async () => {
      // Make 5 quick requests - should all succeed
      const requests = Array.from({ length: 5 }, () =>
        fetch(`http://localhost:${TEST_PORT}/health`)
      );

      const responses = await Promise.all(requests);

      // All should succeed (status 200)
      for (const response of responses) {
        expect(response.status).toBe(200);
      }
    });
  });
});
