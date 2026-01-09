/**
 * HTTP Server for niws-analysis
 *
 * REST API endpoints with production-ready middleware:
 * - Compression (gzip)
 * - Rate limiting
 * - Request ID tracking
 * - Structured logging
 * - Prometheus metrics
 * - Deep health checks
 */

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import http from 'http';
import { v4 as uuidv4 } from 'uuid';
import { getBiasAnalyzer } from '../services/biasAnalyzer.js';
import { getAnalysisDatabase } from '../database/analysisDatabase.js';
import { checkHealth } from '../services/healthChecker.js';
import { logger, createRequestLogger } from '../logging/index.js';
import {
  httpRequestDuration,
  httpRequestTotal,
  rateLimitHits,
  getMetrics,
  getMetricsContentType,
} from '../metrics/index.js';
import type { AnalysisType } from '../types.js';

const HTTP_PORT = parseInt(process.env.HTTP_PORT || '8034', 10);

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      requestId?: string;
      log?: ReturnType<typeof createRequestLogger>;
    }
  }
}

/**
 * Request ID middleware - generates or uses existing X-Request-ID
 */
function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const requestId = (req.headers['x-request-id'] as string) || uuidv4();
  req.requestId = requestId;
  req.log = createRequestLogger(requestId);
  res.setHeader('X-Request-ID', requestId);
  next();
}

/**
 * Request logging middleware with metrics
 */
function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();
  const { method, path } = req;

  res.on('finish', () => {
    const duration = Date.now() - start;
    const durationSeconds = duration / 1000;
    const { statusCode } = res;

    // Log request
    const log = req.log || logger;
    log.http(`${method} ${path} ${statusCode} ${duration}ms`);

    // Record metrics
    const normalizedPath = normalizePath(path);
    httpRequestDuration.observe({ method, path: normalizedPath, status: statusCode.toString() }, durationSeconds);
    httpRequestTotal.inc({ method, path: normalizedPath, status: statusCode.toString() });
  });

  next();
}

/**
 * Normalize path for metrics (replace IDs with :id)
 */
function normalizePath(path: string): string {
  // Replace UUIDs and IDs with :id
  return path
    .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '/:id')
    .replace(/\/[a-zA-Z0-9_-]{20,}/g, '/:id');
}

// Rate limit error messages (single source of truth)
const RATE_LIMIT_MESSAGES = {
  general: 'Too many requests, please try again later',
  analysis: 'Too many analysis requests, please try again later',
};

/**
 * Create rate limiters
 *
 * Note: Uses in-memory store by default. For multi-instance deployments,
 * configure REDIS_URL environment variable to use Redis store.
 * Example: REDIS_URL=redis://localhost:6379
 */
function createRateLimiters() {
  // Log warning about in-memory store in production
  if (process.env.NODE_ENV === 'production' && !process.env.REDIS_URL) {
    logger.warn('Rate limiter using in-memory store. For multi-instance deployments, set REDIS_URL.');
  }

  // General rate limiter - 100 requests per minute
  const generalLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req, res) => {
      rateLimitHits.inc({ endpoint: 'general' });
      res.status(429).json({ error: RATE_LIMIT_MESSAGES.general });
    },
    // Note: To use Redis store, install rate-limit-redis and configure:
    // store: new RedisStore({ client: redisClient })
  });

  // Analysis rate limiter - 10 requests per minute (protects Claude API)
  const analysisLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req, res) => {
      rateLimitHits.inc({ endpoint: 'analysis' });
      res.status(429).json({ error: RATE_LIMIT_MESSAGES.analysis });
    },
  });

  return { generalLimiter, analysisLimiter };
}

