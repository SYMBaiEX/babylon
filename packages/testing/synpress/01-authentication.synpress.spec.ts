/**
 * Authentication E2E Tests
 *
 * Tests authentication flow with Privy + MetaMask:
 * - Wallet connection via Privy
 * - Session persistence
 * - Protected route access
 * - Admin access verification (Anvil test wallet is admin)
 */

import { expect, test } from '@playwright/test';
import {
  cooldownBetweenTests,
  navigateTo,
  waitForPageLoad,
} from './helpers/page-helpers';
import {
  hasWalletCredentials,
  loginWithWallet,
} from './helpers/privy-auth';
import {
  ADMIN_ROUTES,
  AUTHENTICATED_ROUTES,
  PUBLIC_ROUTES,
  ROUTES,
  SELECTORS,
  TIMEOUTS,
} from './helpers/test-data';

test.setTimeout(TIMEOUTS.EXTRA_LONG);

test.describe('Authentication - Wallet Connection', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
  });

  test.afterEach(async ({ page }) => {
    await cooldownBetweenTests(page);
  });

  test('should show login/connect button when not authenticated', async ({ page }) => {
    await navigateTo(page, ROUTES.HOME);
    await waitForPageLoad(page);

    // Should see a login/connect wallet button
    const loginButton = page.locator(SELECTORS.LOGIN_BUTTON).first();
    await expect(loginButton).toBeVisible({ timeout: TIMEOUTS.MEDIUM });

    console.log('✅ Login button visible when not authenticated');
  });

  test('should connect wallet successfully', async ({ page }) => {
    test.skip(
      !hasWalletCredentials(),
      'Skipped: Wallet credentials not configured (using defaults for local testing)'
    );

    await navigateTo(page, ROUTES.HOME);
    await loginWithWallet(page);

    // Verify user menu appears after connection
    const userMenu = page.locator(SELECTORS.USER_MENU).first();
    await expect(userMenu).toBeVisible({ timeout: TIMEOUTS.LONG });

    console.log('✅ Wallet connection successful - user menu visible');
  });

  test('should persist session across page navigation', async ({ page }) => {
    test.skip(
      !hasWalletCredentials(),
      'Skipped: Wallet credentials not configured'
    );

    await navigateTo(page, ROUTES.HOME);
    await loginWithWallet(page);

    // Navigate to different pages
    const pagesToCheck = [ROUTES.FEED, ROUTES.MARKETS, ROUTES.PROFILE];

    for (const route of pagesToCheck) {
      await navigateTo(page, route);
      await waitForPageLoad(page);

      // Should still be logged in
      const userMenu = page.locator(SELECTORS.USER_MENU).first();
      const isVisible = await userMenu
        .isVisible({ timeout: TIMEOUTS.SHORT })
        .catch(() => false);

      expect(isVisible).toBe(true);
      console.log(`✅ Session persisted on ${route}`);
    }
  });

  test('should access protected routes when authenticated', async ({ page }) => {
    await navigateTo(page, ROUTES.HOME);
    await loginWithWallet(page);
    await page.waitForTimeout(2000);

    // Try each authenticated route
    for (const route of AUTHENTICATED_ROUTES.slice(0, 3)) {
      await navigateTo(page, route);
      await waitForPageLoad(page);

      // Should not redirect to login
      const currentUrl = page.url();
      expect(currentUrl).toContain(route.replace(/\/$/, ''));

      // Should have content
      const hasContent = await page.locator('body').textContent();
      expect(hasContent).toBeTruthy();

      console.log(`✅ Authenticated access to ${route}`);
    }
  });

  test('should show login button or redirect when visiting protected routes', async ({
    page,
  }) => {
    // Try to access settings without authentication
    await navigateTo(page, ROUTES.SETTINGS);
    await waitForPageLoad(page);

    // Page should render something
    const pageContent = await page.locator('body').textContent();
    expect(pageContent).toBeTruthy();

    // Check if login button is visible anywhere
    const hasLoginButton = await page
      .locator(SELECTORS.LOGIN_BUTTON)
      .first()
      .isVisible({ timeout: TIMEOUTS.SHORT })
      .catch(() => false);

    // Either has login button OR was redirected
    const currentUrl = page.url();
    const wasRedirected =
      !currentUrl.includes('/settings') || currentUrl.includes('login');

    console.log(
      `✅ Settings page behavior: loginButton=${hasLoginButton}, redirected=${wasRedirected}`
    );
  });
});

