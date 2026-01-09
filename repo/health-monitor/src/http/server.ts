/**
 * HTTP REST API Server
 *
 * Port: 8024
 * Provides REST endpoints for Health Monitor.
 */

import express, { Request, Response, NextFunction } from 'express';
import { Server } from 'http';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { getDatabase } from '../database/schema.js';
import { checkAllServers, getOverallStatus, getServers } from '../health/checker.js';
import { getScheduler } from '../health/scheduler.js';

// CORS whitelist - restrict to known origins for security
const ALLOWED_ORIGINS = [
  'http://localhost:5173',   // GMI frontend (Vite)
  'http://127.0.0.1:5173',
  'http://localhost:3099',   // GMI control API
  'http://localhost:8024'    // Self
];

// Rate limiting configuration
const generalLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  limit: 100, // 100 requests per minute
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later', retryAfter: '60s' }
});

const healthCheckLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  limit: 30, // 30 health check requests per minute
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many health check requests, please try again later', retryAfter: '60s' }
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
    // Health check (for this server)
    this.app.get('/health', (req: Request, res: Response) => {
      const db = getDatabase();
      const stats = db.getStats();
      const scheduler = getScheduler();

      res.json({
        status: 'healthy',
        server: 'health-monitor',
        port: this.port,
        scheduler_active: scheduler.isActive(),
        stats
      });
    });

    // Get all servers health (stricter rate limit)
    this.app.get('/api/health', healthCheckLimiter, async (req: Request, res: Response) => {
      try {
        const results = await checkAllServers();
        res.json({
          servers: results.map(r => ({
            name: r.server_name,
            status: r.status,
            cpu_usage: r.cpu_usage,
            memory_usage: r.memory_usage,
            response_time_ms: r.response_time_ms
          })),
          overall_status: getOverallStatus(results),
          checked_at: new Date().toISOString()
        });
      } catch (error) {
        res.status(500).json({ error: (error as Error).message });
      }
    });

    // Get specific server status
    this.app.get('/api/servers/:name', (req: Request, res: Response) => {
      try {
        const db = getDatabase();
        const latestCheck = db.getLatestHealthCheck(req.params.name);

        if (!latestCheck) {
          res.status(404).json({ error: `Server not found: ${req.params.name}` });
          return;
        }

        const activeAlerts = db.getActiveAlerts(req.params.name);

        res.json({
          server_name: latestCheck.server_name,
          status: latestCheck.status,
          cpu_usage: latestCheck.cpu_usage,
          memory_usage: latestCheck.memory_usage,
          response_time_ms: latestCheck.response_time_ms,
          uptime_seconds: latestCheck.uptime_seconds,
          checked_at: new Date(latestCheck.checked_at).toISOString(),
          active_alerts: activeAlerts.length
        });
      } catch (error) {
        res.status(500).json({ error: (error as Error).message });
      }
    });

    // Get server history
    this.app.get('/api/servers/:name/history', (req: Request, res: Response) => {
      try {
        const db = getDatabase();
        const hours = parseInt(req.query.hours as string) || 24;
        const since = Date.now() - (hours * 60 * 60 * 1000);

        const history = db.getHealthCheckHistory(req.params.name, since);
        res.json({ history });
      } catch (error) {
        res.status(500).json({ error: (error as Error).message });
      }
    });

    // List alerts
    this.app.get('/api/alerts', (req: Request, res: Response) => {
      try {
        const db = getDatabase();
        const serverName = req.query.server as string | undefined;
        const alerts = db.getActiveAlerts(serverName);
        res.json({ alerts });
      } catch (error) {
        res.status(500).json({ error: (error as Error).message });
      }
    });

    // Get active alerts
    this.app.get('/api/alerts/active', (req: Request, res: Response) => {
      try {
        const db = getDatabase();
        const alerts = db.getActiveAlerts();
        res.json({ alerts, count: alerts.length });
      } catch (error) {
        res.status(500).json({ error: (error as Error).message });
      }
    });

    // Acknowledge alert
    this.app.post('/api/alerts/:id/ack', (req: Request, res: Response) => {
      try {
        const db = getDatabase();
        const alertId = parseInt(req.params.id);
        const acknowledgedBy = req.body.acknowledged_by;

        const success = db.acknowledgeAlert(alertId, acknowledgedBy);
        if (!success) {
          res.status(404).json({ error: 'Alert not found' });
          return;
        }

        res.json({ success: true, acknowledged_at: new Date().toISOString() });
      } catch (error) {
        res.status(400).json({ error: (error as Error).message });
      }
    });

    // Get metrics
    this.app.get('/api/metrics', (req: Request, res: Response) => {
      try {
        const db = getDatabase();
        const latestChecks = db.getAllLatestHealthChecks();

        const metrics = latestChecks.map(c => ({
          server_name: c.server_name,
          cpu_usage: c.cpu_usage,
          memory_usage: c.memory_usage,
          response_time_ms: c.response_time_ms,
          recorded_at: new Date(c.checked_at).toISOString()
        }));

        res.json({ metrics });
      } catch (error) {
        res.status(500).json({ error: (error as Error).message });
      }
    });

    // Get predictions
    this.app.get('/api/predictions', (req: Request, res: Response) => {
      try {
        const db = getDatabase();
        const serverName = req.query.server as string | undefined;
        const predictions = db.getActivePredictiveAlerts(serverName);
        res.json({ predictions });
      } catch (error) {
        res.status(500).json({ error: (error as Error).message });
      }
    });

    // Get aggregated summary
    this.app.get('/api/summary', (req: Request, res: Response) => {
      try {
        const db = getDatabase();
        const latestChecks = db.getAllLatestHealthChecks();

        let healthyCount = 0;
        let degradedCount = 0;
        let criticalCount = 0;
        let offlineCount = 0;

        for (const check of latestChecks) {
          switch (check.status) {
            case 'healthy': healthyCount++; break;
            case 'degraded': degradedCount++; break;
            case 'critical': criticalCount++; break;
            case 'offline': offlineCount++; break;
          }
        }

        let ecosystemStatus = 'healthy';
        if (offlineCount > 0 || criticalCount > 2) {
          ecosystemStatus = 'critical';
        } else if (criticalCount > 0 || degradedCount > 2) {
          ecosystemStatus = 'degraded';
        }

        res.json({
          total_servers: latestChecks.length,
          healthy_count: healthyCount,
          degraded_count: degradedCount,
          critical_count: criticalCount,
          offline_count: offlineCount,
          ecosystem_status: ecosystemStatus
        });
      } catch (error) {
        res.status(500).json({ error: (error as Error).message });
      }
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
          console.error(`[health-monitor] HTTP server listening on port ${this.port}`);
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
          console.error('[health-monitor] HTTP server stopped');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }
}
