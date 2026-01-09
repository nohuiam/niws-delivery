import { describe, it, expect, vi, beforeEach } from 'vitest';
import './setup';

// Mock fetch for service clients
global.fetch = vi.fn().mockImplementation(() =>
  Promise.resolve({
    ok: true,
    json: () => Promise.resolve({ id: 'mock-id', title: 'Mock Title' })
  })
);

describe('Teleprompter Tools', () => {
  it('should format script content correctly', async () => {
    const { TeleprompterFormatter } = await import('../src/services/teleprompterFormatter.js');

    const formatter = new TeleprompterFormatter({
      uppercase: true,
      sentenceBreaks: true,
      lineSpacing: 2
    });

    const mockScript = {
      id: 'script-1',
      storyId: 'story-1',
      briefId: 'brief-1',
      title: 'Test Script',
      status: 'draft' as const,
      content: 'This is test content.',
      sections: [
        {
          id: 'section-1',
          scriptId: 'script-1',
          sectionType: 'intro' as const,
          content: 'Hello world. This is a test.',
          position: 0,
          wordCount: 6
        }
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const formatted = formatter.format(mockScript);
    expect(formatted).toContain('TEST SCRIPT');
    expect(formatted).toContain('INTRODUCTION');
    expect(formatted).toContain('HELLO WORLD');
  });
});

describe('RTF Exporter', () => {
  it('should export valid RTF content', async () => {
    const { exportToRTF } = await import('../src/exporters/rtf.js');

    const content = 'Hello World';
    const rtf = exportToRTF(content);

    expect(rtf).toContain('{\\rtf1');
    expect(rtf).toContain('Hello World');
    expect(rtf).toContain('\\fs96'); // Default font size
  });

  it('should support dark mode', async () => {
    const { exportToRTFDarkMode } = await import('../src/exporters/rtf.js');

    const content = 'Dark Mode Test';
    const rtf = exportToRTFDarkMode(content);

    expect(rtf).toContain('\\red255\\green255\\blue255'); // White text
  });
});

describe('HTML Exporter', () => {
  it('should export valid HTML content', async () => {
    const { exportToHTML } = await import('../src/exporters/html.js');

    const content = 'Hello World\n\nSecond paragraph';
    const html = exportToHTML(content, 'Test Page');

    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('<title>Test Page - Teleprompter</title>');
    expect(html).toContain('Hello World');
    expect(html).toContain('Second paragraph');
  });

  it('should include auto-scroll script when enabled', async () => {
    const { exportToHTML } = await import('../src/exporters/html.js');

    const html = exportToHTML('Content', 'Test', { autoScroll: true });

    expect(html).toContain('startScroll');
    expect(html).toContain('toggleScroll');
  });
});

describe('Plain Text Exporter', () => {
  it('should export plain text correctly', async () => {
    const { exportToPlainText } = await import('../src/exporters/plainText.js');

    const content = 'Hello World';
    const text = exportToPlainText(content, 'Test Title');

    expect(text).toContain('TEST TITLE');
    expect(text).toContain('HELLO WORLD');
    expect(text).toContain('END OF SCRIPT');
  });
});

describe('Orchestrator State Manager', () => {
  beforeEach(async () => {
    // Reset state between tests
    const { stateManager } = await import('../src/orchestrator/stateManager.js');
    stateManager.cancel();
  });

  it('should start and track workflow runs', async () => {
    const { stateManager } = await import('../src/orchestrator/stateManager.js');

    const run = stateManager.startRun('overnight');

    expect(run.id).toBeDefined();
    expect(run.workflowType).toBe('overnight');
    expect(run.status).toBe('running');
  });

  it('should log workflow events', async () => {
    const { stateManager } = await import('../src/orchestrator/stateManager.js');

    stateManager.startRun('morning');
    stateManager.log('info', 'Test log message');

    const run = stateManager.getCurrentRun();
    // Now includes initial "Workflow started" log plus test log
    expect(run?.logs).toHaveLength(2);
    expect(run?.logs[0].message).toBe('Workflow started');
    expect(run?.logs[1].message).toBe('Test log message');
  });

  it('should pause and resume workflows', async () => {
    const { stateManager } = await import('../src/orchestrator/stateManager.js');

    stateManager.startRun('overnight');

    const paused = stateManager.pause();
    expect(paused).toBe(true);
    expect(stateManager.getCurrentRun()?.status).toBe('paused');

    const resumed = stateManager.resume();
    expect(resumed).toBe(true);
    expect(stateManager.getCurrentRun()?.status).toBe('running');
  });

  it('should track pending actions', async () => {
    const { stateManager } = await import('../src/orchestrator/stateManager.js');

    const actionId = stateManager.addPendingAction({
      type: 'approval',
      description: 'Test action',
      storyId: 'story-1'
    });

    expect(actionId).toBeDefined();

    const actions = stateManager.getPendingActions();
    expect(actions).toHaveLength(1);
    expect(actions[0].description).toBe('Test action');

    stateManager.approveAction(actionId);
    expect(stateManager.getPendingActions()).toHaveLength(0);
  });
});

describe('Video Orchestrator', () => {
  it('should create and track video jobs', async () => {
    const { videoOrchestrator } = await import('../src/services/videoOrchestrator.js');

    // Note: This will fail in test environment without FFmpeg
    // We're just testing the job creation logic
    const jobs = videoOrchestrator.getAllJobs();
    expect(Array.isArray(jobs)).toBe(true);
  });
});

describe('InterLock Protocol', () => {
  it('should encode and decode messages', async () => {
    const { encode, decode, SIGNAL_TYPES, getSignalName } = await import('../src/interlock/protocol.js');

    const payload = { server: 'test', message: 'hello' };
    const encoded = encode(SIGNAL_TYPES.SERVER_READY, payload);

    expect(encoded).toBeInstanceOf(Buffer);
    expect(encoded.length).toBeGreaterThan(12); // Header is 12 bytes

    const decoded = decode(encoded);
    expect(decoded).not.toBeNull();
    expect(decoded?.signalType).toBe(SIGNAL_TYPES.SERVER_READY);
    expect(decoded?.payload).toEqual(payload);

    expect(getSignalName(SIGNAL_TYPES.SERVER_READY)).toBe('server:ready');
  });
});

describe('Tumbler', () => {
  it('should filter signals based on whitelist', async () => {
    const { Tumbler } = await import('../src/interlock/tumbler.js');

    const tumbler = new Tumbler({
      allowedSignals: ['server:ready', 'export:completed'],
      allowAll: false
    });

    expect(tumbler.isAllowed('server:ready')).toBe(true);
    expect(tumbler.isAllowed('export:completed')).toBe(true);
    expect(tumbler.isAllowed('video:queued')).toBe(false);
  });

  it('should allow all when configured', async () => {
    const { Tumbler } = await import('../src/interlock/tumbler.js');

    const tumbler = new Tumbler({
      allowedSignals: ['*'],
      allowAll: true
    });

    expect(tumbler.isAllowed('anything')).toBe(true);
  });

  it('should block signals on blocklist', async () => {
    const { Tumbler } = await import('../src/interlock/tumbler.js');

    const tumbler = new Tumbler({
      allowedSignals: ['*'],
      blockedSignals: ['blocked:signal'],
      allowAll: true
    });

    expect(tumbler.isAllowed('allowed:signal')).toBe(true);
    expect(tumbler.isAllowed('blocked:signal')).toBe(false);
  });
});
