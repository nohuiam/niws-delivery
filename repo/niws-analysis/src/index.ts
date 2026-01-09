#!/usr/bin/env node
/**
 * niws-analysis MCP Server
 *
 * Article bias analysis, framing comparison, and neutral alternatives.
 *
 * Ports:
 * - MCP: stdio
 * - UDP: 3034 (InterLock mesh)
 * - HTTP: 8034 (REST API)
 * - WS: 9034 (real-time events)
 *
 * Features:
 * - Structured logging (winston)
 * - Request ID tracking
 * - Prometheus metrics (/metrics)
 * - Rate limiting (100/min general, 10/min for analysis)
 * - Deep health checks (/api/health?deep=true)
 * - Response compression
 * - API key rotation (SIGHUP or config file)
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { logger } from './logging/index.js';
import { analysisTools, AnalysisToolHandler } from './tools/index.js';
import { startHttpServer, stopHttpServer } from './http/server.js';
import { getInterLockSocket } from './interlock/socket.js';
import { startWebSocketServer, getWebSocketServer } from './websocket/server.js';
import { getApiKeyManager } from './services/apiKeyManager.js';
import { SERVER_NAME, SERVER_VERSION } from './version.js';

async function main() {
  logger.info('Starting niws-analysis server', { version: SERVER_VERSION });

  // Initialize API key manager (watches for key rotation)
  const keyManager = getApiKeyManager();
  logger.info('API key manager initialized', {
    configured: keyManager.isConfigured(),
    source: keyManager.getKeySource(),
  });

  // Start ancillary servers
  const httpPort = parseInt(process.env.HTTP_PORT || '8034', 10);
  const wsPort = parseInt(process.env.WS_PORT || '9034', 10);

  // Start HTTP server
  await startHttpServer(httpPort);

  // Start WebSocket server
  await startWebSocketServer(wsPort);

  // Start InterLock mesh
  const interlock = getInterLockSocket();
  try {
    await interlock.start();
  } catch (error) {
    logger.warn('InterLock failed to start - continuing without mesh', { error });
  }

  // Create MCP server
  const server = new Server(
    { name: SERVER_NAME, version: SERVER_VERSION },
    { capabilities: { tools: {} } }
  );

  const toolHandler = new AnalysisToolHandler();

  // List tools handler
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools: analysisTools };
  });

  // Call tool handler
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      const result = await toolHandler.handleToolCall(name, args || {});
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        content: [{ type: 'text', text: JSON.stringify({ error: errorMessage }) }],
        isError: true,
      };
    }
  });

  // Connect to stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);

  logger.info('MCP server running on stdio');
  logger.info(`HTTP API on port ${httpPort}`);
  logger.info(`WebSocket on port ${wsPort}`);

  // Handle shutdown
  const shutdown = async () => {
    logger.info('Shutting down...');
    try {
      await stopHttpServer();
      logger.info('HTTP server stopped');
    } catch (error) {
      logger.error('Error stopping HTTP server', { error });
    }
    try {
      await getWebSocketServer().stop();
      logger.info('WebSocket server stopped');
    } catch (error) {
      logger.error('Error stopping WebSocket server', { error });
    }
    try {
      await interlock.stop();
      logger.info('InterLock stopped');
    } catch (error) {
      logger.error('Error stopping InterLock', { error });
    }
    try {
      keyManager.stop();
      logger.info('API key manager stopped');
    } catch (error) {
      logger.error('Error stopping API key manager', { error });
    }
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((error) => {
  logger.error('Fatal error', { error });
  process.exit(1);
});
