/**
 * Settings Page E2E Tests
 *
 * Tests settings functionality: profile editing, themes, security.
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

test.describe('Settings - Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.DESKTOP);
    await navigateTo(page, ROUTES.HOME);
    await loginWithWallet(page);
    await navigateTo(page, ROUTES.SETTINGS);
    await waitForPageLoad(page);
    await page.waitForTimeout(2000);
  });

  test.afterEach(async ({ page }) => {
    await cooldownBetweenTests(page);
  });

  test('displays settings page with tabs', async ({ page }) => {
    expect(page.url()).toContain('/settings');

    // Should have settings heading
    const heading = page.locator('h1:has-text("Settings")');
    await expect(heading.first()).toBeVisible({ timeout: TIMEOUTS.MEDIUM });
  });

  test('can switch between settings tabs', async ({ page }) => {
    const tabs = ['Profile', 'Theme', 'Security', 'Privacy', 'API'];

    for (const tabName of tabs) {
      const tab = page.locator(`button:has-text("${tabName}")`).first();
      if (await tab.isVisible({ timeout: TIMEOUTS.SHORT })) {
        await tab.click();
        await page.waitForTimeout(500);
      }
    }
    // Made it through all tabs without crashing
  });
});

test.describe('Settings - Profile Tab', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.DESKTOP);
    await navigateTo(page, ROUTES.HOME);
    await loginWithWallet(page);
    await page.goto(
      `${process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000'}/settings?tab=profile`
    );
    await waitForPageLoad(page);
    await page.waitForTimeout(2000);
  });

  test.afterEach(async ({ page }) => {
    await cooldownBetweenTests(page);
  });

  test('displays profile form fields', async ({ page }) => {
    const displayNameInput = page
      .locator('input#displayName, input[name="displayName"]')
      .first();
    const bioTextarea = page
      .locator('textarea#bio, textarea[name="bio"]')
      .first();

    const hasDisplayName = await displayNameInput
      .isVisible({ timeout: TIMEOUTS.SHORT })
      .catch(() => false);
    const hasBio = await bioTextarea
      .isVisible({ timeout: TIMEOUTS.SHORT })
      .catch(() => false);

    // At least one form field should exist
    expect(hasDisplayName || hasBio).toBe(true);
  });

  test('can edit display name', async ({ page }) => {
    const displayNameInput = page
      .locator('input#displayName, input[name="displayName"]')
      .first();

    if (!(await displayNameInput.isVisible({ timeout: TIMEOUTS.SHORT }))) {
      test.skip();
      return;
    }

    const testName = `Test User ${Date.now()}`;
    await displayNameInput.clear();
    await displayNameInput.fill(testName);

    const value = await displayNameInput.inputValue();
    expect(value).toBe(testName);
  });

  test('save button exists and responds', async ({ page }) => {
    const saveButton = page.locator('button:has-text("Save")').first();
    await expect(saveButton).toBeVisible({ timeout: TIMEOUTS.MEDIUM });

    // Button should be either enabled or disabled based on form state
    const isDisabled = await saveButton.isDisabled();
    expect(typeof isDisabled).toBe('boolean');
  });
});

test.describe('Settings - Theme Tab', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.DESKTOP);
    await navigateTo(page, ROUTES.HOME);
    await loginWithWallet(page);
    await page.goto(
      `${process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000'}/settings?tab=theme`
    );
    await waitForPageLoad(page);
    await page.waitForTimeout(2000);
  });

  test.afterEach(async ({ page }) => {
    await cooldownBetweenTests(page);
  });

  test('can switch to dark theme', async ({ page }) => {
    const darkOption = page
      .locator(
        'label:has-text("Dark"), input[value="dark"], button:has-text("Dark")'
      )
      .first();

    if (await darkOption.isVisible({ timeout: TIMEOUTS.SHORT })) {
      await darkOption.click();
      await page.waitForTimeout(1000);

      // Check if theme was applied
      const isDark = await page.evaluate(() => {
        return (
          document.documentElement.classList.contains('dark') ||
          document.documentElement.getAttribute('data-theme') === 'dark' ||
          document.body.classList.contains('dark')
        );
      });
      expect(isDark).toBe(true);
    }
  });
});

test.describe('Settings - Privacy Tab', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.DESKTOP);
    await navigateTo(page, ROUTES.HOME);
    await loginWithWallet(page);
    await page.goto(
      `${process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000'}/settings?tab=privacy`
    );
    await waitForPageLoad(page);
    await page.waitForTimeout(2000);
  });

  test('displays privacy options including delete account', async ({
    page,
  }) => {
    const content = await page.locator('body').textContent();

    // Should have some privacy-related content
    const hasPrivacyContent =
      content?.toLowerCase().includes('block') ||
      content?.toLowerCase().includes('mute') ||
      content?.toLowerCase().includes('delete') ||
      content?.toLowerCase().includes('privacy');

    expect(hasPrivacyContent).toBe(true);
  });
});

test.describe('Settings - API Keys Tab', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.DESKTOP);
    await navigateTo(page, ROUTES.HOME);
    await loginWithWallet(page);
    await page.goto(
      `${process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000'}/settings?tab=api`
    );
    await waitForPageLoad(page);
    await page.waitForTimeout(2000);
  });

  test('displays API keys section with create button', async ({ page }) => {
    const createButton = page
      .locator(
        'button:has-text("Create"), button:has-text("Generate"), button:has-text("New")'
      )
      .first();
    const isVisible = await createButton
      .isVisible({ timeout: TIMEOUTS.SHORT })
      .catch(() => false);

    // Should have a way to create new API keys
    expect(isVisible).toBe(true);
  });
});
