import { WebSocketServer, WebSocket } from 'ws';
import { signalRouter } from '../interlock/handlers.js';
import { stateManager } from '../orchestrator/stateManager.js';
import { videoOrchestrator } from '../services/videoOrchestrator.js';

interface WSClient {
  ws: WebSocket;
  subscriptions: Set<string>;
}

class DeliveryWebSocketServer {
  private wss: WebSocketServer | null = null;
  private clients: Set<WSClient> = new Set();
  private heartbeatInterval: NodeJS.Timeout | null = null;

  start(port: number = 9036): void {
    this.wss = new WebSocketServer({ port });

    this.wss.on('connection', (ws) => {
      const client: WSClient = {
        ws,
        subscriptions: new Set(['*']) // Subscribe to all by default
      };
      this.clients.add(client);

      console.log(`[WebSocket] Client connected (total: ${this.clients.size})`);

      ws.on('message', (data) => {
        this.handleMessage(client, data.toString());
      });

      ws.on('close', () => {
        this.clients.delete(client);
        console.log(`[WebSocket] Client disconnected (total: ${this.clients.size})`);
      });

      ws.on('error', (err) => {
        console.error('[WebSocket] Client error:', err.message);
      });

      // Send welcome message
      this.sendToClient(client, {
        type: 'connected',
        server: 'niws-delivery',
        timestamp: new Date().toISOString()
      });
    });

    // Start heartbeat
    this.heartbeatInterval = setInterval(() => {
      this.broadcast({
        type: 'heartbeat',
        timestamp: new Date().toISOString()
      });
    }, 30000);

    // Register for InterLock signals to relay to WebSocket clients
    this.registerInterLockRelay();

    console.log(`[WebSocket] niws-delivery listening on port ${port}`);
  }

  stop(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }

    if (this.wss) {
      // Close all client connections
      for (const client of this.clients) {
        client.ws.close();
      }
      this.clients.clear();

      this.wss.close();
      this.wss = null;
      console.log('[WebSocket] Server stopped');
    }
  }

  private handleMessage(client: WSClient, message: string): void {
    let data: { type: string; events?: string[]; [key: string]: unknown };
    try {
      data = JSON.parse(message);
    } catch {
      this.sendToClient(client, { type: 'error', message: 'Invalid JSON' });
      return;
    }

    switch (data.type) {
      case 'subscribe':
        if (Array.isArray(data.events)) {
          for (const event of data.events) {
            // Validate event is a non-empty string with reasonable length
            if (typeof event === 'string' && event.length > 0 && event.length < 100) {
              client.subscriptions.add(event);
            }
          }
        }
        this.sendToClient(client, {
          type: 'subscribed',
          events: Array.from(client.subscriptions)
        });
        break;

      case 'unsubscribe':
        if (Array.isArray(data.events)) {
          for (const event of data.events) {
            // Validate event is a non-empty string with reasonable length
            if (typeof event === 'string' && event.length > 0 && event.length < 100) {
              client.subscriptions.delete(event);
            }
          }
        }
        this.sendToClient(client, {
          type: 'unsubscribed',
          events: Array.from(client.subscriptions)
        });
        break;

      case 'get_status':
        this.sendStatus(client);
        break;

      case 'ping':
        this.sendToClient(client, { type: 'pong', timestamp: new Date().toISOString() });
        break;

      default:
        console.log(`[WebSocket] Unknown message type: ${data.type}`);
    }
  }

  private sendStatus(client: WSClient): void {
    const workflowStatus = stateManager.getCurrentRun();
    const jobs = videoOrchestrator.getAllJobs();

    this.sendToClient(client, {
      type: 'status',
      workflow: workflowStatus ? {
        id: workflowStatus.id,
        type: workflowStatus.workflowType,
        status: workflowStatus.status,
        currentStep: workflowStatus.currentStep
      } : null,
      videoJobs: jobs.map(j => ({
        id: j.id,
        status: j.status,
        progress: j.progress
      })),
      timestamp: new Date().toISOString()
    });
  }

  private sendToClient(client: WSClient, data: unknown): void {
    if (client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(JSON.stringify(data));
    }
  }

  private broadcast(data: { type: string; [key: string]: unknown }): void {
    const message = JSON.stringify(data);

    for (const client of this.clients) {
      if (client.ws.readyState !== WebSocket.OPEN) continue;

      // Check subscription
      if (client.subscriptions.has('*') || client.subscriptions.has(data.type)) {
        client.ws.send(message);
      }
    }
  }

  private registerInterLockRelay(): void {
    // Relay InterLock signals to WebSocket clients
    signalRouter.onAny((payload, source) => {
      this.broadcast({
        type: 'interlock',
        source: `${source.address}:${source.port}`,
        payload,
        timestamp: new Date().toISOString()
      });
    });
  }

  // Public API for emitting events
  emit(eventType: string, data: unknown): void {
    this.broadcast({
      type: eventType,
      data,
      timestamp: new Date().toISOString()
    });
  }

  // Emit workflow events
  emitWorkflowEvent(event: 'started' | 'step' | 'paused' | 'resumed' | 'completed' | 'failed', data?: unknown): void {
    this.emit(`workflow:${event}`, data);
  }

  // Emit video events
  emitVideoEvent(event: 'queued' | 'processing' | 'completed' | 'failed', jobId: string, data?: unknown): void {
    this.emit(`video:${event}`, { jobId, ...data as object });
  }

  // Emit export events
  emitExportEvent(event: 'started' | 'completed' | 'failed', data?: unknown): void {
    this.emit(`export:${event}`, data);
  }
}

export const wsServer = new DeliveryWebSocketServer();
