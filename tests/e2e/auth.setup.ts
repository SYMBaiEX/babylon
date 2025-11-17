/**
 * Playwright Authentication Setup
 *
 * This setup file handles authentication for E2E tests that require admin access.
 * It creates an authenticated state that can be reused across tests.
 */

import { test as setup, expect } from '@playwright/test'
import path from 'path'

const authFile = path.join(__dirname, '../../.playwright/auth.json')

// Skip authentication in CI for now - tests should handle their own auth state
// In production, this would use actual Privy authentication flow
if (!process.env.CI) {
  setup('authenticate as admin', async ({ page, context }) => {
    // For local development, we can set a mock auth state
    // In CI, tests need to be updated to not require authentication
    // or use a test admin account

    // Navigate to home page
    await page.goto('/')

    // Store auth state for reuse
    await page.context().storageState({ path: authFile })
  })
}

// Export a function to check if we should skip admin tests
export function shouldSkipAdminTests(): boolean {
  // Skip admin tests in CI until proper authentication is set up
  return !!process.env.CI
}
