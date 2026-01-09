/**
 * Health Checker Service
 *
 * Provides shallow and deep health checks for the service and its dependencies.
 */

import { getAnalysisDatabase } from '../database/analysisDatabase.js';
import { getIntakeClient } from './intakeClient.js';
import { getApiKeyManager } from './apiKeyManager.js';
import { logger } from '../logging/index.js';
import { SERVER_VERSION } from '../version.js';

export interface HealthCheck {
  status: 'healthy' | 'unhealthy' | 'unknown';
  latencyMs?: number;
  message?: string;
}

export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  version: string;
  checks: {
    database: HealthCheck;
    intake: HealthCheck;
    claudeApi: HealthCheck & { configured: boolean };
  };
  stats?: {
    totalArticleAnalyses: number;
    totalComparisons: number;
    pendingCount: number;
    failedCount: number;
    lexiconSize: number;
  };
}

// Timeout for health checks (5 seconds)
const HEALTH_CHECK_TIMEOUT_MS = 5000;

/**
 * Check database health
 */
async function checkDatabase(): Promise<HealthCheck> {
  const start = Date.now();
  try {
    const db = getAnalysisDatabase();
    db.getStats(); // Simple query to verify connectivity
    return {
      status: 'healthy',
      latencyMs: Date.now() - start,
    };
  } catch (error) {
    logger.error('Database health check failed', { error });
    return {
      status: 'unhealthy',
      latencyMs: Date.now() - start,
      message: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Promise that rejects after a timeout
 */
function withTimeout<T>(promise: Promise<T>, timeoutMs: number, errorMessage: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(errorMessage)), timeoutMs)
    ),
  ]);
}

/**
 * Check intake service health
 */
async function checkIntake(): Promise<HealthCheck> {
  const start = Date.now();
  try {
    const client = getIntakeClient();
    const isHealthy = await withTimeout(
      client.checkHealth(),
      HEALTH_CHECK_TIMEOUT_MS,
      `Intake health check timed out after ${HEALTH_CHECK_TIMEOUT_MS}ms`
    );
    return {
      status: isHealthy ? 'healthy' : 'unhealthy',
      latencyMs: Date.now() - start,
      message: isHealthy ? undefined : 'Intake service not responding',
    };
  } catch (error) {
    logger.warn('Intake health check failed', { error });
    return {
      status: 'unhealthy',
      latencyMs: Date.now() - start,
      message: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Check Claude API configuration
 */
async function checkClaudeApi(): Promise<HealthCheck & { configured: boolean }> {
  const keyManager = getApiKeyManager();
  const configured = keyManager.isConfigured();

  if (!configured) {
    return {
      status: 'unhealthy',
      configured: false,
      message: `API key not configured (checked: ${keyManager.getKeySource()})`,
    };
  }

  // We don't actually call the API for health check (costs money)
  // Just verify the key is present and looks valid
  const looksValid = keyManager.isKeyFormatValid();

  return {
    status: looksValid ? 'healthy' : 'unknown',
    configured: true,
    message: looksValid ? undefined : 'API key format may be invalid',
  };
}

/**
 * Determine overall health status from individual checks
 */
function determineOverallStatus(checks: HealthStatus['checks']): 'healthy' | 'degraded' | 'unhealthy' {
  const statuses = [checks.database.status, checks.intake.status, checks.claudeApi.status];

  // If database is unhealthy, the whole service is unhealthy
  if (checks.database.status === 'unhealthy') {
    return 'unhealthy';
  }

  // If Claude API is not configured, service is degraded (can still use mock)
  if (checks.claudeApi.status === 'unhealthy') {
    return 'degraded';
  }

  // If intake is down, service is degraded (can still use inline content)
  if (checks.intake.status === 'unhealthy') {
    return 'degraded';
  }

  // If any status is unknown, we're degraded
  if (statuses.includes('unknown')) {
    return 'degraded';
  }

  return 'healthy';
}

/**
 * Perform health check
 *
 * @param deep - If true, performs deep checks on all dependencies
 */
export async function checkHealth(deep: boolean = false): Promise<HealthStatus> {
  const db = getAnalysisDatabase();

  // Default shallow checks (fast)
  const checks: HealthStatus['checks'] = {
    database: { status: 'unknown' },
    intake: { status: 'unknown' },
    claudeApi: { status: 'unknown', configured: false },
  };

  if (deep) {
    // Perform all checks in parallel
    const [dbCheck, intakeCheck, claudeCheck] = await Promise.all([
      checkDatabase(),
      checkIntake(),
      checkClaudeApi(),
    ]);

    checks.database = dbCheck;
    checks.intake = intakeCheck;
    checks.claudeApi = claudeCheck;
  } else {
    // Quick checks only - just verify database is accessible
    try {
      db.getStats();
      checks.database = { status: 'healthy' };
    } catch {
      checks.database = { status: 'unhealthy' };
    }

    // Check if API key is configured using ApiKeyManager
    const keyManager = getApiKeyManager();
    const configured = keyManager.isConfigured();
    checks.claudeApi = {
      status: configured ? (keyManager.isKeyFormatValid() ? 'healthy' : 'unknown') : 'unhealthy',
      configured,
    };

    // For shallow health, assume intake is healthy (not checked)
    // This prevents shallow checks from always returning 'degraded'
    checks.intake = { status: 'healthy', message: 'Not checked (shallow mode)' };
  }

  const stats = db.getStats();

  return {
    status: determineOverallStatus(checks),
    timestamp: new Date().toISOString(),
    version: SERVER_VERSION,
    checks,
    stats,
  };
}
