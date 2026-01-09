// InterLock signal handlers

import { getSignalName, SIGNAL_TYPES } from './protocol.js';
import { tumbler } from './tumbler.js';

export type SignalHandler = (payload: unknown, source: { address: string; port: number }) => void;

class SignalRouter {
  private handlers: Map<string, SignalHandler[]> = new Map();
  private globalHandlers: SignalHandler[] = [];

  /**
   * Register a handler for a specific signal type
   */
  on(signalName: string, handler: SignalHandler): void {
    const handlers = this.handlers.get(signalName) || [];
    handlers.push(handler);
    this.handlers.set(signalName, handlers);
  }

  /**
   * Register a handler for all signals
   */
  onAny(handler: SignalHandler): void {
    this.globalHandlers.push(handler);
  }

  /**
   * Remove a handler
   */
  off(signalName: string, handler: SignalHandler): void {
    const handlers = this.handlers.get(signalName);
    if (handlers) {
      const index = handlers.indexOf(handler);
      if (index >= 0) {
        handlers.splice(index, 1);
      }
    }
  }

  /**
   * Route a signal to appropriate handlers
   */
  route(signalType: number, payload: unknown, source: { address: string; port: number }): void {
    const signalName = getSignalName(signalType);

    // Check tumbler
    if (!tumbler.isAllowed(signalName)) {
      console.log(`[InterLock] Signal blocked by tumbler: ${signalName}`);
      return;
    }

    // Call global handlers
    for (const handler of this.globalHandlers) {
      try {
        handler(payload, source);
      } catch (err) {
        console.error(`[InterLock] Global handler error:`, err);
      }
    }

    // Call specific handlers
    const handlers = this.handlers.get(signalName) || [];
    for (const handler of handlers) {
      try {
        handler(payload, source);
      } catch (err) {
        console.error(`[InterLock] Handler error for ${signalName}:`, err);
      }
    }
  }

  /**
   * Get registered handlers count
   */
  getHandlerCount(signalName?: string): number {
    if (signalName) {
      return (this.handlers.get(signalName) || []).length;
    }
    let total = this.globalHandlers.length;
    for (const handlers of this.handlers.values()) {
      total += handlers.length;
    }
    return total;
  }
}

export const signalRouter = new SignalRouter();

/**
 * Clear all registered handlers (prevents memory leaks on restart cycles)
 */
export function clearHandlers(): void {
  // Access private members for cleanup - we own this class
  (signalRouter as unknown as { handlers: Map<string, SignalHandler[]> }).handlers.clear();
  (signalRouter as unknown as { globalHandlers: SignalHandler[] }).globalHandlers = [];
}

// Default handlers for delivery server
export function registerDefaultHandlers(): void {
  // Log all incoming signals
  signalRouter.onAny((payload, source) => {
    console.log(`[InterLock] Received signal from ${source.address}:${source.port}`);
  });

  // Handle ping
  signalRouter.on('ping', (_payload, source) => {
    console.log(`[InterLock] Ping from ${source.address}:${source.port}`);
  });

  // Handle server:ready from other servers
  signalRouter.on('server:ready', (payload, source) => {
    const data = payload as { server?: string };
    console.log(`[InterLock] Server ready: ${data.server || 'unknown'} at ${source.address}:${source.port}`);
  });

  // Handle approval notifications
  signalRouter.on('notion:approved', (payload, _source) => {
    const data = payload as { storyId?: string; title?: string };
    console.log(`[InterLock] Story approved: ${data.title || data.storyId}`);
  });
}
