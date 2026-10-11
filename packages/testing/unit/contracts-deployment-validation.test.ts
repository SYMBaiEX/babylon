/**
 * Deployment validation must never report success for empty expectations,
 * missing bytecode or reverted transactions.
 */

import { describe, expect, it } from 'bun:test';
import { ethers } from 'ethers';
import {
  validateDeploymentWithProvider,
  waitForTransaction,
} from '../../contracts/src/deployment/validation';

const DIAMOND = '0x1111111111111111111111111111111111111111';
const REGISTRY = '0x2222222222222222222222222222222222222222';
const REPUTATION = '0x3333333333333333333333333333333333333333';

function fakeProvider(deployed: Set<string>, chainId = 84532n) {
  return {
    getNetwork: async () => new ethers.Network('test', chainId),
    getCode: async (address: ethers.AddressLike) =>
      deployed.has(String(address)) ? '0x6000' : '0x',
    call: async () =>
      ethers.AbiCoder.defaultAbiCoder().encode(['uint256'], [0n]),
  };
}

const deployment = {
  chainId: 84532,
  contracts: {
    diamond: DIAMOND,
    identityRegistry: REGISTRY,
    reputationSystem: REPUTATION,
    diamondCutFacet: '',
    diamondLoupeFacet: '',
    predictionMarketFacet: '',
    oracleFacet: '',
  },
};

describe('validateDeploymentWithProvider', () => {
  it('passes when every listed contract has bytecode', async () => {
    const result = await validateDeploymentWithProvider(
      fakeProvider(new Set([DIAMOND, REGISTRY, REPUTATION])),
      deployment
    );
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it('fails for an empty expectation set instead of passing vacuously', async () => {
    const result = await validateDeploymentWithProvider(
      fakeProvider(new Set()),
      deployment,
      {}
    );
    expect(result.valid).toBe(false);
    expect(result.deployed).toBe(false);
    expect(result.errors).toContain('No contract addresses to validate');
  });

  it('fails when any listed contract lacks bytecode', async () => {
    const result = await validateDeploymentWithProvider(
      fakeProvider(new Set([DIAMOND, REGISTRY])),
      deployment
    );
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual([
      `reputationSystem not deployed at ${REPUTATION}`,
    ]);
  });

  it('fails on chain id mismatch', async () => {
    const result = await validateDeploymentWithProvider(
      fakeProvider(new Set([DIAMOND, REGISTRY, REPUTATION]), 1n),
      deployment
    );
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('Chain ID mismatch');
  });
});

describe('waitForTransaction', () => {
  function receiptProvider(status: number | null) {
    return {
      waitForTransaction: async () =>
        status === null
          ? null
          : ({ status } as unknown as ethers.TransactionReceipt),
    };
  }

  it('returns a successful receipt', async () => {
    const receipt = await waitForTransaction(receiptProvider(1), '0xabc');
    expect(receipt.status).toBe(1);
  });

  it('throws when the transaction reverted', async () => {
    await expect(
      waitForTransaction(receiptProvider(0), '0xabc')
    ).rejects.toThrow('reverted');
  });

  it('throws when no receipt is returned', async () => {
    await expect(
      waitForTransaction(receiptProvider(null), '0xabc')
    ).rejects.toThrow('was not mined');
  });
});
