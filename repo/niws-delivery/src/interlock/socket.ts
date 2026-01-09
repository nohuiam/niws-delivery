import dgram from 'dgram';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { encode, decode, getSignalName, SIGNAL_TYPES } from './protocol.js';
import { signalRouter, registerDefaultHandlers, clearHandlers } from './handlers.js';

interface Peer {
  name: string;
  host: string;
  port: number;
}

interface InterLockConfig {
  server: {
    name: string;
    udpPort: number;
    httpPort: number;
    wsPort: number;
  };
  mesh: {
    peers: Peer[];
    signals: {
      emit: string[];
      receive: string[];
    };
  };
}

class InterLockSocket {
  private socket: dgram.Socket | null = null;
  private config: InterLockConfig;
  private isRunning = false;

  constructor() {
    // Default config
    const defaultConfig: InterLockConfig = {
      server: {
        name: 'niws-delivery',
        udpPort: 3036,
        httpPort: 8036,
        wsPort: 9036
      },
      mesh: {
        peers: [],
        signals: {
          emit: ['server:ready', 'server:shutdown'],
          receive: ['*']
        }
      }
    };

    // Load config with fallback to defaults
    const configPath = join(process.cwd(), 'config', 'interlock.json');
    if (existsSync(configPath)) {
      try {
        this.config = JSON.parse(readFileSync(configPath, 'utf-8'));
      } catch (err) {
        console.error(`[InterLock] Failed to parse config at ${configPath}, using defaults`);
        this.config = defaultConfig;
      }
    } else {
      this.config = defaultConfig;
    }
  }

  /**
   * Start the InterLock socket
   */
  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.isRunning) {
        resolve();
        return;
      }

      this.socket = dgram.createSocket('udp4');

      this.socket.on('error', (err) => {
        console.error('[InterLock] Socket error:', err.message);
        if (!this.isRunning) {
          reject(err);
        }
      });

      this.socket.on('message', (msg, rinfo) => {
        this.handleMessage(msg, rinfo);
      });

      this.socket.bind(this.config.server.udpPort, () => {
        console.log(`[InterLock] Listening on UDP port ${this.config.server.udpPort}`);
        this.isRunning = true;

        // Register default handlers
        registerDefaultHandlers();

        // Announce server ready
        this.broadcast('server:ready', {
          server: this.config.server.name,
          ports: {
            udp: this.config.server.udpPort,
            http: this.config.server.httpPort,
            ws: this.config.server.wsPort
          }
        });

        resolve();
      });
    });
  }

  /**
   * Stop the InterLock socket
   */
  stop(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.isRunning || !this.socket) {
        resolve();
        return;
      }

      // Announce shutdown
      this.broadcast('server:shutdown', {
        server: this.config.server.name
      });

      // Clear signal handlers to prevent memory leaks on restart cycles
      clearHandlers();

      this.socket.close(() => {
        this.isRunning = false;
        console.log('[InterLock] Socket closed');
        resolve();
      });
    });
  }

  /**
   * Handle incoming message
   */
  private handleMessage(msg: Buffer, rinfo: dgram.RemoteInfo): void {
    const decoded = decode(msg);
    if (!decoded) {
      console.warn('[InterLock] Failed to decode message');
      return;
    }

    const signalName = getSignalName(decoded.signalType);
    console.log(`[InterLock] Received ${signalName} from ${rinfo.address}:${rinfo.port}`);

    signalRouter.route(decoded.signalType, decoded.payload, {
      address: rinfo.address,
      port: rinfo.port
    });
  }

  /**
   * Send a signal to a specific peer
   */
  send(peer: Peer, signalName: string, payload: unknown): void {
    if (!this.socket || !this.isRunning) {
      console.warn('[InterLock] Socket not running');
      return;
    }

    const buffer = encode(signalName, payload);
    this.socket.send(buffer, peer.port, peer.host, (err) => {
      if (err) {
        console.error(`[InterLock] Send error to ${peer.name}:`, err.message);
      }
    });
  }

  /**
   * Broadcast a signal to all peers
   */
  broadcast(signalName: string, payload: unknown): void {
    for (const peer of this.config.mesh.peers) {
      this.send(peer, signalName, payload);
    }
  }

  /**
   * Send a signal by peer name
   */
  sendToPeer(peerName: string, signalName: string, payload: unknown): boolean {
    const peer = this.config.mesh.peers.find(p => p.name === peerName);
    if (!peer) {
      console.warn(`[InterLock] Peer not found: ${peerName}`);
      return false;
    }
    this.send(peer, signalName, payload);
    return true;
  }

  /**
   * Get configuration
   */
  getConfig(): InterLockConfig {
    return this.config;
  }

  /**
   * Check if running
   */
  isActive(): boolean {
    return this.isRunning;
  }
}

export const interlock = new InterLockSocket();
