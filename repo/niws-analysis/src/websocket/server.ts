/**
 * WebSocket Server for niws-analysis
 *
 * Real-time event streaming to connected clients.
 */

import { WebSocketServer, WebSocket } from 'ws';

const WS_PORT = parseInt(process.env.WS_PORT || '9034', 10);

export interface WSEvent {
  type: string;
  timestamp: string;
  data: Record<string, unknown>;
}

class AnalysisWebSocketServer {
  private wss: WebSocketServer | null = null;
  private clients: Set<WebSocket> = new Set();
  private running = false;

  /**
   * Start the WebSocket server
   */
  start(port: number = WS_PORT): Promise<void> {
    if (this.running) return Promise.resolve();

    return new Promise((resolve) => {
      this.wss = new WebSocketServer({ port });

      this.wss.on('connection', (ws, req) => {
        const clientIp = req.socket.remoteAddress;
        console.error(`[WebSocket] Client connected from ${clientIp}`);

        this.clients.add(ws);

        // Send welcome message
        this.sendTo(ws, {
          type: 'connected',
          timestamp: new Date().toISOString(),
          data: { message: 'Connected to niws-analysis WebSocket server' },
        });

        ws.on('message', (message) => {
          try {
            const data = JSON.parse(message.toString());
            this.handleMessage(ws, data);
          } catch (error) {
            console.error('[WebSocket] Invalid message:', error);
          }
        });

        ws.on('close', () => {
          console.error(`[WebSocket] Client disconnected: ${clientIp}`);
          this.clients.delete(ws);
        });

        ws.on('error', (error) => {
          console.error('[WebSocket] Client error:', error);
          this.clients.delete(ws);
        });
      });

      this.wss.on('listening', () => {
        console.error(`[WebSocket] Server listening on port ${port}`);
        this.running = true;
        resolve();
      });

      this.wss.on('error', (error) => {
        console.error('[WebSocket] Server error:', error);
      });
    });
  }

  /**
   * Stop the WebSocket server
   */
  stop(): Promise<void> {
    if (!this.running || !this.wss) return Promise.resolve();

    return new Promise((resolve) => {
      // Close all client connections
      for (const client of this.clients) {
        client.close();
      }
      this.clients.clear();

      this.wss!.close(() => {
        console.error('[WebSocket] Server closed');
        this.running = false;
        resolve();
      });
    });
  }

  /**
   * Handle incoming message from client
   */
  private handleMessage(ws: WebSocket, data: unknown): void {
    // Validate message structure
    if (data === null || typeof data !== 'object' || Array.isArray(data)) {
      console.error('[WebSocket] Invalid message: not an object');
      return;
    }

    const message = data as Record<string, unknown>;

    // Validate type field exists and is a string
    if (typeof message.type !== 'string') {
      console.error('[WebSocket] Invalid message: missing or invalid type field');
      return;
    }

    const type = message.type;
    const payload = (message.payload !== null && typeof message.payload === 'object' && !Array.isArray(message.payload))
      ? message.payload as Record<string, unknown>
      : undefined;

    switch (type) {
      case 'ping':
        this.sendTo(ws, {
          type: 'pong',
          timestamp: new Date().toISOString(),
          data: {},
        });
        break;

      case 'subscribe':
        // Could implement topic subscriptions here
        this.sendTo(ws, {
          type: 'subscribed',
          timestamp: new Date().toISOString(),
          data: { topics: (payload?.topics as string[]) || ['*'] },
        });
        break;

      default:
        console.error(`[WebSocket] Unknown message type: ${type}`);
    }
  }

  /**
   * Send event to a specific client
   */
  private sendTo(ws: WebSocket, event: WSEvent): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(event));
    }
  }

  /**
   * Broadcast event to all connected clients
   */
  broadcast(event: WSEvent): void {
    const message = JSON.stringify(event);
    for (const client of this.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    }
  }

  /**
   * Emit analysis started event
   */
  emitAnalysisStarted(analysisId: string, articleId: string): void {
    this.broadcast({
      type: 'analysis:started',
      timestamp: new Date().toISOString(),
      data: { analysisId, articleId },
    });
  }

  /**
   * Emit analysis complete event
   */
  emitAnalysisComplete(analysisId: string, articleId: string, result: Record<string, unknown>): void {
    this.broadcast({
      type: 'analysis:complete',
      timestamp: new Date().toISOString(),
      data: { analysisId, articleId, result },
    });
  }

  /**
   * Emit analysis failed event
   */
  emitAnalysisFailed(analysisId: string, articleId: string, error: string): void {
    this.broadcast({
      type: 'analysis:failed',
      timestamp: new Date().toISOString(),
      data: { analysisId, articleId, error },
    });
  }

  /**
   * Emit comparison started event
   */
  emitComparisonStarted(comparisonId: string, storyId: string): void {
    this.broadcast({
      type: 'comparison:started',
      timestamp: new Date().toISOString(),
      data: { comparisonId, storyId },
    });
  }

  /**
   * Emit comparison complete event
   */
  emitComparisonComplete(comparisonId: string, storyId: string, differences: unknown[]): void {
    this.broadcast({
      type: 'comparison:complete',
      timestamp: new Date().toISOString(),
      data: { comparisonId, storyId, differences },
    });
  }

  /**
   * Get connected client count
   */
  getClientCount(): number {
    return this.clients.size;
  }

  /**
   * Check if running
   */
  isRunning(): boolean {
    return this.running;
  }
}

// Singleton instance
let wsServerInstance: AnalysisWebSocketServer | null = null;

export function getWebSocketServer(): AnalysisWebSocketServer {
  if (!wsServerInstance) {
    wsServerInstance = new AnalysisWebSocketServer();
  }
  return wsServerInstance;
}

export function startWebSocketServer(port: number = WS_PORT): Promise<void> {
  return getWebSocketServer().start(port);
}
