/**
 * Shared test helpers for integration tests
 */

import { test } from 'bun:test'

/**
 * Check if a server is available at the given URL
 * @param url - The base URL to check
 * @param timeout - Timeout in milliseconds (default: 5000)
 * @returns true if server is available, false otherwise
 */
export async function isServerAvailable(url: string, timeout = 5000): Promise<boolean> {
  // If TEST_SERVER_AVAILABLE is set, assume server is available and do a quick check
  if (process.env.TEST_SERVER_AVAILABLE === 'true') {
    try {
      // Quick check with shorter timeout since we expect it to be ready
      const response = await fetch(`${url}/api/health`, { signal: AbortSignal.timeout(2000) })
      return response.ok
    } catch {
      // Fall through to full check if health endpoint fails
    }
  }
  
  try {
    // Try health endpoint first (more reliable)
    try {
      const healthResponse = await fetch(`${url}/api/health`, { signal: AbortSignal.timeout(timeout) })
      if (healthResponse.ok) return true
    } catch {
      // Fall through to root check
    }
    
    // Fallback to root URL check
    const response = await fetch(url, { signal: AbortSignal.timeout(timeout) })
    return response.status < 500
  } catch {
    return false
  }
}

/**
 * Get base URL for API tests from environment or default
 */
export function getTestBaseUrl(): string {
  return process.env.TEST_API_URL || 'http://localhost:3000'
}

/**
 * Check server availability at module load time
 * This is used by test files that need to check server availability when imported
 * Respects TEST_SERVER_AVAILABLE environment variable for better reliability
 */
export async function checkServerAvailableAtLoadTime(): Promise<boolean> {
  const BASE_URL = getTestBaseUrl()
  
  // If SKIP_LIVE_SERVER is set, skip server checks
  if (process.env.SKIP_LIVE_SERVER === 'true') {
    return false
  }
  
  // Always verify server is actually responding - TEST_SERVER_AVAILABLE just affects timeout
  const timeout = process.env.TEST_SERVER_AVAILABLE === 'true' ? 10000 : 3000
  
  // Try multiple endpoints to be thorough
  const endpoints = ['/api/health', '/api/stats', '/']
  
  for (const endpoint of endpoints) {
    try {
      const response = await fetch(`${BASE_URL}${endpoint}`, {
        signal: AbortSignal.timeout(timeout),
      })
      if (response.status < 500) {
        return true
      }
    } catch (e) {
      // Try next endpoint
      continue
    }
  }
  
  return false
}

/**
 * Conditionally run a test only if condition is true, otherwise skip it
 * Use this when condition is known at test definition time.
 * 
 * @param condition - Whether to run the test
 * @returns test or test.skip
 * 
 * @example
 * const skipIfNoServer = testIf(serverAvailable)
 * skipIfNoServer('API test', async () => { ... })
 */
export function testIf(condition: boolean) {
  return condition ? test : test.skip
}

