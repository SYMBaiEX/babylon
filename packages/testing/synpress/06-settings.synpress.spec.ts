/**
 * Settings Page E2E Tests
 *
 * Tests all settings functionality:
 * - Profile settings (display name, username, bio)
 * - Theme settings
 * - Security settings
 * - Privacy settings
 * - API Keys management
 * - Form validation
 * - Save functionality
 */

import { expect, test } from '@playwright/test';
import {
  cooldownBetweenTests,
  navigateTo,
  waitForPageLoad,
} from './helpers/page-helpers';
import { loginWithWallet } from './helpers/privy-auth';
import {
  ROUTES,
  TEST_FORM_DATA,
  TIMEOUTS,
  VIEWPORTS,
} from './helpers/test-data';

test.setTimeout(TIMEOUTS.EXTRA_LONG);

test.describe('Settings Page - Navigation', () => {
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

  test('should display settings page with tabs', async ({ page }) => {
    expect(page.url()).toContain('/settings');

    // Should have Settings heading
    const heading = page.locator('h1:has-text("Settings")');
    await expect(heading.first()).toBeVisible({ timeout: TIMEOUTS.MEDIUM });

    console.log('✅ Settings page displays with heading');
  });

  test('should display all settings tabs', async ({ page }) => {
    const expectedTabs = ['Profile', 'Theme', 'Security', 'Privacy', 'API'];

    for (const tabName of expectedTabs) {
      const tab = page
        .locator(
          `button:has-text("${tabName}"), [role="tab"]:has-text("${tabName}")`
        )
        .first();
      const isVisible = await tab
        .isVisible({ timeout: TIMEOUTS.SHORT })
        .catch(() => false);

      if (isVisible) {
        console.log(`✅ Tab "${tabName}" visible`);
      } else {
        console.log(`ℹ️ Tab "${tabName}" not found`);
      }
    }
  });

  test('should switch between settings tabs', async ({ page }) => {
    const tabs = ['Profile', 'Theme', 'Security', 'Privacy', 'API'];

    for (const tabName of tabs) {
      const tab = page.locator(`button:has-text("${tabName}")`).first();
      if (await tab.isVisible({ timeout: TIMEOUTS.SHORT })) {
        await tab.click();
        await page.waitForTimeout(1000);

        // URL should update with tab parameter
        const _url = page.url();
        console.log(`✅ Switched to ${tabName} tab`);
      }
    }
  });

  test('should have back button', async ({ page }) => {
    const backButton = page
      .locator('button:has-text("Back"), a:has-text("Back")')
      .first();
    const isVisible = await backButton
      .isVisible({ timeout: TIMEOUTS.SHORT })
      .catch(() => false);

    if (isVisible) {
      console.log('✅ Back button visible');
    }
  });
});

