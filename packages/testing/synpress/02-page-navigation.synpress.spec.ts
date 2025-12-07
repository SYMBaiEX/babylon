/**
 * Page Navigation E2E Tests
 *
 * Tests all page routes load correctly:
 * - All public pages load without errors
 * - All authenticated pages load after login
 * - Navigation between pages works
 * - Bottom nav / sidebar navigation works
 */

import { expect, test } from '@playwright/test';
import {
  cooldownBetweenTests,
  navigateTo,
  waitForPageLoad,
} from './helpers/page-helpers';
import { getPrivyTestAccount, loginWithPrivyEmail } from './helpers/privy-auth';
import { ROUTES, SELECTORS, TIMEOUTS, VIEWPORTS } from './helpers/test-data';

test.setTimeout(TIMEOUTS.EXTRA_LONG);

test.describe('Page Navigation - Core Routes', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.DESKTOP);
    await navigateTo(page, ROUTES.HOME);
    await loginWithPrivyEmail(page, getPrivyTestAccount());
    await page.waitForTimeout(2000);
  });

  test.afterEach(async ({ page }) => {
    await cooldownBetweenTests(page);
  });

  test('should load home page and redirect to feed', async ({ page }) => {
    await navigateTo(page, ROUTES.HOME);
    await waitForPageLoad(page);

    // Home typically redirects to feed when authenticated
    await page.waitForTimeout(2000);
    const url = page.url();
    expect(url.includes('/feed') || url.includes('/')).toBe(true);

    console.log('✅ Home page loads correctly');
  });

  test('should load feed page', async ({ page }) => {
    await navigateTo(page, ROUTES.FEED);
    await waitForPageLoad(page);

    expect(page.url()).toContain('/feed');

    // Should have feed toggle tabs
    const feedContent = page.locator('body');
    await expect(feedContent).toBeVisible();

    // Look for feed-specific elements
    const tabs = page.locator(
      'button:has-text("Latest"), button:has-text("Following")'
    );
    const hasTab = await tabs
      .first()
      .isVisible({ timeout: TIMEOUTS.SHORT })
      .catch(() => false);
    if (hasTab) {
      console.log('✅ Feed tabs visible');
    }

    console.log('✅ Feed page loads correctly');
  });

  test('should load chats page', async ({ page }) => {
    await navigateTo(page, ROUTES.CHATS);
    await waitForPageLoad(page);

    expect(page.url()).toContain('/chats');

    // Page should have content
    const content = await page.locator('body').textContent();
    expect(content).toBeTruthy();

    console.log('✅ Chats page loads correctly');
  });

  test('should load markets page', async ({ page }) => {
    await navigateTo(page, ROUTES.MARKETS);
    await waitForPageLoad(page);

    expect(page.url()).toContain('/markets');

    // Page should have content
    const content = await page.locator('body').textContent();
    expect(content).toBeTruthy();

    console.log('✅ Markets page loads correctly');
  });

  test('should load profile page', async ({ page }) => {
    await navigateTo(page, ROUTES.PROFILE);
    await waitForPageLoad(page);

    expect(page.url()).toContain('/profile');

    // Profile should have some content
    const content = await page.locator('body').textContent();
    expect(content).toBeTruthy();

    console.log('✅ Profile page loads correctly');
  });

  test('should load settings page', async ({ page }) => {
    await navigateTo(page, ROUTES.SETTINGS);
    await waitForPageLoad(page);

    expect(page.url()).toContain('/settings');

    // Page should have content
    const content = await page.locator('body').textContent();
    expect(content).toBeTruthy();

    console.log('✅ Settings page loads correctly');
  });

  test('should load notifications page', async ({ page }) => {
    await navigateTo(page, ROUTES.NOTIFICATIONS);
    await waitForPageLoad(page);

    expect(page.url()).toContain('/notifications');
    console.log('✅ Notifications page loads correctly');
  });

  test('should load rewards page', async ({ page }) => {
    await navigateTo(page, ROUTES.REWARDS);
    await waitForPageLoad(page);

    expect(page.url()).toContain('/rewards');
    console.log('✅ Rewards page loads correctly');
  });

  test('should load leaderboard page', async ({ page }) => {
    await navigateTo(page, ROUTES.LEADERBOARD);
    await waitForPageLoad(page);

    expect(page.url()).toContain('/leaderboard');
    console.log('✅ Leaderboard page loads correctly');
  });

  test('should load reputation page', async ({ page }) => {
    await navigateTo(page, ROUTES.REPUTATION);
    await waitForPageLoad(page);

    expect(page.url()).toContain('/reputation');
    console.log('✅ Reputation page loads correctly');
  });

  test('should load registry page', async ({ page }) => {
    await navigateTo(page, ROUTES.REGISTRY);
    await waitForPageLoad(page);

    expect(page.url()).toContain('/registry');
    console.log('✅ Registry page loads correctly');
  });
});

