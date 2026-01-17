import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import http from 'http';
import { teleprompterToolHandlers, teleprompterToolDefinitions, exportTeleprompter, airdropToIpad } from '../tools/teleprompter-tools.js';
import { notionToolHandlers, notionToolDefinitions, notionPushStory } from '../tools/notion-tools.js';
import { videoToolHandlers, videoToolDefinitions, runVideoPipeline, getVideoStatus } from '../tools/video-tools.js';
import { orchestratorToolHandlers, orchestratorToolDefinitions, startOvernightRun, startMorningPoll, getWorkflowStatus, pauseWorkflow, resumeWorkflow, getSchedule, updateSchedule } from '../tools/orchestrator-tools.js';
import { productionClient } from '../services/clients.js';
import { scheduler } from '../orchestrator/scheduler.js';
import { getDatabase } from '../database/schema.js';

// Combined tool definitions and handlers for gateway integration
const allToolDefinitions = [
  ...notionToolDefinitions,
  ...teleprompterToolDefinitions,
  ...videoToolDefinitions,
  ...orchestratorToolDefinitions
];

const allToolHandlers: Record<string, (args: unknown) => Promise<{ content: Array<{ type: 'text'; text: string }>; isError?: boolean }>> = {
  ...notionToolHandlers,
  ...teleprompterToolHandlers,
  ...videoToolHandlers,
  ...orchestratorToolHandlers
};

const app = express();

// Trust first proxy (nginx, load balancer) for accurate rate limiting
app.set('trust proxy', 1);

// CORS configuration - configurable via environment or default whitelist
const CORS_ORIGINS = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',')
  : ['http://localhost:5173', 'http://localhost:3099', 'http://127.0.0.1:5173', 'http://127.0.0.1:3099'];

app.use(cors({
  origin: CORS_ORIGINS,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

/**
 * Safely parse MCP tool result. Prevents crashes from malformed responses.
 */
function parseToolResult(result: { content: Array<{ type: string; text: string }>; isError?: boolean }): Record<string, unknown> {
  try {
    return JSON.parse(result.content[0]?.text || '{}') as Record<string, unknown>;
  } catch {
    return { error: 'Failed to parse tool response' };
  }
}

// Input validation helpers
const isValidUUID = (s: unknown): boolean => typeof s === 'string' && /^[a-f0-9-]{36}$/i.test(s);
const isValidFormat = (s: unknown): boolean => typeof s === 'string' && ['rtf', 'html', 'txt', 'notion'].includes(s);
const isValidWorkflowType = (s: unknown): boolean => typeof s === 'string' && ['overnight', 'morning'].includes(s);
const isValidJobId = (s: string): boolean => /^(video_)?[a-f0-9]{8}$/i.test(s);

// Request size limit
app.use(express.json({ limit: '1mb' }));

// General rate limiter - 100 requests per minute per IP
const generalLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 100,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.path === '/api/health',
  message: { error: 'Too many requests, please try again later' }
});

// Stricter rate limiter for Notion endpoints (Notion API has 3 req/sec limit)
const notionLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Notion rate limit exceeded, please wait before retrying' }
});

// Apply general limiter to all routes
app.use(generalLimiter);

