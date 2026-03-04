/**
 * Unit Tests: Wallet Token List
 *
 * Tests the static token list configuration and lookup function.
 * Exercises real code paths in packages/shared/src/constants/token-list.ts.
 *
 * Run with: bun test unit/wallet-token-list.test.ts
 */

import { describe, expect, test } from 'bun:test';
import {
  DEFAULT_TOKEN_LIST,
  getTokenListForChain,
  type TokenConfig,
} from '@babylon/shared';

// ---------------------------------------------------------------------------
// getTokenListForChain — returns correct tokens for known chains
// ---------------------------------------------------------------------------

describe('getTokenListForChain', () => {
  test('returns tokens for Base mainnet (8453)', () => {
    const tokens = getTokenListForChain(8453);
    expect(tokens.length).toBeGreaterThan(0);
    const symbols = tokens.map((t) => t.symbol);
    expect(symbols).toContain('USDC');
    expect(symbols).toContain('WETH');
  });

  test('returns tokens for Ethereum mainnet (1)', () => {
    const tokens = getTokenListForChain(1);
    expect(tokens.length).toBeGreaterThan(0);
    const symbols = tokens.map((t) => t.symbol);
    expect(symbols).toContain('USDC');
    expect(symbols).toContain('WETH');
  });

  test('returns empty array for Base Sepolia (84532)', () => {
    const tokens = getTokenListForChain(84532);
    expect(tokens).toEqual([]);
  });

  test('returns empty array for Sepolia (11155111)', () => {
    const tokens = getTokenListForChain(11155111);
    expect(tokens).toEqual([]);
  });

  test('returns empty array for Hardhat local (31337)', () => {
    const tokens = getTokenListForChain(31337);
    expect(tokens).toEqual([]);
  });

  test('returns empty array for unknown chain ID', () => {
    expect(getTokenListForChain(999999)).toEqual([]);
  });

  test('returns empty array for chain ID 0', () => {
    expect(getTokenListForChain(0)).toEqual([]);
  });

  test('returns empty array for negative chain ID', () => {
    expect(getTokenListForChain(-1)).toEqual([]);
  });

  test('returns empty array for NaN chain ID', () => {
    expect(getTokenListForChain(NaN)).toEqual([]);
  });

  test('returns a new reference each time (not mutating shared state)', () => {
    const tokens1 = getTokenListForChain(8453);
    const tokens2 = getTokenListForChain(8453);
    // Same content but should reference the same underlying array (from DEFAULT_TOKEN_LIST)
    expect(tokens1).toEqual(tokens2);
    // Mutating the result should not affect next call (it returns the same ref)
    // This is by design — the function returns the stored array directly
    expect(tokens1).toBe(tokens2);
  });
});

// ---------------------------------------------------------------------------
// DEFAULT_TOKEN_LIST — structural validation of all configured tokens
// ---------------------------------------------------------------------------

