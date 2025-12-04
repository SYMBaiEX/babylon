/**
 * Retry Utilities Unit Tests
 * Tests for async retry logic with exponential backoff
 */

import { describe, expect, it } from 'bun:test';
import {
  isRetryableError,
  retryIfRetryable,
  retryWithCondition,
  sleep,
} from '@babylon/shared';

describe('Retry Utilities', () => {
  describe('sleep', () => {
    it('should delay for specified time', async () => {
      const start = Date.now();
      await sleep(50);
      const elapsed = Date.now() - start;
      expect(elapsed).toBeGreaterThanOrEqual(40); // Allow some variance
      expect(elapsed).toBeLessThan(150);
    });

    it('should resolve without value', async () => {
      const result = await sleep(10);
      expect(result).toBeUndefined();
    });
  });

  describe('isRetryableError', () => {
    it('should return true for network errors', () => {
      const error = new TypeError('Failed to fetch');
      expect(isRetryableError(error)).toBe(true);
    });

    it('should return true for 5xx status errors', () => {
      expect(isRetryableError({ status: 500 })).toBe(true);
      expect(isRetryableError({ status: 502 })).toBe(true);
      expect(isRetryableError({ status: 503 })).toBe(true);
    });

    it('should return true for 429 rate limit errors', () => {
      expect(isRetryableError({ status: 429 })).toBe(true);
    });

    it('should return false for 4xx client errors', () => {
      expect(isRetryableError({ status: 400 })).toBe(false);
      expect(isRetryableError({ status: 401 })).toBe(false);
      expect(isRetryableError({ status: 404 })).toBe(false);
    });

    it('should return false for non-error objects', () => {
      expect(isRetryableError(null)).toBe(false);
      expect(isRetryableError(undefined)).toBe(false);
      expect(isRetryableError('error')).toBe(false);
    });
  });

  describe('retryIfRetryable', () => {
    it('should succeed on first attempt', async () => {
      let attempts = 0;
      const result = await retryIfRetryable(async () => {
        attempts++;
        return 'success';
      });
      expect(result).toBe('success');
      expect(attempts).toBe(1);
    });

    it('should retry on retryable errors', async () => {
      let attempts = 0;
      const result = await retryIfRetryable(
        async () => {
          attempts++;
          if (attempts < 3) {
            const error = { status: 500 };
            throw error;
          }
          return 'success';
        },
        { maxAttempts: 5, initialDelayMs: 10 }
      );
      expect(result).toBe('success');
      expect(attempts).toBe(3);
    });

    it('should not retry on non-retryable errors', async () => {
      let attempts = 0;
      await expect(
        retryIfRetryable(async () => {
          attempts++;
          throw { status: 400 }; // Client error - not retryable
        })
      ).rejects.toEqual({ status: 400 });
      expect(attempts).toBe(1);
    });

    it('should throw after max attempts', async () => {
      let attempts = 0;
      await expect(
        retryIfRetryable(
          async () => {
            attempts++;
            throw { status: 500 };
          },
          { maxAttempts: 3, initialDelayMs: 10 }
        )
      ).rejects.toEqual({ status: 500 });
      expect(attempts).toBe(3);
    });

    it('should call onRetry callback', async () => {
      const retries: number[] = [];
      let attempts = 0;

      await retryIfRetryable(
        async () => {
          attempts++;
          if (attempts < 3) {
            throw { status: 500 };
          }
          return 'success';
        },
        {
          maxAttempts: 5,
          initialDelayMs: 10,
          onRetry: (attempt) => retries.push(attempt),
        }
      );

      expect(retries).toEqual([1, 2]);
    });
  });

  describe('retryWithCondition', () => {
    it('should retry based on custom condition', async () => {
      let attempts = 0;
      const result = await retryWithCondition(
        async () => {
          attempts++;
          if (attempts < 3) {
            throw new Error('RETRY_ME');
          }
          return 'success';
        },
        (error) => error instanceof Error && error.message === 'RETRY_ME',
        { maxAttempts: 5, initialDelayMs: 10 }
      );
      expect(result).toBe('success');
      expect(attempts).toBe(3);
    });

    it('should not retry when condition returns false', async () => {
      let attempts = 0;
      await expect(
        retryWithCondition(
          async () => {
            attempts++;
            throw new Error('DO_NOT_RETRY');
          },
          (error) => error instanceof Error && error.message === 'RETRY_ME',
          { maxAttempts: 5, initialDelayMs: 10 }
        )
      ).rejects.toThrow('DO_NOT_RETRY');
      expect(attempts).toBe(1);
    });
  });
});
