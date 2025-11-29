/**
 * Contract Address Configuration
 *
 * ERC-8004 Identity, Reputation, and Prediction Market contract addresses.
 * Supports: localnet (Hardhat), Base Sepolia (staging), Base Mainnet (production),
 * Ethereum Sepolia, Ethereum Mainnet.
 *
 * Note: For ERC-8004 operations, prefer using the Agent0 SDK (@babylon/agents/agent0)
 * which handles registration, discovery, and reputation through the Agent0 network.
 * These addresses are for direct contract interactions when needed.
 *
 * @see packages/shared/src/config/public-config.json for the canonical source
 */

import type { Address } from 'viem';
import {
  PUBLIC_CONFIG,
  areContractsDeployed as checkContractsDeployed,
  type CoreContractAddresses,
} from '../config';

// =============================================================================
// Types
// =============================================================================

/**
 * Subset of contract addresses for ERC-8004 and prediction market operations
 * @deprecated Use CoreContractAddresses from @babylon/shared/config instead
 */
export interface ERC8004ContractAddresses {
  identityRegistry: Address;
  reputationSystem: Address;
  diamond: Address;
  predictionMarketFacet: Address;
  oracleFacet: Address;
}

// =============================================================================
// Network Contract Exports (Legacy Compatibility)
// =============================================================================

/**
 * Localnet (Hardhat) - Chain ID: 31337
 *
 * For dynamic localnet addresses, use @babylon/contracts/deployment
 */
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

/**
 * Base Sepolia (Staging Testnet) - Chain ID: 84532
 */
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

/**
 * Ethereum Sepolia (Testnet) - Chain ID: 11155111
 */
export const SEPOLIA_CONTRACTS: ERC8004ContractAddresses = {
  identityRegistry: PUBLIC_CONFIG.networks.sepolia.contracts
    .identityRegistry as Address,
  reputationSystem: PUBLIC_CONFIG.networks.sepolia.contracts
    .reputationSystem as Address,
  diamond: PUBLIC_CONFIG.networks.sepolia.contracts.diamond as Address,
  predictionMarketFacet: PUBLIC_CONFIG.networks.sepolia.contracts
    .predictionMarketFacet as Address,
  oracleFacet: PUBLIC_CONFIG.networks.sepolia.contracts.oracleFacet as Address,
};

/**
 * Ethereum Mainnet - Chain ID: 1
 */
export const MAINNET_CONTRACTS: ERC8004ContractAddresses = {
  identityRegistry: PUBLIC_CONFIG.networks.mainnet.contracts
    .identityRegistry as Address,
  reputationSystem: PUBLIC_CONFIG.networks.mainnet.contracts
    .reputationSystem as Address,
  diamond: PUBLIC_CONFIG.networks.mainnet.contracts.diamond as Address,
  predictionMarketFacet: PUBLIC_CONFIG.networks.mainnet.contracts
    .predictionMarketFacet as Address,
  oracleFacet: PUBLIC_CONFIG.networks.mainnet.contracts.oracleFacet as Address,
};

/**
 * Base Mainnet (Production) - Chain ID: 8453
 */
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

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Get contract addresses for the specified chain ID
 *
 * @param chainId - The chain ID to get addresses for
 * @returns Contract addresses for the chain
 */
export function getERC8004ContractAddresses(
  chainId: number
): ERC8004ContractAddresses {
  switch (chainId) {
    case 31337:
      return LOCAL_CONTRACTS;
    case 84532:
      return BASE_SEPOLIA_CONTRACTS;
    case 8453:
      return BASE_MAINNET_CONTRACTS;
    case 11155111:
      return SEPOLIA_CONTRACTS;
    case 1:
      return MAINNET_CONTRACTS;
    default:
      // Default to Base Sepolia for unknown chains
      return BASE_SEPOLIA_CONTRACTS;
  }
}

/**
 * Check if contracts are deployed on the given chain
 *
 * @param chainId - The chain ID to check
 * @returns True if identity registry is deployed (non-zero address)
 */
export function areERC8004ContractsDeployed(chainId: number): boolean {
  return checkContractsDeployed(chainId);
}

// =============================================================================
// Re-exports from config module
// =============================================================================

export { CoreContractAddresses };
