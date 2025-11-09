/**
 * Agent0 Metrics Collection
 * 
 * Tracks performance metrics for Agent0 operations
 */

import { logger } from '@/lib/logger'

interface MetricData {
  operation: string
  duration: number
  status: 'success' | 'error' | 'timeout'
  errorType?: string
  metadata?: Record<string, unknown>
}

interface MetricCounter {
  [key: string]: number
}

/**
 * Simple in-memory metrics collector
 * In production, should use a proper metrics service (Prometheus, DataDog, etc.)
 */
class Agent0Metrics {
  private counters: MetricCounter = {}
  private timers: Map<string, number> = new Map()

  /**
   * Increment a counter
   */
  increment(metric: string, tags?: Record<string, unknown>): void {
    const key = this.buildKey(metric, tags)
    this.counters[key] = (this.counters[key] || 0) + 1

    logger.debug('Metric incremented', { metric, count: this.counters[key], tags })
  }

  /**
   * Record a duration
   */
  recordDuration(metric: string, duration: number, tags?: Record<string, unknown>): void {
    logger.debug('Duration recorded', { metric, duration, tags })

    // In production, this would send to a metrics service
    // For now, just log
    if (duration > 5000) {
      logger.warn('Slow Agent0 operation', { metric, duration, tags })
    }
  }

  /**
   * Start a timer
   */
  startTimer(metric: string): (tags?: Record<string, unknown>) => void {
    const startTime = Date.now()
    const timerId = `${metric}:${startTime}`

    this.timers.set(timerId, startTime)

    return (tags?: Record<string, unknown>) => {
      const duration = Date.now() - startTime
      this.recordDuration(metric, duration, tags)
      this.timers.delete(timerId)
    }
  }

  /**
   * Record operation metrics
   */
  recordOperation(data: MetricData): void {
    const { operation, duration, status, errorType, metadata } = data

    // Increment counters
    this.increment(`agent0.${operation}.total`, { status })
    
    if (status === 'error') {
      this.increment(`agent0.${operation}.error`, { errorType })
    }

    // Record duration
    this.recordDuration(`agent0.${operation}.duration`, duration, {
      status,
      ...metadata,
    })

    // Log operation
    logger.info('Agent0 operation metrics', {
      operation,
      duration,
      status,
      errorType,
      metadata,
    })
  }

  /**
   * Get all metrics
   */
  getMetrics(): Record<string, number> {
    return { ...this.counters }
  }

  /**
   * Reset all metrics
   */
  reset(): void {
    this.counters = {}
    this.timers.clear()
  }

  /**
   * Build key from metric name and tags
   */
  private buildKey(metric: string, tags?: Record<string, unknown>): string {
    if (!tags || Object.keys(tags).length === 0) {
      return metric
    }

    const tagString = Object.entries(tags)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}:${v}`)
      .join(',')

    return `${metric}[${tagString}]`
  }
}

/**
 * Singleton metrics instance
 */
export const agent0Metrics = new Agent0Metrics()

/**
 * Helper to wrap operations with metrics
 */
export async function withMetrics<T>(
  operation: string,
  fn: () => Promise<T>,
  metadata?: Record<string, unknown>
): Promise<T> {
  const startTime = Date.now()

  try {
    const result = await fn()
    
    agent0Metrics.recordOperation({
      operation,
      duration: Date.now() - startTime,
      status: 'success',
      metadata,
    })

    return result
  } catch (error) {
    agent0Metrics.recordOperation({
      operation,
      duration: Date.now() - startTime,
      status: 'error',
      errorType: error instanceof Error ? error.name : 'Unknown',
      metadata,
    })

    throw error
  }
}