// Error handler middleware
const asyncHandler = (fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

// === HEALTH ===

app.get('/api/health', (_req: Request, res: Response) => {
  let dbStatus = 'ok';
  try {
    const db = getDatabase();
    db.getStats(); // Simple query to verify connectivity
  } catch {
    dbStatus = 'error';
  }

  res.json({
    status: dbStatus === 'ok' ? 'ok' : 'degraded',
    timestamp: new Date().toISOString(),
    server: 'niws-delivery',
    version: '1.0.0',
    database: dbStatus
  });
});

// === EXPORT ENDPOINTS ===

// POST /api/export/teleprompter
app.post('/api/export/teleprompter', asyncHandler(async (req: Request, res: Response) => {
  const { scriptId, format } = req.body;

  if (!scriptId || !format) {
    res.status(400).json({ error: 'scriptId and format are required' });
    return;
  }

  const result = await exportTeleprompter({ scriptId, format });
  const data = parseToolResult(result);

  if (result.isError) {
    res.status(500).json({ error: data });
    return;
  }

  res.json({
    exportId: data.exportId,
    filePath: data.filePath
  });
}));

// POST /api/export/notion - uses stricter rate limit
app.post('/api/export/notion', notionLimiter, asyncHandler(async (req: Request, res: Response) => {
  const { scriptId, briefId, database } = req.body;

  if (!scriptId) {
    res.status(400).json({ error: 'scriptId is required' });
    return;
  }

  // Get script to get storyId
  const script = await productionClient.getScript(scriptId);
  const storyId = script.storyId;
  const actualBriefId = briefId || script.briefId;

  const result = await notionPushStory({ storyId, briefId: actualBriefId, scriptId });
  const data = parseToolResult(result);

  if (result.isError) {
    res.status(500).json({ error: data });
    return;
  }

  const notionPageId = String(data.notionPageId || '');
  res.json({
    exportId: data.exportId || `notion_${Date.now()}`,
    notionPageId,
    url: data.url || `https://notion.so/${notionPageId.replace(/-/g, '')}`
  });
}));

// POST /api/export/airdrop
app.post('/api/export/airdrop', asyncHandler(async (req: Request, res: Response) => {
  const { filePath, device } = req.body;

  if (!filePath) {
    res.status(400).json({ error: 'filePath is required' });
    return;
  }

  const result = await airdropToIpad({ filePath, device });
  const data = parseToolResult(result);

  if (result.isError) {
    res.status(500).json({ error: data });
    return;
  }

  res.json({
    status: data.status === 'sent' ? 'sent' : 'failed'
  });
}));

// === VIDEO ENDPOINTS ===

// POST /api/video/build
app.post('/api/video/build', asyncHandler(async (req: Request, res: Response) => {
  const { scriptId, options } = req.body;

  if (!scriptId) {
    res.status(400).json({ error: 'scriptId is required' });
    return;
  }

  const platforms = options?.platforms || ['youtube'];
  const result = await runVideoPipeline({
    scriptId,
    platforms,
    chromaKeySource: options?.chromaKeySource,
    motionGraphics: options?.motionGraphics
  });
  const data = parseToolResult(result);

  if (result.isError) {
    res.status(500).json({ error: data });
    return;
  }

  res.json({
    jobId: data.jobId,
    status: 'queued'
  });
}));

// GET /api/video/status/:jobId
app.get('/api/video/status/:jobId', asyncHandler(async (req: Request, res: Response) => {
  const { jobId } = req.params;

  // Validate jobId format to prevent path traversal
  if (!isValidJobId(jobId)) {
    res.status(400).json({ error: 'Invalid jobId format' });
    return;
  }

  const result = await getVideoStatus({ jobId });
  const data = parseToolResult(result);

  if (result.isError) {
    res.status(404).json({ error: 'Job not found' });
    return;
  }

  res.json(data);
}));

// === WORKFLOW ENDPOINTS ===

// POST /api/workflow/start
app.post('/api/workflow/start', asyncHandler(async (req: Request, res: Response) => {
  const { type } = req.body;

  if (!type || !['overnight', 'morning'].includes(type)) {
    res.status(400).json({ error: 'type must be "overnight" or "morning"' });
    return;
  }

  const result = type === 'overnight'
    ? await startOvernightRun()
    : await startMorningPoll();

  const data = parseToolResult(result);

  if (result.isError) {
    res.status(500).json({ error: data });
    return;
  }

  res.json({
    runId: data.runId,
    status: 'started'
  });
}));

// GET /api/workflow/status
app.get('/api/workflow/status', asyncHandler(async (_req: Request, res: Response) => {
  const result = await getWorkflowStatus();
  const data = parseToolResult(result);

  if (data.status === 'idle') {
    res.json(null);
    return;
  }

  res.json(data);
}));

// POST /api/workflow/pause
app.post('/api/workflow/pause', asyncHandler(async (_req: Request, res: Response) => {
  const result = await pauseWorkflow();
  const data = parseToolResult(result);

  if (result.isError) {
    res.status(400).json({ error: data });
    return;
  }

  res.json({
    status: 'paused'
  });
}));

// POST /api/workflow/resume
app.post('/api/workflow/resume', asyncHandler(async (_req: Request, res: Response) => {
  const result = await resumeWorkflow();
  const data = parseToolResult(result);

  if (result.isError) {
    res.status(400).json({ error: data });
    return;
  }

  res.json({
    status: 'resumed'
  });
}));

// GET /api/workflow/schedule
app.get('/api/workflow/schedule', asyncHandler(async (_req: Request, res: Response) => {
  const result = await getSchedule();
  const data = parseToolResult(result);

  res.json({
    schedules: data.schedules
  });
}));

// PUT /api/workflow/schedule
app.put('/api/workflow/schedule', asyncHandler(async (req: Request, res: Response) => {
  const { schedules } = req.body;

  if (!schedules || !Array.isArray(schedules)) {
    res.status(400).json({ error: 'schedules array is required' });
    return;
  }

  for (const schedule of schedules) {
    await updateSchedule({
      id: schedule.id,
      cronExpr: schedule.cronExpr,
      enabled: schedule.enabled
    });
  }

  res.json({
    updated: true
  });
}));

// ===== GATEWAY INTEGRATION ENDPOINTS =====

// GET /api/tools - List all MCP tools
app.get('/api/tools', (_req: Request, res: Response) => {
  const tools = allToolDefinitions.map(t => ({
    name: t.name,
    description: t.description,
    inputSchema: t.inputSchema
  }));
  res.json({ tools, count: tools.length });
});

// POST /api/tools/:toolName - Execute MCP tool
app.post('/api/tools/:toolName', asyncHandler(async (req: Request, res: Response) => {
  const { toolName } = req.params;
  const args = req.body.arguments || req.body;

  const handler = allToolHandlers[toolName];
  if (!handler) {
    res.status(404).json({ success: false, error: `Tool '${toolName}' not found` });
    return;
  }

  try {
    const result = await handler(args);
    res.json({ success: true, result });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error)
    });
  }
}));

// Error handling middleware
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[HTTP] Error:', err.message);
  res.status(500).json({
    error: 'Internal server error',
    message: err.message
  });
});

export function startHttpServer(port: number = 8036): Promise<http.Server> {
  return new Promise((resolve, reject) => {
    const server = app.listen(port, () => {
      console.log(`[HTTP] niws-delivery listening on port ${port}`);
      resolve(server);
    });

    server.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        console.error(`[HTTP] Port ${port} is already in use`);
      } else {
        console.error(`[HTTP] Server error:`, err.message);
      }
      reject(err);
    });
  });
}

export { app };
