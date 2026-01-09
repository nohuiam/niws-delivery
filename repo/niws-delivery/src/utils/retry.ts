/**
 * Retry utility with exponential backoff.
 *
 * Provides resilient HTTP request handling for external APIs
 * with automatic retry on transient failures.
 */

// Default fetch timeout for createRetryFetch
const DEFAULT_FETCH_TIMEOUT_MS = 30 * 1000; // 30 seconds

export interface RetryOptions {
  /** Maximum number of retry attempts (default: 3) */
  retries?: number;
  /** Base delay in ms between retries (default: 1000) */
  baseDelay?: number;
  /** Maximum delay in ms (default: 30000) */
  maxDelay?: number;
  /** Multiplier for exponential backoff (default: 2) */
  backoffFactor?: number;
  /** HTTP status codes to retry on (default: [429, 500, 502, 503, 504]) */
  retryableStatuses?: number[];
  /** Whether to add jitter to delays (default: true) */
  jitter?: boolean;
  /** Callback for logging retry attempts */
  onRetry?: (attempt: number, delay: number, error: Error) => void;
}

const DEFAULT_OPTIONS: Required<Omit<RetryOptions, 'onRetry'>> = {
  retries: 3,
  baseDelay: 1000,
  maxDelay: 30000,
  backoffFactor: 2,
  retryableStatuses: [429, 500, 502, 503, 504],
  jitter: true
};

/**
 * Custom error class for retry failures
 */
export class RetryError extends Error {
  constructor(
    message: string,
    public readonly attempts: number,
    public readonly lastError: Error
  ) {
    super(message);
    this.name = 'RetryError';
  }
}

/**
 * Error class for rate limiting with retry-after support
 */
export class RateLimitError extends Error {
  constructor(
    message: string,
    public readonly retryAfterMs?: number
  ) {
    super(message);
    this.name = 'RateLimitError';
  }
}

/**
 * Calculate delay for a given attempt with optional jitter
 */
function calculateDelay(
  attempt: number,
  baseDelay: number,
  maxDelay: number,
  backoffFactor: number,
  jitter: boolean
): number {
  // Exponential backoff: baseDelay * backoffFactor^attempt
  let delay = baseDelay * Math.pow(backoffFactor, attempt);

  // Cap at max delay
  delay = Math.min(delay, maxDelay);

  // Add jitter (0-25% random variation)
  if (jitter) {
    const jitterAmount = delay * 0.25 * Math.random();
    delay = delay + jitterAmount;
  }

  return Math.round(delay);
}

/**
 * Sleep for a given number of milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Determine if an error is retryable
 */
function isRetryableError(error: unknown, retryableStatuses: number[]): boolean {
  // Check for RateLimitError first
  if (error instanceof RateLimitError) {
    return true;
  }

  // Network/fetch errors are retryable
  if (error instanceof TypeError && error.message.includes('fetch')) {
    return true;
  }

  // Check for error objects with status property (common in HTTP libraries)
  if (error && typeof error === 'object') {
    const status = (error as { status?: number }).status;
    if (typeof status === 'number' && retryableStatuses.includes(status)) {
      return true;
    }
  }

  // Fallback: Check for HTTP status codes in error message
  if (error instanceof Error) {
    const statusMatch = error.message.match(/\b([45]\d{2})\b/);
    if (statusMatch) {
      const status = parseInt(statusMatch[1], 10);
      return retryableStatuses.includes(status);
    }
  }

  // Unknown errors - don't retry by default
  return false;
}

/**
 * Execute a function with retry logic and exponential backoff.
 *
 * @param fn - The async function to execute
 * @param options - Retry configuration options
 * @returns The result of the function
 * @throws RetryError if all attempts fail
 *
 * @example
 * ```typescript
 * const result = await withRetry(
 *   async () => {
 *     const response = await fetch('https://api.example.com/data');
 *     if (!response.ok) throw new Error(`HTTP ${response.status}`);
 *     return response.json();
 *   },
 *   {
 *     retries: 3,
 *     baseDelay: 1000,
 *     onRetry: (attempt, delay, error) => {
 *       console.log(`Retry ${attempt}, waiting ${delay}ms: ${error.message}`);
 *     }
 *   }
 * );
 * ```
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options?: RetryOptions
): Promise<T> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  let lastError: Error = new Error('Unknown error');

  for (let attempt = 0; attempt <= opts.retries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Check if this is the last attempt
      if (attempt === opts.retries) {
        break;
      }

      // Check if error is retryable
      if (!isRetryableError(error, opts.retryableStatuses)) {
        throw lastError;
      }

      // Calculate delay
      let delay: number;

      // Special handling for rate limit errors with retry-after
      if (error instanceof RateLimitError && error.retryAfterMs) {
        delay = Math.min(error.retryAfterMs, opts.maxDelay);
      } else {
        delay = calculateDelay(
          attempt,
          opts.baseDelay,
          opts.maxDelay,
          opts.backoffFactor,
          opts.jitter
        );
      }

      // Call onRetry callback if provided
      if (options?.onRetry) {
        options.onRetry(attempt + 1, delay, lastError);
      }

      // Wait before retrying
      await sleep(delay);
    }
  }

  throw new RetryError(
    `Failed after ${opts.retries + 1} attempts: ${lastError.message}`,
    opts.retries + 1,
    lastError
  );
}

/**
 * Create a fetch wrapper with automatic retry.
 *
 * @param baseUrl - Base URL for all requests
 * @param defaultOptions - Default retry options
 * @returns A fetch function with retry logic
 *
 * @example
 * ```typescript
 * const fetchWithRetry = createRetryFetch('https://api.example.com', {
 *   retries: 3,
 *   baseDelay: 1000
 * });
 *
 * const data = await fetchWithRetry('/users', { method: 'GET' });
 * ```
 */
export function createRetryFetch(
  baseUrl: string,
  defaultOptions?: RetryOptions
): (path: string, init?: RequestInit) => Promise<Response> {
  return async (path: string, init?: RequestInit): Promise<Response> => {
    const url = path.startsWith('http') ? path : `${baseUrl}${path}`;

    return withRetry(async () => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), DEFAULT_FETCH_TIMEOUT_MS);

      try {
        const response = await fetch(url, {
          ...init,
          signal: controller.signal
        });

        // Handle rate limiting
        if (response.status === 429) {
          const retryAfter = response.headers.get('Retry-After');
          const retryAfterMs = retryAfter
            ? (parseInt(retryAfter, 10) || 60) * 1000
            : undefined;
          throw new RateLimitError('Rate limited', retryAfterMs);
        }

        // Throw on server errors to trigger retry
        if (response.status >= 500) {
          throw new Error(`HTTP status ${response.status}`);
        }

        return response;
      } finally {
        clearTimeout(timeout);
      }
    }, defaultOptions);
  };
}

/**
 * Wrap a function to add timeout capability.
 *
 * @param fn - The async function to wrap
 * @param timeoutMs - Timeout in milliseconds
 * @returns The result of the function
 * @throws Error if timeout is exceeded
 */
export async function withTimeout<T>(
  fn: () => Promise<T>,
  timeoutMs: number
): Promise<T> {
  return Promise.race([
    fn(),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Operation timed out after ${timeoutMs}ms`)), timeoutMs)
    )
  ]);
}
