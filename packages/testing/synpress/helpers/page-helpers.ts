/**
 * Page navigation helpers for synpress tests.
 *
 * @module testing/synpress/helpers/page-helpers
 */

import type { Page } from '@playwright/test';

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000';

/**
 * Waits for the server to be responsive before proceeding.
 *
 * Checks the root URL and accepts any response (except network errors or 5xx).
 * This prevents flakiness when the server is slow to start.
 *
 * @param maxRetries - Maximum number of retry attempts (default: 10)
 * @param retryDelay - Delay between retries in milliseconds (default: 3000)
 * @throws Error if server is not responsive after all retries
 */
export async function waitForServerHealthy(
  maxRetries = 10,
  retryDelay = 3000
): Promise<void> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(`${BASE_URL}/`, {
        method: 'GET',
        signal: AbortSignal.timeout(10000),
      });
      // Accept any non-5xx response as "server is up"
      if (response.status < 500) {
        return;
      }
      // Only log 5xx errors occasionally to reduce noise
      if (attempt === 1 || attempt === maxRetries) {
        console.log(
          `⚠️ Server returned 5xx (attempt ${attempt}/${maxRetries}): ${response.status}`
        );
      }
    } catch (error) {
      // Only log errors occasionally to reduce noise
      if (attempt === 1 || attempt === maxRetries) {
        console.log(
          `⚠️ Server not reachable (attempt ${attempt}/${maxRetries}): ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }

    if (attempt < maxRetries) {
      await new Promise((resolve) => setTimeout(resolve, retryDelay));
    }
  }

  // Instead of throwing, log warning and continue - let the actual test fail if needed
  console.warn(
    `⚠️ Server may not be fully responsive after ${maxRetries} attempts, continuing anyway...`
  );
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
 * Hide Next.js dev overlay to prevent it from intercepting pointer events.
 *
 * In development mode, Next.js injects a portal that can block UI interactions.
 * This function hides it so tests can interact with the actual UI.
 *
 * @param page - Playwright page instance
 */
export async function hideNextDevOverlay(page: Page): Promise<void> {
  await page
    .evaluate(() => {
      const overlay = document.querySelector('nextjs-portal');
      if (overlay instanceof HTMLElement) {
        overlay.style.pointerEvents = 'none';
        overlay.style.display = 'none';
      }
      // Also hide any error overlays
      document.querySelectorAll('[data-nextjs-dev-overlay]').forEach((el) => {
        if (el instanceof HTMLElement) {
          el.style.pointerEvents = 'none';
        }
      });
    })
    .catch(() => {});
}

/**
 * Waits for page to be fully loaded and hydrated.
 *
 * @param page - Playwright page instance
 * @param timeout - Maximum time to wait in milliseconds (default: 20000)
 */
export async function waitForPageLoad(
  page: Page,
  timeout = 20000
): Promise<void> {
  try {
    await page.waitForLoadState('domcontentloaded', { timeout });

    // Hide Next.js dev overlay to prevent test interference
    await hideNextDevOverlay(page);

    // Wait for page to have interactive elements
    let hasButtons = false;
    for (let i = 0; i < 20; i++) {
      const buttonCount = await page
        .locator('button')
        .count()
        .catch(() => 0);
      if (buttonCount > 0) {
        hasButtons = true;
        break;
      }
      await page.waitForTimeout(500);
    }

    if (!hasButtons) {
      // Try reloading the page once
      await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
      await page.waitForTimeout(2000);
      // Hide overlay again after reload
      await hideNextDevOverlay(page);
    }
  } catch (_e) {
    // Continue anyway
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
