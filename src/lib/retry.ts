/**
 * Retry utility for failed API requests with exponential backoff
 */

import type { ErrorLike } from '@/types/common'
import { logger } from './logger'

export interface RetryOptions {
  maxAttempts?: number
  initialDelay?: number
  maxDelay?: number
  backoffFactor?: number
  onRetry?: (attempt: number, error: Error) => void
}

const DEFAULT_RETRY_OPTIONS: Required<RetryOptions> = {
  maxAttempts: 3,
  initialDelay: 1000, // 1 second
  maxDelay: 10000, // 10 seconds
  backoffFactor: 2,
  onRetry: () => {},
}

/**
 * Retry a function with exponential backoff
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const opts = { ...DEFAULT_RETRY_OPTIONS, ...options }
  let lastError: Error | unknown

  for (let attempt = 0; attempt < opts.maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error

      // Don't retry on last attempt
      if (attempt === opts.maxAttempts - 1) {
        break
      }

      // Calculate delay with exponential backoff
      const delay = Math.min(
        opts.initialDelay * Math.pow(opts.backoffFactor, attempt),
        opts.maxDelay
      )

      // Call onRetry callback
      if (error instanceof Error) {
        opts.onRetry(attempt + 1, error)
      }

      logger.debug('Retrying operation', {
        attempt: attempt + 1,
        maxAttempts: opts.maxAttempts,
        delayMs: delay,
        error: error instanceof Error ? error.message : String(error),
      })

      await new Promise((resolve) => setTimeout(resolve, delay))
    }
  }

  // All retries exhausted
  throw lastError
}

/**
 * Check if an error is retryable (network errors, 5xx status codes)
 */
export function isRetryableError(error: Error | ErrorLike): boolean {
  // Check for network errors
  const networkErrors = [
    'ECONNRESET',
    'ETIMEDOUT',
    'ENOTFOUND',
    'ENETUNREACH',
    'EHOSTUNREACH',
    'NetworkError',
    'network',
    'timeout',
  ]

  const errorMessage = error.message?.toLowerCase() || ''
  if (networkErrors.some((msg) => errorMessage.includes(msg.toLowerCase()))) {
    return true
  }

  // Check for 5xx status codes
  if ('status' in error && typeof error.status === 'number') {
    return error.status >= 500 && error.status < 600
  }

  if ('statusCode' in error && typeof error.statusCode === 'number') {
    return error.statusCode >= 500 && error.statusCode < 600
  }

  return false
}

/**
 * Retry only if error is retryable
 */
export async function retryIfRetryable<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const opts = { ...DEFAULT_RETRY_OPTIONS, ...options }
  let lastError: Error | unknown

  for (let attempt = 0; attempt < opts.maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error

      // Check if error is retryable
      const shouldRetry =
        error instanceof Error ? isRetryableError(error) : false

      // Don't retry if error is not retryable or on last attempt
      if (!shouldRetry || attempt === opts.maxAttempts - 1) {
        throw error
      }

      // Calculate delay with exponential backoff
      const delay = Math.min(
        opts.initialDelay * Math.pow(opts.backoffFactor, attempt),
        opts.maxDelay
      )

      // Call onRetry callback
      if (error instanceof Error) {
        opts.onRetry(attempt + 1, error)
      }

      logger.debug('Retrying retryable error', {
        attempt: attempt + 1,
        maxAttempts: opts.maxAttempts,
        delayMs: delay,
        error: error instanceof Error ? error.message : String(error),
      })

      await new Promise((resolve) => setTimeout(resolve, delay))
    }
  }

  throw lastError
}