export function createHttpServer() {
  const app = express();
  const { generalLimiter, analysisLimiter } = createRateLimiters();

  // === Middleware Stack (order matters!) ===

  // 1. Request ID (first, so all logs have it)
  app.use(requestIdMiddleware);

  // 2. CORS configuration
  app.use(cors({
    origin: process.env.CORS_ORIGIN || '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
    exposedHeaders: ['X-Request-ID', 'X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-RateLimit-Reset'],
  }));

  // 3. Compression (before other body processing)
  app.use(compression({
    threshold: 1024, // Only compress responses > 1KB
    filter: (req, res) => {
      if (req.headers['x-no-compression']) return false;
      return compression.filter(req, res);
    },
  }));

  // 4. Request logging
  app.use(requestLogger);

  // 5. General rate limiter (applied to all routes)
  app.use(generalLimiter);

  // 6. JSON body parser
  app.use(express.json({ limit: '10mb' }));

  const analyzer = getBiasAnalyzer();
  const db = getAnalysisDatabase();

  // === Metrics Endpoint (with optional auth) ===
  // Set METRICS_AUTH_TOKEN env var to require Bearer token authentication
  app.get('/metrics', async (req: Request, res: Response) => {
    const authToken = process.env.METRICS_AUTH_TOKEN;

    // If auth token is configured, require it
    if (authToken) {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({ error: 'Authentication required for metrics endpoint' });
        return;
      }

      const providedToken = authHeader.slice(7); // Remove 'Bearer ' prefix
      if (providedToken !== authToken) {
        res.status(403).json({ error: 'Invalid authentication token' });
        return;
      }
    }

    try {
      const metrics = await getMetrics();
      res.setHeader('Content-Type', getMetricsContentType());
      res.send(metrics);
    } catch (error) {
      res.status(500).json({ error: 'Failed to collect metrics' });
    }
  });

  // === Health Check (supports deep=true) ===
  app.get('/api/health', async (req: Request, res: Response) => {
    try {
      const deep = req.query.deep === 'true';
      const health = await checkHealth(deep);

      const statusCode = health.status === 'healthy' ? 200 :
                         health.status === 'degraded' ? 200 : 503;

      res.status(statusCode).json(health);
    } catch (error) {
      res.status(503).json({
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: 'Health check failed',
      });
    }
  });

  // === GET /api/analyses ===
  app.get('/api/analyses', (req: Request, res: Response) => {
    try {
      const limitParam = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;
      const offsetParam = req.query.offset ? parseInt(req.query.offset as string, 10) : 0;
      const limit = Number.isNaN(limitParam) ? 50 : Math.min(Math.max(1, limitParam), 100);
      const offset = Number.isNaN(offsetParam) ? 0 : Math.max(0, offsetParam);

      const options = {
        articleId: req.query.articleId as string | undefined,
        type: req.query.type as AnalysisType | undefined,
        status: req.query.status as 'pending' | 'processing' | 'complete' | 'failed' | undefined,
        limit,
        offset,
      };

      const result = db.getAnalyses(options);
      res.json(result);
    } catch (error) {
      req.log?.error('Failed to get analyses', { error });
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // === GET /api/analyses/:id ===
  app.get('/api/analyses/:id', (req: Request, res: Response) => {
    try {
      const analysis = db.getAnalysisById(req.params.id);
      if (!analysis) {
        res.status(404).json({ error: 'Analysis not found' });
        return;
      }
      res.json(analysis);
    } catch (error) {
      req.log?.error('Failed to get analysis', { error, analysisId: req.params.id });
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // === GET /api/analyses/story/:storyId ===
  app.get('/api/analyses/story/:storyId', (req: Request, res: Response) => {
    try {
      const result = db.getAnalysesByStoryId(req.params.storyId);
      res.json(result);
    } catch (error) {
      req.log?.error('Failed to get story analyses', { error, storyId: req.params.storyId });
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // === POST /api/analyze (with stricter rate limit) ===
  app.post('/api/analyze', analysisLimiter, async (req: Request, res: Response) => {
    try {
      const { articleId, type, inline } = req.body;

      if (!articleId) {
        res.status(400).json({ error: 'articleId is required' });
        return;
      }

      req.log?.info('Starting analysis', { articleId, type, hasInline: !!inline });

      const analysisType = (type || 'bias') as AnalysisType;

      if (inline) {
        const result = await analyzer.analyzeArticleContent({
          articleId,
          title: inline.title,
          content: inline.content,
          outletName: inline.outletName,
          outletLean: inline.outletLean,
          publishedAt: inline.publishedAt,
          analysisType,
        });

        req.log?.info('Analysis complete', { analysisId: result.analysis.id, status: result.analysis.status });

        res.json({
          analysisId: result.analysis.id,
          status: result.analysis.status,
          result: result.analysis.result,
        });
        return;
      }

      const result = await analyzer.analyzeArticle(articleId, analysisType);

      req.log?.info('Analysis complete', { analysisId: result.analysis.id, status: result.analysis.status });

      res.json({
        analysisId: result.analysis.id,
        status: result.analysis.status,
        result: result.analysis.result,
      });
    } catch (error) {
      req.log?.error('Analysis failed', { error });
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // === POST /api/compare (with stricter rate limit) ===
  app.post('/api/compare', analysisLimiter, async (req: Request, res: Response) => {
    try {
      const { storyId, articleIds, storyTopic, articles } = req.body;

      if (!storyId) {
        res.status(400).json({ error: 'storyId is required' });
        return;
      }

      req.log?.info('Starting comparison', { storyId, articleCount: articles?.length || articleIds?.length });

      if (articles && storyTopic) {
        if (articles.length < 2) {
          res.status(400).json({ error: 'At least 2 articles required for comparison' });
          return;
        }

        const result = await analyzer.compareArticles({
          storyId,
          storyTopic,
          articles: articles.map((a: Record<string, string>) => ({
            articleId: a.articleId,
            title: a.title,
            content: a.content,
            outletName: a.outletName,
            outletLean: a.outletLean,
            publishedAt: a.publishedAt,
          })),
        });

        req.log?.info('Comparison complete', { comparisonId: result.comparison.id });

        res.json({
          comparisonId: result.comparison.id,
          differences: result.comparison.framingDifferences,
          assessment: result.comparison.overallAssessment,
        });
        return;
      }

      if (!articleIds || articleIds.length < 2) {
        res.status(400).json({ error: 'At least 2 articleIds required for comparison' });
        return;
      }

      const result = await analyzer.compareCoverage(storyId, articleIds);

      req.log?.info('Comparison complete', { comparisonId: result.comparison.id });

      res.json({
        comparisonId: result.comparison.id,
        differences: result.comparison.framingDifferences,
        assessment: result.comparison.overallAssessment,
      });
    } catch (error) {
      req.log?.error('Comparison failed', { error });
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // === GET /api/lexicon ===
  app.get('/api/lexicon', (req: Request, res: Response) => {
    try {
      const category = req.query.category as string | undefined;

      if (category) {
        const entries = db.getLexiconByCategory(category);
        res.json({ entries, count: entries.length });
        return;
      }

      const entries = db.getAllLexicon();
      res.json({ entries, count: entries.length });
    } catch (error) {
      req.log?.error('Failed to get lexicon', { error });
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // === GET /api/lexicon/:word ===
  app.get('/api/lexicon/:word', (req: Request, res: Response) => {
    try {
      const entry = db.getLexiconEntry(req.params.word);
      if (!entry) {
        res.status(404).json({ error: 'Word not found' });
        return;
      }
      res.json(entry);
    } catch (error) {
      req.log?.error('Failed to get lexicon entry', { error, word: req.params.word });
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // === POST /api/lexicon ===
  app.post('/api/lexicon', (req: Request, res: Response) => {
    try {
      const { word, category, lean, severity, alternatives } = req.body;

      if (!word || !category || severity === undefined || !alternatives) {
        res.status(400).json({ error: 'word, category, severity, and alternatives are required' });
        return;
      }

      const entry = db.addLexiconEntry({
        word,
        category,
        lean,
        severity,
        alternatives,
      });

      req.log?.info('Lexicon entry added', { word, category });
      res.status(201).json(entry);
    } catch (error) {
      req.log?.error('Failed to add lexicon entry', { error });
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // === GET /api/stats ===
  app.get('/api/stats', (_req: Request, res: Response) => {
    try {
      const stats = db.getStats();
      res.json(stats);
    } catch (error) {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Error handler
  app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
    req.log?.error('Unhandled error', { error: err });
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}

// Server instance for graceful shutdown
let httpServer: http.Server | null = null;

export function startHttpServer(port: number = HTTP_PORT): Promise<http.Server> {
  return new Promise((resolve) => {
    const app = createHttpServer();
    httpServer = app.listen(port, () => {
      logger.info(`HTTP server listening on port ${port}`);
      resolve(httpServer!);
    });
  });
}

export function stopHttpServer(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!httpServer) {
      resolve();
      return;
    }

    httpServer.close((err) => {
      if (err) {
        reject(err);
        return;
      }
      logger.info('HTTP server closed');
      httpServer = null;
      resolve();
    });
  });
}

export function getHttpServer(): http.Server | null {
  return httpServer;
}
