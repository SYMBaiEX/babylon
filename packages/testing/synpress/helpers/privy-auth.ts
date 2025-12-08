/**
 * Privy authentication helpers for synpress tests.
 *
 * Handles wallet connection flow for E2E testing with Privy.
 * This helper attempts to authenticate via wallet connection.
 *
 * @module testing/synpress/helpers/privy-auth
 */

import type { Page } from '@playwright/test';

/**
 * Wallet configuration for testing
 */
export interface WalletConfig {
  seedPhrase: string;
  password: string;
}

/**
 * Default Anvil test wallet (Account #0)
 * This wallet should be configured as admin in localnet
 */
export const DEFAULT_ANVIL_WALLET = {
  address: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
  privateKey:
    '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
  seedPhrase: 'test test test test test test test test test test test junk',
  password: 'Tester@1234',
} as const;

/**
 * Gets wallet configuration from environment variables.
 */
export function getWalletConfig(): WalletConfig {
  return {
    seedPhrase:
      process.env.WALLET_SEED_PHRASE || DEFAULT_ANVIL_WALLET.seedPhrase,
    password: process.env.WALLET_PASSWORD || DEFAULT_ANVIL_WALLET.password,
  };
}

/**
 * Checks if custom wallet credentials are configured.
 */
export function hasWalletCredentials(): boolean {
  return Boolean(process.env.WALLET_SEED_PHRASE);
}

/**
 * Waits for Privy SDK to be initialized and ready.
 *
 * @param page - Playwright page instance
 * @param timeout - Maximum time to wait in milliseconds
 */
export async function waitForPrivyReady(
  page: Page,
  timeout = 60000
): Promise<void> {
  const startTime = Date.now();

  // Wait for page to have interactive elements
  for (let i = 0; i < 30; i++) {
    const buttonCount = await page.locator('button').count().catch(() => 0);
    if (buttonCount > 0) break;
    await page.waitForTimeout(500);
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

  // Wait for Privy UI elements to appear
  const privyIndicators = [
    'button:has-text("Log in")',
    'button:has-text("Connect Wallet")',
    '[data-testid="user-menu"]',
  ];

  const remainingTime = Math.max(timeout - (Date.now() - startTime), 10000);
  const checkInterval = 500;
  const maxAttempts = Math.floor(remainingTime / checkInterval);

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    for (const selector of privyIndicators) {
      const isVisible = await page
        .locator(selector)
        .first()
        .isVisible({ timeout: 100 })
        .catch(() => false);
      if (isVisible) return;
    }
    await page.waitForTimeout(checkInterval);
  }

  throw new Error(`Privy SDK failed to initialize within ${timeout}ms`);
}

/**
 * Checks if user is already authenticated.
 *
 * @param page - Playwright page instance
 * @returns true if user menu is visible
 */
export async function isAuthenticated(page: Page): Promise<boolean> {
  return await page
    .locator('[data-testid="user-menu"]')
    .first()
    .isVisible({ timeout: 3000 })
    .catch(() => false);
}

/**
 * Login with wallet via Privy.
 *
 * This function attempts the wallet connection flow:
 * 1. Click login button to open Privy modal
 * 2. Select wallet connection option
 * 3. Wait for wallet popup handling
 *
 * Note: For full wallet integration, you need a browser extension
 * or Synpress wallet setup. This helper handles the UI flow.
 *
 * @param page - Playwright page instance
 */
export async function loginWithWallet(page: Page): Promise<void> {
  await waitForPrivyReady(page);

  // Check if already logged in
  if (await isAuthenticated(page)) {
    return;
  }

  // Check if Privy modal is already open
  const privyModal = page
    .locator('[role="dialog"][aria-label*="log in" i]')
    .first();
  const modalOpen = await privyModal.isVisible({ timeout: 2000 }).catch(() => false);

  if (!modalOpen) {
    // Click login button to open modal
    const loginButton = page
      .locator(
        'button:has-text("Log in"), button:has-text("Connect Wallet"), button:has-text("Sign in")'
      )
      .first();

    const loginVisible = await loginButton
      .isVisible({ timeout: 5000 })
      .catch(() => false);

    if (loginVisible) {
      await loginButton.click({ force: true, timeout: 5000 });
      await page.waitForTimeout(1500);
    }
  }

  // Look for "More options" to expand wallet choices
  const moreOptionsButton = page.locator('button:has-text("More option")').first();
  if (await moreOptionsButton.isVisible({ timeout: 3000 }).catch(() => false)) {
    await moreOptionsButton.click({ timeout: 5000 });
    await page.waitForTimeout(1000);
  }

  // Try to select wallet connection option
  const walletSelectors = [
    'button:has-text("MetaMask")',
    'button:has-text("Continue with a wallet")',
    'button:has-text("Wallet")',
  ];

  for (const selector of walletSelectors) {
    const walletButton = page.locator(selector).first();
    if (await walletButton.isVisible({ timeout: 1000 }).catch(() => false)) {
      await walletButton.click({ force: true, timeout: 5000 });
      await page.waitForTimeout(2000);
      break;
    }
  }

  // Close modal if still open to allow test to continue
  await closePrivyModal(page);

  // Wait for authentication to complete
  await page.waitForTimeout(3000);
}

/**
 * Close Privy modal if open
 */
async function closePrivyModal(page: Page): Promise<void> {
  const closeButton = page
    .locator('button[aria-label*="close" i], button:has-text("close modal")')
    .first();
  if (await closeButton.isVisible({ timeout: 1000 }).catch(() => false)) {
    await closeButton.click({ force: true, timeout: 2000 }).catch(() => {});
    await page.waitForTimeout(500);
  }

  // Try pressing Escape as fallback
  await page.keyboard.press('Escape').catch(() => {});
  await page.waitForTimeout(500);
}

/**
 * Logout the current user
 *
 * @param page - Playwright page instance
 */
export async function logout(page: Page): Promise<void> {
  const userMenu = page.locator('[data-testid="user-menu"]').first();
  if (!(await userMenu.isVisible({ timeout: 3000 }).catch(() => false))) {
    return; // Not logged in
  }

  await userMenu.click();
  await page.waitForTimeout(500);

  const logoutButton = page
    .locator('button:has-text("Log out"), button:has-text("Sign out")')
    .first();

  if (await logoutButton.isVisible({ timeout: 2000 }).catch(() => false)) {
    await logoutButton.click();
    await page.waitForTimeout(2000);
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
