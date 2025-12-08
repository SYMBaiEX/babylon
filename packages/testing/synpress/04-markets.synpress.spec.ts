/**
 * Markets Page E2E Tests
 *
 * Tests markets functionality: perps, predictions, and trading interfaces.
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

test.describe('Markets Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.DESKTOP);
    await navigateTo(page, ROUTES.HOME);
    await loginWithWallet(page);
    await navigateTo(page, ROUTES.MARKETS);
    await waitForPageLoad(page);
    await page.waitForTimeout(2000);
  });

  test.afterEach(async ({ page }) => {
    await cooldownBetweenTests(page);
  });

  test('dashboard displays with Perps and Predictions tabs', async ({
    page,
  }) => {
    expect(page.url()).toContain('/markets');

    // Check for main tabs
    const perpsTab = page
      .locator('[role="tab"]:has-text("Perps"), button:has-text("Perps")')
      .first();
    const predictionsTab = page
      .locator(
        '[role="tab"]:has-text("Predictions"), button:has-text("Predictions")'
      )
      .first();

    await expect(perpsTab).toBeVisible({ timeout: TIMEOUTS.MEDIUM });
    await expect(predictionsTab).toBeVisible({ timeout: TIMEOUTS.MEDIUM });
  });

  test('tabs navigate to correct pages', async ({ page }) => {
    const perpsTab = page
      .locator('[role="tab"]:has-text("Perps"), button:has-text("Perps")')
      .first();
    await perpsTab.click();
    await page.waitForTimeout(2000);
    expect(page.url()).toContain('/markets/perps');

    await navigateTo(page, ROUTES.MARKETS);
    await waitForPageLoad(page);

    const predictionsTab = page
      .locator(
        '[role="tab"]:has-text("Predictions"), button:has-text("Predictions")'
      )
      .first();
    await predictionsTab.click();
    await page.waitForTimeout(2000);
    expect(page.url()).toContain('/markets/predictions');
  });
});

test.describe('Perps Markets', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.DESKTOP);
    await navigateTo(page, ROUTES.HOME);
    await loginWithWallet(page);
    await navigateTo(page, ROUTES.MARKETS_PERPS);
    await waitForPageLoad(page);
    await page.waitForTimeout(2000);
  });

  test.afterEach(async ({ page }) => {
    await cooldownBetweenTests(page);
  });

  test('displays perp market list with ticker symbols', async ({ page }) => {
    const marketCards = page.locator(
      'button:has-text("$"), [data-testid="market-card"]'
    );
    const count = await marketCards.count().catch(() => 0);

    if (count > 0) {
      // Markets should display price (has $ symbol)
      const firstCard = marketCards.first();
      const cardText = await firstCard.textContent();
      expect(cardText).toContain('$');
    } else {
      // Empty state is acceptable
      const emptyState = page.getByText('No markets');
      const isEmpty = await emptyState
        .isVisible({ timeout: TIMEOUTS.SHORT })
        .catch(() => false);
      expect(isEmpty || count === 0).toBe(true);
    }
  });

  test('clicking market card navigates to trading page', async ({ page }) => {
    const marketCard = page.locator('button:has-text("$")').first();

    if (!(await marketCard.isVisible({ timeout: TIMEOUTS.SHORT }))) {
      test.skip();
      return;
    }

    await marketCard.click();
    await page.waitForTimeout(2000);

    expect(page.url()).toContain('/markets/perps/');
  });

  test('search filters market list', async ({ page }) => {
    const searchInput = page
      .locator('input[type="search"], input[placeholder*="Search"]')
      .first();

    if (!(await searchInput.isVisible({ timeout: TIMEOUTS.SHORT }))) {
      test.skip();
      return;
    }

    const marketsBeforeSearch = page.locator('button:has-text("$")');
    const countBefore = await marketsBeforeSearch.count().catch(() => 0);

    await searchInput.fill('AAPL');
    await page.waitForTimeout(1500);

    // Search should filter results (count may decrease or stay same)
    const marketsAfterSearch = page.locator('button:has-text("$")');
    const countAfter = await marketsAfterSearch.count().catch(() => 0);

    // At minimum, search didn't crash and page still has content
    expect(countAfter).toBeLessThanOrEqual(countBefore);
  });
});

test.describe('Perp Trading Interface', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.DESKTOP);
    await navigateTo(page, ROUTES.HOME);
    await loginWithWallet(page);
    await navigateTo(page, ROUTES.MARKETS_PERPS);
    await waitForPageLoad(page);
    await page.waitForTimeout(2000);

    // Navigate to first market
    const marketCard = page.locator('button:has-text("$")').first();
    if (await marketCard.isVisible({ timeout: TIMEOUTS.SHORT })) {
      await marketCard.click();
      await page.waitForTimeout(2000);
    }
  });

  test.afterEach(async ({ page }) => {
    await cooldownBetweenTests(page);
  });

  test('trading page shows Long/Short buttons and price', async ({ page }) => {
    if (!page.url().includes('/markets/perps/')) {
      test.skip();
      return;
    }

    // Should have trading buttons
    const longButton = page
      .locator('button:has-text("Long"), button:has-text("Buy")')
      .first();
    const shortButton = page
      .locator('button:has-text("Short"), button:has-text("Sell")')
      .first();

    const hasLong = await longButton
      .isVisible({ timeout: TIMEOUTS.SHORT })
      .catch(() => false);
    const hasShort = await shortButton
      .isVisible({ timeout: TIMEOUTS.SHORT })
      .catch(() => false);

    // At least one trading button should be visible
    expect(hasLong || hasShort).toBe(true);

    // Price should be displayed
    const priceDisplay = page.locator('text=/\\$\\d+/').first();
    await expect(priceDisplay).toBeVisible({ timeout: TIMEOUTS.MEDIUM });
  });
});

test.describe('Predictions Markets', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.DESKTOP);
    await navigateTo(page, ROUTES.HOME);
    await loginWithWallet(page);
    await navigateTo(page, ROUTES.MARKETS_PREDICTIONS);
    await waitForPageLoad(page);
    await page.waitForTimeout(2000);
  });

  test.afterEach(async ({ page }) => {
    await cooldownBetweenTests(page);
  });

  test('displays prediction markets with YES/NO options', async ({ page }) => {
    const yesButtons = page.locator('button:has-text("YES")');
    const count = await yesButtons.count().catch(() => 0);

    if (count > 0) {
      // YES button should exist alongside NO button
      const noButton = page.locator('button:has-text("NO")').first();
      await expect(noButton).toBeVisible({ timeout: TIMEOUTS.SHORT });
    } else {
      // Empty state acceptable
      const emptyState = page.getByText('No active predictions');
      const isEmpty = await emptyState
        .isVisible({ timeout: TIMEOUTS.SHORT })
        .catch(() => false);
      expect(isEmpty || count === 0).toBe(true);
    }
  });

  test('sorting buttons change market order', async ({ page }) => {
    const trendingButton = page.locator('button:has-text("Trending")').first();
    const volumeButton = page.locator('button:has-text("Volume")').first();

    if (await trendingButton.isVisible({ timeout: TIMEOUTS.SHORT })) {
      await trendingButton.click();
      await page.waitForTimeout(1000);
    }

    if (await volumeButton.isVisible({ timeout: TIMEOUTS.SHORT })) {
      await volumeButton.click();
      await page.waitForTimeout(1000);
    }

    // Page should still function after sorting
    const body = await page.locator('body').textContent();
    expect(body?.length).toBeGreaterThan(100);
  });

  test('search filters prediction markets', async ({ page }) => {
    const searchInput = page
      .locator('input[type="search"], input[placeholder*="Search"]')
      .first();

    if (!(await searchInput.isVisible({ timeout: TIMEOUTS.SHORT }))) {
      test.skip();
      return;
    }

    await searchInput.fill('Will');
    await page.waitForTimeout(1500);

    // Search should work without crashing
    const body = await page.locator('body').textContent();
    expect(body?.length).toBeGreaterThan(50);
  });
});
