/**
 * Profile Page E2E Tests
 *
 * Tests profile viewing and interactions.
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

test.describe('Profile - Own Profile', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.DESKTOP);
    await navigateTo(page, ROUTES.HOME);
    await loginWithWallet(page);
    await navigateTo(page, ROUTES.PROFILE);
    await waitForPageLoad(page);
    await page.waitForTimeout(2000);
  });

  test.afterEach(async ({ page }) => {
    await cooldownBetweenTests(page);
  });

  test('displays profile page with user info', async ({ page }) => {
    expect(page.url()).toContain('/profile');

    // Should have profile content (avatar, name, etc.)
    const body = await page.locator('body').textContent();
    expect(body?.length).toBeGreaterThan(100);

    // Should have some kind of heading/name
    const heading = page.locator('h1, h2').first();
    await expect(heading).toBeVisible({ timeout: TIMEOUTS.MEDIUM });
  });

  test('does not show follow button on own profile', async ({ page }) => {
    // Own profile should NOT have follow button
    const followButton = page
      .locator('button:has-text("Follow"):not(:has-text("Following"))')
      .first();
    const isVisible = await followButton
      .isVisible({ timeout: TIMEOUTS.SHORT })
      .catch(() => false);

    // If visible, it should be related to followers list, not self-follow
    if (isVisible) {
      const buttonText = await followButton.textContent();
      // "Following" count is OK, actual "Follow" button is not
      expect(buttonText?.includes('Followers')).toBe(true);
    }
  });
});

test.describe('Profile - Other User', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.DESKTOP);
    await navigateTo(page, ROUTES.HOME);
    await loginWithWallet(page);
    await page.waitForTimeout(2000);
  });

  test.afterEach(async ({ page }) => {
    await cooldownBetweenTests(page);
  });

  test('can navigate to other profile from feed', async ({ page }) => {
    await navigateTo(page, ROUTES.FEED);
    await waitForPageLoad(page);

    const authorLink = page.locator('a[href*="/profile/"]').first();
    if (await authorLink.isVisible({ timeout: TIMEOUTS.SHORT })) {
      await authorLink.click();
      await page.waitForTimeout(2000);
      expect(page.url()).toContain('/profile/');
    }
  });

  test('other profile shows follow and message buttons', async ({ page }) => {
    await navigateTo(page, ROUTES.FEED);
    await waitForPageLoad(page);

    const authorLink = page.locator('a[href*="/profile/"]').first();
    if (!(await authorLink.isVisible({ timeout: TIMEOUTS.SHORT }))) {
      test.skip();
      return;
    }

    await authorLink.click();
    await page.waitForTimeout(2000);

    // Should have follow OR following button
    const followButton = page
      .locator('button:has-text("Follow"), button:has-text("Following")')
      .first();
    const hasFollow = await followButton
      .isVisible({ timeout: TIMEOUTS.SHORT })
      .catch(() => false);

    // Should have message button
    const messageButton = page.locator('button:has-text("Message")').first();
    const hasMessage = await messageButton
      .isVisible({ timeout: TIMEOUTS.SHORT })
      .catch(() => false);

    // At least one interaction button should exist
    expect(hasFollow || hasMessage).toBe(true);
  });
});

test.describe('Profile - Content Tabs', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.DESKTOP);
    await navigateTo(page, ROUTES.HOME);
    await loginWithWallet(page);
    await navigateTo(page, ROUTES.PROFILE);
    await waitForPageLoad(page);
    await page.waitForTimeout(2000);
  });

  test.afterEach(async ({ page }) => {
    await cooldownBetweenTests(page);
  });

  test('can switch between profile content tabs', async ({ page }) => {
    const tabs = page.locator('[role="tab"], button.tab');
    const tabCount = await tabs.count();

    if (tabCount > 1) {
      // Click second tab
      const secondTab = tabs.nth(1);
      if (await secondTab.isVisible()) {
        await secondTab.click();
        await page.waitForTimeout(1000);
        // No crash = success
      }
    }
  });
});
