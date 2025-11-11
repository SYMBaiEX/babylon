/**
 * Circuit Breaker Pattern Implementation
 * 
 * Prevents cascading failures by failing fast when a service is down
 */

import { logger } from '@/lib/logger'
import { ServiceUnavailableError } from '@/lib/errors'

export interface CircuitBreakerOptions {
  failureThreshold: number // Number of failures before opening circuit
  successThreshold: number // Number of successes before closing circuit
  timeout: number // Time in ms before attempting reset
  name?: string // Name for logging
}

export enum CircuitState {
  CLOSED = 'CLOSED', // Normal operation
  OPEN = 'OPEN', // Failing fast
  HALF_OPEN = 'HALF_OPEN', // Testing if service recovered
}

/**
 * Circuit Breaker implementation
 */
export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED
  private failureCount = 0
  private successCount = 0
  private nextAttempt = Date.now()
  private readonly name: string

  constructor(private options: CircuitBreakerOptions) {
    this.name = options.name || 'CircuitBreaker'
  }

  /**
   * Execute function with circuit breaker protection
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    // Check circuit state
    if (this.state === CircuitState.OPEN) {
      // Check if timeout has elapsed
      if (Date.now() < this.nextAttempt) {
        const waitMs = this.nextAttempt - Date.now()
        logger.warn(`${this.name} circuit is OPEN`, {
          state: this.state,
          failureCount: this.failureCount,
          retryAfter: waitMs,
        })
        throw new ServiceUnavailableError(
          `${this.name} service is currently unavailable`,
          Math.ceil(waitMs / 1000)
        )
      }

      // Timeout elapsed, try half-open
      this.state = CircuitState.HALF_OPEN
      this.successCount = 0
      logger.info(`${this.name} circuit entering HALF_OPEN state`, {
        state: this.state,
      })
    }

    try {
      const result = await fn()
      this.onSuccess()
      return result
    } catch (error) {
      this.onFailure()
      throw error
    }
  }

  /**
   * Handle successful execution
   */
  private onSuccess(): void {
    this.failureCount = 0

    if (this.state === CircuitState.HALF_OPEN) {
      this.successCount++

      if (this.successCount >= this.options.successThreshold) {
        this.state = CircuitState.CLOSED
        logger.info(`${this.name} circuit CLOSED (service recovered)`, {
          state: this.state,
          successCount: this.successCount,
        })
      }
    }
  }

  /**
   * Handle failed execution
   */
  private onFailure(): void {
    this.failureCount++

    if (this.state === CircuitState.HALF_OPEN) {
      // Failed during test, reopen circuit
      this.state = CircuitState.OPEN
      this.nextAttempt = Date.now() + this.options.timeout
      logger.warn(`${this.name} circuit REOPENED (service still down)`, {
        state: this.state,
        nextAttempt: new Date(this.nextAttempt).toISOString(),
      })
    } else if (this.failureCount >= this.options.failureThreshold) {
      // Threshold reached, open circuit
      this.state = CircuitState.OPEN
      this.nextAttempt = Date.now() + this.options.timeout
      logger.error(`${this.name} circuit OPENED (too many failures)`, {
        state: this.state,
        failureCount: this.failureCount,
        threshold: this.options.failureThreshold,
        nextAttempt: new Date(this.nextAttempt).toISOString(),
      })
    }
  }

  /**
   * Get current state
   */
  getState(): CircuitState {
    return this.state
  }

  /**
   * Get current metrics
   */
  getMetrics(): {
    state: CircuitState
    failureCount: number
    successCount: number
    nextAttempt: Date | null
  } {
    return {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      nextAttempt: this.state === CircuitState.OPEN ? new Date(this.nextAttempt) : null,
    }
  }

  /**
   * Reset circuit breaker (for testing or manual intervention)
   */
  reset(): void {
    this.state = CircuitState.CLOSED
    this.failureCount = 0
    this.successCount = 0
    this.nextAttempt = Date.now()
    logger.info(`${this.name} circuit manually reset`, { state: this.state })
  }
}