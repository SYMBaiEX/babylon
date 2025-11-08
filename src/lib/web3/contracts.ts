/**
 * Smart Contract Configuration
 * ERC-8004 Identity, Reputation, and Prediction Market contracts on Ethereum
 * Unified with Agent0 registry on the same chain
 */

import type { Address } from 'viem'

export interface ContractAddresses {
  identityRegistry: Address
  reputationSystem: Address
  diamond: Address
  predictionMarketFacet: Address
  oracleFacet: Address
}

// Ethereum Sepolia (Testnet) - Chain ID: 11155111
export const SEPOLIA_CONTRACTS: ContractAddresses = {
  identityRegistry: (process.env.NEXT_PUBLIC_IDENTITY_REGISTRY_SEPOLIA || '0x0000000000000000000000000000000000000000') as Address,
  reputationSystem: (process.env.NEXT_PUBLIC_REPUTATION_SYSTEM_SEPOLIA || '0x0000000000000000000000000000000000000000') as Address,
  diamond: (process.env.NEXT_PUBLIC_DIAMOND_SEPOLIA || '0x0000000000000000000000000000000000000000') as Address,
  predictionMarketFacet: (process.env.NEXT_PUBLIC_DIAMOND_SEPOLIA || '0x0000000000000000000000000000000000000000') as Address, // Diamond handles all facets
  oracleFacet: (process.env.NEXT_PUBLIC_DIAMOND_SEPOLIA || '0x0000000000000000000000000000000000000000') as Address, // Diamond handles all facets
}

// Ethereum Mainnet - Chain ID: 1
export const MAINNET_CONTRACTS: ContractAddresses = {
  identityRegistry: (process.env.NEXT_PUBLIC_IDENTITY_REGISTRY_MAINNET || '0x0000000000000000000000000000000000000000') as Address,
  reputationSystem: (process.env.NEXT_PUBLIC_REPUTATION_SYSTEM_MAINNET || '0x0000000000000000000000000000000000000000') as Address,
  diamond: (process.env.NEXT_PUBLIC_DIAMOND_MAINNET || '0x0000000000000000000000000000000000000000') as Address,
  predictionMarketFacet: (process.env.NEXT_PUBLIC_DIAMOND_MAINNET || '0x0000000000000000000000000000000000000000') as Address, // Diamond handles all facets
  oracleFacet: (process.env.NEXT_PUBLIC_DIAMOND_MAINNET || '0x0000000000000000000000000000000000000000') as Address, // Diamond handles all facets
}

/**
 * Get contract addresses for the current chain
 */
export function getContractAddresses(chainId: number): ContractAddresses {
  switch (chainId) {
    case 11155111: // Ethereum Sepolia
      return SEPOLIA_CONTRACTS
    case 1: // Ethereum Mainnet
      return MAINNET_CONTRACTS
    default:
      return SEPOLIA_CONTRACTS // Default to testnet
  }
}

/**
 * Check if contracts are deployed on the given chain
 */
export function areContractsDeployed(chainId: number): boolean {
  const contracts = getContractAddresses(chainId)
  return contracts.identityRegistry !== '0x0000000000000000000000000000000000000000'
}
