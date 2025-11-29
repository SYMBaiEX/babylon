/**
 * Canonical Public Configuration for Babylon
 *
 * This module provides typed access to all public configuration values
 * including contract addresses, API endpoints, and game settings.
 *
 * Configuration is environment-aware:
 * - development: Uses local Hardhat network (chainId: 31337)
 * - staging: Uses Base Sepolia testnet (chainId: 84532)
 * - production: Uses Base Mainnet (chainId: 8453)
 *
 * Environment is detected from:
 * 1. NEXT_PUBLIC_CHAIN_ID (explicit chain selection)
 * 2. NODE_ENV (development/staging/production)
 *
 * Import this instead of reading from environment variables.
 */

import type { Address } from 'viem';
import configData from './public-config.json';

// =============================================================================
// Types
// =============================================================================

/** Core ERC-8004 contract addresses */
export interface CoreContractAddresses {
  diamond: Address;
  identityRegistry: Address;
  reputationSystem: Address;
  predictionMarketFacet: Address;
  oracleFacet: Address;
}

/** Extended contract addresses for local development */
export interface LocalContractAddresses extends CoreContractAddresses {
  liquidityPoolFacet: Address;
  perpetualMarketFacet: Address;
  referralSystemFacet: Address;
  banManager: Address;
  reportingSystem: Address;
  labelManager: Address;
  babylonOracle: Address;
  predimarket: Address;
  marketFactory: Address;
  contestOracle: Address;
  testToken: Address;
}

/** Network configuration */
export interface NetworkConfig {
  chainId: number;
  name: string;
  rpcUrl: string;
  contracts: CoreContractAddresses;
}

/** Local network configuration with extended contracts */
export interface LocalNetworkConfig extends Omit<NetworkConfig, 'contracts'> {
  contracts: LocalContractAddresses;
}

/** API endpoints configuration */
export interface EndpointsConfig {
  apiBaseUrl: string;
  a2aEndpoint: string;
  mcpEndpoint: string;
}

/** Environment configuration */
export interface EnvironmentConfig {
  network: string;
  endpoints: EndpointsConfig;
}

/** Game speed settings */
export interface GameSpeedSettings {
  /** Default game speed in milliseconds (time between events) */
  default: number;
  /** Minimum allowed game speed (fastest) - 1 second */
  min: number;
  /** Maximum allowed game speed (slowest) - 60 seconds */
  max: number;
}

/** Complete public configuration */
export interface PublicConfig {
  version: string;
  networks: {
    local: LocalNetworkConfig;
    baseSepolia: NetworkConfig;
    base: NetworkConfig;
    sepolia: NetworkConfig;
    mainnet: NetworkConfig;
  };
  environments: {
    development: EnvironmentConfig;
    staging: EnvironmentConfig;
    production: EnvironmentConfig;
  };
  gameSettings: {
    speed: GameSpeedSettings;
  };
}

// =============================================================================
// Configuration Access
// =============================================================================

/** The complete public configuration */
export const PUBLIC_CONFIG = configData as PublicConfig;

// =============================================================================
// Environment Detection
// =============================================================================

export type EnvironmentName = 'development' | 'staging' | 'production';
export type NetworkId = keyof typeof PUBLIC_CONFIG.networks;

/**
 * Chain ID to network ID mapping
 */
const CHAIN_ID_TO_NETWORK: Record<number, NetworkId> = {
  31337: 'local',
  84532: 'baseSepolia',
  8453: 'base',
  11155111: 'sepolia',
  1: 'mainnet',
};

/**
 * Network ID to environment mapping
 */
const NETWORK_TO_ENVIRONMENT: Record<NetworkId, EnvironmentName> = {
  local: 'development',
  baseSepolia: 'staging',
  base: 'production',
  sepolia: 'staging',
  mainnet: 'production',
};