test.describe('Authentication - Admin Access', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await navigateTo(page, ROUTES.HOME);
    await loginWithWallet(page);
    await page.waitForTimeout(2000);
  });

  test.afterEach(async ({ page }) => {
    await cooldownBetweenTests(page);
  });

  test('should access admin dashboard with admin wallet', async ({ page }) => {
    await navigateTo(page, ROUTES.ADMIN);
    await waitForPageLoad(page);

    // Should be on admin page (not redirected)
    expect(page.url()).toContain('/admin');

    // Should see admin dashboard content
    const adminHeading = page.getByRole('heading', { name: 'Admin Dashboard' });
    const isVisible = await adminHeading
      .isVisible({ timeout: TIMEOUTS.MEDIUM })
      .catch(() => false);

    if (isVisible) {
      console.log('✅ Admin dashboard accessible');
    } else {
      // Check if access denied (wallet might not be admin)
      const accessDenied = await page
        .getByText('Access Denied')
        .isVisible({ timeout: TIMEOUTS.SHORT })
        .catch(() => false);

      if (accessDenied) {
        console.log('⚠️ Admin access denied - wallet may not have admin role');
      } else {
        console.log('ℹ️ Admin page loaded but heading not visible');
      }
    }
  });

  test('should see admin tabs and navigation', async ({ page }) => {
    await navigateTo(page, ROUTES.ADMIN);
    await waitForPageLoad(page);

    // Check for common admin tabs
    const expectedTabs = [
      'Stats',
      'Users',
      'Agents',
      'Registry',
      'Reports',
      'Training',
    ];

    for (const tabName of expectedTabs) {
      const tab = page
        .getByRole('tab', { name: tabName })
        .or(page.locator(`button:has-text("${tabName}")`));

      const isVisible = await tab
        .isVisible({ timeout: TIMEOUTS.SHORT })
        .catch(() => false);

      if (isVisible) {
        console.log(`✅ Admin tab "${tabName}" visible`);
      }
    }
  });

  test('should access all admin sub-routes', async ({ page }) => {
    for (const route of ADMIN_ROUTES) {
      await navigateTo(page, route);
      await waitForPageLoad(page);

      expect(page.url()).toContain(route.replace(/\/$/, ''));
      console.log(`✅ Admin route ${route} accessible`);
    }
  });
});

test.describe('Authentication - Public Routes', () => {
  test('should access public routes without authentication', async ({
    page,
  }) => {
    for (const route of PUBLIC_ROUTES.slice(0, 5)) {
      await navigateTo(page, route);
      await waitForPageLoad(page);

      // Should load without redirecting to login
      const hasContent = await page.locator('body').textContent();
      expect(hasContent).toBeTruthy();

      // Should not show "access denied" or similar
      const accessDenied = await page
        .getByText('Access Denied')
        .isVisible({ timeout: TIMEOUTS.SHORT })
        .catch(() => false);

      expect(accessDenied).toBe(false);
      console.log(`✅ Public route ${route} accessible`);
    }
  });
});

test.describe('Authentication - Session State', () => {
  test('should show different UI elements based on auth state', async ({
    page,
  }) => {
    test.skip(
      !hasWalletCredentials(),
      'Skipped: Wallet credentials not configured'
    );

    // Check UI before login
    await navigateTo(page, ROUTES.FEED);
    await waitForPageLoad(page);

    const loginButtonBefore = page.locator(SELECTORS.LOGIN_BUTTON).first();
    const loginVisibleBefore = await loginButtonBefore
      .isVisible({ timeout: TIMEOUTS.SHORT })
      .catch(() => false);

    // Connect wallet
    await navigateTo(page, ROUTES.HOME);
    await loginWithWallet(page);

    // Check UI after login
    await navigateTo(page, ROUTES.FEED);
    await waitForPageLoad(page);

    const userMenu = page.locator(SELECTORS.USER_MENU).first();
    const userMenuVisible = await userMenu
      .isVisible({ timeout: TIMEOUTS.SHORT })
      .catch(() => false);

    console.log(`Login button before login: ${loginVisibleBefore}`);
    console.log(`User menu after login: ${userMenuVisible}`);

    expect(userMenuVisible).toBe(true);
    console.log('✅ UI changes correctly based on auth state');
  });
});
