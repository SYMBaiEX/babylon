/**
 * Type declarations for Synpress modules
 * These packages don't have official type declarations
 */

declare module '@synthetixio/synpress-cache' {
  import type { BrowserContext, Page } from '@playwright/test';

  export function defineWalletSetup(
    password: string,
    setupFn: (context: BrowserContext, walletPage: Page) => Promise<void>
  ): unknown;
}

declare module '@synthetixio/synpress-metamask/playwright' {
  import type { BrowserContext, Page } from '@playwright/test';

  export interface NetworkConfig {
    name: string;
    rpcUrl: string;
    chainId: number;
    symbol: string;
  }

  export class MetaMask {
    constructor(context: BrowserContext, walletPage: Page, password: string);
    importWallet(seedPhrase: string): Promise<void>;
    addNetwork(network: NetworkConfig): Promise<void>;
    switchNetwork(networkName: string): Promise<void>;
    connectToDapp(): Promise<void>;
    confirmTransaction(): Promise<void>;
    rejectTransaction(): Promise<void>;
    signMessage(): Promise<void>;
  }
}

