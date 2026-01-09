/**
 * InterLock Protocol Tests
 *
 * Tests for BaNano binary encoding/decoding, tumbler filtering,
 * and signal type conversions.
 */

import { describe, it, expect } from 'vitest';
import {
  encode,
  decode,
  decodeDual,
  getSignalTypeName,
  getSignalTypeCode,
  SignalTypes,
  HEADER_SIZE,
  PROTOCOL_VERSION,
} from '../src/interlock/protocol.js';
import { Tumbler } from '../src/interlock/tumbler.js';

describe('InterLock Protocol', () => {
  // ============================================
  // ENCODING
  // ============================================

  describe('Encoding', () => {
    it('should encode a message with numeric signal type', () => {
      const buffer = encode(SignalTypes.HEARTBEAT, { data: 'test' });

      expect(buffer.length).toBeGreaterThan(HEADER_SIZE);
      expect(buffer.readUInt16BE(0)).toBe(SignalTypes.HEARTBEAT);
      expect(buffer.readUInt16BE(2)).toBe(PROTOCOL_VERSION);
    });

    it('should encode a message with string signal type', () => {
      const buffer = encode('heartbeat', { data: 'test' });

      expect(buffer.readUInt16BE(0)).toBe(SignalTypes.HEARTBEAT);
    });

    it('should encode timestamp in header', () => {
      const before = Math.floor(Date.now() / 1000);
      const buffer = encode(SignalTypes.HEARTBEAT, {});
      const after = Math.floor(Date.now() / 1000);

      const timestamp = buffer.readUInt32BE(8);
      expect(timestamp).toBeGreaterThanOrEqual(before);
      expect(timestamp).toBeLessThanOrEqual(after);
    });

    it('should encode payload length in header', () => {
      const payload = { key: 'value', number: 123 };
      const buffer = encode(SignalTypes.HEARTBEAT, payload);

      const payloadLen = buffer.readUInt32BE(4);
      const expectedLen = Buffer.from(JSON.stringify(payload)).length;
      expect(payloadLen).toBe(expectedLen);
    });

    it('should handle empty payload', () => {
      const buffer = encode(SignalTypes.HEARTBEAT, {});

      expect(buffer.length).toBe(HEADER_SIZE + 2); // {} is 2 bytes
    });

    it('should handle complex payloads', () => {
      const payload = {
        array: [1, 2, 3],
        nested: { deep: { value: true } },
        string: 'Hello world',
        number: 42.5,
      };

      const buffer = encode(SignalTypes.REQUEST, payload);

      // Should be able to decode it
      const decoded = decode(buffer);
      expect(decoded?.payload).toEqual(payload);
    });

    it('should handle unicode in payload', () => {
      const payload = { message: '日本語 한국어 العربية' };
      const buffer = encode(SignalTypes.REQUEST, payload);
      const decoded = decode(buffer);

      expect(decoded?.payload).toEqual(payload);
    });
  });

  // ============================================
  // DECODING
  // ============================================

  describe('Decoding', () => {
    it('should decode a valid message', () => {
      const original = { test: 'data', count: 42 };
      const buffer = encode(SignalTypes.SCRIPT_GENERATED, original);

      const decoded = decode(buffer);

      expect(decoded).not.toBeNull();
      expect(decoded!.signalType).toBe(SignalTypes.SCRIPT_GENERATED);
      expect(decoded!.version).toBe(PROTOCOL_VERSION);
      expect(decoded!.payload).toEqual(original);
    });

    it('should return null for buffer too small', () => {
      const buffer = Buffer.alloc(6);

      const decoded = decode(buffer);

      expect(decoded).toBeNull();
    });

    it('should return null for incomplete payload', () => {
      const buffer = Buffer.alloc(HEADER_SIZE);
      buffer.writeUInt16BE(SignalTypes.HEARTBEAT, 0);
      buffer.writeUInt16BE(PROTOCOL_VERSION, 2);
      buffer.writeUInt32BE(100, 4); // Says payload is 100 bytes but we have none

      const decoded = decode(buffer);

      expect(decoded).toBeNull();
    });

    it('should handle malformed JSON in payload', () => {
      // Create a buffer with invalid JSON
      const header = Buffer.alloc(HEADER_SIZE);
      header.writeUInt16BE(SignalTypes.HEARTBEAT, 0);
      header.writeUInt16BE(PROTOCOL_VERSION, 2);
      const badPayload = Buffer.from('not valid json');
      header.writeUInt32BE(badPayload.length, 4);
      header.writeUInt32BE(Math.floor(Date.now() / 1000), 8);

      const buffer = Buffer.concat([header, badPayload]);
      const decoded = decode(buffer);

      // Should return message with empty payload
      expect(decoded).not.toBeNull();
      expect(decoded!.payload).toEqual({});
    });

    it('should preserve timestamp', () => {
      const buffer = encode(SignalTypes.HEARTBEAT, {});
      const decoded = decode(buffer);

      const now = Math.floor(Date.now() / 1000);
      expect(decoded!.timestamp).toBeGreaterThanOrEqual(now - 1);
      expect(decoded!.timestamp).toBeLessThanOrEqual(now + 1);
    });
  });

  // ============================================
  // DUAL-PROTOCOL DECODING
  // ============================================

  describe('Dual-Protocol Decoding', () => {
    it('should decode BaNano binary format', () => {
      const buffer = encode(SignalTypes.BRIEF_CREATED, { brief_id: 'test' });
      const decoded = decodeDual(buffer);

      expect(decoded).not.toBeNull();
      expect(decoded!.signalType).toBe(SignalTypes.BRIEF_CREATED);
    });

    it('should decode JSON format', () => {
      const json = { type: 'heartbeat', payload: { data: 'test' } };
      const buffer = Buffer.from(JSON.stringify(json));

      const decoded = decodeDual(buffer);

      expect(decoded).not.toBeNull();
      expect(decoded!.signalType).toBe(SignalTypes.HEARTBEAT);
      expect(decoded!.payload).toEqual({ data: 'test' });
    });

    it('should handle JSON without payload', () => {
      const json = { type: 'server:ready', server: 'test-server' };
      const buffer = Buffer.from(JSON.stringify(json));

      const decoded = decodeDual(buffer);

      expect(decoded).not.toBeNull();
      expect(decoded!.signalType).toBe(SignalTypes.SERVER_READY);
    });

    it('should return null for invalid data', () => {
      const buffer = Buffer.from('not json or binary');

      const decoded = decodeDual(buffer);

      expect(decoded).toBeNull();
    });

    it('should prefer BaNano format when version matches', () => {
      // Create valid BaNano buffer
      const buffer = encode(SignalTypes.SCRIPT_APPROVED, { id: '123' });

      const decoded = decodeDual(buffer);

      expect(decoded!.signalType).toBe(SignalTypes.SCRIPT_APPROVED);
    });
  });

  // ============================================
  // SIGNAL TYPE CONVERSIONS
  // ============================================

  describe('Signal Type Conversions', () => {
    it('should convert type code to name', () => {
      expect(getSignalTypeName(SignalTypes.HEARTBEAT)).toBe('heartbeat');
      expect(getSignalTypeName(SignalTypes.SERVER_READY)).toBe('server:ready');
      expect(getSignalTypeName(SignalTypes.SCRIPT_GENERATED)).toBe('script:generated');
      expect(getSignalTypeName(SignalTypes.BRIEF_CREATED)).toBe('brief:created');
    });

    it('should convert name to type code', () => {
      expect(getSignalTypeCode('heartbeat')).toBe(SignalTypes.HEARTBEAT);
      expect(getSignalTypeCode('server:ready')).toBe(SignalTypes.SERVER_READY);
      expect(getSignalTypeCode('script:generated')).toBe(SignalTypes.SCRIPT_GENERATED);
      expect(getSignalTypeCode('brief:created')).toBe(SignalTypes.BRIEF_CREATED);
    });

    it('should return unknown format for unknown types', () => {
      const name = getSignalTypeName(0x9999);
      expect(name).toContain('unknown');
      expect(name).toContain('9999');
    });

    it('should return ERROR for unknown signal names', () => {
      expect(getSignalTypeCode('unknown:signal')).toBe(SignalTypes.ERROR);
    });

    it('should handle all defined signal types', () => {
      const signalTypes = [
        SignalTypes.SERVER_READY,
        SignalTypes.SERVER_SHUTDOWN,
        SignalTypes.HEARTBEAT,
        SignalTypes.SCRIPT_GENERATED,
        SignalTypes.SCRIPT_VALIDATED,
        SignalTypes.SCRIPT_APPROVED,
        SignalTypes.BRIEF_CREATED,
        SignalTypes.BRIEF_RATED,
        SignalTypes.CHRISTOHMETER_RATED,
        SignalTypes.REQUEST,
        SignalTypes.RESPONSE,
        SignalTypes.ERROR,
      ];

      for (const type of signalTypes) {
        const name = getSignalTypeName(type);
        expect(name).not.toContain('unknown');
        const code = getSignalTypeCode(name);
        expect(code).toBe(type);
      }
    });
  });

  // ============================================
  // HEADER CONSTANTS
  // ============================================

  describe('Header Constants', () => {
    it('should have correct header size', () => {
      expect(HEADER_SIZE).toBe(12);
    });

    it('should have protocol version 1', () => {
      expect(PROTOCOL_VERSION).toBe(1);
    });
  });
});

