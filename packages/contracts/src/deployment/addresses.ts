/**
 * @packageDocumentation
 * @module @babylon/contracts/deployment/addresses
 *
 * Contract Address Loader
 *
 * Loads deployed contract addresses based on the current network environment.
 * Supports localnet (Hardhat) and Base Sepolia testnet.
 *
 * @remarks Base mainnet support will be added when contracts are deployed.
 */

import baseSepoliaDeployment from '@babylon/contracts/deployments/base-sepolia';
import localDeployment from '@babylon/contracts/deployments/local';
import type { Address } from 'viem';

/**
 * Deployed contract addresses for the current network.
 */
export interface DeployedContracts {
  /** Diamond proxy contract address */
  diamond: Address;
  /** Babylon Game Oracle contract address */
  babylonOracle: Address;
  /** Predimarket contract address */
  predimarket: Address;
  /** Prediction Market Facet address */
  predictionMarketFacet: Address;
  /** ERC-8004 Identity Registry contract address */
  identityRegistry: Address;
  /** ERC-8004 Reputation System contract address */
  reputationSystem: Address;
  /** Chain ID for the network */
  chainId: number;
  /** Network name identifier */
  network: string;
}

/**
 * Get deployed contract addresses for the current network.
 *
 * Automatically detects the network from `NEXT_PUBLIC_CHAIN_ID` environment variable
 * and returns the corresponding contract addresses.
 *
 * @returns Contract addresses for the detected network
 * @throws Error if Base mainnet is detected (not yet deployed)
 *
 * @example
 * ```typescript
 * const addresses = getContractAddresses();
 * console.log(addresses.diamond); // Main Diamond proxy address
 * ```
 */
export function getContractAddresses(): DeployedContracts {
  const chainId = Number(process.env.NEXT_PUBLIC_CHAIN_ID || 31337);

  if (chainId === 31337) {
    return {
      diamond: localDeployment.contracts.diamond as Address,
      babylonOracle: localDeployment.contracts.babylonOracle as Address,
      predimarket: localDeployment.contracts.predimarket as Address,
      predictionMarketFacet: localDeployment.contracts
        .predictionMarketFacet as Address,
      identityRegistry: localDeployment.contracts.identityRegistry as Address,
      reputationSystem: localDeployment.contracts.reputationSystem as Address,
      chainId: 31337,
      network: 'localnet',
    };
  }

  if (chainId === 84532) {
    return {
      diamond: baseSepoliaDeployment.contracts.diamond as Address,
      babylonOracle: (process.env.NEXT_PUBLIC_BABYLON_ORACLE ||
        baseSepoliaDeployment.contracts.oracleFacet) as Address,
      predimarket: '0x0000000000000000000000000000000000000000' as Address,
      predictionMarketFacet: baseSepoliaDeployment.contracts
        .predictionMarketFacet as Address,
      identityRegistry: baseSepoliaDeployment.contracts
        .identityRegistry as Address,
      reputationSystem: baseSepoliaDeployment.contracts
        .reputationSystem as Address,
      chainId: 84532,
      network: 'base-sepolia',
    };
  }

  if (chainId === 8453) {
    throw new Error(
      'Base mainnet contracts are not yet deployed. Use localnet or base-sepolia.'
    );
  }

  return {
    diamond: localDeployment.contracts.diamond as Address,
    babylonOracle: localDeployment.contracts.babylonOracle as Address,
    predimarket: localDeployment.contracts.predimarket as Address,
    predictionMarketFacet: localDeployment.contracts
      .predictionMarketFacet as Address,
    identityRegistry: localDeployment.contracts.identityRegistry as Address,
    reputationSystem: localDeployment.contracts.reputationSystem as Address,
    chainId: 31337,
    network: 'localnet',
  };
}

/**
 * Check if the current environment is localnet (Hardhat).
 *
 * @returns `true` if chain ID is 31337 (Hardhat local network)
 */
export function isLocalnet(): boolean {
  const chainId = Number(process.env.NEXT_PUBLIC_CHAIN_ID || 31337);
  return chainId === 31337;
}

/**
 * Get the RPC URL for the current network.
 *
 * Returns the appropriate RPC endpoint based on the detected chain ID.
 * Falls back to localhost if no environment variable is set.
 *
 * @returns RPC URL string for the current network
 *
 * @example
 * ```typescript
 * const rpcUrl = getRpcUrl();
 * const provider = new ethers.JsonRpcProvider(rpcUrl);
 * ```
 */
export function getRpcUrl(): string {
  const chainId = Number(process.env.NEXT_PUBLIC_CHAIN_ID || 31337);

  if (chainId === 31337) {
    return process.env.NEXT_PUBLIC_RPC_URL || 'http://localhost:8545';
  }

  if (chainId === 84532) {
    return process.env.NEXT_PUBLIC_RPC_URL || 'https://sepolia.base.org';
  }

  if (chainId === 8453) {
    return process.env.NEXT_PUBLIC_RPC_URL || 'https://mainnet.base.org';
  }

  return process.env.NEXT_PUBLIC_RPC_URL || 'http://localhost:8545';
}

