/**
 * Page navigation helpers for synpress tests.
 *
 * @module testing/synpress/helpers/page-helpers
 */

import type { Page } from '@playwright/test';

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000';

/**
 * Waits for the server to be healthy before proceeding.
 *
 * Helps prevent flakiness when the server is slow to respond.
 *
 * @param maxRetries - Maximum number of retry attempts (default: 5)
 * @param retryDelay - Delay between retries in milliseconds (default: 2000)
 * @throws Error if server is not healthy after all retries
 */
export async function waitForServerHealthy(
  maxRetries = 5,
  retryDelay = 2000
): Promise<void> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(`${BASE_URL}/api/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      });
      if (response.ok) {
        return;
      }
      console.log(
        `⚠️ Server health check failed (attempt ${attempt}/${maxRetries}): ${response.status}`
      );
    } catch (error) {
      console.log(
        `⚠️ Server health check error (attempt ${attempt}/${maxRetries}): ${error instanceof Error ? error.message : String(error)}`
      );
    }

    if (attempt < maxRetries) {
      await new Promise((resolve) => setTimeout(resolve, retryDelay));
    }
  }

  throw new Error(`Server not healthy after ${maxRetries} attempts`);
}

/**
 * Navigates to a route and waits for it to load.
 *
 * Includes server health check to prevent flakiness.
 *
 * @param page - Playwright page instance
 * @param route - Route path to navigate to
 * @throws Error if navigation fails after all retries
 */
export async function navigateTo(page: Page, route: string): Promise<void> {
  await waitForServerHealthy(3, 1000);
  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await page.goto(`${BASE_URL}${route}`, {
        waitUntil: 'domcontentloaded',
        timeout: 30000,
      });
      return;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.log(
        `⚠️ Navigation attempt ${attempt} failed: ${lastError.message}`
      );
      if (attempt < 3) {
        await page.waitForTimeout(1000);
      }
    }
  }

  throw lastError ?? new Error('Navigation failed');
}

/**
 * Waits for page to be fully loaded and hydrated.
 *
 * @param page - Playwright page instance
 * @param timeout - Maximum time to wait in milliseconds (default: 15000)
 */
export async function waitForPageLoad(
  page: Page,
  timeout = 15000
): Promise<void> {
  try {
    await page.waitForLoadState('domcontentloaded', { timeout });

    await page
      .waitForSelector('button', { state: 'visible', timeout: 10000 })
      .catch(() => {
        console.log('⚠️ No buttons found, page may not have fully hydrated');
      });

    await page.waitForTimeout(500);
  } catch (_e) {
    console.log('⚠️ Page load wait timed out, continuing...');
  }
}

/**
 * Waits a short period between tests to let the server recover.
 *
 * Helps prevent flakiness from server overload.
 *
 * @param page - Playwright page instance
 */
export async function cooldownBetweenTests(page: Page): Promise<void> {
  await page.waitForTimeout(500);
}
