// BaNano InterLock Protocol - 12-byte binary header format
// Format: signalType(uint16) + version(uint16) + payloadLen(uint32) + timestamp(uint32) + JSON payload

export interface InterLockMessage {
  signalType: number;
  version: number;
  timestamp: number;
  payload: unknown;
}

// Signal type codes
export const SIGNAL_TYPES = {
  // Server lifecycle
  SERVER_READY: 0x0001,
  SERVER_SHUTDOWN: 0x0002,

  // Export signals
  EXPORT_STARTED: 0x0100,
  EXPORT_COMPLETED: 0x0101,

  // Video signals
  VIDEO_QUEUED: 0x0200,
  VIDEO_PROCESSING: 0x0201,
  VIDEO_COMPLETED: 0x0202,

  // Workflow signals
  WORKFLOW_STARTED: 0x0300,
  WORKFLOW_STEP: 0x0301,
  WORKFLOW_COMPLETED: 0x0302,

  // Notion signals
  NOTION_PUSHED: 0x0400,
  NOTION_APPROVED: 0x0401,

  // Generic
  PING: 0xFF00,
  PONG: 0xFF01
};

// Signal type name lookup
export const SIGNAL_NAMES: Record<number, string> = {
  [SIGNAL_TYPES.SERVER_READY]: 'server:ready',
  [SIGNAL_TYPES.SERVER_SHUTDOWN]: 'server:shutdown',
  [SIGNAL_TYPES.EXPORT_STARTED]: 'export:started',
  [SIGNAL_TYPES.EXPORT_COMPLETED]: 'export:completed',
  [SIGNAL_TYPES.VIDEO_QUEUED]: 'video:queued',
  [SIGNAL_TYPES.VIDEO_PROCESSING]: 'video:processing',
  [SIGNAL_TYPES.VIDEO_COMPLETED]: 'video:completed',
  [SIGNAL_TYPES.WORKFLOW_STARTED]: 'workflow:started',
  [SIGNAL_TYPES.WORKFLOW_STEP]: 'workflow:step',
  [SIGNAL_TYPES.WORKFLOW_COMPLETED]: 'workflow:completed',
  [SIGNAL_TYPES.NOTION_PUSHED]: 'notion:pushed',
  [SIGNAL_TYPES.NOTION_APPROVED]: 'notion:approved',
  [SIGNAL_TYPES.PING]: 'ping',
  [SIGNAL_TYPES.PONG]: 'pong'
};

// Reverse lookup: name to code
export const SIGNAL_CODES: Record<string, number> = Object.entries(SIGNAL_NAMES).reduce(
  (acc, [code, name]) => ({ ...acc, [name]: parseInt(code) }),
  {}
);

const PROTOCOL_VERSION = 1;

/**
 * Encode a message to BaNano format
 */
export function encode(signalType: number | string, payload: unknown): Buffer {
  const typeCode = typeof signalType === 'string' ? SIGNAL_CODES[signalType] || 0 : signalType;
  const payloadStr = JSON.stringify(payload);
  const payloadBuf = Buffer.from(payloadStr, 'utf-8');
  const timestamp = Math.floor(Date.now() / 1000);

  // 12-byte header + payload
  const header = Buffer.alloc(12);
  header.writeUInt16BE(typeCode, 0);           // signalType
  header.writeUInt16BE(PROTOCOL_VERSION, 2);    // version
  header.writeUInt32BE(payloadBuf.length, 4);   // payloadLen
  header.writeUInt32BE(timestamp, 8);           // timestamp

  return Buffer.concat([header, payloadBuf]);
}

/**
 * Decode a BaNano format message
 */
export function decode(buffer: Buffer): InterLockMessage | null {
  if (buffer.length < 12) {
    return null;
  }

  try {
    const signalType = buffer.readUInt16BE(0);
    const version = buffer.readUInt16BE(2);
    const payloadLen = buffer.readUInt32BE(4);
    const timestamp = buffer.readUInt32BE(8);

    if (buffer.length < 12 + payloadLen) {
      return null;
    }

    const payloadStr = buffer.slice(12, 12 + payloadLen).toString('utf-8');
    const payload = JSON.parse(payloadStr);

    return {
      signalType,
      version,
      timestamp,
      payload
    };
  } catch {
    // Try legacy JSON-only format for compatibility
    try {
      const jsonStr = buffer.toString('utf-8');
      const data = JSON.parse(jsonStr);
      return {
        signalType: SIGNAL_CODES[data.type] || 0,
        version: 0,
        timestamp: Math.floor(Date.now() / 1000),
        payload: data
      };
    } catch {
      return null;
    }
  }
}

/**
 * Get signal name from code
 */
export function getSignalName(code: number): string {
  return SIGNAL_NAMES[code] || `unknown:${code}`;
}

/**
 * Get signal code from name
 */
export function getSignalCode(name: string): number {
  return SIGNAL_CODES[name] || 0;
}
