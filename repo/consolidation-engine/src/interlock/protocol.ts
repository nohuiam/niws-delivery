/**
 * InterLock Protocol
 *
 * BaNano-style message encoding/decoding for UDP mesh communication.
 */

export const SIGNAL_TYPES = {
  // Core signals
  HEARTBEAT: 0x01,
  DISCOVERY: 0x02,
  SHUTDOWN: 0x03,

  // Health signals
  HEALTH_CHECK: 0x04,
  HEALTH_RESPONSE: 0x05,

  // Merge signals
  MERGE_PLAN_CREATED: 0x30,
  MERGE_STARTED: 0x31,
  MERGE_COMPLETE: 0x32,
  CONFLICT_DETECTED: 0x33,
  CONFLICT_RESOLVED: 0x34,

  // BBB integration
  BBB_ANALYSIS_COMPLETE: 0x40,
  REQUEST_MERGE: 0x41,

  // Error signals
  ERROR: 0xE0,
  ERROR_CRITICAL: 0xE1,
  ERROR_RECOVERABLE: 0xE2,
  ERROR_VALIDATION: 0xE3
} as const;

export type SignalType = (typeof SIGNAL_TYPES)[keyof typeof SIGNAL_TYPES];

export interface DecodedMessage {
  type: number;
  serverId: string;
  data: unknown;
  timestamp: number;
}

/**
 * Get human-readable signal name
 */
export function getSignalName(type: number): string {
  for (const [name, value] of Object.entries(SIGNAL_TYPES)) {
    if (value === type) {
      return name;
    }
  }
  return `UNKNOWN_0x${type.toString(16).toUpperCase()}`;
}

/**
 * Encode a message to Buffer for UDP transmission
 */
export function encode(message: {
  type: number;
  serverId: string;
  data?: unknown;
}): Buffer {
  const payload = {
    t: message.type,
    s: message.serverId,
    d: message.data || {},
    ts: Date.now()
  };

  return Buffer.from(JSON.stringify(payload), 'utf-8');
}

/**
 * Decode a Buffer to message object
 */
export function decode(buffer: Buffer): DecodedMessage | null {
  try {
    const str = buffer.toString('utf-8');
    const payload = JSON.parse(str);

    return {
      type: payload.t,
      serverId: payload.s,
      data: payload.d,
      timestamp: payload.ts
    };
  } catch {
    return null;
  }
}
