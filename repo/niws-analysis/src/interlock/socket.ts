/**
 * InterLock UDP Socket
 *
 * Handles UDP mesh communication with other servers.
 */

import dgram from 'dgram';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { encodeSignal, decodeSignal, createSignal, Signal } from './protocol.js';
import { Tumbler } from './tumbler.js';
import { handleSignal, registerDefaultHandlers } from './handlers.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CONFIG_PATH = path.join(__dirname, '..', '..', 'config', 'interlock.json');

export interface InterLockConfig {
  server: {
    name: string;
    udpPort: number;
    httpPort: number;
    wsPort: number;
  };
  mesh: {
    peers: Array<{
      name: string;
      host: string;
      port: number;
    }>;
    signals: {
      emit: string[];
      receive: string[];
    };
  };
}

export class InterLockSocket {
  private socket: dgram.Socket | null = null;
  private config: InterLockConfig;
  private tumbler: Tumbler;
  private running = false;

  constructor(configPath: string = CONFIG_PATH) {
    this.config = this.loadConfig(configPath);
    this.tumbler = new Tumbler({
      allowedSignals: this.config.mesh.signals.receive,
    });
  }

  private loadConfig(configPath: string): InterLockConfig {
    try {
      const content = fs.readFileSync(configPath, 'utf-8');
      return JSON.parse(content);
    } catch (error) {
      console.error(`[InterLock] Failed to load config from ${configPath}:`, error);
      // Return default config
      return {
        server: {
          name: 'niws-analysis',
          udpPort: 3034,
          httpPort: 8034,
          wsPort: 9034,
        },
        mesh: {
          peers: [],
          signals: {
            emit: ['server:ready', 'server:shutdown'],
            receive: ['*'],
          },
        },
      };
    }
  }

  /**
   * Start the InterLock socket
   */
  async start(): Promise<void> {
    if (this.running) return;

    registerDefaultHandlers();

    return new Promise((resolve, reject) => {
      this.socket = dgram.createSocket('udp4');

      this.socket.on('message', (msg, rinfo) => {
        this.handleMessage(msg, rinfo);
      });

      this.socket.on('error', (err) => {
        console.error('[InterLock] Socket error:', err);
        reject(err);
      });

      this.socket.on('listening', () => {
        const addr = this.socket!.address();
        console.error(`[InterLock] UDP socket listening on ${addr.address}:${addr.port}`);
        this.running = true;

        // Announce ourselves to peers
        this.emit('server:ready', {
          name: this.config.server.name,
          ports: {
            udp: this.config.server.udpPort,
            http: this.config.server.httpPort,
            ws: this.config.server.wsPort,
          },
        });

        resolve();
      });

      this.socket.bind(this.config.server.udpPort);
    });
  }

  /**
   * Stop the InterLock socket
   */
  async stop(): Promise<void> {
    if (!this.running || !this.socket) return;

    // Announce shutdown to peers
    this.emit('server:shutdown', {
      name: this.config.server.name,
    });

    return new Promise((resolve) => {
      this.socket!.close(() => {
        this.running = false;
        console.error('[InterLock] Socket closed');
        resolve();
      });
    });
  }

  /**
   * Handle incoming message
   */
  private handleMessage(msg: Buffer, rinfo: dgram.RemoteInfo): void {
    // Sanity check on message size (max 64KB for UDP)
    if (msg.length > 65536) {
      console.error(`[InterLock] Oversized message (${msg.length} bytes) from ${rinfo.address}:${rinfo.port}`);
      return;
    }

    const signal = decodeSignal(msg);
    if (!signal) {
      console.error(`[InterLock] Invalid message from ${rinfo.address}:${rinfo.port}`);
      return;
    }

    // Check tumbler whitelist
    if (!this.tumbler.isAllowed(signal.type)) {
      console.error(`[InterLock] Blocked signal: ${signal.type} from ${rinfo.address}`);
      return;
    }

    signal.source = `${rinfo.address}:${rinfo.port}`;

    // Await the handler and catch any errors
    handleSignal(signal).catch((error) => {
      console.error(`[InterLock] Error handling signal ${signal.type}:`, error);
    });
  }

  /**
   * Emit a signal to all peers
   */
  emit(type: string, payload: Record<string, unknown>): void {
    if (!this.socket || !this.running) return;

    // Check if we're allowed to emit this signal
    if (!this.config.mesh.signals.emit.includes(type) && !this.config.mesh.signals.emit.includes('*')) {
      console.error(`[InterLock] Not allowed to emit: ${type}`);
      return;
    }

    const signal = createSignal(type, {
      ...payload,
      source: this.config.server.name,
    });
    const buffer = encodeSignal(signal);

    for (const peer of this.config.mesh.peers) {
      this.socket.send(buffer, peer.port, peer.host, (err) => {
        if (err) {
          console.error(`[InterLock] Failed to send to ${peer.name}:`, err);
        }
      });
    }
  }

  /**
   * Send a signal to a specific peer
   */
  sendTo(peerName: string, type: string, payload: Record<string, unknown>): void {
    if (!this.socket || !this.running) return;

    const peer = this.config.mesh.peers.find(p => p.name === peerName);
    if (!peer) {
      console.error(`[InterLock] Unknown peer: ${peerName}`);
      return;
    }

    const signal = createSignal(type, {
      ...payload,
      source: this.config.server.name,
    });
    const buffer = encodeSignal(signal);

    this.socket.send(buffer, peer.port, peer.host, (err) => {
      if (err) {
        console.error(`[InterLock] Failed to send to ${peerName}:`, err);
      }
    });
  }

  /**
   * Get server config
   */
  getConfig(): InterLockConfig {
    return this.config;
  }

  /**
   * Check if running
   */
  isRunning(): boolean {
    return this.running;
  }
}

// Singleton instance
let socketInstance: InterLockSocket | null = null;

export function getInterLockSocket(configPath?: string): InterLockSocket {
  if (!socketInstance) {
    socketInstance = new InterLockSocket(configPath);
  }
  return socketInstance;
}
