/**
 * Rate Limiter Implementation
 * 
 * Token bucket algorithm for API rate limiting
 */

import { logger } from '@/lib/logger'
import { RateLimitError } from '@/lib/errors'

export interface RateLimiterOptions {
  tokensPerInterval: number
  intervalMs: number
  name?: string
}

interface TokenBucket {
  tokens: number
  lastRefill: number
}

/**
 * Token bucket rate limiter
 */
export class RateLimiter {
  private readonly name: string
  private readonly options: RateLimiterOptions
  private bucket: TokenBucket

  constructor(options: RateLimiterOptions) {
    this.options = options
    this.name = options.name || 'RateLimiter'
    
    // Initialize token bucket
    this.bucket = {
      tokens: options.tokensPerInterval,
      lastRefill: Date.now()
    }
  }

  /**
   * Refill tokens based on elapsed time
   */
  private refillBucket(): void {
    const now = Date.now()
    const timePassed = now - this.bucket.lastRefill

    if (timePassed >= this.options.intervalMs) {
      const intervalsElapsed = Math.floor(timePassed / this.options.intervalMs)
      const tokensToAdd = intervalsElapsed * this.options.tokensPerInterval

      this.bucket.tokens = Math.min(
        this.options.tokensPerInterval,
        this.bucket.tokens + tokensToAdd
      )
      this.bucket.lastRefill = now
    }
  }

  /**
   * Try to consume tokens
   * @param count Number of tokens to consume
   * @returns true if tokens available, false otherwise
   */
  async tryConsume(count = 1): Promise<boolean> {
    this.refillBucket()

    if (this.bucket.tokens >= count) {
      this.bucket.tokens -= count
      return true
    }

    return false
  }

  /**
   * Consume tokens or throw error
   * @param count Number of tokens to consume
   */
  async consume(count = 1): Promise<void> {
    this.refillBucket()

    if (this.bucket.tokens >= count) {
      this.bucket.tokens -= count
      return
    }

    // Rate limit exceeded
    const retryAfter = Math.ceil(this.options.intervalMs / 1000)
    
    logger.warn(`${this.name} rate limit exceeded`, {
      tokensRequested: count,
      tokensAvailable: this.bucket.tokens,
      retryAfterSeconds: retryAfter,
    })

    throw new RateLimitError(
      this.options.tokensPerInterval,
      this.options.intervalMs,
      retryAfter
    )
  }

  /**
   * Get current token count
   */
  getAvailableTokens(): number {
    this.refillBucket()
    return Math.floor(this.bucket.tokens)
  }

  /**
   * Reset rate limiter (refill all tokens)
   */
  reset(): void {
    this.bucket = {
      tokens: this.options.tokensPerInterval,
      lastRefill: Date.now()
    }
    
    logger.info(`${this.name} rate limiter reset`)
  }
}
