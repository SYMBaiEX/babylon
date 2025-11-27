/**
 * Retry Utility for Network Calls
 *
 * @description Provides retry logic for fetch calls and other async operations
 * with exponential backoff. Automatically retries on network errors, 5xx server
 * errors, and rate limit (429) responses.
 */

import { logger } from './logger';

/**
 * Retry configuration options
 */
interface RetryOptions {
  maxAttempts?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  backoffMultiplier?: number;
}

const DEFAULT_OPTIONS: Required<RetryOptions> = {
  maxAttempts: 3,
  initialDelayMs: 100,
  maxDelayMs: 2000,
  backoffMultiplier: 2,
};

/**
 * Check if error is retryable (network errors, 5xx, rate limits)
 *
 * @description Determines if an error should trigger a retry based on error type
 * and HTTP status code. Retries on network errors, 5xx server errors, and 429
 * rate limit responses.
 *
 * @param {unknown} error - The error to check
 * @returns {boolean} True if the error is retryable
 * @private
 */
function isRetryableError(error: unknown): boolean {
  if (error instanceof TypeError && error.message.includes('fetch')) {
    return true; // Network errors
  }

  if (error && typeof error === 'object' && 'status' in error) {
    const status = (error as { status: number }).status;
    // Retry on 5xx errors and 429 (rate limit)
    return status >= 500 || status === 429;
  }

  return false;
}

/**
 * Sleep for specified milliseconds
 *
 * @description Creates a promise that resolves after the specified delay.
 * Used for exponential backoff delays between retry attempts.
 *
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>} Promise that resolves after the delay
 * @private
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry an async operation if it fails with a retryable error
 *
 * @description Executes an async operation and automatically retries on retryable
 * errors (network errors, 5xx, 429) with exponential backoff. Throws immediately
 * on non-retryable errors.
 *
 * @template T - Return type of the operation
 * @param {() => Promise<T>} operation - Async operation to retry
 * @param {RetryOptions} options - Retry configuration options
 * @returns {Promise<T>} Result of the operation
 *
 * @example
 * ```typescript
 * const data = await retryIfRetryable(
 *   () => fetch('/api/data').then(r => r.json()),
 *   { maxAttempts: 5, initialDelayMs: 200 }
 * );
 * ```
 */
export async function retryIfRetryable<T>(
  operation: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  let lastError: Error | undefined;

  for (let attempt = 0; attempt < opts.maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error as Error;

      // Check if we should retry
      if (!isRetryableError(error)) {
        throw error; // Not retryable, throw immediately
      }

      // Don't retry if we've exhausted attempts
      if (attempt === opts.maxAttempts - 1) {
        throw error;
      }

      // Calculate delay with exponential backoff
      const delay = Math.min(
        opts.initialDelayMs * opts.backoffMultiplier ** attempt,
        opts.maxDelayMs
      );

      logger.debug(
        'Retrying operation',
        {
          attempt: attempt + 1,
          maxAttempts: opts.maxAttempts,
          delayMs: delay,
          error: error instanceof Error ? error.message : String(error),
        },
        'retry'
      );

      await sleep(delay);
    }
  }

  throw lastError || new Error('Operation failed with unknown error');
}

/**
 * Retry with custom retry condition
 *
 * @description Executes an async operation and retries based on a custom condition
 * function. Allows fine-grained control over which errors trigger retries.
 *
 * @template T - Return type of the operation
 * @param {() => Promise<T>} operation - Async operation to retry
 * @param {(error: unknown) => boolean} shouldRetry - Function that determines if error should retry
 * @param {RetryOptions} options - Retry configuration options
 * @returns {Promise<T>} Result of the operation
 *
 * @example
 * ```typescript
 * const result = await retryWithCondition(
 *   () => processData(),
 *   (error) => error instanceof CustomError && error.isRetryable,
 *   { maxAttempts: 3 }
 * );
 * ```
 */
export async function retryWithCondition<T>(
  operation: () => Promise<T>,
  shouldRetry: (error: unknown) => boolean,
  options: RetryOptions = {}
): Promise<T> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  let lastError: Error | undefined;

  for (let attempt = 0; attempt < opts.maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error as Error;

      if (!shouldRetry(error)) {
        throw error;
      }

      if (attempt === opts.maxAttempts - 1) {
        throw error;
      }

      const delay = Math.min(
        opts.initialDelayMs * opts.backoffMultiplier ** attempt,
        opts.maxDelayMs
      );

      await sleep(delay);
    }
  }

  throw lastError || new Error('Operation failed with unknown error');
}
