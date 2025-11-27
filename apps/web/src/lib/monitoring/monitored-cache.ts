/**
 * Monitored Cache Service
 * Wraps cache operations with performance monitoring
 */

import type { CacheOptions } from '@/lib/cache-service';
import { getCache, invalidateCache, setCache } from '@/lib/cache-service';
import { performanceMonitor } from './performance-monitor';

/**
 * Get value from cache with monitoring
 */
export async function getMonitoredCache<T>(
  key: string,
  options: CacheOptions = {}
): Promise<T | null> {
  const startTime = performance.now();

  const value = await getCache<T>(key, options);
  const latency = performance.now() - startTime;
  const hit = value !== null;

  // Estimate size (rough approximation)
  const bytes = value ? JSON.stringify(value).length : 0;

  performanceMonitor.recordCacheOperation('get', hit, latency, bytes);

  return value;
}

/**
 * Set value in cache with monitoring
 */
export async function setMonitoredCache<T>(
  key: string,
  value: T,
  options: CacheOptions = {}
): Promise<void> {
  const startTime = performance.now();

  await setCache(key, value, options);
  const latency = performance.now() - startTime;

  // Estimate size
  const bytes = JSON.stringify(value).length;

  performanceMonitor.recordCacheOperation('set', true, latency, bytes);
}

/**
 * Invalidate cache entry with monitoring
 */
export async function invalidateMonitoredCache(
  key: string,
  options: CacheOptions = {}
): Promise<void> {
  const startTime = performance.now();

  await invalidateCache(key, options);
  const latency = performance.now() - startTime;

  performanceMonitor.recordCacheOperation('delete', true, latency);
}
