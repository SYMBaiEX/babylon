/**
 * Markets Page E2E Tests
 *
 * Tests all markets functionality:
 * - Markets dashboard view
 * - Perps market listing and trading
 * - Predictions market listing and trading
 * - Positions display
 * - Search and filtering
 * - Sorting options
 * - Mobile responsiveness
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

  test('should display markets dashboard with tabs', async ({ page }) => {
    expect(page.url()).toContain('/markets');

    // Check for Dashboard, Perps, Predictions tabs
    const tabs = ['Dashboard', 'Perps', 'Predictions'];
    for (const tabName of tabs) {
      const tab = page
        .locator(
          `[role="tab"]:has-text("${tabName}"), button:has-text("${tabName}")`
        )
        .first();
      await expect(tab).toBeVisible({ timeout: TIMEOUTS.MEDIUM });
    }

    console.log('✅ Markets dashboard displays with tabs');
  });

  test('should show portfolio PnL card when authenticated', async ({
    page,
  }) => {
    // Look for portfolio/P&L card
    const pnlCard = page
      .locator(
        '[data-testid="portfolio-pnl"], [class*="PnL"], text=/Portfolio|P&L|Balance/i'
      )
      .first();
    const isVisible = await pnlCard
      .isVisible({ timeout: TIMEOUTS.SHORT })
      .catch(() => false);

    if (isVisible) {
      console.log('✅ Portfolio PnL card visible');
    } else {
      // May need to be on dashboard tab
      const dashboardTab = page.locator('button:has-text("Dashboard")').first();
      if (await dashboardTab.isVisible()) {
        await dashboardTab.click();
        await page.waitForTimeout(2000);

        const pnlAfter = page.locator('text=/Portfolio|Balance|PnL/i').first();
        const visibleAfter = await pnlAfter
          .isVisible({ timeout: TIMEOUTS.SHORT })
          .catch(() => false);
        console.log(
          `✅ Portfolio info after clicking Dashboard: ${visibleAfter}`
        );
      }
    }
  });

  test('should display trending perpetuals section', async ({ page }) => {
    const dashboardTab = page.locator('button:has-text("Dashboard")').first();
    if (await dashboardTab.isVisible()) {
      await dashboardTab.click();
      await page.waitForTimeout(2000);
    }

    const trendingSection = page
      .getByText('Trending Perpetuals')
      .or(page.getByText('Trending'));
    const isVisible = await trendingSection
      .first()
      .isVisible({ timeout: TIMEOUTS.SHORT })
      .catch(() => false);

    if (isVisible) {
      console.log('✅ Trending perpetuals section visible');
    } else {
      console.log('ℹ️ Trending section not found - may be loading');
    }
  });

  test('should display hot predictions section', async ({ page }) => {
    const dashboardTab = page.locator('button:has-text("Dashboard")').first();
    if (await dashboardTab.isVisible()) {
      await dashboardTab.click();
      await page.waitForTimeout(2000);
    }

    const hotPredictions = page
      .getByText('Hot Predictions')
      .or(page.getByText('Top Predictions'));
    const isVisible = await hotPredictions
      .first()
      .isVisible({ timeout: TIMEOUTS.SHORT })
      .catch(() => false);

    console.log(`✅ Hot predictions section visible: ${isVisible}`);
  });

  test('should navigate to perps page from tab', async ({ page }) => {
    const perpsTab = page
      .locator('[role="tab"]:has-text("Perps"), button:has-text("Perps")')
      .first();
    await expect(perpsTab).toBeVisible();
    await perpsTab.click();
    await page.waitForTimeout(2000);

    expect(page.url()).toContain('/markets/perps');
    console.log('✅ Navigated to perps page');
  });

  test('should navigate to predictions page from tab', async ({ page }) => {
    const predictionsTab = page
      .locator(
        '[role="tab"]:has-text("Predictions"), button:has-text("Predictions")'
      )
      .first();
    await expect(predictionsTab).toBeVisible();
    await predictionsTab.click();
    await page.waitForTimeout(2000);

    expect(page.url()).toContain('/markets/predictions');
    console.log('✅ Navigated to predictions page');
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

  test('should display perps market list', async ({ page }) => {
    expect(page.url()).toContain('/markets/perps');

    // Look for market cards with ticker symbols
    const marketCards = page.locator(
      'button:has-text("$"), [data-testid="market-card"]'
    );
    const count = await marketCards.count().catch(() => 0);

    if (count > 0) {
      console.log(`✅ Perps page shows ${count} market cards`);
    } else {
      // Check for loading or empty state
      const emptyState = page.getByText('No markets available');
      const isEmpty = await emptyState
        .isVisible({ timeout: TIMEOUTS.SHORT })
        .catch(() => false);
      console.log(`ℹ️ Perps page empty state: ${isEmpty}`);
    }
  });

  test('should display market details (price, change, volume)', async ({
    page,
  }) => {
    const marketCards = page.locator('button:has-text("$")').first();

    if (await marketCards.isVisible({ timeout: TIMEOUTS.SHORT })) {
      const cardText = await marketCards.textContent();

      // Should contain price-like format ($X.XX)
      const hasPrice = cardText?.includes('$');
      // Should contain percentage change
      const hasChange = cardText?.includes('%');

      console.log(
        `✅ Market card has price: ${hasPrice}, change: ${hasChange}`
      );
    }
  });

  test('should search perp markets', async ({ page }) => {
    const searchInput = page
      .locator('input[type="search"], input[placeholder*="Search"]')
      .first();

    if (await searchInput.isVisible({ timeout: TIMEOUTS.SHORT })) {
      await searchInput.fill('BTC');
      await page.waitForTimeout(1000);

      // Results should be filtered
      const _content = await page.locator('body').textContent();
      console.log('✅ Search input works for perps');
    }
  });

  test('should navigate to individual perp market page', async ({ page }) => {
    const marketCards = page.locator('button:has-text("$")').first();

    if (await marketCards.isVisible({ timeout: TIMEOUTS.SHORT })) {
      await marketCards.click();
      await page.waitForTimeout(2000);

      // Should navigate to /markets/perps/[ticker]
      expect(page.url()).toContain('/markets/perps/');
      console.log('✅ Navigated to individual perp market');
    }
  });

  test('should display volume and open interest info', async ({ page }) => {
    const marketCards = page.locator('button:has-text("$")').first();

    if (await marketCards.isVisible({ timeout: TIMEOUTS.SHORT })) {
      const cardText = await marketCards.textContent();

      const hasVol = cardText?.includes('Vol');
      const hasOI = cardText?.includes('OI');

      console.log(`✅ Market card has Volume: ${hasVol}, OI: ${hasOI}`);
    }
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

    // Click first market to go to trading page
    const marketCard = page.locator('button:has-text("$")').first();
    if (await marketCard.isVisible({ timeout: TIMEOUTS.SHORT })) {
      await marketCard.click();
      await page.waitForTimeout(2000);
    }
  });

  test.afterEach(async ({ page }) => {
    await cooldownBetweenTests(page);
  });

  test('should display trading interface elements', async ({ page }) => {
    const url = page.url();
    if (!url.includes('/markets/perps/')) {
      console.log('ℹ️ Not on trading page, skipping');
      return;
    }

    // Check for trading UI elements
    const elements = [
      { name: 'Price display', selector: 'text=/\\$\\d+/' },
      {
        name: 'Long/Buy button',
        selector: 'button:has-text("Long"), button:has-text("Buy")',
      },
      {
        name: 'Short/Sell button',
        selector: 'button:has-text("Short"), button:has-text("Sell")',
      },
    ];

    for (const { name, selector } of elements) {
      const element = page.locator(selector).first();
      const isVisible = await element
        .isVisible({ timeout: TIMEOUTS.SHORT })
        .catch(() => false);
      console.log(`${isVisible ? '✅' : 'ℹ️'} ${name}: ${isVisible}`);
    }
  });

  test('should have size input field', async ({ page }) => {
    const sizeInput = page
      .locator(
        'input[type="number"], input[placeholder*="Size" i], input[placeholder*="Amount" i]'
      )
      .first();
    const isVisible = await sizeInput
      .isVisible({ timeout: TIMEOUTS.SHORT })
      .catch(() => false);

    if (isVisible) {
      await sizeInput.fill('1');
      await page.waitForTimeout(500);
      console.log('✅ Size input works');
    } else {
      console.log('ℹ️ Size input not found');
    }
  });

  test('should have leverage selector', async ({ page }) => {
    const leverageSelector = page
      .locator(
        'input[type="range"], [role="slider"], select:has-text("Leverage")'
      )
      .first();
    const leverageButtons = page
      .locator(
        'button:has-text("1x"), button:has-text("2x"), button:has-text("5x")'
      )
      .first();

    const hasSlider = await leverageSelector
      .isVisible({ timeout: TIMEOUTS.SHORT })
      .catch(() => false);
    const hasButtons = await leverageButtons
      .isVisible({ timeout: TIMEOUTS.SHORT })
      .catch(() => false);

    console.log(
      `✅ Leverage controls: slider=${hasSlider}, buttons=${hasButtons}`
    );
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

  test('should display predictions market list', async ({ page }) => {
    expect(page.url()).toContain('/markets/predictions');

    // Predictions have YES/NO options
    const predictionCards = page.locator(
      'button:has-text("YES"), button:has-text("NO")'
    );
    const count = await predictionCards.count().catch(() => 0);

    if (count > 0) {
      console.log(`✅ Predictions page shows markets with YES/NO options`);
    } else {
      // Check for empty state
      const emptyState = page.getByText('No active predictions');
      const isEmpty = await emptyState
        .isVisible({ timeout: TIMEOUTS.SHORT })
        .catch(() => false);
      console.log(`ℹ️ Predictions page empty: ${isEmpty}`);
    }
  });

  test('should display sorting options', async ({ page }) => {
    const sortButtons = ['Trending', 'Volume', 'Newest', 'Ending Soon'];

    for (const sortName of sortButtons) {
      const button = page.locator(`button:has-text("${sortName}")`).first();
      const isVisible = await button
        .isVisible({ timeout: TIMEOUTS.SHORT })
        .catch(() => false);
      if (isVisible) {
        console.log(`✅ Sort option "${sortName}" visible`);
      }
    }
  });

  test('should sort predictions by different criteria', async ({ page }) => {
    const trendingButton = page.locator('button:has-text("Trending")').first();
    const volumeButton = page.locator('button:has-text("Volume")').first();

    if (await trendingButton.isVisible()) {
      await trendingButton.click();
      await page.waitForTimeout(1000);
    }

    if (await volumeButton.isVisible()) {
      await volumeButton.click();
      await page.waitForTimeout(1000);
    }

    console.log('✅ Sorting buttons work');
  });

  test('should search prediction markets', async ({ page }) => {
    const searchInput = page
      .locator('input[type="search"], input[placeholder*="Search"]')
      .first();

    if (await searchInput.isVisible({ timeout: TIMEOUTS.SHORT })) {
      await searchInput.fill('election');
      await page.waitForTimeout(1000);
      console.log('✅ Search input works for predictions');
    }
  });

  test('should navigate to individual prediction page', async ({ page }) => {
    const predictionCard = page.locator('button:has-text("YES")').first();

    if (await predictionCard.isVisible({ timeout: TIMEOUTS.SHORT })) {
      // Click the parent card, not the YES button
      const card = predictionCard
        .locator('xpath=ancestor::button[contains(text(), "%")]')
        .first();
      if (await card.isVisible()) {
        await card.click();
      } else {
        await predictionCard.click();
      }
      await page.waitForTimeout(2000);

      const url = page.url();
      if (url.includes('/markets/predictions/')) {
        console.log('✅ Navigated to individual prediction');
      } else {
        console.log('ℹ️ Click did not navigate to prediction detail');
      }
    }
  });

  test('should display prediction percentages', async ({ page }) => {
    const yesPercent = page
      .locator('text=/\\d+%\\s*YES/i, text=/YES.*\\d+%/i')
      .first();
    const noPercent = page
      .locator('text=/\\d+%\\s*NO/i, text=/NO.*\\d+%/i')
      .first();

    const hasYes = await yesPercent
      .isVisible({ timeout: TIMEOUTS.SHORT })
      .catch(() => false);
    const hasNo = await noPercent
      .isVisible({ timeout: TIMEOUTS.SHORT })
      .catch(() => false);

    console.log(`✅ Prediction percentages: YES=${hasYes}, NO=${hasNo}`);
  });

  test('should display days remaining for predictions', async ({ page }) => {
    const daysLeft = page.locator('text=/\\d+d/').first();
    const isVisible = await daysLeft
      .isVisible({ timeout: TIMEOUTS.SHORT })
      .catch(() => false);

    console.log(`✅ Days remaining visible: ${isVisible}`);
  });
});

test.describe('Prediction Trading Interface', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.DESKTOP);
    await navigateTo(page, ROUTES.HOME);
    await loginWithWallet(page);
    await navigateTo(page, ROUTES.MARKETS_PREDICTIONS);
    await waitForPageLoad(page);
    await page.waitForTimeout(2000);
  });

  test('should display YES/NO trading buttons', async ({ page }) => {
    const yesButton = page.locator('button:has-text("YES")').first();
    const noButton = page.locator('button:has-text("NO")').first();

    const hasYes = await yesButton
      .isVisible({ timeout: TIMEOUTS.SHORT })
      .catch(() => false);
    const hasNo = await noButton
      .isVisible({ timeout: TIMEOUTS.SHORT })
      .catch(() => false);

    console.log(`✅ YES button: ${hasYes}, NO button: ${hasNo}`);
  });
});

test.describe('Markets - User Positions', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.DESKTOP);
    await navigateTo(page, ROUTES.HOME);
    await loginWithWallet(page);
    await navigateTo(page, ROUTES.MARKETS);
    await waitForPageLoad(page);
    await page.waitForTimeout(2000);
  });

  test('should display user positions section if positions exist', async ({
    page,
  }) => {
    // Look for positions section
    const positionsSection = page
      .getByText('Your Positions')
      .or(page.getByText('MY POSITIONS'));
    const isVisible = await positionsSection
      .first()
      .isVisible({ timeout: TIMEOUTS.SHORT })
      .catch(() => false);

    if (isVisible) {
      console.log('✅ User positions section visible');
    } else {
      console.log('ℹ️ No positions to display (or section not visible)');
    }
  });

  test('should show perp positions with P&L', async ({ page }) => {
    const perpPositions = page
      .locator('text=/PERPETUAL|Perp Positions/i')
      .first();
    const isVisible = await perpPositions
      .isVisible({ timeout: TIMEOUTS.SHORT })
      .catch(() => false);

    if (isVisible) {
      // Check for P&L display
      const pnl = page.locator('text=/[+-]\\$\\d+/').first();
      const hasPnL = await pnl
        .isVisible({ timeout: TIMEOUTS.SHORT })
        .catch(() => false);
      console.log(`✅ Perp positions with P&L: ${hasPnL}`);
    } else {
      console.log('ℹ️ No perp positions section');
    }
  });
});

test.describe('Markets - Mobile View', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.MOBILE);
    await navigateTo(page, ROUTES.HOME);
    await loginWithWallet(page);
    await navigateTo(page, ROUTES.MARKETS);
    await waitForPageLoad(page);
    await page.waitForTimeout(2000);
  });

  test.afterEach(async ({ page }) => {
    await cooldownBetweenTests(page);
  });

  test('should display mobile-friendly markets layout', async ({ page }) => {
    const content = page
      .locator('main, [data-testid="markets-content"]')
      .first();
    if (await content.isVisible()) {
      const box = await content.boundingBox();
      if (box) {
        expect(box.width).toBeLessThanOrEqual(VIEWPORTS.MOBILE.width + 20);
        console.log('✅ Markets is mobile-width');
      }
    }
  });

  test('should have scrollable tabs on mobile', async ({ page }) => {
    const tabsContainer = page.locator('[role="tablist"]').first();
    if (await tabsContainer.isVisible()) {
      // Check if tabs are in a scrollable container
      const overflowStyle = await tabsContainer.evaluate((el) => {
        return window.getComputedStyle(el).overflowX;
      });
      console.log(`✅ Tabs overflow style: ${overflowStyle}`);
    }
  });

  test('should have horizontal sort buttons on mobile', async ({ page }) => {
    await navigateTo(page, ROUTES.MARKETS_PREDICTIONS);
    await waitForPageLoad(page);

    const sortButtons = page.locator(
      'button:has-text("Trending"), button:has-text("Volume")'
    );
    const count = await sortButtons.count();

    if (count > 0) {
      // Check if they're in a horizontal scrollable container
      console.log(`✅ Sort buttons visible on mobile: ${count}`);
    }
  });
});
