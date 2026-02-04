/**
 * Contract Address Configuration
 *
 * ERC-8004 Identity, Reputation, and Prediction Market contract addresses.
 * Supports: localnet (Hardhat), Base Sepolia (staging), Base Mainnet, Ethereum Mainnet.
 *
 * @see packages/shared/src/config/default-config.ts for the canonical source
 */

import type { Address } from 'viem';
import {
  type CoreContractAddresses,
  areContractsDeployed as checkContractsDeployed,
  PUBLIC_CONFIG,
} from '../config';

// =============================================================================
// Types
// =============================================================================

/**
 * Contract addresses for ERC-8004 and prediction market operations
 */
export interface ERC8004ContractAddresses {
  identityRegistry: Address;
  reputationSystem: Address;
  diamond: Address;
  predictionMarketFacet: Address;
  oracleFacet: Address;
}

// =============================================================================
// Network Contract Exports
// =============================================================================

/** Localnet (Hardhat) - Chain ID: 31337 */
export const LOCAL_CONTRACTS: ERC8004ContractAddresses = {
  identityRegistry: PUBLIC_CONFIG.networks.local.contracts
    .identityRegistry as Address,
  reputationSystem: PUBLIC_CONFIG.networks.local.contracts
    .reputationSystem as Address,
  diamond: PUBLIC_CONFIG.networks.local.contracts.diamond as Address,
  predictionMarketFacet: PUBLIC_CONFIG.networks.local.contracts
    .predictionMarketFacet as Address,
  oracleFacet: PUBLIC_CONFIG.networks.local.contracts.oracleFacet as Address,
};

/** Base Sepolia (Staging) - Chain ID: 84532 */
export const BASE_SEPOLIA_CONTRACTS: ERC8004ContractAddresses = {
  identityRegistry: PUBLIC_CONFIG.networks.baseSepolia.contracts
    .identityRegistry as Address,
  reputationSystem: PUBLIC_CONFIG.networks.baseSepolia.contracts
    .reputationSystem as Address,
  diamond: PUBLIC_CONFIG.networks.baseSepolia.contracts.diamond as Address,
  predictionMarketFacet: PUBLIC_CONFIG.networks.baseSepolia.contracts
    .predictionMarketFacet as Address,
  oracleFacet: PUBLIC_CONFIG.networks.baseSepolia.contracts
    .oracleFacet as Address,
};

/** Base Mainnet (Production) - Chain ID: 8453 */
export const BASE_MAINNET_CONTRACTS: ERC8004ContractAddresses = {
  identityRegistry: PUBLIC_CONFIG.networks.base.contracts
    .identityRegistry as Address,
  reputationSystem: PUBLIC_CONFIG.networks.base.contracts
    .reputationSystem as Address,
  diamond: PUBLIC_CONFIG.networks.base.contracts.diamond as Address,
  predictionMarketFacet: PUBLIC_CONFIG.networks.base.contracts
    .predictionMarketFacet as Address,
  oracleFacet: PUBLIC_CONFIG.networks.base.contracts.oracleFacet as Address,
};

/** Ethereum Mainnet - Chain ID: 1 */
export const ETHEREUM_MAINNET_CONTRACTS: ERC8004ContractAddresses = {
  identityRegistry: PUBLIC_CONFIG.networks.ethereum.contracts
    .identityRegistry as Address,
  reputationSystem: PUBLIC_CONFIG.networks.ethereum.contracts
    .reputationSystem as Address,
  // Ethereum mainnet doesn't have prediction market contracts
  diamond: '0x0000000000000000000000000000000000000000' as Address,
  predictionMarketFacet: '0x0000000000000000000000000000000000000000' as Address,
  oracleFacet: '0x0000000000000000000000000000000000000000' as Address,
};

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Get contract addresses for the specified chain ID
 */
export function getERC8004ContractAddresses(
  chainId: number
): ERC8004ContractAddresses {
  switch (chainId) {
    case 1:
      return ETHEREUM_MAINNET_CONTRACTS;
    case 31337:
      return LOCAL_CONTRACTS;
    case 84532:
      return BASE_SEPOLIA_CONTRACTS;
    case 8453:
      return BASE_MAINNET_CONTRACTS;
    default:
      return BASE_SEPOLIA_CONTRACTS;
  }
}

/**
 * Check if contracts are deployed on the given chain
 */
export function areERC8004ContractsDeployed(chainId: number): boolean {
  return checkContractsDeployed(chainId);
}

export { CoreContractAddresses };
