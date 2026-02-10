import { describe, expect, test } from 'bun:test';

import { privyConfig } from '../privy-config';

describe('privyConfig', () => {
  test('includes Ethereum mainnet in supportedChains (chainId=1)', () => {
    const supportedChainIds = privyConfig.config.supportedChains?.map(
      (chain) => chain.id
    );

    expect(supportedChainIds).toBeDefined();
    expect(supportedChainIds).toContain(1);
  });

  test('uses Ethereum mainnet as defaultChain (chainId=1)', () => {
    expect(privyConfig.config.defaultChain?.id).toBe(1);
  });
});