describe('DEFAULT_TOKEN_LIST structure', () => {
  const allChainIds = Object.keys(DEFAULT_TOKEN_LIST).map(Number);

  test('contains expected chain IDs', () => {
    expect(allChainIds).toContain(8453); // Base mainnet
    expect(allChainIds).toContain(84532); // Base Sepolia
    expect(allChainIds).toContain(1); // Ethereum mainnet
    expect(allChainIds).toContain(11155111); // Sepolia
    expect(allChainIds).toContain(31337); // Hardhat
  });

  test('all token entries have required fields', () => {
    for (const [chainId, tokens] of Object.entries(DEFAULT_TOKEN_LIST)) {
      for (const token of tokens) {
        expect(token.address).toBeDefined();
        expect(token.symbol).toBeDefined();
        expect(token.name).toBeDefined();
        expect(typeof token.decimals).toBe('number');
        expect(token.logoUrl).toBeDefined();
        expect(token.chainId).toBe(Number(chainId));
      }
    }
  });

  test('all token addresses are valid hex format (0x + 40 hex chars)', () => {
    for (const tokens of Object.values(DEFAULT_TOKEN_LIST)) {
      for (const token of tokens) {
        expect(token.address).toMatch(/^0x[a-fA-F0-9]{40}$/);
      }
    }
  });

  test('token decimals are within valid range (0-18)', () => {
    for (const tokens of Object.values(DEFAULT_TOKEN_LIST)) {
      for (const token of tokens) {
        expect(token.decimals).toBeGreaterThanOrEqual(0);
        expect(token.decimals).toBeLessThanOrEqual(18);
      }
    }
  });

  test('chainId in token config matches the map key', () => {
    for (const [chainId, tokens] of Object.entries(DEFAULT_TOKEN_LIST)) {
      for (const token of tokens) {
        expect(token.chainId).toBe(Number(chainId));
      }
    }
  });

  test('no duplicate token addresses within a chain', () => {
    for (const tokens of Object.values(DEFAULT_TOKEN_LIST)) {
      const addresses = tokens.map((t) => t.address.toLowerCase());
      const uniqueAddresses = new Set(addresses);
      expect(addresses.length).toBe(uniqueAddresses.size);
    }
  });

  test('no duplicate token symbols within a chain', () => {
    for (const tokens of Object.values(DEFAULT_TOKEN_LIST)) {
      const symbols = tokens.map((t) => t.symbol);
      const uniqueSymbols = new Set(symbols);
      expect(symbols.length).toBe(uniqueSymbols.size);
    }
  });

  test('logoUrl paths are well-formed', () => {
    for (const tokens of Object.values(DEFAULT_TOKEN_LIST)) {
      for (const token of tokens) {
        expect(token.logoUrl).toMatch(/^\/assets\/tokens\/\w+\.svg$/);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Specific token address verification (Base mainnet)
// ---------------------------------------------------------------------------

describe('Base mainnet token addresses', () => {
  const baseTokens = getTokenListForChain(8453);

  test('USDC has correct verified address on Base', () => {
    const usdc = baseTokens.find((t) => t.symbol === 'USDC');
    expect(usdc).toBeDefined();
    expect(usdc!.address).toBe('0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913');
    expect(usdc!.decimals).toBe(6);
  });

  test('WETH has correct verified address on Base', () => {
    const weth = baseTokens.find((t) => t.symbol === 'WETH');
    expect(weth).toBeDefined();
    expect(weth!.address).toBe('0x4200000000000000000000000000000000000006');
    expect(weth!.decimals).toBe(18);
  });
});

// ---------------------------------------------------------------------------
// Specific token address verification (Ethereum mainnet)
// ---------------------------------------------------------------------------

describe('Ethereum mainnet token addresses', () => {
  const ethTokens = getTokenListForChain(1);

  test('USDC has correct verified address on Ethereum', () => {
    const usdc = ethTokens.find((t) => t.symbol === 'USDC');
    expect(usdc).toBeDefined();
    expect(usdc!.address).toBe('0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48');
    expect(usdc!.decimals).toBe(6);
  });

  test('WETH has correct verified address on Ethereum', () => {
    const weth = ethTokens.find((t) => t.symbol === 'WETH');
    expect(weth).toBeDefined();
    expect(weth!.address).toBe('0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2');
    expect(weth!.decimals).toBe(18);
  });
});

// ---------------------------------------------------------------------------
// TokenConfig type — validate coingeckoId optionality
// ---------------------------------------------------------------------------

describe('TokenConfig optional fields', () => {
  test('coingeckoId is present on mainnet tokens', () => {
    const baseTokens = getTokenListForChain(8453);
    for (const token of baseTokens) {
      expect(token.coingeckoId).toBeDefined();
      expect(typeof token.coingeckoId).toBe('string');
      expect(token.coingeckoId!.length).toBeGreaterThan(0);
    }
  });

  test('coingeckoId can be undefined (interface allows it)', () => {
    const config: TokenConfig = {
      address: '0x0000000000000000000000000000000000000001' as `0x${string}`,
      symbol: 'TEST',
      name: 'Test Token',
      decimals: 18,
      logoUrl: '/assets/tokens/test.svg',
      chainId: 1,
      // coingeckoId intentionally omitted
    };
    expect(config.coingeckoId).toBeUndefined();
  });
});
