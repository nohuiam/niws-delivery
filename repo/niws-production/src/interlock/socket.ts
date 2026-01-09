/**
 * InterLock UDP Socket
 *
 * Handles UDP mesh communication with other NIWS pipeline servers.
 * Port: 3035
 */

import * as dgram from 'dgram';
import { encode, decodeDual, getSignalTypeName, SignalTypes, type InterLockMessage } from './protocol.js';
import { Tumbler } from './tumbler.js';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface Peer {
  name: string;
  host: string;
  port: number;
}

interface SocketConfig {
  udpPort: number;
  peers: Peer[];
  signals: {
    emit: string[];
    receive: string[];
  };
}

type MessageHandler = (message: InterLockMessage, rinfo: dgram.RemoteInfo) => void;

export class InterLockSocket {
  private socket: dgram.Socket | null = null;
  private config: SocketConfig;
  private tumbler: Tumbler;
  private handlers: Map<string, MessageHandler[]> = new Map();
  private messagesReceived = 0;
  private messagesSent = 0;

  constructor(configPath?: string) {
    this.config = this.loadConfig(configPath);
    this.tumbler = new Tumbler({
      acceptedSignals: this.config.signals.receive,
    });
  }

  private loadConfig(configPath?: string): SocketConfig {
    const defaultPath = join(__dirname, '../../config/interlock.json');
    const path = configPath || defaultPath;

    if (existsSync(path)) {
      try {
        const content = readFileSync(path, 'utf-8');
        const json = JSON.parse(content);
        return {
          udpPort: json.server?.udpPort || 3035,
          peers: json.mesh?.peers || [],
          signals: json.mesh?.signals || { emit: [], receive: ['*'] },
        };
      } catch (error) {
        console.warn('[InterLock] Failed to load config:', error);
      }
    }

    // Default config
    return {
      udpPort: 3035,
      peers: [],
      signals: { emit: [], receive: ['*'] },
    };
  }

  /**
   * Start the UDP socket
   */
  async start(): Promise<void> {
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
        const address = this.socket!.address();
        console.log(`[InterLock] UDP socket listening on port ${address.port}`);
        resolve();
      });

      this.socket.bind(this.config.udpPort);
    });
  }

  /**
   * Stop the UDP socket
   */
  stop(): void {
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
  }

  /**
   * Handle incoming message
   */
  private handleMessage(msg: Buffer, rinfo: dgram.RemoteInfo): void {
    const message = decodeDual(msg);
    if (!message) {
      console.warn('[InterLock] Failed to decode message from', rinfo.address, rinfo.port);
      return;
    }

    const signalName = getSignalTypeName(message.signalType);

    // Check tumbler whitelist
    if (!this.tumbler.shouldAccept(signalName, rinfo.address)) {
      return;
    }

    this.messagesReceived++;

    // Dispatch to handlers
    const handlers = this.handlers.get(signalName) || [];
    const wildcardHandlers = this.handlers.get('*') || [];

    for (const handler of [...handlers, ...wildcardHandlers]) {
      try {
        handler(message, rinfo);
      } catch (error) {
        console.error('[InterLock] Handler error:', error);
      }
    }
  }

  /**
   * Register a handler for a signal type
   */
  on(signalName: string, handler: MessageHandler): void {
    if (!this.handlers.has(signalName)) {
      this.handlers.set(signalName, []);
    }
    this.handlers.get(signalName)!.push(handler);
  }

  /**
   * Remove a handler
   */
  off(signalName: string, handler: MessageHandler): void {
    const handlers = this.handlers.get(signalName);
    if (handlers) {
      const index = handlers.indexOf(handler);
      if (index >= 0) {
        handlers.splice(index, 1);
      }
    }
  }

  /**
   * Emit a signal to all peers
   */
  emit(signalName: string, payload: Record<string, unknown>): void {
    if (!this.socket) return;

    const buffer = encode(signalName, payload);

    for (const peer of this.config.peers) {
      this.socket.send(buffer, peer.port, peer.host, (err) => {
        if (err) {
          console.error(`[InterLock] Failed to send to ${peer.name}:`, err);
        } else {
          this.messagesSent++;
        }
      });
    }
  }

  /**
   * Emit a signal to a specific peer
   */
  emitTo(peerName: string, signalName: string, payload: Record<string, unknown>): void {
    if (!this.socket) return;

    const peer = this.config.peers.find(p => p.name === peerName);
    if (!peer) {
      console.warn(`[InterLock] Unknown peer: ${peerName}`);
      return;
    }

    const buffer = encode(signalName, payload);

    this.socket.send(buffer, peer.port, peer.host, (err) => {
      if (err) {
        console.error(`[InterLock] Failed to send to ${peer.name}:`, err);
      } else {
        this.messagesSent++;
      }
    });
  }

  /**
   * Broadcast server ready signal
   */
  announceReady(): void {
    this.emit('server:ready', {
      server: 'niws-production',
      port: this.config.udpPort,
      timestamp: Date.now(),
    });
  }

  /**
   * Broadcast shutdown signal
   */
  announceShutdown(): void {
    this.emit('server:shutdown', {
      server: 'niws-production',
      port: this.config.udpPort,
      timestamp: Date.now(),
    });
  }

  /**
   * Get stats
   */
  getStats(): { messagesReceived: number; messagesSent: number; peers: number } {
    return {
      messagesReceived: this.messagesReceived,
      messagesSent: this.messagesSent,
      peers: this.config.peers.length,
    };
  }
}

export const interLockSocket = new InterLockSocket();