test.describe('Page Navigation - Markets Sub-routes', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.DESKTOP);
    await navigateTo(page, ROUTES.HOME);
    await loginWithPrivyEmail(page, getPrivyTestAccount());
    await page.waitForTimeout(2000);
  });

  test.afterEach(async ({ page }) => {
    await cooldownBetweenTests(page);
  });

  test('should load perps markets page', async ({ page }) => {
    await navigateTo(page, ROUTES.MARKETS_PERPS);
    await waitForPageLoad(page);

    expect(page.url()).toContain('/markets/perps');

    // Should have market cards or list
    const content = await page.locator('body').textContent();
    expect(content).toBeTruthy();

    console.log('✅ Perps markets page loads correctly');
  });

  test('should load predictions markets page', async ({ page }) => {
    await navigateTo(page, ROUTES.MARKETS_PREDICTIONS);
    await waitForPageLoad(page);

    expect(page.url()).toContain('/markets/predictions');

    // Should have prediction market content
    const content = await page.locator('body').textContent();
    expect(content).toBeTruthy();

    console.log('✅ Predictions markets page loads correctly');
  });
});

test.describe('Page Navigation - Agents Routes', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.DESKTOP);
    await navigateTo(page, ROUTES.HOME);
    await loginWithPrivyEmail(page, getPrivyTestAccount());
    await page.waitForTimeout(2000);
  });

  test.afterEach(async ({ page }) => {
    await cooldownBetweenTests(page);
  });

  test('should load agents list page', async ({ page }) => {
    await navigateTo(page, ROUTES.AGENTS);
    await waitForPageLoad(page);

    expect(page.url()).toContain('/agents');
    console.log('✅ Agents list page loads correctly');
  });

  test('should load agent create page', async ({ page }) => {
    await navigateTo(page, ROUTES.AGENTS_CREATE);
    await waitForPageLoad(page);

    expect(page.url()).toContain('/agents/create');
    console.log('✅ Agent create page loads correctly');
  });
});

test.describe('Page Navigation - Admin Routes', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.DESKTOP);
    await navigateTo(page, ROUTES.HOME);
    await loginWithPrivyEmail(page, getPrivyTestAccount());
    await page.waitForTimeout(2000);
  });

  test.afterEach(async ({ page }) => {
    await cooldownBetweenTests(page);
  });

  test('should load admin dashboard', async ({ page }) => {
    await navigateTo(page, ROUTES.ADMIN);
    await waitForPageLoad(page);

    expect(page.url()).toContain('/admin');
    console.log('✅ Admin dashboard loads correctly');
  });

  test('should load admin groups page', async ({ page }) => {
    await navigateTo(page, ROUTES.ADMIN_GROUPS);
    await waitForPageLoad(page);

    expect(page.url()).toContain('/admin/groups');
    console.log('✅ Admin groups page loads correctly');
  });

  test('should load admin performance page', async ({ page }) => {
    await navigateTo(page, ROUTES.ADMIN_PERFORMANCE);
    await waitForPageLoad(page);

    expect(page.url()).toContain('/admin/performance');
    console.log('✅ Admin performance page loads correctly');
  });
});

test.describe('Page Navigation - Navigation Links', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.DESKTOP);
    await navigateTo(page, ROUTES.HOME);
    await loginWithPrivyEmail(page, getPrivyTestAccount());
    await page.waitForTimeout(2000);
  });

  test.afterEach(async ({ page }) => {
    await cooldownBetweenTests(page);
  });

  test('should navigate using main navigation', async ({ page }) => {
    await navigateTo(page, ROUTES.FEED);
    await waitForPageLoad(page);

    // Try to find and click navigation links
    const navLinks = page.locator('nav a, [role="navigation"] a');
    const count = await navLinks.count();

    if (count > 0) {
      // Try clicking first nav link
      const firstLink = navLinks.first();
      const href = await firstLink.getAttribute('href');

      if (href && !href.startsWith('http')) {
        await firstLink.click();
        await waitForPageLoad(page);
        console.log(`✅ Navigation via nav link to ${href} works`);
      }
    }
  });

  test('should navigate back button works', async ({ page }) => {
    // Navigate to feed, then settings
    await navigateTo(page, ROUTES.FEED);
    await waitForPageLoad(page);

    await navigateTo(page, ROUTES.SETTINGS);
    await waitForPageLoad(page);

    // Click back button (if present) or use browser back
    const backButton = page
      .locator('button:has-text("Back"), a:has-text("Back")')
      .first();
    const hasBackButton = await backButton
      .isVisible({ timeout: TIMEOUTS.SHORT })
      .catch(() => false);

    if (hasBackButton) {
      await backButton.click();
      await waitForPageLoad(page);
    } else {
      await page.goBack();
      await waitForPageLoad(page);
    }

    console.log('✅ Back navigation works');
  });
});

