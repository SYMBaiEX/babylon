/**
 * Edge Case E2E Tests
 *
 * Tests application behavior with unusual inputs.
 * These tests verify the app doesn't crash and handles edge cases gracefully.
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

test.describe('Edge Cases - Security', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.DESKTOP);
    await navigateTo(page, ROUTES.HOME);
    await loginWithWallet(page);
    await page.waitForTimeout(2000);
  });

  test.afterEach(async ({ page }) => {
    await cooldownBetweenTests(page);
  });

  test('should sanitize XSS attempts in settings bio', async ({ page }) => {
    await navigateTo(page, ROUTES.SETTINGS);
    await waitForPageLoad(page);

    const bioTextarea = page
      .locator('textarea#bio, textarea[name="bio"]')
      .first();

    // Skip if bio field not visible (page might be in different state)
    if (!(await bioTextarea.isVisible({ timeout: TIMEOUTS.SHORT }))) {
      test.skip();
      return;
    }

    await bioTextarea.clear();
    await bioTextarea.fill(TEST_FORM_DATA.XSS_ATTEMPT);
    await page.waitForTimeout(500);

    // The script should not execute
    const alertTriggered = await page.evaluate(() => {
      return (
        (window as Window & { xssTriggered?: boolean }).xssTriggered === true
      );
    });

    expect(alertTriggered).toBe(false);
  });

  test('should handle SQL injection attempts in search', async ({ page }) => {
    await navigateTo(page, ROUTES.MARKETS);
    await waitForPageLoad(page);

    const searchInput = page
      .locator('input[type="search"], input[placeholder*="Search"]')
      .first();

    // Skip if search not visible
    if (!(await searchInput.isVisible({ timeout: TIMEOUTS.SHORT }))) {
      test.skip();
      return;
    }

    await searchInput.fill(TEST_FORM_DATA.SQL_INJECTION);
    await page.waitForTimeout(1000);

    // Page should not crash or show SQL errors
    const content = await page.locator('body').textContent();
    expect(content).toBeTruthy();

    const hasSqlError =
      content?.toLowerCase().includes('sql') &&
      content?.toLowerCase().includes('error');
    expect(hasSqlError).toBe(false);
  });

  test('should not expose server errors to users', async ({ page }) => {
    // Try to access an invalid API endpoint
    const response = await page.request.get('/api/nonexistent-endpoint-12345');

    // Should return 404, not 500 with stack trace
    expect(response.status()).toBe(404);

    const text = await response.text();
    // Should not expose internal details
    expect(text.toLowerCase()).not.toContain('stack trace');
    expect(text.toLowerCase()).not.toContain('internal server');
  });
});

test.describe('Edge Cases - Input Validation', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.DESKTOP);
    await navigateTo(page, ROUTES.HOME);
    await loginWithWallet(page);
    await page.waitForTimeout(2000);
  });

  test.afterEach(async ({ page }) => {
    await cooldownBetweenTests(page);
  });

  test('should handle empty form submission on feed', async ({ page }) => {
    await navigateTo(page, ROUTES.FEED);
    await waitForPageLoad(page);

    const createButton = page
      .locator('button[aria-label="Create Post"]')
      .first();

    if (!(await createButton.isVisible({ timeout: TIMEOUTS.SHORT }))) {
      test.skip();
      return;
    }

    await createButton.click();
    await page.waitForTimeout(1000);

    const submitButton = page
      .locator('button:has-text("Post"), button[type="submit"]')
      .first();

    if (await submitButton.isVisible({ timeout: TIMEOUTS.SHORT })) {
      // Submit should be disabled when content is empty
      const isDisabled = await submitButton.isDisabled();
      expect(isDisabled).toBe(true);
    }

    await page.keyboard.press('Escape');
  });

  test('should handle unicode/emoji in profile settings', async ({ page }) => {
    await navigateTo(page, ROUTES.SETTINGS);
    await waitForPageLoad(page);

    const displayNameInput = page
      .locator('input#displayName, input[name="displayName"]')
      .first();

    if (!(await displayNameInput.isVisible({ timeout: TIMEOUTS.SHORT }))) {
      test.skip();
      return;
    }

    await displayNameInput.clear();
    await displayNameInput.fill(TEST_FORM_DATA.UNICODE_STRING);
    await page.waitForTimeout(500);

    // Value should be preserved (not corrupted)
    const value = await displayNameInput.inputValue();
    expect(value.length).toBeGreaterThan(0);
    // Should contain at least some of the unicode characters
    expect(value).toContain('🎉');
  });

  test('should limit very long inputs', async ({ page }) => {
    await navigateTo(page, ROUTES.SETTINGS);
    await waitForPageLoad(page);

    const displayNameInput = page
      .locator('input#displayName, input[name="displayName"]')
      .first();

    if (!(await displayNameInput.isVisible({ timeout: TIMEOUTS.SHORT }))) {
      test.skip();
      return;
    }

    await displayNameInput.clear();
    await displayNameInput.fill(TEST_FORM_DATA.LONG_STRING);
    await page.waitForTimeout(500);

    // Value should be limited (not allow 5000 chars)
    const value = await displayNameInput.inputValue();
    expect(value.length).toBeLessThan(TEST_FORM_DATA.LONG_STRING.length);
  });
});

test.describe('Edge Cases - 404 and Error Handling', () => {
  test('should show 404 page for invalid routes', async ({ page }) => {
    await page.goto(
      `${process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000'}/nonexistent-page-12345`
    );
    await waitForPageLoad(page);

    const content = await page.locator('body').textContent();
    expect(content).toBeTruthy();

    // Should show some indication of 404
    const has404 =
      content?.includes('404') ||
      content?.toLowerCase().includes('not found') ||
      content?.toLowerCase().includes('page not found');
    expect(has404).toBe(true);
  });

  test('should handle invalid post ID gracefully', async ({ page }) => {
    await page.goto(
      `${process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000'}/post/invalid-id-12345`
    );
    await waitForPageLoad(page);

    // Should not crash - either show 404 or redirect
    const content = await page.locator('body').textContent();
    expect(content).toBeTruthy();
  });

  test('should handle invalid profile ID gracefully', async ({ page }) => {
    await page.goto(
      `${process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000'}/profile/invalid-user-12345`
    );
    await waitForPageLoad(page);

    // Should not crash
    const content = await page.locator('body').textContent();
    expect(content).toBeTruthy();
  });
});

test.describe('Edge Cases - Rapid Actions', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.DESKTOP);
    await navigateTo(page, ROUTES.HOME);
    await loginWithWallet(page);
    await page.waitForTimeout(2000);
  });

  test('should handle rapid tab switching', async ({ page }) => {
    await navigateTo(page, ROUTES.MARKETS);
    await waitForPageLoad(page);

    const tabs = page.locator('[role="tab"]');
    const tabCount = await tabs.count();

    if (tabCount < 2) {
      test.skip();
      return;
    }

    // Rapidly click tabs
    for (let i = 0; i < 10; i++) {
      await tabs.nth(i % tabCount).click();
      await page.waitForTimeout(50); // Very short wait
    }

    // Page should still be functional
    const content = await page.locator('body').textContent();
    expect(content).toBeTruthy();
  });

  test('should handle rapid navigation', async ({ page }) => {
    const routes: readonly string[] = [
      ROUTES.FEED,
      ROUTES.MARKETS,
      ROUTES.PROFILE,
    ];

    for (let i = 0; i < 6; i++) {
      const routeIndex = i % routes.length;
      const route = routes[routeIndex];
      if (!route) continue;
      await navigateTo(page, route);
      await page.waitForTimeout(100); // Very short wait
    }

    // Should end up on last route without crashing
    await waitForPageLoad(page);
    const content = await page.locator('body').textContent();
    expect(content).toBeTruthy();
  });
});
