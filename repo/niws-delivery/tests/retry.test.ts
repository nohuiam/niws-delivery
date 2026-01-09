import { describe, it, expect, vi, beforeEach } from 'vitest';
import './setup';

describe('retry utilities', () => {
  describe('withRetry', () => {
    it('should succeed on first attempt', async () => {
      const { withRetry } = await import('../src/utils/retry.js');

      const fn = vi.fn().mockResolvedValue('success');
      const result = await withRetry(fn);

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should retry on retryable errors', async () => {
      const { withRetry, RateLimitError } = await import('../src/utils/retry.js');

      const fn = vi.fn()
        .mockRejectedValueOnce(new RateLimitError('Rate limited', 100))
        .mockResolvedValue('success');

      const result = await withRetry(fn, { retries: 3, baseDelay: 10 });

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('should not retry on non-retryable errors', async () => {
      const { withRetry } = await import('../src/utils/retry.js');

      const fn = vi.fn().mockRejectedValue(new Error('Validation error'));

      await expect(withRetry(fn, { retries: 3, baseDelay: 10 })).rejects.toThrow('Validation error');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should respect maxRetries', async () => {
      const { withRetry, RateLimitError, RetryError } = await import('../src/utils/retry.js');

      const fn = vi.fn().mockRejectedValue(new RateLimitError('Always rate limited'));

      await expect(withRetry(fn, { retries: 2, baseDelay: 10 })).rejects.toThrow(RetryError);
      expect(fn).toHaveBeenCalledTimes(3); // Initial + 2 retries
    });

    it('should call onRetry callback', async () => {
      const { withRetry, RateLimitError } = await import('../src/utils/retry.js');

      const onRetry = vi.fn();
      const fn = vi.fn()
        .mockRejectedValueOnce(new RateLimitError('Rate limited'))
        .mockResolvedValue('success');

      await withRetry(fn, { retries: 3, baseDelay: 10, onRetry });

      expect(onRetry).toHaveBeenCalledTimes(1);
      expect(onRetry).toHaveBeenCalledWith(
        1, // attempt number
        expect.any(Number), // delay
        expect.any(Error) // error
      );
    });
  });

  describe('RateLimitError', () => {
    it('should preserve retryAfterMs', async () => {
      const { RateLimitError } = await import('../src/utils/retry.js');

      const error = new RateLimitError('Rate limited', 5000);
      expect(error.name).toBe('RateLimitError');
      expect(error.retryAfterMs).toBe(5000);
      expect(error.message).toBe('Rate limited');
    });
  });

  describe('RetryError', () => {
    it('should preserve attempts and lastError', async () => {
      const { RetryError } = await import('../src/utils/retry.js');

      const lastError = new Error('Last failure');
      const error = new RetryError('All retries failed', 3, lastError);

      expect(error.name).toBe('RetryError');
      expect(error.attempts).toBe(3);
      expect(error.lastError).toBe(lastError);
    });
  });

  describe('isRetryableError detection', () => {
    it('should detect RateLimitError as retryable', async () => {
      const { withRetry, RateLimitError } = await import('../src/utils/retry.js');

      const fn = vi.fn()
        .mockRejectedValueOnce(new RateLimitError('Rate limited'))
        .mockResolvedValue('success');

      const result = await withRetry(fn, { retries: 1, baseDelay: 10 });
      expect(result).toBe('success');
    });

    it('should detect 429 status as retryable', async () => {
      const { withRetry } = await import('../src/utils/retry.js');

      // Error object with status property (like axios)
      const error429 = Object.assign(new Error('Too many requests'), { status: 429 });

      const fn = vi.fn()
        .mockRejectedValueOnce(error429)
        .mockResolvedValue('success');

      const result = await withRetry(fn, { retries: 1, baseDelay: 10 });
      expect(result).toBe('success');
    });

    it('should detect 5xx status as retryable', async () => {
      const { withRetry } = await import('../src/utils/retry.js');

      // Error object with status property
      const error500 = Object.assign(new Error('Internal server error'), { status: 500 });

      const fn = vi.fn()
        .mockRejectedValueOnce(error500)
        .mockResolvedValue('success');

      const result = await withRetry(fn, { retries: 1, baseDelay: 10 });
      expect(result).toBe('success');
    });

    it('should detect status in error message', async () => {
      const { withRetry } = await import('../src/utils/retry.js');

      const fn = vi.fn()
        .mockRejectedValueOnce(new Error('HTTP 503 Service Unavailable'))
        .mockResolvedValue('success');

      const result = await withRetry(fn, { retries: 1, baseDelay: 10 });
      expect(result).toBe('success');
    });

    it('should not retry 4xx errors except 429', async () => {
      const { withRetry } = await import('../src/utils/retry.js');

      const error400 = Object.assign(new Error('Bad request'), { status: 400 });

      const fn = vi.fn().mockRejectedValue(error400);

      await expect(withRetry(fn, { retries: 3, baseDelay: 10 })).rejects.toThrow();
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should not retry 404 errors', async () => {
      const { withRetry } = await import('../src/utils/retry.js');

      const fn = vi.fn().mockRejectedValue(new Error('HTTP 404 Not Found'));

      await expect(withRetry(fn, { retries: 3, baseDelay: 10 })).rejects.toThrow();
      expect(fn).toHaveBeenCalledTimes(1);
    });
  });

  describe('withTimeout', () => {
    it('should resolve when function completes in time', async () => {
      const { withTimeout } = await import('../src/utils/retry.js');

      const fn = () => Promise.resolve('success');
      const result = await withTimeout(fn, 1000);

      expect(result).toBe('success');
    });

    it('should reject when timeout is exceeded', async () => {
      const { withTimeout } = await import('../src/utils/retry.js');

      const fn = () => new Promise(resolve => setTimeout(resolve, 500));

      await expect(withTimeout(fn, 10)).rejects.toThrow('timed out');
    });
  });

  describe('createRetryFetch', () => {
    it('should create a fetch function with retry logic', async () => {
      const { createRetryFetch } = await import('../src/utils/retry.js');

      const retryFetch = createRetryFetch('https://api.example.com', {
        retries: 2,
        baseDelay: 10
      });

      expect(typeof retryFetch).toBe('function');
    });
  });
});
