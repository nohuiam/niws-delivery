import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import './setup';

describe('database schema', () => {
  // Store the original console.warn to restore later
  let originalWarn: typeof console.warn;

  beforeEach(() => {
    originalWarn = console.warn;
  });

  afterEach(() => {
    console.warn = originalWarn;
  });

  describe('safeJsonParse behavior', () => {
    it('should handle valid JSON in video job platforms', async () => {
      // This tests that the database correctly parses JSON fields
      // The safeJsonParse function is internal, so we test via the public API
      const { DatabaseManager, closeDatabase } = await import('../src/database/schema.js');

      // Create a temporary database
      const db = new DatabaseManager(':memory:');

      // Insert a video job with platforms
      db.insertVideoJob({
        id: 'test-job-1',
        status: 'queued',
        progress: 0,
        platforms: ['youtube', 'tiktok'],
        config: { test: true },
        createdAt: new Date().toISOString()
      });

      // Retrieve and verify
      const job = db.getVideoJob('test-job-1');
      expect(job).toBeDefined();
      expect(job?.platforms).toEqual(['youtube', 'tiktok']);
      expect(job?.config).toEqual({ test: true });

      db.close();
    });

    it('should handle null platforms and config', async () => {
      const { DatabaseManager } = await import('../src/database/schema.js');

      const db = new DatabaseManager(':memory:');

      db.insertVideoJob({
        id: 'test-job-2',
        status: 'queued',
        progress: 0,
        createdAt: new Date().toISOString()
      });

      const job = db.getVideoJob('test-job-2');
      expect(job).toBeDefined();
      expect(job?.platforms).toBeUndefined();
      expect(job?.config).toBeUndefined();

      db.close();
    });
  });

  describe('singleton behavior', () => {
    it('should return same instance on multiple calls', async () => {
      const { getDatabase, closeDatabase } = await import('../src/database/schema.js');

      // Close any existing instance first
      closeDatabase();

      const db1 = getDatabase(':memory:');
      const db2 = getDatabase();

      expect(db1).toBe(db2);

      closeDatabase();
    });

    it('should warn when called with different dbPath after init', async () => {
      const { getDatabase, closeDatabase } = await import('../src/database/schema.js');

      // Close any existing instance first
      closeDatabase();

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      // First call creates the instance
      const db1 = getDatabase(':memory:');

      // Second call with different path should warn
      const db2 = getDatabase('/different/path.db');

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('getDatabase called with dbPath after initialization')
      );
      expect(db1).toBe(db2);

      warnSpy.mockRestore();
      closeDatabase();
    });
  });

  describe('workflow operations', () => {
    it('should insert and retrieve workflow runs', async () => {
      const { DatabaseManager } = await import('../src/database/schema.js');

      const db = new DatabaseManager(':memory:');

      db.insertWorkflowRun({
        id: 'run-1',
        workflowType: 'overnight',
        status: 'running',
        startedAt: new Date().toISOString()
      });

      const run = db.getWorkflowRun('run-1');
      expect(run).toBeDefined();
      expect(run?.workflowType).toBe('overnight');
      expect(run?.status).toBe('running');

      db.close();
    });

    it('should update workflow runs', async () => {
      const { DatabaseManager } = await import('../src/database/schema.js');

      const db = new DatabaseManager(':memory:');

      db.insertWorkflowRun({
        id: 'run-2',
        workflowType: 'morning',
        status: 'running',
        startedAt: new Date().toISOString()
      });

      db.updateWorkflowRun('run-2', { status: 'complete' });

      const run = db.getWorkflowRun('run-2');
      expect(run?.status).toBe('complete');

      db.close();
    });
  });

  describe('pending actions', () => {
    it('should insert and retrieve pending actions', async () => {
      const { DatabaseManager } = await import('../src/database/schema.js');

      const db = new DatabaseManager(':memory:');

      db.insertPendingAction({
        id: 'action-1',
        type: 'approval',
        description: 'Test action',
        status: 'pending',
        createdAt: new Date().toISOString()
      });

      const action = db.getPendingAction('action-1');
      expect(action).toBeDefined();
      expect(action?.type).toBe('approval');
      expect(action?.description).toBe('Test action');

      db.close();
    });

    it('should list pending actions by status', async () => {
      const { DatabaseManager } = await import('../src/database/schema.js');

      const db = new DatabaseManager(':memory:');

      db.insertPendingAction({
        id: 'action-2',
        type: 'approval',
        description: 'Pending action',
        status: 'pending',
        createdAt: new Date().toISOString()
      });

      db.insertPendingAction({
        id: 'action-3',
        type: 'approval',
        description: 'Approved action',
        status: 'approved',
        createdAt: new Date().toISOString()
      });

      const pendingActions = db.listPendingActions('pending');
      expect(pendingActions).toHaveLength(1);
      expect(pendingActions[0].id).toBe('action-2');

      db.close();
    });
  });

  describe('getStats', () => {
    it('should return statistics', async () => {
      const { DatabaseManager } = await import('../src/database/schema.js');

      const db = new DatabaseManager(':memory:');

      const stats = db.getStats();
      expect(stats).toHaveProperty('workflow_runs');
      expect(stats).toHaveProperty('video_jobs');
      expect(stats).toHaveProperty('pending_actions');
      expect(stats.workflow_runs).toHaveProperty('total');
      expect(stats.workflow_runs).toHaveProperty('by_status');

      db.close();
    });
  });
});
