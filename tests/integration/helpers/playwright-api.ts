/**
 * Playwright API Request Helper for Integration Tests
 * 
 * Provides a Playwright APIRequestContext for making authenticated API calls
 * in integration tests. Uses the authenticated state from Playwright setup.
 */

import { chromium, type APIRequestContext } from 'playwright'
import { existsSync, readFileSync } from 'fs'
import path from 'path'

const authFile = path.join(__dirname, '../../.playwright/auth.json')
const tokenFile = path.join(__dirname, '../../.playwright/test-tokens.json')
const baseURL = process.env.PLAYWRIGHT_BASE_URL || process.env.API_URL?.replace('/api', '') || 'http://localhost:3000'

let apiRequest: APIRequestContext | null = null
let testUserId: string | null = null
let browser: Awaited<ReturnType<typeof chromium.launch>> | null = null

/**
 * Initialize Playwright API request context with authentication
 * 
 * @returns {Promise<{ apiRequest: APIRequestContext; testUserId: string }>}
 */
export async function initPlaywrightAPI(): Promise<{ apiRequest: APIRequestContext; testUserId: string }> {
  if (apiRequest && testUserId) {
    return { apiRequest, testUserId }
  }

  // Check if auth state exists
  if (!existsSync(authFile)) {
    throw new Error(
      `Authentication state file not found: ${authFile}\n` +
      'Please run Playwright setup first:\n' +
      '  bunx playwright test --project=setup\n' +
      '  bunx playwright test --project=setup-integration-auth'
    )
  }

  // Load test tokens if available (for fallback)
  let tokens: { TEST_USER_ID?: string; TEST_ACCESS_TOKEN?: string } | null = null
  if (existsSync(tokenFile)) {
    try {
      tokens = JSON.parse(readFileSync(tokenFile, 'utf-8'))
    } catch (error) {
      console.warn(`⚠️  Could not read token file: ${error}`)
    }
  }

  // Create browser context with authenticated state
  browser = await chromium.launch()
  const context = await browser.newContext({
    storageState: authFile,
    baseURL: baseURL,
  })
  
  apiRequest = context.request
  
  // Get user ID from API or token file
  try {
    const response = await apiRequest.get(`${baseURL}/api/users/me`)
    if (response.ok()) {
      const userData = await response.json()
      testUserId = userData.user?.id || tokens?.TEST_USER_ID || null
    } else {
      // Fallback to token file if API fails
      testUserId = tokens?.TEST_USER_ID || null
    }
  } catch (error) {
    console.warn(`⚠️  Could not fetch user ID from API: ${error}`)
    testUserId = tokens?.TEST_USER_ID || null
  }

  if (!testUserId) {
    throw new Error(
      'Could not determine test user ID. Please ensure:\n' +
      '1. Playwright auth setup has been run\n' +
      '2. User is authenticated\n' +
      '3. Token file exists at .playwright/test-tokens.json'
    )
  }

  return { apiRequest, testUserId }
}

/**
 * Cleanup Playwright API request context
 */
export async function cleanupPlaywrightAPI(): Promise<void> {
  if (apiRequest) {
    await apiRequest.dispose()
    apiRequest = null
  }
  if (browser) {
    await browser.close()
    browser = null
  }
  testUserId = null
}

/**
 * Get the API base URL
 */
export function getAPIBaseURL(): string {
  return `${baseURL}/api`
}