/**
 * Detect current chain ID from environment
 *
 * Priority:
 * 1. NEXT_PUBLIC_CHAIN_ID env var
 * 2. Infer from NODE_ENV
 */
export function getCurrentChainId(): number {
  // Explicit chain ID takes priority
  const envChainId = process.env.NEXT_PUBLIC_CHAIN_ID;
  if (envChainId) {
    return Number.parseInt(envChainId, 10);
  }

  // Infer from NODE_ENV
  const nodeEnv = process.env.NODE_ENV;
  switch (nodeEnv) {
    case 'production':
      return 8453; // Base Mainnet
    case 'staging':
    case 'test':
      return 84532; // Base Sepolia
    default:
      return 31337; // Local Hardhat
  }
}

/**
 * Detect current environment name
 */
export function getCurrentEnvironment(): EnvironmentName {
  const chainId = getCurrentChainId();
  const networkId = CHAIN_ID_TO_NETWORK[chainId];
  return networkId ? NETWORK_TO_ENVIRONMENT[networkId] : 'development';
}

/**
 * Get current network ID
 */
export function getCurrentNetworkId(): NetworkId {
  const chainId = getCurrentChainId();
  return CHAIN_ID_TO_NETWORK[chainId] || 'local';
}

// =============================================================================
// Network Helpers
// =============================================================================

/**
 * Get network configuration by chain ID
 */
export function getNetworkByChainId(chainId: number): NetworkConfig {
  const networkId = CHAIN_ID_TO_NETWORK[chainId];
  if (!networkId) {
    // Default to local for unknown chains in development
    return PUBLIC_CONFIG.networks.local;
  }
  return PUBLIC_CONFIG.networks[networkId];
}

/**
 * Get network configuration by network ID
 */
export function getNetwork(networkId: NetworkId): NetworkConfig {
  return PUBLIC_CONFIG.networks[networkId];
}

/**
 * Get current network configuration based on environment
 */
export function getCurrentNetwork(): NetworkConfig {
  return getNetworkByChainId(getCurrentChainId());
}

/**
 * Get contract addresses for a chain ID
 */
export function getContractAddresses(
  chainId: number
): CoreContractAddresses | LocalContractAddresses {
  return getNetworkByChainId(chainId).contracts;
}

/**
 * Get contract addresses for current environment
 */
export function getCurrentContractAddresses(): CoreContractAddresses | LocalContractAddresses {
  return getContractAddresses(getCurrentChainId());
}

/**
 * Check if contracts are deployed on the given chain
 */
export function areContractsDeployed(chainId: number): boolean {
  const contracts = getContractAddresses(chainId);
  const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
  return contracts.identityRegistry !== ZERO_ADDRESS;
}

/**
 * Get RPC URL for current environment
 */
export function getCurrentRpcUrl(): string {
  // Allow override via env var
  if (process.env.NEXT_PUBLIC_RPC_URL) {
    return process.env.NEXT_PUBLIC_RPC_URL;
  }
  return getCurrentNetwork().rpcUrl;
}

// =============================================================================
// Environment Configuration
// =============================================================================

/**
 * Get environment configuration
 */
export function getEnvironmentConfig(env?: EnvironmentName): EnvironmentConfig {
  const envName = env || getCurrentEnvironment();
  return PUBLIC_CONFIG.environments[envName];
}

/**
 * Get endpoints for current environment
 */
export function getCurrentEndpoints(): EndpointsConfig {
  return getEnvironmentConfig().endpoints;
}

// =============================================================================
// Static Network Exports (for specific network access)
// =============================================================================

/** Local development contract addresses - use when chainId is 31337 */
export const LOCAL_CONTRACT_ADDRESSES = PUBLIC_CONFIG.networks.local
  .contracts as LocalContractAddresses;

/** Base Sepolia contract addresses - use when chainId is 84532 */
export const BASE_SEPOLIA_CONTRACT_ADDRESSES = PUBLIC_CONFIG.networks.baseSepolia
  .contracts as CoreContractAddresses;

