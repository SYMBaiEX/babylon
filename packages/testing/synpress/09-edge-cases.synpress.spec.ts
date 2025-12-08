/**
 * Edge Case E2E Tests
 *
 * Tests security and input validation edge cases.
 * Focuses on meaningful security/validation checks, not just "doesn't crash".
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

test.describe('Security', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.DESKTOP);
    await navigateTo(page, ROUTES.HOME);
    await loginWithWallet(page);
    await page.waitForTimeout(2000);
  });

  test.afterEach(async ({ page }) => {
    await cooldownBetweenTests(page);
  });

  test('XSS script tags do not execute in form inputs', async ({ page }) => {
    await navigateTo(page, ROUTES.SETTINGS);
    await waitForPageLoad(page);

    const bioTextarea = page
      .locator('textarea#bio, textarea[name="bio"]')
      .first();

    if (!(await bioTextarea.isVisible({ timeout: TIMEOUTS.SHORT }))) {
      test.skip();
      return;
    }

    // Inject XSS payload
    await bioTextarea.clear();
    await bioTextarea.fill('<script>window.xssTriggered=true</script>');
    await page.waitForTimeout(500);

    // Verify script did NOT execute
    const xssTriggered = await page.evaluate(() => {
      return (
        (window as Window & { xssTriggered?: boolean }).xssTriggered === true
      );
    });
    expect(xssTriggered).toBe(false);
  });

  test('SQL injection does not expose database errors', async ({ page }) => {
    await navigateTo(page, ROUTES.MARKETS);
    await waitForPageLoad(page);

    const searchInput = page
      .locator('input[type="search"], input[placeholder*="Search"]')
      .first();

    if (!(await searchInput.isVisible({ timeout: TIMEOUTS.SHORT }))) {
      test.skip();
      return;
    }

    await searchInput.fill("'; DROP TABLE users; --");
    await page.waitForTimeout(1000);

    const content = await page.locator('body').textContent();
    // Should not show SQL syntax or database errors
    expect(content?.toLowerCase()).not.toContain('syntax error');
    expect(content?.toLowerCase()).not.toContain('postgresql');
    expect(content?.toLowerCase()).not.toContain('mysql');
  });

  test('API errors do not expose stack traces', async ({ page }) => {
    const response = await page.request.get('/api/nonexistent-endpoint-xyz');

    expect(response.status()).toBe(404);

    const text = await response.text();
    expect(text.toLowerCase()).not.toContain('stack');
    expect(text.toLowerCase()).not.toContain('at module');
    expect(text.toLowerCase()).not.toContain('/node_modules/');
    expect(text.toLowerCase()).not.toContain('internal server error');
  });
});

test.describe('Input Validation', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.DESKTOP);
    await navigateTo(page, ROUTES.HOME);
    await loginWithWallet(page);
    await page.waitForTimeout(2000);
  });

  test.afterEach(async ({ page }) => {
    await cooldownBetweenTests(page);
  });

  test('empty post submission is prevented', async ({ page }) => {
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

  test('unicode and emoji characters are preserved in inputs', async ({
    page,
  }) => {
    await navigateTo(page, ROUTES.SETTINGS);
    await waitForPageLoad(page);

    const displayNameInput = page
      .locator('input#displayName, input[name="displayName"]')
      .first();

    if (!(await displayNameInput.isVisible({ timeout: TIMEOUTS.SHORT }))) {
      test.skip();
      return;
    }

    const unicodeTest = '日本語テスト 🎉 émojis';
    await displayNameInput.clear();
    await displayNameInput.fill(unicodeTest);

    const value = await displayNameInput.inputValue();
    expect(value).toContain('🎉');
    expect(value).toContain('日本語');
  });

  test('excessively long input is truncated', async ({ page }) => {
    await navigateTo(page, ROUTES.SETTINGS);
    await waitForPageLoad(page);

    const displayNameInput = page
      .locator('input#displayName, input[name="displayName"]')
      .first();

    if (!(await displayNameInput.isVisible({ timeout: TIMEOUTS.SHORT }))) {
      test.skip();
      return;
    }

    const longString = 'A'.repeat(5000);
    await displayNameInput.clear();
    await displayNameInput.fill(longString);

    const value = await displayNameInput.inputValue();
    // Should be truncated to reasonable length
    expect(value.length).toBeLessThan(500);
  });
});

test.describe('Error Pages', () => {
  test('404 page shows for invalid routes', async ({ page }) => {
    await page.goto(
      `${process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000'}/definitely-not-a-page-xyz`
    );
    await waitForPageLoad(page);

    const content = await page.locator('body').textContent();
    const shows404 =
      content?.includes('404') || content?.toLowerCase().includes('not found');

    expect(shows404).toBe(true);
  });
});
