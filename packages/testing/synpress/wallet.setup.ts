/**
 * Wallet setup for Synpress MetaMask tests
 *
 * This file defines how MetaMask should be configured before running tests.
 * Uses the default Anvil test wallet (Account #0) which is admin in localnet.
 */

import { defineWalletSetup } from '@synthetixio/synpress-cache';
import { MetaMask } from '@synthetixio/synpress-metamask/playwright';

/**
 * Default Anvil test wallet configuration
 */
export const ANVIL_WALLET = {
  seedPhrase: 'test test test test test test test test test test test junk',
  password: 'Tester@1234',
};

/**
 * Local Anvil network configuration
 */
export const ANVIL_NETWORK = {
  name: 'Anvil Local',
  rpcUrl: 'http://localhost:8545',
  chainId: 31337,
  symbol: 'ETH',
};

/**
 * Define wallet setup for MetaMask
 *
 * This is run once per worker and cached for reuse.
 */
export default defineWalletSetup(
  ANVIL_WALLET.password,
  async (context, walletPage) => {
    const metamask = new MetaMask(
      context,
      walletPage,
      ANVIL_WALLET.password
    );

    // Import seed phrase
    await metamask.importWallet(ANVIL_WALLET.seedPhrase);

    // Add local Anvil network
    await metamask.addNetwork(ANVIL_NETWORK);
  }
);

