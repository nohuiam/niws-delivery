/**
 * InterLock Protocol - BaNano 12-byte binary header
 *
 * Header format:
 * - signalType: uint16 (2 bytes)
 * - version: uint16 (2 bytes)
 * - payloadLen: uint32 (4 bytes)
 * - timestamp: uint32 (4 bytes)
 * + JSON payload
 */

export const HEADER_SIZE = 12;
export const PROTOCOL_VERSION = 1;

export interface InterLockMessage {
  signalType: number;
  version: number;
  timestamp: number;
  payload: Record<string, unknown>;
}

// Signal type constants
export const SignalTypes = {
  // Server lifecycle
  SERVER_READY: 0x0001,
  SERVER_SHUTDOWN: 0x0002,
  HEARTBEAT: 0x0003,

  // Script events
  SCRIPT_GENERATED: 0x0100,
  SCRIPT_VALIDATED: 0x0101,
  SCRIPT_APPROVED: 0x0102,

  // Brief events
  BRIEF_CREATED: 0x0200,
  BRIEF_RATED: 0x0201,

  // Christ-Oh-Meter events
  CHRISTOHMETER_RATED: 0x0300,

  // Generic
  REQUEST: 0x1000,
  RESPONSE: 0x1001,
  ERROR: 0xFFFF,
} as const;

// Signal type to name mapping
const signalTypeNames: Record<number, string> = {
  [SignalTypes.SERVER_READY]: 'server:ready',
  [SignalTypes.SERVER_SHUTDOWN]: 'server:shutdown',
  [SignalTypes.HEARTBEAT]: 'heartbeat',
  [SignalTypes.SCRIPT_GENERATED]: 'script:generated',
  [SignalTypes.SCRIPT_VALIDATED]: 'script:validated',
  [SignalTypes.SCRIPT_APPROVED]: 'script:approved',
  [SignalTypes.BRIEF_CREATED]: 'brief:created',
  [SignalTypes.BRIEF_RATED]: 'brief:rated',
  [SignalTypes.CHRISTOHMETER_RATED]: 'christohmeter:rated',
  [SignalTypes.REQUEST]: 'request',
  [SignalTypes.RESPONSE]: 'response',
  [SignalTypes.ERROR]: 'error',
};

// Name to signal type mapping
const signalNameTypes: Record<string, number> = {};
for (const [type, name] of Object.entries(signalTypeNames)) {
  signalNameTypes[name] = parseInt(type);
}

export function getSignalTypeName(type: number): string {
  return signalTypeNames[type] || `unknown:${type.toString(16)}`;
}

export function getSignalTypeCode(name: string): number {
  return signalNameTypes[name] || SignalTypes.ERROR;
}

/**
 * Encode a message to binary format
 */
export function encode(signalType: number | string, payload: Record<string, unknown>): Buffer {
  const typeCode = typeof signalType === 'string' ? getSignalTypeCode(signalType) : signalType;
  const payloadJson = JSON.stringify(payload);
  const payloadBuffer = Buffer.from(payloadJson, 'utf-8');
  const timestamp = Math.floor(Date.now() / 1000);

  const header = Buffer.alloc(HEADER_SIZE);
  header.writeUInt16BE(typeCode, 0);
  header.writeUInt16BE(PROTOCOL_VERSION, 2);
  header.writeUInt32BE(payloadBuffer.length, 4);
  header.writeUInt32BE(timestamp, 8);

  return Buffer.concat([header, payloadBuffer]);
}

/**
 * Decode a binary message
 */
export function decode(buffer: Buffer): InterLockMessage | null {
  if (buffer.length < HEADER_SIZE) {
    return null;
  }

  const signalType = buffer.readUInt16BE(0);
  const version = buffer.readUInt16BE(2);
  const payloadLen = buffer.readUInt32BE(4);
  const timestamp = buffer.readUInt32BE(8);

  if (buffer.length < HEADER_SIZE + payloadLen) {
    return null;
  }

  const payloadBuffer = buffer.subarray(HEADER_SIZE, HEADER_SIZE + payloadLen);

  let payload: Record<string, unknown> = {};
  try {
    payload = JSON.parse(payloadBuffer.toString('utf-8'));
  } catch {
    console.warn('[InterLock] Failed to parse payload');
  }

  return { signalType, version, timestamp, payload };
}

/**
 * Decode with dual-protocol support (JSON string or BaNano binary)
 */
export function decodeDual(buffer: Buffer): InterLockMessage | null {
  // Try BaNano first (check for valid header)
  if (buffer.length >= HEADER_SIZE) {
    const version = buffer.readUInt16BE(2);
    if (version === PROTOCOL_VERSION) {
      return decode(buffer);
    }
  }

  // Try JSON fallback
  try {
    const json = JSON.parse(buffer.toString('utf-8'));
    if (json.type && typeof json.type === 'string') {
      return {
        signalType: getSignalTypeCode(json.type),
        version: PROTOCOL_VERSION,
        timestamp: json.timestamp || Math.floor(Date.now() / 1000),
        payload: json.payload || json,
      };
    }
  } catch {
    // Not JSON
  }

  return null;
}
