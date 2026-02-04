/**
 * Wallet setup for Synpress MetaMask tests
 *
 * This file defines how MetaMask should be configured before running tests.
 * Uses the default Anvil test wallet (Account #0) which is admin in localnet.
 *
 * @see https://docs.synpress.io/docs/playwright/metamask/setup
 */

import { defineWalletSetup } from '@synthetixio/synpress-cache';
import { MetaMask } from '@synthetixio/synpress-metamask/playwright';

/**
 * Default Anvil test wallet configuration
 * Account #0 from 'test test test test test test test test test test test junk'
 */
export const ANVIL_WALLET = {
  seedPhrase: 'test test test test test test test test test test test junk',
  password: 'Tester@1234',
} as const;

/**
 * Local Anvil network configuration
 */
export const ANVIL_NETWORK = {
  name: 'Anvil Local',
  rpcUrl: 'http://localhost:8545',
  chainId: 31337,
  symbol: 'ETH',
} as const;

/**
 * Define wallet setup for MetaMask
 *
 * This is run once per worker and cached for reuse.
 * The setup imports the seed phrase and configures the local Anvil network.
 */
export default defineWalletSetup(
  ANVIL_WALLET.password,
  async (context, walletPage) => {
    const metamask = new MetaMask(context, walletPage, ANVIL_WALLET.password);

    // Import the test seed phrase
    await metamask.importWallet(ANVIL_WALLET.seedPhrase);

    // Add local Anvil network for testing
    await metamask.addNetwork(ANVIL_NETWORK);
  }
);
