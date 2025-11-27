/**
 * Page navigation helpers for synpress tests
 */

import type { Page } from '@playwright/test';

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000';

/**
 * Wait for the server to be healthy before proceeding
 * This helps prevent flakiness when the server is slow to respond
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
 * Navigate to a route and wait for it to load
 * Includes server health check to prevent flakiness
 */
export async function navigateTo(page: Page, route: string): Promise<void> {
  // First ensure server is healthy
  await waitForServerHealthy(3, 1000);

  // Navigate with retry logic for slow server
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
 * Wait for page to be fully loaded and hydrated
 */
export async function waitForPageLoad(
  page: Page,
  timeout = 15000
): Promise<void> {
  try {
    // Wait for DOM content to be loaded
    await page.waitForLoadState('domcontentloaded', { timeout });

    // Wait for at least one button to be visible (indicates React has hydrated)
    await page
      .waitForSelector('button', { state: 'visible', timeout: 10000 })
      .catch(() => {
        console.log('⚠️ No buttons found, page may not have fully hydrated');
      });

    // Small delay to let any async components finish loading
    await page.waitForTimeout(500);
  } catch (_e) {
    console.log('⚠️ Page load wait timed out, continuing...');
  }
}

/**
 * Wait a bit between tests to let the server recover
 * This helps prevent flakiness from server overload
 */
export async function cooldownBetweenTests(page: Page): Promise<void> {
  await page.waitForTimeout(500);
}
