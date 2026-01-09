/**
 * HTTP REST API Server
 *
 * Port: 8022
 * Provides REST endpoints for Safe Batch Processor.
 */

import express, { Request, Response, NextFunction } from 'express';
import { Server } from 'http';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { getDatabase } from '../database/schema.js';
import { executeBatch } from '../core/executor.js';
import { validateBatch } from '../core/validator.js';
import { rollbackBatch } from '../core/rollback.js';

// CORS whitelist - restrict to known origins for security
const ALLOWED_ORIGINS = [
  'http://localhost:5173',   // GMI frontend (Vite)
  'http://127.0.0.1:5173',
  'http://localhost:3099',   // GMI control API
  'http://localhost:8022'    // Self
];

// Rate limiting configuration
const generalLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  limit: 100, // 100 requests per minute
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later', retryAfter: '60s' }
});

const batchLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  limit: 20, // 20 batch operations per minute (conservative for file ops)
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many batch requests, please try again later', retryAfter: '60s' }
});

export class HttpServer {
  private app: express.Application;
  private server: Server | null = null;
  private port: number;

  constructor(port: number) {
    this.port = port;
    this.app = express();
    this.setupMiddleware();
    this.setupRoutes();
  }

  private setupMiddleware(): void {
    this.app.use(express.json());

    // CORS - Restrict to known origins for security
    this.app.use(cors({
      origin: (origin, callback) => {
        // Allow requests with no origin (same-origin, curl, etc.)
        if (!origin) return callback(null, true);
        if (ALLOWED_ORIGINS.includes(origin)) {
          return callback(null, true);
        }
        callback(null, false);
      },
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization']
    }));

    // Apply general rate limiting
    this.app.use(generalLimiter);
  }

  private setupRoutes(): void {
    // Health check
    this.app.get('/health', (req: Request, res: Response) => {
      const db = getDatabase();
      const stats = db.getStats();

      res.json({
        status: 'healthy',
        server: 'safe-batch-processor',
        port: this.port,
        stats
      });
    });

    // Execute batch operation (stricter rate limit for file ops)
    this.app.post('/api/batch', batchLimiter, async (req: Request, res: Response) => {
      try {
        const result = await executeBatch(req.body);
        res.json(result);
      } catch (error) {
        res.status(400).json({ error: (error as Error).message });
      }
    });

    // Validate batch before execution
    this.app.post('/api/validate', (req: Request, res: Response) => {
      try {
        const result = validateBatch(req.body.operations || []);
        res.json(result);
      } catch (error) {
        res.status(400).json({ error: (error as Error).message });
      }
    });

    // Rollback batch operation (stricter rate limit for file ops)
    this.app.post('/api/rollback', batchLimiter, async (req: Request, res: Response) => {
      try {
        const result = await rollbackBatch(req.body);
        res.json(result);
      } catch (error) {
        res.status(400).json({ error: (error as Error).message });
      }
    });

    // List batch operations
    this.app.get('/api/batches', (req: Request, res: Response) => {
      try {
        const db = getDatabase();
        const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;
        const batches = db.listBatchOperations(limit);
        res.json({ batches });
      } catch (error) {
        res.status(500).json({ error: (error as Error).message });
      }
    });

    // Get specific batch status
    this.app.get('/api/batches/:id', (req: Request, res: Response) => {
      try {
        const db = getDatabase();
        const batch = db.getBatchOperation(req.params.id);
        if (!batch) {
          res.status(404).json({ error: 'Batch not found' });
          return;
        }
        res.json(batch);
      } catch (error) {
        res.status(500).json({ error: (error as Error).message });
      }
    });

    // Get batch item details
    this.app.get('/api/batches/:id/items', (req: Request, res: Response) => {
      try {
        const db = getDatabase();
        const items = db.getBatchItems(req.params.id);
        res.json({ items });
      } catch (error) {
        res.status(500).json({ error: (error as Error).message });
      }
    });

    // Cancel pending batch (not implemented - batches run synchronously)
    this.app.delete('/api/batches/:id', (req: Request, res: Response) => {
      res.status(501).json({ error: 'Cancel not implemented - batches run synchronously' });
    });

    // 404 handler
    this.app.use((req: Request, res: Response) => {
      res.status(404).json({
        error: 'Not found',
        path: req.path,
        method: req.method
      });
    });
  }

  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.server = this.app.listen(this.port, () => {
          console.error(`[safe-batch-processor] HTTP server listening on port ${this.port}`);
          resolve();
        });

        this.server.on('error', (err) => {
          reject(err);
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          console.error('[safe-batch-processor] HTTP server stopped');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }
}