/** Base Mainnet contract addresses - use when chainId is 8453 */
export const BASE_CONTRACT_ADDRESSES = PUBLIC_CONFIG.networks.base
  .contracts as CoreContractAddresses;

/** Ethereum Sepolia contract addresses - use when chainId is 11155111 */
export const SEPOLIA_CONTRACT_ADDRESSES = PUBLIC_CONFIG.networks.sepolia
  .contracts as CoreContractAddresses;

/** Ethereum Mainnet contract addresses - use when chainId is 1 */
export const MAINNET_CONTRACT_ADDRESSES = PUBLIC_CONFIG.networks.mainnet
  .contracts as CoreContractAddresses;

// =============================================================================
// Game Settings
// =============================================================================

/** Game speed settings */
export const GAME_SPEED = PUBLIC_CONFIG.gameSettings.speed;

/**
 * Validate game speed is within allowed range
 */
export function clampGameSpeed(speed: number): number {
  return Math.max(GAME_SPEED.min, Math.min(GAME_SPEED.max, speed));
}

/**
 * Check if game speed is valid
 */
export function isValidGameSpeed(speed: number): boolean {
  return speed >= GAME_SPEED.min && speed <= GAME_SPEED.max;
}

// =============================================================================
// Environment-Aware Contract Address Exports
// =============================================================================

// These are computed at runtime based on the current environment

/** Get diamond address for current environment */
export function getDiamondAddress(): Address {
  return getCurrentContractAddresses().diamond;
}

/** Get identity registry address for current environment */
export function getIdentityRegistry(): Address {
  return getCurrentContractAddresses().identityRegistry;
}

/** Get reputation system address for current environment */
export function getReputationSystem(): Address {
  return getCurrentContractAddresses().reputationSystem;
}

// =============================================================================
// Legacy Convenience Exports (for backward compatibility)
// =============================================================================

// These use LOCAL addresses by default for backward compatibility
// New code should use getCurrentContractAddresses() or the getter functions

/** Diamond proxy contract address (local/dev default) */
export const DIAMOND_ADDRESS = LOCAL_CONTRACT_ADDRESSES.diamond;

/** Identity registry contract address (local/dev default) */
export const IDENTITY_REGISTRY = LOCAL_CONTRACT_ADDRESSES.identityRegistry;

/** Reputation system contract address (local/dev default) */
export const REPUTATION_SYSTEM = LOCAL_CONTRACT_ADDRESSES.reputationSystem;

/** Ban manager contract address (local only) */
export const BAN_MANAGER = LOCAL_CONTRACT_ADDRESSES.banManager;

/** Reporting system contract address (local only) */
export const REPORTING_SYSTEM = LOCAL_CONTRACT_ADDRESSES.reportingSystem;

/** Label manager contract address (local only) */
export const LABEL_MANAGER = LOCAL_CONTRACT_ADDRESSES.labelManager;

/** Babylon oracle contract address (local only) */
export const BABYLON_ORACLE = LOCAL_CONTRACT_ADDRESSES.babylonOracle;

/** Predimarket contract address (local only) */
export const PREDIMARKET = LOCAL_CONTRACT_ADDRESSES.predimarket;

/** Market factory contract address (local only) */
export const MARKET_FACTORY = LOCAL_CONTRACT_ADDRESSES.marketFactory;

/** Contest oracle contract address (local only) */
export const CONTEST_ORACLE = LOCAL_CONTRACT_ADDRESSES.contestOracle;

/** Test token contract address (local only) */
export const TEST_TOKEN = LOCAL_CONTRACT_ADDRESSES.testToken;

/** Prediction market facet address (local/dev default) */
export const PREDICTION_MARKET_FACET = LOCAL_CONTRACT_ADDRESSES.predictionMarketFacet;

/** Oracle facet address (local/dev default) */
export const ORACLE_FACET = LOCAL_CONTRACT_ADDRESSES.oracleFacet;

