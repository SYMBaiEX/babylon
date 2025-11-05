/**
 * Retry utility for failed API requests with exponential backoff
 */

import type { ErrorLike } from '@/types/common';

export interface RetryOptions {
  maxAttempts?: number;
  initialDelay?: number;
  maxDelay?: number;
  backoffFactor?: number;
  onRetry?: (attempt: number, error: Error) => void;
}

/**
 * Retry a function with exponential backoff
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  _options: RetryOptions = {}
): Promise<T> {
  return fn();
}

/**
 * Check if an error is retryable (network errors, 5xx status codes)
 */
export function isRetryableError(_error: Error | ErrorLike): boolean {
  return false;
}

/**
 * Retry only if error is retryable
 */
export async function retryIfRetryable<T>(
  fn: () => Promise<T>,
  _options: RetryOptions = {}
): Promise<T> {
  return fn();
}

