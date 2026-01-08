/**
 * InterLock Tests
 * Tests for mesh communication protocol (BaNano format)
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import {
  encodeSignal,
  decodeSignal,
  createSignal,
  getSignalName
} from '../src/interlock/protocol.js';
import {
  isSignalAllowed,
  addToWhitelist,
  removeFromWhitelist,
  getWhitelist,
  loadTumblerConfig
} from '../src/interlock/tumbler.js';
import {
  registerHandler,
  handleSignal,
  handlers,
  initHandlers
} from '../src/interlock/handlers.js';
import { SignalTypes, Signal } from '../src/types.js';

describe('InterLock Protocol', () => {
  describe('encodeSignal', () => {
    it('should encode a signal to buffer', () => {
      const signal = createSignal(SignalTypes.SKILL_CREATED, 'skill-builder', {
        skill_id: 'test-123'
      });

      const buffer = encodeSignal(signal);
      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBeGreaterThan(0);
    });

    it('should encode signal without data', () => {
      const signal = createSignal(SignalTypes.HEARTBEAT, 'skill-builder');
      const buffer = encodeSignal(signal);
      expect(buffer).toBeInstanceOf(Buffer);
    });

    it('should include all signal fields', () => {
      const signal: Signal = {
        signalType: SignalTypes.SKILL_MATCHED,
        version: 0x0100,
        timestamp: Math.floor(Date.now() / 1000),
        payload: { sender: 'test-sender', test: true }
      };

      const buffer = encodeSignal(signal);
      const decoded = decodeSignal(buffer);

      expect(decoded).not.toBeNull();
      expect(decoded!.signalType).toBe(signal.signalType);
      expect(decoded!.payload.sender).toBe(signal.payload.sender);
    });
  });

  describe('decodeSignal', () => {
    it('should decode a signal from buffer', () => {
      const original = createSignal(SignalTypes.SKILL_USED, 'skill-builder', {
        skill_id: 'skill-123',
        outcome: 'success'
      });

      const buffer = encodeSignal(original);
      const decoded = decodeSignal(buffer);

      expect(decoded).not.toBeNull();
      expect(decoded!.signalType).toBe(original.signalType);
      expect(decoded!.payload.sender).toBe(original.payload.sender);
      expect(decoded!.payload.skill_id).toBe(original.payload.skill_id);
    });

    it('should preserve timestamp', () => {
      const original = createSignal(SignalTypes.SKILL_CREATED, 'test');
      const buffer = encodeSignal(original);
      const decoded = decodeSignal(buffer);

      expect(decoded).not.toBeNull();
      expect(decoded!.timestamp).toBe(original.timestamp);
    });

    it('should handle signal without extra data', () => {
      const original = createSignal(SignalTypes.HEARTBEAT, 'test');
      const buffer = encodeSignal(original);
      const decoded = decodeSignal(buffer);

      expect(decoded).not.toBeNull();
      expect(decoded!.payload.sender).toBe('test');
    });
  });

  describe('createSignal', () => {
    it('should create signal with timestamp', () => {
      const before = Math.floor(Date.now() / 1000);
      const signal = createSignal(SignalTypes.SKILL_CREATED, 'test');
      const after = Math.floor(Date.now() / 1000);

      expect(signal.timestamp).toBeGreaterThanOrEqual(before);
      expect(signal.timestamp).toBeLessThanOrEqual(after);
    });

    it('should set correct signal type', () => {
      const signal = createSignal(SignalTypes.SKILL_MATCHED, 'test');
      expect(signal.signalType).toBe(SignalTypes.SKILL_MATCHED);
    });

    it('should include data in payload when provided', () => {
      const data = { skill_id: 'test', confidence: 0.9 };
      const signal = createSignal(SignalTypes.SKILL_MATCHED, 'test', data);
      expect(signal.payload.skill_id).toBe('test');
      expect(signal.payload.confidence).toBe(0.9);
    });
  });

  describe('getSignalName', () => {
    it('should return correct name for known codes', () => {
      expect(getSignalName(SignalTypes.SKILL_CREATED)).toBe('SKILL_CREATED');
      expect(getSignalName(SignalTypes.SKILL_MATCHED)).toBe('SKILL_MATCHED');
      expect(getSignalName(SignalTypes.SKILL_USED)).toBe('SKILL_USED');
      expect(getSignalName(SignalTypes.SKILL_DEPRECATED)).toBe('SKILL_DEPRECATED');
      expect(getSignalName(SignalTypes.SKILL_VALIDATION_FAILED)).toBe('SKILL_VALIDATION_FAILED');
    });

    it('should return UNKNOWN for unknown codes', () => {
      // 0xBB is not defined in SignalTypes
      const name = getSignalName(0xBB);
      expect(name).toContain('UNKNOWN');
    });
  });
});

describe('Tumbler', () => {
  beforeEach(() => {
    loadTumblerConfig();
  });

  describe('isSignalAllowed', () => {
    it('should allow whitelisted signals', () => {
      addToWhitelist('SKILL_CREATED');
      const signal = createSignal(SignalTypes.SKILL_CREATED, 'test');
      expect(isSignalAllowed(signal)).toBe(true);
    });

    it('should block non-whitelisted signals', () => {
      removeFromWhitelist('SKILL_DEPRECATED');
      const signal: Signal = {
        signalType: SignalTypes.SKILL_DEPRECATED,
        version: 0x0100,
        timestamp: Math.floor(Date.now() / 1000),
        payload: { sender: 'test' }
      };
      expect(isSignalAllowed(signal)).toBe(false);
    });
  });

  describe('addToWhitelist', () => {
    it('should add signal to whitelist', () => {
      const before = getWhitelist();
      addToWhitelist('NEW_SIGNAL');
      const after = getWhitelist();

      expect(after.length).toBe(before.length + 1);
      expect(after).toContain('NEW_SIGNAL');
    });
  });

  describe('removeFromWhitelist', () => {
    it('should remove signal from whitelist', () => {
      addToWhitelist('REMOVE_ME');
      removeFromWhitelist('REMOVE_ME');
      expect(getWhitelist()).not.toContain('REMOVE_ME');
    });
  });

  describe('getWhitelist', () => {
    it('should return array of signal names', () => {
      const whitelist = getWhitelist();
      expect(Array.isArray(whitelist)).toBe(true);
    });
  });
});

describe('Handlers', () => {
  beforeEach(() => {
    initHandlers();
  });

  describe('registerHandler', () => {
    it('should register a handler for signal code', () => {
      const mockHandler = jest.fn();
      registerHandler(0xF0, mockHandler);

      expect(handlers.has(0xF0)).toBe(true);
    });

    it('should overwrite existing handler', () => {
      const handler1 = jest.fn();
      const handler2 = jest.fn();

      registerHandler(0xF1, handler1);
      registerHandler(0xF1, handler2);

      expect(handlers.get(0xF1)).toBe(handler2);
    });
  });

  describe('handleSignal', () => {
    it('should call registered handler', () => {
      const mockHandler = jest.fn();
      registerHandler(0xF2, mockHandler);

      const signal: Signal = {
        signalType: 0xF2,
        version: 0x0100,
        timestamp: Math.floor(Date.now() / 1000),
        payload: { sender: 'test' }
      };

      handleSignal(signal);
      expect(mockHandler).toHaveBeenCalledWith(signal);
    });

    it('should not throw for unhandled signals', () => {
      const signal: Signal = {
        signalType: 0xFE,
        version: 0x0100,
        timestamp: Math.floor(Date.now() / 1000),
        payload: { sender: 'test' }
      };

      expect(() => handleSignal(signal)).not.toThrow();
    });

    it('should handle built-in signals', () => {
      const signal = createSignal(SignalTypes.HEARTBEAT, 'test');
      expect(() => handleSignal(signal)).not.toThrow();
    });
  });

  describe('initHandlers', () => {
    it('should register default handlers', () => {
      initHandlers();

      // Check for some built-in handlers
      expect(handlers.has(SignalTypes.EXPERIENCE_RECORDED)).toBe(true);
      expect(handlers.has(SignalTypes.PATTERN_EMERGED)).toBe(true);
      expect(handlers.has(SignalTypes.LESSON_EXTRACTED)).toBe(true);
      expect(handlers.has(SignalTypes.OPERATION_COMPLETE)).toBe(true);
      expect(handlers.has(SignalTypes.HEARTBEAT)).toBe(true);
    });
  });
});

describe('Signal Roundtrip', () => {
  it('should encode and decode all signal types', () => {
    const signalTypes = [
      SignalTypes.SKILL_CREATED,
      SignalTypes.SKILL_MATCHED,
      SignalTypes.SKILL_USED,
      SignalTypes.SKILL_DEPRECATED,
      SignalTypes.SKILL_VALIDATION_FAILED,
      SignalTypes.HEARTBEAT
    ];

    for (const type of signalTypes) {
      const original = createSignal(type, 'roundtrip-test', { test: type });
      const buffer = encodeSignal(original);
      const decoded = decodeSignal(buffer);

      expect(decoded).not.toBeNull();
      expect(decoded!.signalType).toBe(original.signalType);
      expect(decoded!.payload.sender).toBe(original.payload.sender);
    }
  });

  it('should handle large data payloads', () => {
    const largeData = {
      items: Array(100).fill(null).map((_, i) => ({
        id: `item-${i}`,
        value: 'x'.repeat(100)
      }))
    };

    const signal = createSignal(SignalTypes.SKILL_CREATED, 'test', largeData);
    const buffer = encodeSignal(signal);
    const decoded = decodeSignal(buffer);

    expect(decoded).not.toBeNull();
    expect(decoded!.payload.items).toEqual(largeData.items);
  });

  it('should handle unicode in sender and data', () => {
    const signal = createSignal(SignalTypes.SKILL_CREATED, '测试-tëst', {
      message: 'Hello 世界 🌍'
    });

    const buffer = encodeSignal(signal);
    const decoded = decodeSignal(buffer);

    expect(decoded).not.toBeNull();
    expect(decoded!.payload.sender).toBe('测试-tëst');
    expect((decoded!.payload as unknown as { message: string }).message).toBe('Hello 世界 🌍');
  });
});
