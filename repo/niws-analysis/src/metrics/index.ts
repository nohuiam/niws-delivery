/**
 * Prometheus Metrics Module
 *
 * Exposes metrics for monitoring HTTP requests, analysis operations,
 * and Claude API calls.
 */

import { Registry, Counter, Histogram, Gauge, collectDefaultMetrics } from 'prom-client';

// Create a custom registry
export const registry = new Registry();

// Collect default Node.js metrics (memory, CPU, etc.)
collectDefaultMetrics({ register: registry });

/**
 * HTTP request duration histogram
 */
export const httpRequestDuration = new Histogram({
  name: 'niws_analysis_http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'path', 'status'],
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [registry],
});

/**
 * HTTP request counter
 */
export const httpRequestTotal = new Counter({
  name: 'niws_analysis_http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'path', 'status'],
  registers: [registry],
});

/**
 * Analysis operations counter
 */
export const analysisCounter = new Counter({
  name: 'niws_analysis_operations_total',
  help: 'Total number of analysis operations',
  labelNames: ['type', 'status'],
  registers: [registry],
});

/**
 * Active analyses gauge
 */
export const activeAnalyses = new Gauge({
  name: 'niws_analysis_active_analyses',
  help: 'Number of currently active analyses',
  registers: [registry],
});

/**
 * Claude API call duration histogram
 */
export const claudeApiDuration = new Histogram({
  name: 'niws_analysis_claude_api_duration_seconds',
  help: 'Duration of Claude API calls in seconds',
  labelNames: ['operation'],
  buckets: [0.5, 1, 2, 5, 10, 20, 30, 60],
  registers: [registry],
});

/**
 * Claude API call counter
 */
export const claudeApiTotal = new Counter({
  name: 'niws_analysis_claude_api_calls_total',
  help: 'Total number of Claude API calls',
  labelNames: ['operation', 'status'],
  registers: [registry],
});

/**
 * Rate limit hits counter
 */
export const rateLimitHits = new Counter({
  name: 'niws_analysis_rate_limit_hits_total',
  help: 'Total number of rate limit hits',
  labelNames: ['endpoint'],
  registers: [registry],
});

/**
 * Database operations duration histogram
 */
export const dbOperationDuration = new Histogram({
  name: 'niws_analysis_db_operation_duration_seconds',
  help: 'Duration of database operations in seconds',
  labelNames: ['operation'],
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1],
  registers: [registry],
});

/**
 * Get metrics in Prometheus format
 */
export async function getMetrics(): Promise<string> {
  return registry.metrics();
}

/**
 * Get content type for metrics endpoint
 */
export function getMetricsContentType(): string {
  return registry.contentType;
}