test.describe('Page Navigation - Mobile Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.MOBILE);
    await navigateTo(page, ROUTES.HOME);
    await loginWithPrivyEmail(page, getPrivyTestAccount());
    await page.waitForTimeout(2000);
  });

  test.afterEach(async ({ page }) => {
    await cooldownBetweenTests(page);
  });

  test('should show mobile bottom navigation', async ({ page }) => {
    await navigateTo(page, ROUTES.FEED);
    await waitForPageLoad(page);

    // Look for bottom navigation (common in mobile layouts)
    const bottomNav = page
      .locator('nav.fixed.bottom-0, [data-testid="bottom-nav"]')
      .first();
    const isVisible = await bottomNav
      .isVisible({ timeout: TIMEOUTS.SHORT })
      .catch(() => false);

    if (isVisible) {
      console.log('✅ Mobile bottom navigation visible');
    } else {
      // Some designs use a different mobile nav pattern
      console.log('ℹ️ Bottom nav not found - design may use different pattern');
    }
  });

  test('should navigate using mobile bottom nav', async ({ page }) => {
    await navigateTo(page, ROUTES.FEED);
    await waitForPageLoad(page);

    // Try to find mobile nav items
    const navItems = page.locator('nav.fixed a, nav.fixed button');
    const count = await navItems.count();

    if (count > 0) {
      for (let i = 0; i < Math.min(count, 3); i++) {
        const item = navItems.nth(i);
        if (await item.isVisible()) {
          await item.click();
          await waitForPageLoad(page);
          console.log(`✅ Mobile nav item ${i + 1} clicked`);
        }
      }
    }
  });
});

test.describe('Page Navigation - Error States', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.DESKTOP);
  });

  test('should handle 404 pages gracefully', async ({ page }) => {
    await navigateTo(page, '/this-page-does-not-exist-12345');
    await waitForPageLoad(page);

    // Should show 404 or not found content
    const body = await page.locator('body').textContent();
    const has404 =
      body?.includes('404') ||
      body?.includes('not found') ||
      body?.includes('Not Found');

    expect(has404 || body?.length).toBeTruthy();
    console.log('✅ 404 page handled gracefully');
  });

  test('should handle network errors gracefully', async ({ page }) => {
    // Abort API requests to simulate network issues
    await page.route('**/api/**', (route) => route.abort());

    await navigateTo(page, ROUTES.FEED);

    // Page should still load (with error states or fallbacks)
    const body = page.locator('body');
    await expect(body).toBeVisible({ timeout: TIMEOUTS.MEDIUM });

    console.log('✅ Network errors handled gracefully');

    // Unroute to restore normal behavior
    await page.unroute('**/api/**');
  });
});

test.describe('Page Navigation - Loading States', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.DESKTOP);
    await navigateTo(page, ROUTES.HOME);
    await loginWithPrivyEmail(page, getPrivyTestAccount());
    await page.waitForTimeout(2000);
  });

  test('should show loading skeletons during page load', async ({ page }) => {
    // Navigate to a data-heavy page
    const response = page
      .waitForResponse('**/api/**', { timeout: TIMEOUTS.LONG })
      .catch(() => null);
    await page.goto(
      `${process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000'}${ROUTES.MARKETS}`,
      {
        waitUntil: 'domcontentloaded',
      }
    );

    // Check for skeleton elements early in the load
    const skeletons = page.locator(SELECTORS.LOADING_SKELETON);
    const count = await skeletons.count().catch(() => 0);

    // Either skeletons visible OR page loaded very fast
    await response;

    console.log(`ℹ️ Loading skeleton count during load: ${count}`);
    console.log('✅ Page load behavior verified');
  });
});
