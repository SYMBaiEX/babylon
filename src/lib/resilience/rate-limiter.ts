/**
 * Rate Limiter Implementation
 * 
 * Wrapper around limiter package for API rate limiting
 */

import { RateLimiter as Limiter } from 'limiter'
import { logger } from '@/lib/logger'
import { RateLimitError } from '@/lib/errors'

export interface RateLimiterOptions {
  tokensPerInterval: number
  intervalMs: number
  name?: string
}

/**
 * Token bucket rate limiter using limiter package
 */
export class RateLimiter {
  private limiter: Limiter
  private readonly name: string
  private readonly options: RateLimiterOptions

  constructor(options: RateLimiterOptions) {
    this.options = options
    this.name = options.name || 'RateLimiter'
    
    // Create limiter instance
    // limiter expects { tokensPerInterval, interval } where interval is a string or number (ms)
    this.limiter = new Limiter({
      tokensPerInterval: options.tokensPerInterval,
      interval: options.intervalMs, // milliseconds
    })
  }

  /**
   * Try to consume tokens
   * @param count Number of tokens to consume
   * @returns true if tokens available, false otherwise
   */
  async tryConsume(count = 1): Promise<boolean> {
    // tryRemoveTokens returns number of remaining tokens or -1 if unavailable
    const result = await this.limiter.tryRemoveTokens(count)
    
    // Check if result is a number (remaining tokens) and >= 0
    return typeof result === 'number' && result >= 0
  }

  /**
   * Consume tokens or throw error
   * @param count Number of tokens to consume
   */
  async consume(count = 1): Promise<void> {
    try {
      const removed = await this.limiter.removeTokens(count)
      
      if (removed < 0) {
        // Rate limit exceeded
        const retryAfter = Math.ceil(this.options.intervalMs / 1000)
        
        logger.warn(`${this.name} rate limit exceeded`, {
          tokensRequested: count,
          retryAfterSeconds: retryAfter,
        })

        throw new RateLimitError(
          this.options.tokensPerInterval,
          this.options.intervalMs,
          retryAfter
        )
      }
    } catch (error) {
      // If it's already a RateLimitError, rethrow
      if (error instanceof RateLimitError) {
        throw error
      }
      
      // Otherwise wrap and throw
      const retryAfter = Math.ceil(this.options.intervalMs / 1000)
      throw new RateLimitError(
        this.options.tokensPerInterval,
        this.options.intervalMs,
        retryAfter
      )
    }
  }

  /**
   * Get current token count
   */
  getAvailableTokens(): number {
    return this.limiter.getTokensRemaining()
  }

  /**
   * Reset rate limiter (refill all tokens)
   */
  reset(): void {
    // limiter doesn't have a direct reset, so recreate the instance
    this.limiter = new Limiter({
      tokensPerInterval: this.options.tokensPerInterval,
      interval: this.options.intervalMs,
    })
    
    logger.info(`${this.name} rate limiter reset`)
  }
}
