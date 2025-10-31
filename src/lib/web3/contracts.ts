/**
 * Smart Contract Configuration
 * ERC-8004 Identity, Reputation, and Prediction Market contracts on Base L2
 */

import type { Address } from 'viem'

export interface ContractAddresses {
  identityRegistry: Address
  reputationSystem: Address
  diamond: Address
  predictionMarketFacet: Address
  oracleFacet: Address
}

// Base Sepolia (Testnet) - Chain ID: 84532
export const BASE_SEPOLIA_CONTRACTS: ContractAddresses = {
  identityRegistry: (process.env.NEXT_PUBLIC_IDENTITY_REGISTRY_BASE_SEPOLIA || '0x0000000000000000000000000000000000000000') as Address,
  reputationSystem: (process.env.NEXT_PUBLIC_REPUTATION_SYSTEM_BASE_SEPOLIA || '0x0000000000000000000000000000000000000000') as Address,
  diamond: (process.env.NEXT_PUBLIC_DIAMOND_BASE_SEPOLIA || '0x0000000000000000000000000000000000000000') as Address,
  predictionMarketFacet: (process.env.NEXT_PUBLIC_DIAMOND_BASE_SEPOLIA || '0x0000000000000000000000000000000000000000') as Address, // Diamond handles all facets
  oracleFacet: (process.env.NEXT_PUBLIC_DIAMOND_BASE_SEPOLIA || '0x0000000000000000000000000000000000000000') as Address, // Diamond handles all facets
}

// Base Mainnet - Chain ID: 8453
export const BASE_MAINNET_CONTRACTS: ContractAddresses = {
  identityRegistry: (process.env.NEXT_PUBLIC_IDENTITY_REGISTRY_BASE || '0x0000000000000000000000000000000000000000') as Address,
  reputationSystem: (process.env.NEXT_PUBLIC_REPUTATION_SYSTEM_BASE || '0x0000000000000000000000000000000000000000') as Address,
  diamond: (process.env.NEXT_PUBLIC_DIAMOND_BASE || '0x0000000000000000000000000000000000000000') as Address,
  predictionMarketFacet: (process.env.NEXT_PUBLIC_DIAMOND_BASE || '0x0000000000000000000000000000000000000000') as Address, // Diamond handles all facets
  oracleFacet: (process.env.NEXT_PUBLIC_DIAMOND_BASE || '0x0000000000000000000000000000000000000000') as Address, // Diamond handles all facets
}

/**
 * Get contract addresses for the current chain
 */
export function getContractAddresses(chainId: number): ContractAddresses {
  switch (chainId) {
    case 84532: // Base Sepolia
      return BASE_SEPOLIA_CONTRACTS
    case 8453: // Base Mainnet
      return BASE_MAINNET_CONTRACTS
    default:
      return BASE_SEPOLIA_CONTRACTS // Default to testnet
  }
}

/**
 * Check if contracts are deployed on the given chain
 */
export function areContractsDeployed(chainId: number): boolean {
  const contracts = getContractAddresses(chainId)
  return contracts.identityRegistry !== '0x0000000000000000000000000000000000000000'
}
