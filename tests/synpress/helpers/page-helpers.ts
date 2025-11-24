/**
 * Page navigation helpers for synpress tests
 */

import type { Page } from '@playwright/test'

/**
 * Navigate to a route and wait for it to load
 */
export async function navigateTo(page: Page, route: string): Promise<void> {
  const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000'
  await page.goto(`${baseURL}${route}`)
}

/**
 * Wait for page to be fully loaded
 */
export async function waitForPageLoad(page: Page, timeout = 15000): Promise<void> {
  try {
    // Prefer domcontentloaded for speed, networkidle is too flaky for long-polling apps
    await page.waitForLoadState('domcontentloaded', { timeout })
    // Optional: wait for a bit of network idle but don't fail on it
    await page.waitForLoadState('networkidle', { timeout: 2000 }).catch(() => {})
  } catch (e) {
    console.log('⚠️ Page load wait timed out, continuing...')
  }
}