describe('Tumbler', () => {
  // ============================================
  // CONSTRUCTION
  // ============================================

  describe('Construction', () => {
    it('should create with default config', () => {
      const tumbler = new Tumbler();

      expect(tumbler.getAcceptedSignals()).toContain('*');
      expect(tumbler.getAcceptedPeers()).toEqual([]);
    });

    it('should create with accept all mode', () => {
      const tumbler = new Tumbler({ acceptAll: true });

      expect(tumbler.shouldAccept('any:signal')).toBe(true);
    });

    it('should create with specific signals', () => {
      const tumbler = new Tumbler({
        acceptedSignals: ['heartbeat', 'server:ready'],
      });

      expect(tumbler.getAcceptedSignals()).toContain('heartbeat');
      expect(tumbler.getAcceptedSignals()).toContain('server:ready');
    });

    it('should create with specific peers', () => {
      const tumbler = new Tumbler({
        acceptedPeers: ['127.0.0.1', '192.168.1.100'],
      });

      expect(tumbler.getAcceptedPeers()).toContain('127.0.0.1');
      expect(tumbler.getAcceptedPeers()).toContain('192.168.1.100');
    });
  });

  // ============================================
  // SIGNAL FILTERING
  // ============================================

  describe('Signal Filtering', () => {
    it('should accept all signals with wildcard', () => {
      const tumbler = new Tumbler({ acceptedSignals: ['*'] });

      expect(tumbler.shouldAccept('heartbeat')).toBe(true);
      expect(tumbler.shouldAccept('script:generated')).toBe(true);
      expect(tumbler.shouldAccept('unknown:signal')).toBe(true);
    });

    it('should accept only whitelisted signals', () => {
      const tumbler = new Tumbler({
        acceptedSignals: ['heartbeat', 'server:ready'],
      });

      expect(tumbler.shouldAccept('heartbeat')).toBe(true);
      expect(tumbler.shouldAccept('server:ready')).toBe(true);
      expect(tumbler.shouldAccept('script:generated')).toBe(false);
    });

    it('should accept all in acceptAll mode', () => {
      const tumbler = new Tumbler({
        acceptAll: true,
        acceptedSignals: ['heartbeat'], // Should be ignored
      });

      expect(tumbler.shouldAccept('any:signal')).toBe(true);
    });
  });

  // ============================================
  // PEER FILTERING
  // ============================================

  describe('Peer Filtering', () => {
    it('should accept any peer when no whitelist', () => {
      const tumbler = new Tumbler({ acceptedSignals: ['*'] });

      expect(tumbler.shouldAccept('heartbeat', '192.168.1.1')).toBe(true);
      expect(tumbler.shouldAccept('heartbeat', '10.0.0.1')).toBe(true);
    });

    it('should filter by peer whitelist', () => {
      const tumbler = new Tumbler({
        acceptedSignals: ['*'],
        acceptedPeers: ['127.0.0.1', '192.168.1.100'],
      });

      expect(tumbler.shouldAccept('heartbeat', '127.0.0.1')).toBe(true);
      expect(tumbler.shouldAccept('heartbeat', '192.168.1.100')).toBe(true);
      expect(tumbler.shouldAccept('heartbeat', '192.168.1.200')).toBe(false);
    });

    it('should accept without peer address when no peer whitelist', () => {
      const tumbler = new Tumbler({ acceptedSignals: ['*'] });

      expect(tumbler.shouldAccept('heartbeat')).toBe(true);
    });

    it('should combine signal and peer filtering', () => {
      const tumbler = new Tumbler({
        acceptedSignals: ['heartbeat'],
        acceptedPeers: ['127.0.0.1'],
      });

      expect(tumbler.shouldAccept('heartbeat', '127.0.0.1')).toBe(true);
      expect(tumbler.shouldAccept('heartbeat', '192.168.1.1')).toBe(false);
      expect(tumbler.shouldAccept('script:generated', '127.0.0.1')).toBe(false);
    });
  });

  // ============================================
  // DYNAMIC MODIFICATION
  // ============================================

  describe('Dynamic Modification', () => {
    it('should add signals to whitelist', () => {
      const tumbler = new Tumbler({ acceptedSignals: ['heartbeat'] });

      tumbler.addSignal('script:generated');

      expect(tumbler.shouldAccept('script:generated')).toBe(true);
    });

    it('should remove signals from whitelist', () => {
      const tumbler = new Tumbler({
        acceptedSignals: ['heartbeat', 'script:generated'],
      });

      tumbler.removeSignal('script:generated');

      expect(tumbler.shouldAccept('heartbeat')).toBe(true);
      expect(tumbler.shouldAccept('script:generated')).toBe(false);
    });

    it('should add peers to whitelist', () => {
      const tumbler = new Tumbler({
        acceptedSignals: ['*'],
        acceptedPeers: ['127.0.0.1'],
      });

      tumbler.addPeer('192.168.1.100');

      expect(tumbler.shouldAccept('heartbeat', '192.168.1.100')).toBe(true);
    });

    it('should remove peers from whitelist', () => {
      const tumbler = new Tumbler({
        acceptedSignals: ['*'],
        acceptedPeers: ['127.0.0.1', '192.168.1.100'],
      });

      tumbler.removePeer('192.168.1.100');

      expect(tumbler.shouldAccept('heartbeat', '127.0.0.1')).toBe(true);
      expect(tumbler.shouldAccept('heartbeat', '192.168.1.100')).toBe(false);
    });
  });

  // ============================================
  // EDGE CASES
  // ============================================

  describe('Edge Cases', () => {
    it('should handle empty signal name', () => {
      const tumbler = new Tumbler({ acceptedSignals: ['*'] });

      expect(tumbler.shouldAccept('')).toBe(true);
    });

    it('should handle empty peer address', () => {
      const tumbler = new Tumbler({
        acceptedSignals: ['*'],
        acceptedPeers: ['127.0.0.1'],
      });

      // Empty peer should fail peer check
      expect(tumbler.shouldAccept('heartbeat', '')).toBe(false);
    });

    it('should handle duplicate additions', () => {
      const tumbler = new Tumbler({ acceptedSignals: ['heartbeat'] });

      tumbler.addSignal('heartbeat');
      tumbler.addSignal('heartbeat');

      expect(tumbler.getAcceptedSignals().filter(s => s === 'heartbeat').length).toBe(1);
    });

    it('should handle removal of non-existent signal', () => {
      const tumbler = new Tumbler({ acceptedSignals: ['heartbeat'] });

      // Should not throw
      tumbler.removeSignal('nonexistent');

      expect(tumbler.getAcceptedSignals()).toContain('heartbeat');
    });
  });
});
