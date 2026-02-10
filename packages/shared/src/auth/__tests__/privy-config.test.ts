import { describe, expect, test } from 'bun:test';

describe('privyConfig', () => {
  test('is single-chain and uses the configured CHAIN (mainnet in prod)', async () => {
    const previousChainId = process.env.NEXT_PUBLIC_CHAIN_ID;
    const previousRpcUrl = process.env.NEXT_PUBLIC_RPC_URL;

    process.env.NEXT_PUBLIC_CHAIN_ID = '1';
    process.env.NEXT_PUBLIC_RPC_URL = 'https://example.invalid';

    const moduleUrl = new URL('../privy-config.ts', import.meta.url);
    const { privyConfig } = (await import(
      `${moduleUrl.href}?t=${Date.now()}`
    )) as typeof import('../privy-config');

    const { defaultChain, supportedChains } = privyConfig.config;
    if (!defaultChain) throw new Error('Expected defaultChain to be set');
    if (!supportedChains) throw new Error('Expected supportedChains to be set');

    expect(defaultChain.id).toBe(1);
    expect(supportedChains.map((chain) => chain.id)).toEqual([1]);

    process.env.NEXT_PUBLIC_CHAIN_ID = previousChainId;
    process.env.NEXT_PUBLIC_RPC_URL = previousRpcUrl;
  });
});
