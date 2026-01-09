/**
 * Structured Logging Module
 *
 * Winston-based logging with JSON format for production and
 * pretty format for development.
 */

import winston from 'winston';

const isDev = process.env.NODE_ENV !== 'production';

/**
 * Create base logger with environment-appropriate formatting
 */
export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    isDev
      ? winston.format.combine(
          winston.format.colorize(),
          winston.format.printf(({ level, message, timestamp, ...meta }) => {
            const metaStr = Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : '';
            return `${timestamp} ${level}: ${message}${metaStr}`;
          })
        )
      : winston.format.json()
  ),
  defaultMeta: { service: 'niws-analysis' },
  transports: [new winston.transports.Console()],
});

/**
 * Create a child logger with additional context
 */
export function createLogger(context: Record<string, unknown>): winston.Logger {
  return logger.child(context);
}

/**
 * Create a request-scoped logger
 */
export function createRequestLogger(requestId: string): winston.Logger {
  return logger.child({ requestId });
}

/**
 * Log levels:
 * - error: Runtime errors that require attention
 * - warn: Warnings about potential issues
 * - info: General operational messages
 * - http: HTTP request/response logging
 * - debug: Detailed debugging information
 */
export type LogLevel = 'error' | 'warn' | 'info' | 'http' | 'debug';
