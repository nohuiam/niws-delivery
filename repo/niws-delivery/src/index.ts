#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

// Import tool definitions and handlers
import { notionToolDefinitions, notionToolHandlers } from './tools/notion-tools.js';
import { teleprompterToolDefinitions, teleprompterToolHandlers } from './tools/teleprompter-tools.js';
import { videoToolDefinitions, videoToolHandlers } from './tools/video-tools.js';
import { orchestratorToolDefinitions, orchestratorToolHandlers } from './tools/orchestrator-tools.js';

// Import servers
import { startHttpServer } from './http/server.js';
import { wsServer } from './websocket/server.js';
import { interlock } from './interlock/index.js';

// Import database and managers
import { getDatabase, closeDatabase } from './database/schema.js';
import { stateManager } from './orchestrator/stateManager.js';
import { videoOrchestrator } from './services/videoOrchestrator.js';
import http from 'http';

// HTTP server reference for graceful shutdown
let httpServer: http.Server | null = null;

// Combine all tool definitions
const allToolDefinitions = [
  ...notionToolDefinitions,
  ...teleprompterToolDefinitions,
  ...videoToolDefinitions,
  ...orchestratorToolDefinitions
];

// Combine all tool handlers
const allToolHandlers: Record<string, (args: unknown) => Promise<{ content: Array<{ type: 'text'; text: string }>; isError?: boolean }>> = {
  ...notionToolHandlers,
  ...teleprompterToolHandlers,
  ...videoToolHandlers,
  ...orchestratorToolHandlers
};

// Create MCP server
const server = new Server(
  {
    name: 'niws-delivery',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// List tools handler
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: allToolDefinitions,
  };
});

// Call tool handler
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  const handler = allToolHandlers[name];
  if (!handler) {
    return {
      content: [{ type: 'text', text: `Unknown tool: ${name}` }],
      isError: true,
    };
  }

  try {
    const result = await handler(args || {});
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      content: [{ type: 'text', text: `Error executing ${name}: ${message}` }],
      isError: true,
    };
  }
});

/**
 * Validate required environment variables at startup
 */
function validateEnvironment(): void {
  const required: Record<string, string | undefined> = {
    NOTION_TOKEN: process.env.NOTION_TOKEN,
    NOTION_DATABASE_ID: process.env.NOTION_DATABASE_ID,
  };

  const missing = Object.entries(required)
    .filter(([_, value]) => !value)
    .map(([key]) => key);

  if (missing.length > 0) {
    console.warn(`[niws-delivery] Missing env vars: ${missing.join(', ')}`);
    console.warn('[niws-delivery] Notion integration will be disabled');
  }
}

/**
 * Graceful shutdown handler
 */
async function shutdown(): Promise<void> {
  console.log('\n[niws-delivery] Shutting down...');

  // Stop accepting new HTTP connections and drain existing ones
  if (httpServer) {
    await new Promise<void>((resolve) => {
      httpServer!.close(() => {
        console.log('[niws-delivery] HTTP server closed');
        resolve();
      });
    });
  }

  // Stop WebSocket server
  wsServer.stop();

  // Stop InterLock mesh
  await interlock.stop();

  // Close database connection
  closeDatabase();

  console.log('[niws-delivery] Shutdown complete');
  process.exit(0);
}

// Main entry point
async function main(): Promise<void> {
  // Validate environment variables
  validateEnvironment();

  // Initialize database
  getDatabase();
  console.error('[niws-delivery] Database initialized');

  // Initialize state managers (restore any interrupted work)
  stateManager.initialize();
  videoOrchestrator.initialize();
  console.error('[niws-delivery] State managers initialized');

  // Check if running in stdio mode (MCP) or standalone mode
  const isStdioMode = !process.argv.includes('--standalone');

  if (isStdioMode) {
    // MCP stdio mode
    console.error('[niws-delivery] Starting in MCP stdio mode...');

    // Start HTTP server on port 8036 (store reference for graceful shutdown)
    httpServer = await startHttpServer(8036);

    // Start WebSocket server on port 9036
    wsServer.start(9036);

    // Start InterLock mesh on port 3036
    await interlock.start();

    // Connect MCP server to stdio transport
    const transport = new StdioServerTransport();
    await server.connect(transport);

    console.error('[niws-delivery] MCP server running');
    console.error(`[niws-delivery] Tools available: ${allToolDefinitions.length}`);
  } else {
    // Standalone mode (HTTP/WS only)
    console.log('[niws-delivery] Starting in standalone mode...');

    // Start HTTP server (store reference for graceful shutdown)
    httpServer = await startHttpServer(8036);

    // Start WebSocket server
    wsServer.start(9036);

    // Start InterLock mesh
    await interlock.start();

    console.log('[niws-delivery] Standalone server running');
    console.log(`[niws-delivery] HTTP: http://localhost:8036`);
    console.log(`[niws-delivery] WebSocket: ws://localhost:9036`);
    console.log(`[niws-delivery] InterLock UDP: 3036`);
  }

  // Register shutdown handlers
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((error) => {
  console.error('[niws-delivery] Fatal error:', error);
  // Ensure database is closed even on startup failure
  closeDatabase();
  process.exit(1);
});
