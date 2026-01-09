/**
 * InterLock Signal Handlers
 *
 * Handles incoming signals from other NIWS pipeline servers.
 */

import type { InterLockMessage } from './protocol.js';
import { interLockSocket } from './socket.js';
import type { RemoteInfo } from 'dgram';

/**
 * Setup signal handlers for niws-production
 */
export function setupHandlers(): void {
  // Handle all incoming messages (for logging)
  interLockSocket.on('*', (message: InterLockMessage, rinfo: RemoteInfo) => {
    console.log(`[InterLock] Received signal from ${rinfo.address}:${rinfo.port}`, {
      type: message.signalType,
      payload: message.payload,
    });
  });

  // Handle server ready signals from peers
  interLockSocket.on('server:ready', (message: InterLockMessage, rinfo: RemoteInfo) => {
    const serverName = message.payload.server as string;
    console.log(`[InterLock] Peer ready: ${serverName} at ${rinfo.address}:${rinfo.port}`);
  });

  // Handle analysis complete signals
  interLockSocket.on('analysis:complete', (message: InterLockMessage) => {
    const storyId = message.payload.story_id as string;
    console.log(`[InterLock] Analysis complete for story: ${storyId}`);
    // Could trigger script generation here
  });

  // Handle intake signals
  interLockSocket.on('story:created', (message: InterLockMessage) => {
    const storyId = message.payload.story_id as string;
    console.log(`[InterLock] New story created: ${storyId}`);
  });

  // Handle delivery requests
  interLockSocket.on('delivery:request', (message: InterLockMessage) => {
    const scriptId = message.payload.script_id as string;
    console.log(`[InterLock] Delivery requested for script: ${scriptId}`);
  });
}

/**
 * Emit script generated signal
 */
export function emitScriptGenerated(scriptId: string, storyId: string, wordCount: number): void {
  interLockSocket.emit('script:generated', {
    script_id: scriptId,
    story_id: storyId,
    word_count: wordCount,
    timestamp: Date.now(),
  });
}

/**
 * Emit script validated signal
 */
export function emitScriptValidated(scriptId: string, passed: boolean, score: number): void {
  interLockSocket.emit('script:validated', {
    script_id: scriptId,
    passed,
    score,
    timestamp: Date.now(),
  });
}

/**
 * Emit script approved signal
 */
export function emitScriptApproved(scriptId: string): void {
  interLockSocket.emit('script:approved', {
    script_id: scriptId,
    timestamp: Date.now(),
  });
}

/**
 * Emit brief created signal
 */
export function emitBriefCreated(briefId: string, storyId: string): void {
  interLockSocket.emit('brief:created', {
    brief_id: briefId,
    story_id: storyId,
    timestamp: Date.now(),
  });
}

/**
 * Emit Christ-Oh-Meter rated signal
 */
export function emitChristOhMeterRated(ratingId: string, spectrumScore: number, verdict: string): void {
  interLockSocket.emit('christohmeter:rated', {
    rating_id: ratingId,
    spectrum_score: spectrumScore,
    verdict,
    timestamp: Date.now(),
  });
}