/** Liquidity pool facet address (local only) */
export const LIQUIDITY_POOL_FACET = LOCAL_CONTRACT_ADDRESSES.liquidityPoolFacet;

/** Perpetual market facet address (local only) */
export const PERPETUAL_MARKET_FACET = LOCAL_CONTRACT_ADDRESSES.perpetualMarketFacet;

/** Referral system facet address (local only) */
export const REFERRAL_SYSTEM_FACET = LOCAL_CONTRACT_ADDRESSES.referralSystemFacet;

/** Base Sepolia reputation system address */
export const REPUTATION_SYSTEM_BASE_SEPOLIA =
  PUBLIC_CONFIG.networks.baseSepolia.contracts.reputationSystem;

/** Base Sepolia identity registry address */
export const IDENTITY_REGISTRY_BASE_SEPOLIA =
  PUBLIC_CONFIG.networks.baseSepolia.contracts.identityRegistry;

// =============================================================================
// Environment-Aware Endpoint Exports
// =============================================================================

/** Get A2A endpoint for current environment */
export function getA2AEndpoint(): string {
  return getCurrentEndpoints().a2aEndpoint;
}

/** Get MCP endpoint for current environment */
export function getMCPEndpoint(): string {
  return getCurrentEndpoints().mcpEndpoint;
}

/** Get API base URL for current environment */
export function getAPIBaseUrl(): string {
  return getCurrentEndpoints().apiBaseUrl;
}

// Legacy static exports (use production values for backward compatibility)
/** A2A WebSocket endpoint (production default) */
export const A2A_ENDPOINT = PUBLIC_CONFIG.environments.production.endpoints.a2aEndpoint;

/** MCP endpoint (production default) */
export const MCP_ENDPOINT = PUBLIC_CONFIG.environments.production.endpoints.mcpEndpoint;

/** API base URL (production default) */
export const API_BASE_URL = PUBLIC_CONFIG.environments.production.endpoints.apiBaseUrl;

// =============================================================================
// Development Helpers
// =============================================================================

/**
 * Check if running in local development mode
 */
export function isLocalDevelopment(): boolean {
  return getCurrentChainId() === 31337;
}

/**
 * Check if running in staging mode (Base Sepolia or Ethereum Sepolia)
 */
export function isStaging(): boolean {
  const chainId = getCurrentChainId();
  return chainId === 84532 || chainId === 11155111;
}

/**
 * Check if running in production mode (Base Mainnet or Ethereum Mainnet)
 */
export function isProduction(): boolean {
  const chainId = getCurrentChainId();
  return chainId === 8453 || chainId === 1;
}

/**
 * Check if on Base chain (Sepolia or Mainnet)
 */
export function isBaseChain(): boolean {
  const chainId = getCurrentChainId();
  return chainId === 84532 || chainId === 8453;
}

/**
 * Check if on Ethereum chain (Sepolia or Mainnet)
 */
export function isEthereumChain(): boolean {
  const chainId = getCurrentChainId();
  return chainId === 11155111 || chainId === 1;
}

/**
 * Log current environment configuration (for debugging)
 */
export function logEnvironmentConfig(): void {
  const env = getCurrentEnvironment();
  const network = getCurrentNetwork();
  const endpoints = getCurrentEndpoints();

  console.log('=== Babylon Environment Configuration ===');
  console.log(`Environment: ${env}`);
  console.log(`Network: ${network.name} (chainId: ${network.chainId})`);
  console.log(`RPC URL: ${getCurrentRpcUrl()}`);
  console.log(`API Base: ${endpoints.apiBaseUrl}`);
  console.log(`A2A: ${endpoints.a2aEndpoint}`);
  console.log(`MCP: ${endpoints.mcpEndpoint}`);
  console.log(`Diamond: ${getCurrentContractAddresses().diamond}`);
  console.log('==========================================');
}
