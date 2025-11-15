/**
 * Agent0 Resilience Configuration
 * 
 * Centralized configuration for circuit breaker and rate limiter
 */

import { CircuitBreaker } from './circuit-breaker'
import { RateLimiter } from './rate-limiter'

/**
 * Agent0 Circuit Breaker
 * Opens after 5 failures, closes after 2 successes, 30s timeout
 */
export const agent0CircuitBreaker = new CircuitBreaker({
  failureThreshold: 5,
  successThreshold: 2,
  timeout: 30000, // 30 seconds
  name: 'Agent0',
})

/**
 * Agent0 Rate Limiter
 * 10 requests per minute
 */
export const agent0RateLimiter = new RateLimiter({
  tokensPerInterval: 10,
  intervalMs: 60000, // 1 minute
  name: 'Agent0',
})

/**
 * Agent0 Feedback Rate Limiter
 * More restrictive for feedback submissions (5 per minute)
 */
export const agent0FeedbackRateLimiter = new RateLimiter({
  tokensPerInterval: 5,
  intervalMs: 60000, // 1 minute
  name: 'Agent0Feedback',
})