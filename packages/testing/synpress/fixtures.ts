/**
 * Synpress test fixtures for MetaMask wallet integration
 *
 * Exports the test function with MetaMask fixtures for E2E testing.
 *
 * @see https://docs.synpress.io/docs/playwright/metamask/fixtures
 */

import { metaMaskFixtures } from '@synthetixio/synpress-metamask/playwright';
import basicSetup from './wallet.setup';

/**
 * Extended test with MetaMask fixtures
 *
 * Provides:
 * - metamask: MetaMask instance for wallet interactions
 * - context: Playwright browser context with extension
 * - extensionId: MetaMask extension ID
 */
export const test = metaMaskFixtures(basicSetup, 0);

/**
 * Re-export expect from the base test
 */
export { expect } from '@playwright/test';
