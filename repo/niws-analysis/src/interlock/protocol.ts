/**
 * InterLock Protocol - BaNano 12-byte Binary Header
 *
 * Format:
 * - signalType (uint16): Signal type identifier
 * - version (uint16): Protocol version
 * - payloadLen (uint32): Length of JSON payload
 * - timestamp (uint32): Unix timestamp
 * - payload: JSON data
 */

export const PROTOCOL_VERSION = 1;

export interface Signal {
  type: string;
  version: number;
  timestamp: number;
  payload: Record<string, unknown>;
  source?: string;
}

// Signal type mappings
const SIGNAL_TYPES: Record<string, number> = {
  'server:ready': 0x0001,
  'server:shutdown': 0x0002,
  'analysis:started': 0x0101,
  'analysis:complete': 0x0102,
  'analysis:failed': 0x0103,
  'comparison:started': 0x0201,
  'comparison:complete': 0x0202,
  'article:new': 0x0301,
  'story:clustered': 0x0302,
  'analysis:request': 0x0303,
};

const REVERSE_SIGNAL_TYPES: Record<number, string> = {};
for (const [name, code] of Object.entries(SIGNAL_TYPES)) {
  REVERSE_SIGNAL_TYPES[code] = name;
}

/**
 * Encode a signal to binary format
 */
export function encodeSignal(signal: Signal): Buffer {
  const typeCode = SIGNAL_TYPES[signal.type] || 0xFFFF;
  const payloadJson = JSON.stringify(signal.payload);
  const payloadBuffer = Buffer.from(payloadJson, 'utf-8');

  const header = Buffer.alloc(12);
  header.writeUInt16BE(typeCode, 0);        // signalType
  header.writeUInt16BE(signal.version, 2);   // version
  header.writeUInt32BE(payloadBuffer.length, 4); // payloadLen
  header.writeUInt32BE(signal.timestamp, 8); // timestamp

  return Buffer.concat([header, payloadBuffer]);
}

/**
 * Decode a signal from binary format
 */
export function decodeSignal(data: Buffer): Signal | null {
  if (data.length < 12) {
    return null;
  }

  const typeCode = data.readUInt16BE(0);
  const version = data.readUInt16BE(2);
  const payloadLen = data.readUInt32BE(4);
  const timestamp = data.readUInt32BE(8);

  if (data.length < 12 + payloadLen) {
    return null;
  }

  const payloadBuffer = data.subarray(12, 12 + payloadLen);
  let payload: unknown;

  try {
    payload = JSON.parse(payloadBuffer.toString('utf-8'));
  } catch {
    return null;
  }

  // Validate payload is an object (not null, array, or primitive)
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
    return null;
  }

  const type = REVERSE_SIGNAL_TYPES[typeCode] || `unknown:${typeCode}`;

  return { type, version, timestamp, payload: payload as Record<string, unknown> };
}

/**
 * Create a signal with current timestamp
 */
export function createSignal(
  type: string,
  payload: Record<string, unknown>,
  source?: string
): Signal {
  return {
    type,
    version: PROTOCOL_VERSION,
    timestamp: Math.floor(Date.now() / 1000),
    payload,
    source,
  };
}