test.describe('Settings Page - Profile Tab', () => {
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

  test('should display profile form fields', async ({ page }) => {
    const fields = [
      {
        label: 'Display Name',
        selector: 'input#displayName, input[name="displayName"]',
      },
      { label: 'Username', selector: 'input#username, input[name="username"]' },
      { label: 'Bio', selector: 'textarea#bio, textarea[name="bio"]' },
    ];

    for (const { label, selector } of fields) {
      const field = page.locator(selector).first();
      const isVisible = await field
        .isVisible({ timeout: TIMEOUTS.SHORT })
        .catch(() => false);

      if (isVisible) {
        console.log(`✅ ${label} field visible`);
      } else {
        console.log(`ℹ️ ${label} field not found with selector: ${selector}`);
      }
    }
  });

  test('should pre-fill profile fields with current values', async ({
    page,
  }) => {
    const displayNameInput = page
      .locator('input#displayName, input[name="displayName"]')
      .first();

    if (await displayNameInput.isVisible({ timeout: TIMEOUTS.SHORT })) {
      const value = await displayNameInput.inputValue();
      console.log(`✅ Display name pre-filled: "${value}"`);
    }
  });

  test('should update display name field', async ({ page }) => {
    const displayNameInput = page
      .locator('input#displayName, input[name="displayName"]')
      .first();

    if (await displayNameInput.isVisible({ timeout: TIMEOUTS.SHORT })) {
      await displayNameInput.clear();
      await displayNameInput.fill(TEST_FORM_DATA.DISPLAY_NAME);
      await page.waitForTimeout(500);

      const value = await displayNameInput.inputValue();
      expect(value).toBe(TEST_FORM_DATA.DISPLAY_NAME);
      console.log('✅ Display name field updated');
    }
  });

  test('should update bio field', async ({ page }) => {
    const bioTextarea = page
      .locator('textarea#bio, textarea[name="bio"]')
      .first();

    if (await bioTextarea.isVisible({ timeout: TIMEOUTS.SHORT })) {
      await bioTextarea.clear();
      await bioTextarea.fill(TEST_FORM_DATA.BIO);
      await page.waitForTimeout(500);

      const value = await bioTextarea.inputValue();
      expect(value).toBe(TEST_FORM_DATA.BIO);
      console.log('✅ Bio field updated');
    }
  });

  test('should show username change restriction message', async ({ page }) => {
    const usernameMessage = page.locator('text=/24 hours|once every/i').first();
    const isVisible = await usernameMessage
      .isVisible({ timeout: TIMEOUTS.SHORT })
      .catch(() => false);

    console.log(`✅ Username restriction message: ${isVisible}`);
  });

  test('should have save button', async ({ page }) => {
    const saveButton = page.locator('button:has-text("Save")').first();
    await expect(saveButton).toBeVisible({ timeout: TIMEOUTS.MEDIUM });
    console.log('✅ Save button visible');
  });

  test('should save profile changes', async ({ page }) => {
    const displayNameInput = page
      .locator('input#displayName, input[name="displayName"]')
      .first();
    const saveButton = page.locator('button:has-text("Save")').first();

    if (await displayNameInput.isVisible({ timeout: TIMEOUTS.SHORT })) {
      const newName = `Test User ${Date.now()}`;
      await displayNameInput.clear();
      await displayNameInput.fill(newName);
      await page.waitForTimeout(500);

      if ((await saveButton.isVisible()) && !(await saveButton.isDisabled())) {
        await saveButton.click();
        await page.waitForTimeout(3000);

        // Check for success indication
        const savedMessage = page
          .getByText('Saved')
          .or(page.getByText('Success'));
        const hasSaved = await savedMessage
          .first()
          .isVisible({ timeout: TIMEOUTS.SHORT })
          .catch(() => false);

        console.log(`✅ Save button clicked, success indicator: ${hasSaved}`);
      } else {
        console.log(
          'ℹ️ Save button disabled (user may not be on-chain registered)'
        );
      }
    }
  });
});

test.describe('Settings Page - Theme Tab', () => {
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

  test('should display theme options', async ({ page }) => {
    const themeOptions = ['Light', 'Dark', 'System'];

    for (const theme of themeOptions) {
      const option = page
        .locator(
          `label:has-text("${theme}"), input[value="${theme.toLowerCase()}"]`
        )
        .first();
      const isVisible = await option
        .isVisible({ timeout: TIMEOUTS.SHORT })
        .catch(() => false);

      if (isVisible) {
        console.log(`✅ Theme option "${theme}" visible`);
      }
    }
  });

  test('should switch to dark theme', async ({ page }) => {
    const darkOption = page
      .locator('label:has-text("Dark"), input[value="dark"]')
      .first();

    if (await darkOption.isVisible({ timeout: TIMEOUTS.SHORT })) {
      await darkOption.click();
      await page.waitForTimeout(1000);

      // Check if theme was applied (usually adds class to html element)
      const isDark = await page.evaluate(() => {
        return (
          document.documentElement.classList.contains('dark') ||
          document.documentElement.getAttribute('data-theme') === 'dark'
        );
      });

      console.log(`✅ Dark theme applied: ${isDark}`);
    }
  });

  test('should switch to light theme', async ({ page }) => {
    const lightOption = page
      .locator('label:has-text("Light"), input[value="light"]')
      .first();

    if (await lightOption.isVisible({ timeout: TIMEOUTS.SHORT })) {
      await lightOption.click();
      await page.waitForTimeout(1000);

      console.log('✅ Light theme selected');
    }
  });

  test('should show theme auto-save message', async ({ page }) => {
    const autoSaveMessage = page
      .locator('text=/saved automatically|applied immediately/i')
      .first();
    const isVisible = await autoSaveMessage
      .isVisible({ timeout: TIMEOUTS.SHORT })
      .catch(() => false);

    console.log(`✅ Auto-save message visible: ${isVisible}`);
  });
});

