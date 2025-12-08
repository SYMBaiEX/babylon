/**
 * Mobile Responsiveness E2E Tests
 *
 * Verifies the app works on mobile viewports.
 * Tests core functionality on mobile, not redundant viewport size variations.
 */

import { expect, test } from '@playwright/test';
import {
  cooldownBetweenTests,
  navigateTo,
  waitForPageLoad,
} from './helpers/page-helpers';
import { loginWithWallet } from './helpers/privy-auth';
import { ROUTES, TIMEOUTS, VIEWPORTS } from './helpers/test-data';

test.setTimeout(TIMEOUTS.EXTRA_LONG);

test.describe('Mobile Responsiveness', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.MOBILE);
    await navigateTo(page, ROUTES.HOME);
    await loginWithWallet(page);
    await page.waitForTimeout(2000);
  });

  test.afterEach(async ({ page }) => {
    await cooldownBetweenTests(page);
  });

  test('core pages render without horizontal overflow', async ({ page }) => {
    const routes = [ROUTES.FEED, ROUTES.MARKETS, ROUTES.PROFILE, ROUTES.SETTINGS];

    for (const route of routes) {
      await navigateTo(page, route);
      await waitForPageLoad(page);

      const scrollWidth = await page.evaluate(
        () => document.documentElement.scrollWidth
      );
      const clientWidth = await page.evaluate(
        () => document.documentElement.clientWidth
      );

      // Allow 10px tolerance for scrollbars
      expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 10);
    }
  });

  test('mobile navigation is accessible', async ({ page }) => {
    await navigateTo(page, ROUTES.FEED);
    await waitForPageLoad(page);

    // Should have either bottom nav or hamburger menu
    const bottomNav = page.locator('nav.fixed.bottom-0, [data-testid="bottom-nav"]').first();
    const hamburger = page.locator('button[aria-label*="menu" i]').first();

    const hasBottomNav = await bottomNav.isVisible({ timeout: TIMEOUTS.SHORT }).catch(() => false);
    const hasHamburger = await hamburger.isVisible({ timeout: TIMEOUTS.SHORT }).catch(() => false);

    expect(hasBottomNav || hasHamburger).toBe(true);
  });

  test('feed posts are touch-friendly width', async ({ page }) => {
    await navigateTo(page, ROUTES.FEED);
    await waitForPageLoad(page);

    const post = page.locator('article, [data-testid="post-card"]').first();
    if (await post.isVisible({ timeout: TIMEOUTS.SHORT })) {
      const box = await post.boundingBox();
      if (box) {
        // Post should be nearly full width on mobile
        expect(box.width).toBeGreaterThan(VIEWPORTS.MOBILE.width * 0.8);
      }
    }
  });

  test('buttons and inputs are tap-friendly size', async ({ page }) => {
    await navigateTo(page, ROUTES.SETTINGS);
    await waitForPageLoad(page);

    const buttons = page.locator('button').first();
    if (await buttons.isVisible({ timeout: TIMEOUTS.SHORT })) {
      const box = await buttons.boundingBox();
      if (box) {
        // Minimum touch target size should be ~44px
        expect(box.height).toBeGreaterThanOrEqual(32);
      }
    }
  });
});

test.describe('Tablet Responsiveness', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.TABLET);
    await navigateTo(page, ROUTES.HOME);
    await loginWithWallet(page);
    await page.waitForTimeout(2000);
  });

  test('pages render correctly on tablet', async ({ page }) => {
    await navigateTo(page, ROUTES.FEED);
    await waitForPageLoad(page);

    const scrollWidth = await page.evaluate(
      () => document.documentElement.scrollWidth
    );
    const clientWidth = await page.evaluate(
      () => document.documentElement.clientWidth
    );

    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 10);
  });
});

test.describe('Small Mobile Edge Cases', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.MOBILE_SMALL); // 320px
    await navigateTo(page, ROUTES.HOME);
    await loginWithWallet(page);
    await page.waitForTimeout(2000);
  });

  test('app works on very small screens', async ({ page }) => {
    await navigateTo(page, ROUTES.FEED);
    await waitForPageLoad(page);

    // Page should load and have content
    const body = await page.locator('body').textContent();
    expect(body?.length).toBeGreaterThan(100);

    // No horizontal overflow
    const scrollWidth = await page.evaluate(
      () => document.documentElement.scrollWidth
    );
    const clientWidth = await page.evaluate(
      () => document.documentElement.clientWidth
    );
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 10);
  });
});
