#!/usr/bin/env node
/**
 * niws-production - NIWS Pipeline Production Server (Instance 3)
 *
 * Script generation, story briefs, and Christ-Oh-Meter moral ratings.
 *
 * Ports:
 * - MCP: stdio (Claude Desktop)
 * - UDP: 3035 (InterLock mesh)
 * - HTTP: 8035 (REST API)
 * - WS: 9035 (Real-time events)
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type Tool,
} from '@modelcontextprotocol/sdk/types.js';

import { getScriptDatabase } from './database/scriptDatabase.js';
import { getBriefDatabase } from './database/briefDatabase.js';
import { scriptTools, ScriptToolHandlers, isScriptTool } from './tools/scriptTools.js';
import { briefTools, BriefToolHandlers, isBriefTool } from './tools/briefTools.js';
import { httpServer } from './http/server.js';
import { interLockSocket, setupHandlers } from './interlock/index.js';
import { wsServer } from './websocket/server.js';

const SERVER_NAME = 'niws-production';
const SERVER_VERSION = '1.0.0';

/**
 * Initialize databases
 */
function initDatabases(): void {
  console.log('[niws-production] Initializing databases...');
  // Calling the getter functions initializes the singletons
  getScriptDatabase();
  getBriefDatabase();
  console.log('[niws-production] Databases initialized');
}

/**
 * Create MCP server
 */
function createMCPServer(): Server {
  const server = new Server(
    {
      name: SERVER_NAME,
      version: SERVER_VERSION,
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // Combine all tool definitions
  const allTools: Tool[] = [...scriptTools, ...briefTools];

  // Create tool handlers
  const scriptHandler = new ScriptToolHandlers();
  const briefHandler = new BriefToolHandlers();

  // Handle list tools request
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools: allTools };
  });

  // Handle tool calls
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      let result: unknown;

      // Check if it's a script tool
      if (isScriptTool(name)) {
        result = await scriptHandler.handleTool(name, args || {});
      }
      // Check if it's a brief tool
      else if (isBriefTool(name)) {
        result = await briefHandler.handleTool(name, args || {});
      }
      else {
        result = { error: `Unknown tool: ${name}` };
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ error: String(error) }),
          },
        ],
      };
    }
  });

  return server;
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  console.log(`[${SERVER_NAME}] Starting v${SERVER_VERSION}...`);

  // Initialize databases
  initDatabases();

  // Start HTTP server
  await httpServer.start();

  // Start InterLock UDP mesh
  try {
    await interLockSocket.start();
    setupHandlers();
    interLockSocket.announceReady();
    console.log('[niws-production] InterLock mesh started');
  } catch (error) {
    console.warn('[niws-production] InterLock mesh failed to start:', error);
  }

  // Start WebSocket server
  try {
    await wsServer.start();
    console.log('[niws-production] WebSocket server started');
  } catch (error) {
    console.warn('[niws-production] WebSocket server failed to start:', error);
  }

  // Create and start MCP server
  const server = createMCPServer();
  const transport = new StdioServerTransport();

  // Handle graceful shutdown
  const shutdown = async (): Promise<void> => {
    console.log(`[${SERVER_NAME}] Shutting down...`);

    // Announce shutdown to mesh
    interLockSocket.announceShutdown();

    // Stop services
    await wsServer.stop();
    interLockSocket.stop();
    httpServer.stop();

    console.log(`[${SERVER_NAME}] Shutdown complete`);
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  // Connect MCP server
  await server.connect(transport);
  console.log(`[${SERVER_NAME}] MCP server connected via stdio`);
}

// Run
main().catch((error) => {
  console.error(`[${SERVER_NAME}] Fatal error:`, error);
  process.exit(1);
});
