/**
 * Contract Address Configuration
 * 
 * ERC-8004 Identity, Reputation, and Prediction Market contract addresses.
 * Supports multiple networks: localnet, Base Sepolia, Ethereum Sepolia, Base Mainnet, Ethereum Mainnet.
 * 
 * Note: For ERC-8004 operations, prefer using the Agent0 SDK (@babylon/agents/agent0)
 * which handles registration, discovery, and reputation through the Agent0 network.
 * These addresses are for direct contract interactions when needed.
 */

import type { Address } from 'viem';

// Subset of contract addresses for ERC-8004 and prediction market operations
export interface ERC8004ContractAddresses {
  identityRegistry: Address;
  reputationSystem: Address;
  diamond: Address;
  predictionMarketFacet: Address;
  oracleFacet: Address;
}

// Localnet (Hardhat) - Chain ID: 31337
// Note: For dynamic localnet addresses, use @babylon/contracts/deployment
export const LOCAL_CONTRACTS: ERC8004ContractAddresses = {
  identityRegistry: (process.env.NEXT_PUBLIC_IDENTITY_REGISTRY_LOCAL ||
    '0x0000000000000000000000000000000000000000') as Address,
  reputationSystem: (process.env.NEXT_PUBLIC_REPUTATION_SYSTEM_LOCAL ||
    '0x0000000000000000000000000000000000000000') as Address,
  diamond: (process.env.NEXT_PUBLIC_DIAMOND_LOCAL ||
    '0x0000000000000000000000000000000000000000') as Address,
  predictionMarketFacet: (process.env.NEXT_PUBLIC_DIAMOND_LOCAL ||
    '0x0000000000000000000000000000000000000000') as Address,
  oracleFacet: (process.env.NEXT_PUBLIC_DIAMOND_LOCAL ||
    '0x0000000000000000000000000000000000000000') as Address,
};

// Base Sepolia (Primary Testnet) - Chain ID: 84532
export const BASE_SEPOLIA_CONTRACTS: ERC8004ContractAddresses = {
  identityRegistry: (process.env.NEXT_PUBLIC_IDENTITY_REGISTRY_BASE_SEPOLIA ||
    '0x0000000000000000000000000000000000000000') as Address,
  reputationSystem: (process.env.NEXT_PUBLIC_REPUTATION_SYSTEM_BASE_SEPOLIA ||
    '0x0000000000000000000000000000000000000000') as Address,
  diamond: (process.env.NEXT_PUBLIC_DIAMOND_BASE_SEPOLIA ||
    '0x0000000000000000000000000000000000000000') as Address,
  predictionMarketFacet: (process.env.NEXT_PUBLIC_DIAMOND_BASE_SEPOLIA ||
    '0x0000000000000000000000000000000000000000') as Address, // Diamond handles all facets
  oracleFacet: (process.env.NEXT_PUBLIC_DIAMOND_BASE_SEPOLIA ||
    '0x0000000000000000000000000000000000000000') as Address, // Diamond handles all facets
};

// Ethereum Sepolia (Legacy Testnet) - Chain ID: 11155111
// Note: Agent0 contracts are deployed on Ethereum Sepolia
export const SEPOLIA_CONTRACTS: ERC8004ContractAddresses = {
  identityRegistry: (process.env.NEXT_PUBLIC_IDENTITY_REGISTRY_SEPOLIA ||
    '0x0000000000000000000000000000000000000000') as Address,
  reputationSystem: (process.env.NEXT_PUBLIC_REPUTATION_SYSTEM_SEPOLIA ||
    '0x0000000000000000000000000000000000000000') as Address,
  diamond: (process.env.NEXT_PUBLIC_DIAMOND_SEPOLIA ||
    '0x0000000000000000000000000000000000000000') as Address,
  predictionMarketFacet: (process.env.NEXT_PUBLIC_DIAMOND_SEPOLIA ||
    '0x0000000000000000000000000000000000000000') as Address, // Diamond handles all facets
  oracleFacet: (process.env.NEXT_PUBLIC_DIAMOND_SEPOLIA ||
    '0x0000000000000000000000000000000000000000') as Address, // Diamond handles all facets
};

// Ethereum Mainnet - Chain ID: 1
export const MAINNET_CONTRACTS: ERC8004ContractAddresses = {
  identityRegistry: (process.env.NEXT_PUBLIC_IDENTITY_REGISTRY_MAINNET ||
    '0x0000000000000000000000000000000000000000') as Address,
  reputationSystem: (process.env.NEXT_PUBLIC_REPUTATION_SYSTEM_MAINNET ||
    '0x0000000000000000000000000000000000000000') as Address,
  diamond: (process.env.NEXT_PUBLIC_DIAMOND_MAINNET ||
    '0x0000000000000000000000000000000000000000') as Address,
  predictionMarketFacet: (process.env.NEXT_PUBLIC_DIAMOND_MAINNET ||
    '0x0000000000000000000000000000000000000000') as Address, // Diamond handles all facets
  oracleFacet: (process.env.NEXT_PUBLIC_DIAMOND_MAINNET ||
    '0x0000000000000000000000000000000000000000') as Address, // Diamond handles all facets
};

// Base Mainnet - Chain ID: 8453
export const BASE_MAINNET_CONTRACTS: ERC8004ContractAddresses = {
  identityRegistry: (process.env.NEXT_PUBLIC_IDENTITY_REGISTRY_BASE ||
    '0x0000000000000000000000000000000000000000') as Address,
  reputationSystem: (process.env.NEXT_PUBLIC_REPUTATION_SYSTEM_BASE ||
    '0x0000000000000000000000000000000000000000') as Address,
  diamond: (process.env.NEXT_PUBLIC_DIAMOND_BASE ||
    '0x0000000000000000000000000000000000000000') as Address,
  predictionMarketFacet: (process.env.NEXT_PUBLIC_DIAMOND_BASE ||
    '0x0000000000000000000000000000000000000000') as Address, // Diamond handles all facets
  oracleFacet: (process.env.NEXT_PUBLIC_DIAMOND_BASE ||
    '0x0000000000000000000000000000000000000000') as Address, // Diamond handles all facets
};

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
    case 31337: // Localnet
      return LOCAL_CONTRACTS;
    case 84532: // Base Sepolia (primary)
      return BASE_SEPOLIA_CONTRACTS;
    case 11155111: // Ethereum Sepolia (legacy, Agent0 network)
      return SEPOLIA_CONTRACTS;
    case 1: // Ethereum Mainnet
      return MAINNET_CONTRACTS;
    case 8453: // Base Mainnet
      return BASE_MAINNET_CONTRACTS;
    default:
      return BASE_SEPOLIA_CONTRACTS; // Default to Base Sepolia testnet
  }
}

/**
 * Check if contracts are deployed on the given chain
 * 
 * @param chainId - The chain ID to check
 * @returns True if identity registry is deployed (non-zero address)
 */
export function areERC8004ContractsDeployed(chainId: number): boolean {
  const contracts = getERC8004ContractAddresses(chainId);
  return (
    contracts.identityRegistry !== '0x0000000000000000000000000000000000000000'
  );
}