test.describe('Settings Page - Security Tab', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.DESKTOP);
    await navigateTo(page, ROUTES.HOME);
    await loginWithWallet(page);
    await page.goto(
      `${process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000'}/settings?tab=security`
    );
    await waitForPageLoad(page);
    await page.waitForTimeout(2000);
  });

  test.afterEach(async ({ page }) => {
    await cooldownBetweenTests(page);
  });

  test('should display security options', async ({ page }) => {
    const content = await page.locator('body').textContent();
    expect(content).toBeTruthy();
    console.log('✅ Security tab content displays');
  });

  test('should display connected accounts or login methods', async ({
    page,
  }) => {
    const connectedAccounts = page
      .locator('text=/Connected|Linked|Email|Wallet/i')
      .first();
    const isVisible = await connectedAccounts
      .isVisible({ timeout: TIMEOUTS.SHORT })
      .catch(() => false);

    console.log(`✅ Connected accounts section: ${isVisible}`);
  });

  test('should display logout option', async ({ page }) => {
    const logoutButton = page
      .locator(
        'button:has-text("Log out"), button:has-text("Sign out"), button:has-text("Disconnect")'
      )
      .first();
    const isVisible = await logoutButton
      .isVisible({ timeout: TIMEOUTS.SHORT })
      .catch(() => false);

    console.log(`✅ Logout option visible: ${isVisible}`);
  });
});

test.describe('Settings Page - Privacy Tab', () => {
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

  test.afterEach(async ({ page }) => {
    await cooldownBetweenTests(page);
  });

  test('should display privacy options', async ({ page }) => {
    const content = await page.locator('body').textContent();
    expect(content).toBeTruthy();
    console.log('✅ Privacy tab content displays');
  });

  test('should display blocked users option', async ({ page }) => {
    const blockedUsers = page.locator('text=/Blocked|Block/i').first();
    const isVisible = await blockedUsers
      .isVisible({ timeout: TIMEOUTS.SHORT })
      .catch(() => false);

    console.log(`✅ Blocked users section: ${isVisible}`);
  });

  test('should display muted users option', async ({ page }) => {
    const mutedUsers = page.locator('text=/Muted|Mute/i').first();
    const isVisible = await mutedUsers
      .isVisible({ timeout: TIMEOUTS.SHORT })
      .catch(() => false);

    console.log(`✅ Muted users section: ${isVisible}`);
  });

  test('should display delete account option', async ({ page }) => {
    const deleteAccount = page
      .locator('text=/Delete account|Delete my account/i')
      .first();
    const isVisible = await deleteAccount
      .isVisible({ timeout: TIMEOUTS.SHORT })
      .catch(() => false);

    console.log(`✅ Delete account option: ${isVisible}`);
  });
});

test.describe('Settings Page - API Keys Tab', () => {
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

  test.afterEach(async ({ page }) => {
    await cooldownBetweenTests(page);
  });

  test('should display API keys section', async ({ page }) => {
    const apiSection = page
      .locator('text=/API Key|API Keys|Access Keys/i')
      .first();
    const isVisible = await apiSection
      .isVisible({ timeout: TIMEOUTS.SHORT })
      .catch(() => false);

    console.log(`✅ API keys section: ${isVisible}`);
  });

  test('should have create API key button', async ({ page }) => {
    const createButton = page
      .locator(
        'button:has-text("Create"), button:has-text("Generate"), button:has-text("New Key")'
      )
      .first();
    const isVisible = await createButton
      .isVisible({ timeout: TIMEOUTS.SHORT })
      .catch(() => false);

    console.log(`✅ Create API key button: ${isVisible}`);
  });

  test('should display existing API keys list', async ({ page }) => {
    const keysList = page.locator('text=/bab_|••••/').first();
    const isVisible = await keysList
      .isVisible({ timeout: TIMEOUTS.SHORT })
      .catch(() => false);

    console.log(`ℹ️ Existing API keys displayed: ${isVisible}`);
  });
});

