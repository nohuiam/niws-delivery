import { describe, it, expect, vi, beforeEach } from 'vitest';
import './setup';

describe('shell-safe utilities', () => {
  describe('sanitizePath', () => {
    it('should accept valid paths', async () => {
      const { sanitizePath } = await import('../src/utils/shell-safe.js');

      const result = sanitizePath('/tmp/test/file.mp4');
      expect(result).toBe('/tmp/test/file.mp4');
    });

    it('should reject paths with shell metacharacters', async () => {
      const { sanitizePath, PathValidationError } = await import('../src/utils/shell-safe.js');

      expect(() => sanitizePath('/tmp/test$(whoami).mp4')).toThrow(PathValidationError);
      expect(() => sanitizePath('/tmp/test`id`.mp4')).toThrow(PathValidationError);
      expect(() => sanitizePath('/tmp/test;rm -rf.mp4')).toThrow(PathValidationError);
    });

    it('should reject paths with null bytes', async () => {
      const { sanitizePath, PathValidationError } = await import('../src/utils/shell-safe.js');

      expect(() => sanitizePath('/tmp/test\0.mp4')).toThrow(PathValidationError);
    });

    it('should not expose full path in error messages', async () => {
      const { sanitizePath, PathValidationError } = await import('../src/utils/shell-safe.js');

      try {
        sanitizePath('/secret/internal/path/bad$file.mp4');
        expect.fail('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(PathValidationError);
        const message = (err as Error).message;
        // Should not contain the full path
        expect(message).not.toContain('/secret/internal/path/');
        // Should only contain the filename
        expect(message).toContain('bad$file.mp4');
      }
    });

    it('should respect maxLength option', async () => {
      const { sanitizePath, PathValidationError } = await import('../src/utils/shell-safe.js');

      const longPath = '/tmp/' + 'a'.repeat(5000) + '.mp4';
      expect(() => sanitizePath(longPath, { maxLength: 100 })).toThrow(PathValidationError);
    });
  });

  describe('sanitizeText', () => {
    it('should escape FFmpeg filter syntax', async () => {
      const { sanitizeText } = await import('../src/utils/shell-safe.js');

      const result = sanitizeText("Hello: World's Text");
      expect(result).toContain('\\:');
      expect(result).toContain("\\'");
    });

    it('should remove dangerous shell characters', async () => {
      const { sanitizeText } = await import('../src/utils/shell-safe.js');

      const result = sanitizeText('Hello $(whoami) `id` $HOME');
      expect(result).not.toContain('$');
      expect(result).not.toContain('`');
    });

    it('should respect maxLength option', async () => {
      const { sanitizeText, TextValidationError } = await import('../src/utils/shell-safe.js');

      const longText = 'a'.repeat(2000);
      expect(() => sanitizeText(longText, { maxLength: 100 })).toThrow(TextValidationError);
    });

    it('should return empty string for null/undefined', async () => {
      const { sanitizeText } = await import('../src/utils/shell-safe.js');

      expect(sanitizeText(null as unknown as string)).toBe('');
      expect(sanitizeText(undefined as unknown as string)).toBe('');
    });
  });

  describe('sanitizeNumber', () => {
    it('should clamp values to min/max', async () => {
      const { sanitizeNumber } = await import('../src/utils/shell-safe.js');

      expect(sanitizeNumber(50, 0, 100, 50)).toBe(50);
      expect(sanitizeNumber(150, 0, 100, 50)).toBe(50); // Above max, use default
      expect(sanitizeNumber(-10, 0, 100, 50)).toBe(50); // Below min, use default
    });

    it('should return default for NaN', async () => {
      const { sanitizeNumber } = await import('../src/utils/shell-safe.js');

      expect(sanitizeNumber(NaN, 0, 100, 50)).toBe(50);
      expect(sanitizeNumber('not a number', 0, 100, 50)).toBe(50);
    });

    it('should handle edge values correctly', async () => {
      const { sanitizeNumber } = await import('../src/utils/shell-safe.js');

      expect(sanitizeNumber(0, 0, 100, 50)).toBe(0);
      expect(sanitizeNumber(100, 0, 100, 50)).toBe(100);
    });
  });

  describe('sanitizeColor', () => {
    it('should accept valid hex colors', async () => {
      const { sanitizeColor } = await import('../src/utils/shell-safe.js');

      expect(sanitizeColor('#FF0000')).toBe('#FF0000');
      expect(sanitizeColor('#ff0000')).toBe('#ff0000');
      expect(sanitizeColor('#FF0000FF')).toBe('#FF0000FF'); // With alpha
    });

    it('should accept named colors', async () => {
      const { sanitizeColor } = await import('../src/utils/shell-safe.js');

      expect(sanitizeColor('white')).toBe('white');
      expect(sanitizeColor('BLACK')).toBe('black');
      expect(sanitizeColor('Red')).toBe('red');
    });

    it('should default to white for invalid colors', async () => {
      const { sanitizeColor } = await import('../src/utils/shell-safe.js');

      expect(sanitizeColor('invalid')).toBe('white');
      expect(sanitizeColor('#XYZ')).toBe('white');
      expect(sanitizeColor('$(whoami)')).toBe('white');
    });
  });
});
