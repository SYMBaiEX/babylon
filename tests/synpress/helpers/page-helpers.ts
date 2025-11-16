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
export async function waitForPageLoad(page: Page, timeout = 10000): Promise<void> {
  await page.waitForLoadState('networkidle', { timeout })
}
