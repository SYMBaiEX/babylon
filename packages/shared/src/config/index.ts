/**
 * Canonical Public Configuration for Babylon
 *
 * Environment-aware configuration for contract addresses and endpoints.
 * Import this instead of reading from environment variables.
 */

import type { Address } from 'viem';
import configData from './public-config.json';

// =============================================================================
// Types
// =============================================================================

export interface CoreContractAddresses {
  diamond: Address;
  identityRegistry: Address;
  reputationSystem: Address;
  predictionMarketFacet: Address;
  oracleFacet: Address;
}

export interface LocalContractAddresses extends CoreContractAddresses {
  babylonOracle: Address;
}

export interface EthereumContractAddresses {
  identityRegistry: Address;
  reputationSystem: Address;
  nft: Address;
}

export interface NetworkConfig {
  chainId: number;
  name: string;
  rpcUrl: string;
  contracts: CoreContractAddresses | LocalContractAddresses;
}

export interface EthereumNetworkConfig {
  chainId: number;
  name: string;
  rpcUrl: string;
  contracts: EthereumContractAddresses;
}

export interface PublicConfig {
  version: string;
  networks: {
    local: NetworkConfig;
    baseSepolia: NetworkConfig;
    base: NetworkConfig;
    ethereum: EthereumNetworkConfig;
  };
  environments: {
    development: { network: string };
    staging: { network: string };
    production: { network: string };
  };
}

// =============================================================================
// Configuration
// =============================================================================

export const PUBLIC_CONFIG = configData as PublicConfig;

type NetworkId = 'local' | 'baseSepolia' | 'base';

const CHAIN_ID_TO_NETWORK: Record<number, NetworkId> = {
  31337: 'local',
  84532: 'baseSepolia',
  8453: 'base',
};

export function getCurrentChainId(): number {
  const envChainId = process.env.NEXT_PUBLIC_CHAIN_ID;
  if (envChainId) return Number.parseInt(envChainId, 10);

  // Default to local for development, Base Sepolia for test
  if (process.env.NODE_ENV === 'production') return 8453;
  if (process.env.NODE_ENV === 'test') return 84532;
  return 31337;
}

function getCurrentNetwork(): NetworkConfig {
  const networkId = CHAIN_ID_TO_NETWORK[getCurrentChainId()] || 'local';
  return PUBLIC_CONFIG.networks[networkId];
}

// =============================================================================
// Contract Addresses
// =============================================================================

export function getCurrentContractAddresses():
  | CoreContractAddresses
  | LocalContractAddresses {
  return getCurrentNetwork().contracts;
}

export function areContractsDeployed(chainId: number): boolean {
  const networkId = CHAIN_ID_TO_NETWORK[chainId] || 'local';
  const contracts = PUBLIC_CONFIG.networks[networkId].contracts;
  return (
    contracts.identityRegistry !== '0x0000000000000000000000000000000000000000'
  );
}

export const LOCAL_CONTRACT_ADDRESSES = PUBLIC_CONFIG.networks.local
  .contracts as LocalContractAddresses;
export const DIAMOND_ADDRESS = LOCAL_CONTRACT_ADDRESSES.diamond;
export const REPUTATION_SYSTEM_BASE_SEPOLIA = PUBLIC_CONFIG.networks.baseSepolia
  .contracts.reputationSystem as Address;
export const IDENTITY_REGISTRY_BASE_SEPOLIA = PUBLIC_CONFIG.networks.baseSepolia
  .contracts.identityRegistry as Address;

// =============================================================================
// RPC & Endpoints
// =============================================================================

export function getCurrentRpcUrl(): string {
  if (process.env.NEXT_PUBLIC_RPC_URL) return process.env.NEXT_PUBLIC_RPC_URL;
  return getCurrentNetwork().rpcUrl;
}

/**
 * Get the base URL for the application with intelligent fallback chain
 *
 * Priority order:
 * 1. NEXT_PUBLIC_APP_URL (explicit override for all environments)
 * 2. NEXT_PUBLIC_VERCEL_URL or VERCEL_URL (Vercel auto-set for preview/staging/production)
 * 3. http://localhost:3000 (local development fallback)
 *
 * This ensures:
 * - Production: Uses play.babylon.market (via NEXT_PUBLIC_APP_URL)
 * - Staging: Uses play.staging.babylon.market (via NEXT_PUBLIC_APP_URL)
 * - Preview: Uses unique Vercel URL (e.g., babylon-pr-123.vercel.app via VERCEL_URL)
 * - Local: Uses localhost:3000
 */
function getBaseUrl(): string {
  // 1. Explicit override (highest priority)
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL;
  }

  // 2. Vercel auto-set variables (preview/staging/production)
  const vercelUrl = process.env.NEXT_PUBLIC_VERCEL_URL || process.env.VERCEL_URL;
  if (vercelUrl) {
    // Vercel URLs don't include protocol, add https://
    return `https://${vercelUrl}`;
  }

  // 3. Local development fallback
  return 'http://localhost:3000';
}

export function getAPIBaseUrl(): string {
  return `${getBaseUrl()}/api`;
}

export function getA2AEndpoint(): string {
  const baseUrl = getBaseUrl();
  const protocol = baseUrl.startsWith('https') ? 'wss' : 'ws';
  const host = baseUrl.replace(/^https?:\/\//, '');
  return `${protocol}://${host}/ws/a2a`;
}

export function getMCPEndpoint(): string {
  return `${getBaseUrl()}/api/mcp`;
}