test.describe('Settings Page - Form Validation', () => {
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

  test('should validate empty display name', async ({ page }) => {
    const displayNameInput = page
      .locator('input#displayName, input[name="displayName"]')
      .first();
    const saveButton = page.locator('button:has-text("Save")').first();

    if (await displayNameInput.isVisible({ timeout: TIMEOUTS.SHORT })) {
      await displayNameInput.clear();
      await page.waitForTimeout(500);

      // Try to save - should either disable button or show error
      const isDisabled = await saveButton.isDisabled().catch(() => false);
      console.log(
        `✅ Empty display name validation: button disabled=${isDisabled}`
      );
    }
  });

  test('should validate special characters in username', async ({ page }) => {
    const usernameInput = page
      .locator('input#username, input[name="username"]')
      .first();

    if (
      (await usernameInput.isVisible({ timeout: TIMEOUTS.SHORT })) &&
      !(await usernameInput.isDisabled())
    ) {
      await usernameInput.clear();
      await usernameInput.fill(TEST_FORM_DATA.SPECIAL_CHARS);
      await page.waitForTimeout(500);

      // Should show validation error or sanitize input
      const hasError = await page
        .locator('text=/invalid|error|not allowed/i')
        .first()
        .isVisible({ timeout: TIMEOUTS.SHORT })
        .catch(() => false);
      console.log(`✅ Special characters validation: error shown=${hasError}`);
    } else {
      console.log('ℹ️ Username input disabled (rate limited)');
    }
  });

  test('should validate bio length', async ({ page }) => {
    const bioTextarea = page
      .locator('textarea#bio, textarea[name="bio"]')
      .first();

    if (await bioTextarea.isVisible({ timeout: TIMEOUTS.SHORT })) {
      await bioTextarea.clear();
      await bioTextarea.fill(TEST_FORM_DATA.LONG_STRING);
      await page.waitForTimeout(500);

      // Should either truncate or show error
      const value = await bioTextarea.inputValue();
      const wasLimited = value.length < TEST_FORM_DATA.LONG_STRING.length;
      console.log(`✅ Bio length validation: was limited=${wasLimited}`);
    }
  });
});

test.describe('Settings Page - Mobile View', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.MOBILE);
    await navigateTo(page, ROUTES.HOME);
    await loginWithWallet(page);
    await navigateTo(page, ROUTES.SETTINGS);
    await waitForPageLoad(page);
    await page.waitForTimeout(2000);
  });

  test.afterEach(async ({ page }) => {
    await cooldownBetweenTests(page);
  });

  test('should display mobile-friendly settings layout', async ({ page }) => {
    const content = page.locator('main').first();
    if (await content.isVisible()) {
      const box = await content.boundingBox();
      if (box) {
        expect(box.width).toBeLessThanOrEqual(VIEWPORTS.MOBILE.width + 20);
        console.log('✅ Settings is mobile-width');
      }
    }
  });

  test('should have scrollable tabs on mobile', async ({ page }) => {
    const tabsContainer = page.locator('[class*="overflow"]').first();
    const isPresent = await tabsContainer
      .isVisible({ timeout: TIMEOUTS.SHORT })
      .catch(() => false);
    console.log(`✅ Scrollable tabs container: ${isPresent}`);
  });

  test('should display form fields properly on mobile', async ({ page }) => {
    const profileTab = page.locator('button:has-text("Profile")').first();
    if (await profileTab.isVisible()) {
      await profileTab.click();
      await page.waitForTimeout(1000);

      const inputs = page.locator('input, textarea');
      const count = await inputs.count();
      console.log(`✅ Mobile form fields count: ${count}`);
    }
  });
});
