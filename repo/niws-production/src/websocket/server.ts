/**
 * WebSocket Server for niws-production
 *
 * Provides real-time event streaming for script/brief operations.
 * Port: 9035
 */

import { WebSocketServer, WebSocket, type RawData } from 'ws';
import type { IncomingMessage } from 'http';

interface WSEvent {
  type: string;
  data: unknown;
  timestamp: number;
}

export class ProductionWebSocketServer {
  private wss: WebSocketServer | null = null;
  private clients: Set<WebSocket> = new Set();
  private port: number;

  constructor(port: number = 9035) {
    this.port = port;
  }

  /**
   * Start the WebSocket server
   */
  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.wss = new WebSocketServer({ port: this.port });

        this.wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
          this.handleConnection(ws, req);
        });

        this.wss.on('error', (error: Error) => {
          console.error('[WebSocket] Server error:', error);
          reject(error);
        });

        this.wss.on('listening', () => {
          console.log(`[WebSocket] Server listening on port ${this.port}`);
          resolve();
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Stop the WebSocket server
   */
  stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.wss) {
        // Close all client connections
        for (const client of this.clients) {
          client.close(1001, 'Server shutting down');
        }
        this.clients.clear();

        this.wss.close(() => {
          console.log('[WebSocket] Server stopped');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  /**
   * Handle new WebSocket connection
   */
  private handleConnection(ws: WebSocket, req: IncomingMessage): void {
    const clientIp = req.socket.remoteAddress || 'unknown';
    console.log(`[WebSocket] Client connected from ${clientIp}`);

    this.clients.add(ws);

    // Send welcome message
    this.sendToClient(ws, {
      type: 'connected',
      data: {
        server: 'niws-production',
        version: '1.0.0',
        capabilities: [
          'script:events',
          'brief:events',
          'christohmeter:events',
        ],
      },
      timestamp: Date.now(),
    });

    ws.on('message', (data: RawData) => {
      this.handleMessage(ws, data);
    });

    ws.on('close', () => {
      console.log(`[WebSocket] Client disconnected from ${clientIp}`);
      this.clients.delete(ws);
    });

    ws.on('error', (error: Error) => {
      console.error(`[WebSocket] Client error from ${clientIp}:`, error);
      this.clients.delete(ws);
    });
  }

  /**
   * Handle incoming message from client
   */
  private handleMessage(ws: WebSocket, data: RawData): void {
    try {
      const message = JSON.parse(data.toString());

      switch (message.type) {
        case 'ping':
          this.sendToClient(ws, {
            type: 'pong',
            data: { serverTime: Date.now() },
            timestamp: Date.now(),
          });
          break;

        case 'subscribe':
          // Client subscribes to specific event types
          console.log(`[WebSocket] Client subscribed to: ${message.events?.join(', ')}`);
          this.sendToClient(ws, {
            type: 'subscribed',
            data: { events: message.events || [] },
            timestamp: Date.now(),
          });
          break;

        default:
          console.log(`[WebSocket] Unknown message type: ${message.type}`);
      }
    } catch (error) {
      console.error('[WebSocket] Failed to parse message:', error);
    }
  }

  /**
   * Send event to a specific client
   */
  private sendToClient(ws: WebSocket, event: WSEvent): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(event));
    }
  }

  /**
   * Broadcast event to all connected clients
   */
  broadcast(type: string, data: unknown): void {
    const event: WSEvent = {
      type,
      data,
      timestamp: Date.now(),
    };

    const message = JSON.stringify(event);

    for (const client of this.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    }
  }

  /**
   * Emit script generated event
   */
  emitScriptGenerated(scriptId: string, storyId: string, wordCount: number): void {
    this.broadcast('script:generated', {
      scriptId,
      storyId,
      wordCount,
    });
  }

  /**
   * Emit script validated event
   */
  emitScriptValidated(scriptId: string, passed: boolean, score: number): void {
    this.broadcast('script:validated', {
      scriptId,
      passed,
      score,
    });
  }

  /**
   * Emit script approved event
   */
  emitScriptApproved(scriptId: string): void {
    this.broadcast('script:approved', { scriptId });
  }

  /**
   * Emit brief created event
   */
  emitBriefCreated(briefId: string, storyId: string): void {
    this.broadcast('brief:created', {
      briefId,
      storyId,
    });
  }

  /**
   * Emit Christ-Oh-Meter rated event
   */
  emitChristOhMeterRated(ratingId: string, spectrumScore: number, verdict: string): void {
    this.broadcast('christohmeter:rated', {
      ratingId,
      spectrumScore,
      verdict,
    });
  }

  /**
   * Get connected client count
   */
  getClientCount(): number {
    return this.clients.size;
  }
}

export const wsServer = new ProductionWebSocketServer();
