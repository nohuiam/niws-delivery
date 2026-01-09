import { vi } from 'vitest';

// Mock better-sqlite3 for tests that don't need real DB
// Note: Tests that explicitly create DatabaseManager with :memory: will use real SQLite
vi.mock('better-sqlite3', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>;
  return {
    ...actual,
    // Keep the default export functional but allow :memory: databases
    default: actual.default
  };
});

// Mock external services
vi.mock('@notionhq/client', () => ({
  Client: vi.fn().mockImplementation(() => ({
    pages: {
      create: vi.fn().mockResolvedValue({ id: 'mock-page-id', properties: {} }),
      update: vi.fn().mockResolvedValue({ id: 'mock-page-id', properties: {} })
    },
    databases: {
      query: vi.fn().mockResolvedValue({ results: [] }),
      retrieve: vi.fn().mockResolvedValue({ id: 'mock-db-id', title: [], properties: {} })
    },
    comments: {
      list: vi.fn().mockResolvedValue({ results: [] }),
      create: vi.fn().mockResolvedValue({ id: 'mock-comment-id' })
    }
  })),
  APIErrorCode: {
    RateLimited: 'rate_limited'
  },
  isNotionClientError: vi.fn().mockReturnValue(false)
}));

// Mock child_process for FFmpeg, AirDrop, and shell-safe utilities
vi.mock('child_process', () => ({
  exec: vi.fn((cmd, callback) => {
    if (typeof callback === 'function') {
      callback(null, { stdout: '{}', stderr: '' });
    }
    return { stdout: '{}', stderr: '' };
  }),
  execFile: vi.fn((cmd, args, options, callback) => {
    // Handle different function signatures
    const cb = typeof options === 'function' ? options : callback;
    if (typeof cb === 'function') {
      cb(null, '{}', '');
    }
    return { stdout: '{}', stderr: '' };
  })
}));

// Mock node-cron
vi.mock('node-cron', () => ({
  default: {
    schedule: vi.fn().mockReturnValue({ stop: vi.fn() }),
    validate: vi.fn().mockReturnValue(true)
  }
}));

// Set test environment
process.env.NOTION_TOKEN = 'test-token';
process.env.NOTION_DATABASE_ID = 'test-database-id';
process.env.NIWS_INTAKE_URL = 'http://localhost:8033';
process.env.NIWS_ANALYSIS_URL = 'http://localhost:8034';
process.env.NIWS_PRODUCTION_URL = 'http://localhost:8035';
