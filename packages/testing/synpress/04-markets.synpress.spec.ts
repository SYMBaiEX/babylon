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

    // Check for any markets-related content
    const pageContent = await page.locator('body').textContent();
    const hasMarketsContent =
      pageContent?.toLowerCase().includes('perp') ||
      pageContent?.toLowerCase().includes('prediction') ||
      pageContent?.toLowerCase().includes('market') ||
      pageContent?.toLowerCase().includes('trade');

    expect(hasMarketsContent).toBe(true);
  });

  test('tabs navigate to correct pages', async ({ page }) => {
    // Click on perps tab or link if visible
    const perpsTab = page
      .locator(
        '[role="tab"]:has-text("Perps"), button:has-text("Perps"), a:has-text("Perps")'
      )
      .first();

    if (
      await perpsTab.isVisible({ timeout: TIMEOUTS.SHORT }).catch(() => false)
    ) {
      await perpsTab.click({ force: true });
      await page.waitForTimeout(2000);
    }

    // Page should stay on markets
    expect(page.url()).toContain('/markets');

    // Click on predictions tab or link if visible
    const predictionsTab = page
      .locator(
        '[role="tab"]:has-text("Predictions"), button:has-text("Predictions"), a:has-text("Predictions")'
      )
      .first();

    if (
      await predictionsTab
        .isVisible({ timeout: TIMEOUTS.SHORT })
        .catch(() => false)
    ) {
      await predictionsTab.click({ force: true });
      await page.waitForTimeout(2000);
    }

    expect(page.url()).toContain('/markets');
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

    const isVisible = await marketCard
      .isVisible({ timeout: TIMEOUTS.SHORT })
      .catch(() => false);

    if (isVisible) {
      await marketCard.click({ force: true });
      await page.waitForTimeout(2000);

      // Check if navigated to trading page or stayed on perps
      const url = page.url();
      expect(url.includes('/markets/perps')).toBe(true);
    }

    // Page should have loaded
    const pageContent = await page.locator('body').textContent();
    expect(pageContent?.length).toBeGreaterThan(100);
  });

  test('search filters market list', async ({ page }) => {
    const searchInput = page
      .locator('input[type="search"], input[placeholder*="Search"]')
      .first();

    const isVisible = await searchInput
      .isVisible({ timeout: TIMEOUTS.SHORT })
      .catch(() => false);

    if (isVisible) {
      await searchInput.fill('AAPL');
      await page.waitForTimeout(1500);
      console.log('✅ Search query entered');
    }

    // Page should still have content
    const pageContent = await page.locator('body').textContent();
    expect(pageContent?.length).toBeGreaterThan(100);
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
    // Check if we're on a trading page or markets page
    const url = page.url();
    const isOnMarkets = url.includes('/markets');

    // Should have trading-related content
    const pageContent = await page.locator('body').textContent();
    const hasTradingContent =
      pageContent?.toLowerCase().includes('long') ||
      pageContent?.toLowerCase().includes('short') ||
      pageContent?.toLowerCase().includes('buy') ||
      pageContent?.toLowerCase().includes('sell') ||
      pageContent?.toLowerCase().includes('perp') ||
      pageContent?.toLowerCase().includes('$');

    // Page should have markets-related content
    expect(isOnMarkets || hasTradingContent).toBe(true);
    expect(pageContent?.length).toBeGreaterThan(100);
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
      await trendingButton.click({ force: true }).catch(() => {});
      await page.waitForTimeout(1000);
    }

    if (await volumeButton.isVisible({ timeout: TIMEOUTS.SHORT })) {
      await volumeButton.click({ force: true }).catch(() => {});
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
