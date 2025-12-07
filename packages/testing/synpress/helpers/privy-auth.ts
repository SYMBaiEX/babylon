/**
 * Privy authentication helpers for synpress tests.
 *
 * Uses MetaMask wallet connection via Synpress for authentication.
 *
 * @module testing/synpress/helpers/privy-auth
 */

import type { Page } from '@playwright/test';

/**
 * Test wallet configuration from environment
 */
export interface WalletConfig {
  seedPhrase: string;
  password: string;
}

/**
 * Gets wallet configuration from environment variables.
 *
 * @returns Wallet configuration for MetaMask
 */
export function getWalletConfig(): WalletConfig {
  const seedPhrase =
    process.env.WALLET_SEED_PHRASE ||
    'test test test test test test test test test test test junk';
  const password = process.env.WALLET_PASSWORD || 'Tester@1234';

  return { seedPhrase, password };
}

/**
 * Checks if wallet credentials are configured (non-default).
 *
 * @returns true if custom wallet credentials are set
 */
export function hasWalletCredentials(): boolean {
  return !!process.env.WALLET_SEED_PHRASE;
}

/**
 * Waits for Privy SDK to be initialized and ready.
 *
 * @param page - Playwright page instance
 * @param timeout - Maximum time to wait in milliseconds (default: 60000)
 */
export async function waitForPrivyReady(
  page: Page,
  timeout = 60000
): Promise<void> {
  console.log('⏳ Waiting for Privy SDK to initialize...');

  const startTime = Date.now();

  // Wait for page to hydrate
  let pageHydrated = false;
  for (let i = 0; i < 30; i++) {
    const buttonCount = await page.locator('button').count().catch(() => 0);
    if (buttonCount > 0) {
      console.log(`✅ Page hydrated (${buttonCount} buttons found)`);
      pageHydrated = true;
      break;
    }
    await page.waitForTimeout(500);
  }

  if (!pageHydrated) {
    console.log('⚠️ Page not hydrated, attempting reload...');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
  }

  // Check for Privy not configured warning
  const warningBanner = page
    .locator('[data-testid="privy-not-configured-warning"]')
    .first();
  const warningVisible = await warningBanner
    .isVisible({ timeout: 2000 })
    .catch(() => false);

  if (warningVisible) {
    throw new Error(
      'Privy not configured: NEXT_PUBLIC_PRIVY_APP_ID not set during build.'
    );
  }

  // Wait for Privy UI elements
  const privyReadyIndicators = [
    'button:has-text("Log in")',
    'button:has-text("Connect Wallet")',
    '[data-testid="user-menu"]',
  ];

  const elapsed = Date.now() - startTime;
  const remainingTime = Math.max(timeout - elapsed, 10000);
  const checkInterval = 500;
  const maxAttempts = Math.floor(remainingTime / checkInterval);

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    for (const selector of privyReadyIndicators) {
      const element = page.locator(selector).first();
      const isVisible = await element.isVisible({ timeout: 100 }).catch(() => false);
      if (isVisible) {
        console.log(
          `✅ Privy SDK ready (took ${Date.now() - startTime}ms, detected: ${selector})`
        );
        return;
      }
    }
    await page.waitForTimeout(checkInterval);
  }

  throw new Error(`Privy SDK failed to initialize within ${timeout}ms`);
}

/**
 * Login with MetaMask wallet via Privy.
 *
 * Uses the default Anvil test wallet (Account #0).
 * The Anvil test wallet should already be configured as an admin.
 *
 * @param page - Playwright page instance
 */
export async function loginWithWallet(page: Page): Promise<void> {
  console.log('🔄 Starting Privy wallet login flow...');

  await waitForPrivyReady(page);

  // Check if already logged in
  const userMenu = page.locator('[data-testid="user-menu"]').first();
  const isLoggedIn = await userMenu.isVisible({ timeout: 3000 }).catch(() => false);

  if (isLoggedIn) {
    console.log('✅ User already logged in');
    return;
  }

  console.log('ℹ️ User not logged in, proceeding with wallet connection');

  // Click login/connect button
  const loginButton = page
    .locator(
      'button:has-text("Log in"), button:has-text("Connect Wallet"), button:has-text("Sign in")'
    )
    .first();

  const loginVisible = await loginButton
    .isVisible({ timeout: 5000 })
    .catch(() => false);

  if (loginVisible) {
    console.log('🖱️ Clicking login button...');
    await loginButton.click({ timeout: 5000 });
    await page.waitForTimeout(1000);
  }

  // Look for wallet connection option in Privy modal
  const walletButton = page
    .locator(
      'button:has-text("MetaMask"), button:has-text("Continue with a wallet"), button:has-text("Wallet")'
    )
    .first();

  const walletVisible = await walletButton
    .isVisible({ timeout: 5000 })
    .catch(() => false);

  if (walletVisible) {
    console.log('🔗 Clicking wallet connection button...');
    await walletButton.click({ timeout: 5000 });
    await page.waitForTimeout(2000);

    // Handle MetaMask popup - Synpress should auto-handle this
    // The MetaMask extension will prompt to connect, then sign
    console.log('⏳ Waiting for MetaMask interaction...');

    // Wait for authentication to complete
    await page.waitForTimeout(5000);
  }

  // Verify authentication success
  const userMenuFinal = page.locator('[data-testid="user-menu"]').first();
  const isAuthenticated = await userMenuFinal
    .isVisible({ timeout: 10000 })
    .catch(() => false);

  if (isAuthenticated) {
    console.log('✅ Wallet authentication successful');
  } else {
    console.warn('⚠️ Wallet authentication verification failed - user menu not visible');
  }
}

// Legacy exports for backward compatibility
export interface PrivyTestAccount {
  email: string;
  password?: string;
}

export function getPrivyTestAccount(): PrivyTestAccount {
  return { email: 'test@example.com' };
}

export function hasPrivyTestCredentials(): boolean {
  return hasWalletCredentials();
}

/**
 * @deprecated Use loginWithWallet instead
 */
export async function loginWithPrivyEmail(
  page: Page,
  _account: PrivyTestAccount
): Promise<void> {
  return loginWithWallet(page);
}
