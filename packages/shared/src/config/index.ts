/**
 * Canonical Public Configuration for Babylon
 *
 * Environment-aware configuration for contract addresses and endpoints.
 * Import this instead of reading from environment variables.
 *
 * Environment detection:
 * 1. NEXT_PUBLIC_CHAIN_ID (explicit chain selection)
 * 2. NODE_ENV (development/staging/production)
 */

import type { Address } from 'viem';
import {
  getConfig,
  getDefaultConfig,
  resetConfig,
  type CoreContractAddresses,
  type DefaultConfig,
  type EndpointsConfig,
  type LocalContractAddresses,
  type NetworkConfig,
  type PerpSettings,
  type GameSpeedSettings,
  type OracleSettings,
  type RLTrainingSettings,
  type AgentSettings,
} from './default-config';

// =============================================================================
// Re-export types
// =============================================================================

export type {
  CoreContractAddresses,
  LocalContractAddresses,
  NetworkConfig,
  EndpointsConfig,
  PerpSettings,
  GameSpeedSettings,
  OracleSettings,
  RLTrainingSettings,
  AgentSettings,
  DefaultConfig as PublicConfig,
};

// Re-export config functions
export { getConfig, getDefaultConfig, resetConfig };

// =============================================================================
// Configuration Access (legacy alias)
// =============================================================================

export const PUBLIC_CONFIG = getConfig();

// =============================================================================
// Environment Detection
// =============================================================================

type NetworkId = 'local' | 'baseSepolia' | 'base';
type EnvironmentName = 'development' | 'staging' | 'production';

const CHAIN_ID_TO_NETWORK: Record<number, NetworkId> = {
  31337: 'local',
  84532: 'baseSepolia',
  8453: 'base',
};

const NETWORK_TO_ENVIRONMENT: Record<NetworkId, EnvironmentName> = {
  local: 'development',
  baseSepolia: 'staging',
  base: 'production',
};

/**
 * Get current chain ID from environment
 */
export function getCurrentChainId(): number {
  const envChainId = process.env.NEXT_PUBLIC_CHAIN_ID;
  if (envChainId) {
    return Number.parseInt(envChainId, 10);
  }

  const nodeEnv = process.env.NODE_ENV;
  switch (nodeEnv) {
    case 'production':
      return 8453;
    case 'test':
      return 84532;
    default:
      return 31337;
  }
}

function getCurrentEnvironment(): EnvironmentName {
  const chainId = getCurrentChainId();
  const networkId = CHAIN_ID_TO_NETWORK[chainId];
  return networkId ? NETWORK_TO_ENVIRONMENT[networkId] : 'development';
}

function getCurrentNetwork(): NetworkConfig {
  const chainId = getCurrentChainId();
  const networkId = CHAIN_ID_TO_NETWORK[chainId] || 'local';
  return PUBLIC_CONFIG.networks[networkId];
}

function getCurrentEndpoints(): EndpointsConfig {
  return PUBLIC_CONFIG.environments[getCurrentEnvironment()].endpoints;
}

// =============================================================================
// Contract Addresses
// =============================================================================

/**
 * Get contract addresses for current environment
 */
export function getCurrentContractAddresses(): CoreContractAddresses | LocalContractAddresses {
  return getCurrentNetwork().contracts;
}

/**
 * Check if contracts are deployed (not zero address)
 */
export function areContractsDeployed(chainId: number): boolean {
  const networkId = CHAIN_ID_TO_NETWORK[chainId] || 'local';
  const contracts = PUBLIC_CONFIG.networks[networkId].contracts;
  return contracts.identityRegistry !== '0x0000000000000000000000000000000000000000';
}

/** Local contract addresses */
export const LOCAL_CONTRACT_ADDRESSES = PUBLIC_CONFIG.networks.local
  .contracts as LocalContractAddresses;

/** Diamond address (local default) */
export const DIAMOND_ADDRESS = LOCAL_CONTRACT_ADDRESSES.diamond;

/** Base Sepolia reputation system */
export const REPUTATION_SYSTEM_BASE_SEPOLIA =
  PUBLIC_CONFIG.networks.baseSepolia.contracts.reputationSystem as Address;

/** Base Sepolia identity registry */
export const IDENTITY_REGISTRY_BASE_SEPOLIA =
  PUBLIC_CONFIG.networks.baseSepolia.contracts.identityRegistry as Address;

// =============================================================================
// RPC & Endpoints
// =============================================================================

/**
 * Get RPC URL for current environment (with env var override)
 */
export function getCurrentRpcUrl(): string {
  if (process.env.NEXT_PUBLIC_RPC_URL) {
    return process.env.NEXT_PUBLIC_RPC_URL;
  }
  return getCurrentNetwork().rpcUrl;
}

/** Get API base URL for current environment */
export function getAPIBaseUrl(): string {
  return getCurrentEndpoints().apiBaseUrl;
}

/** Get A2A endpoint for current environment */
export function getA2AEndpoint(): string {
  return getCurrentEndpoints().a2aEndpoint;
}

/** Get MCP endpoint for current environment */
export function getMCPEndpoint(): string {
  return getCurrentEndpoints().mcpEndpoint;
}

// =============================================================================
// Perp Settings
// =============================================================================

/** Get settlement mode */
export function getSettlementMode(): 'offchain' | 'onchain' | 'hybrid' {
  const envMode = process.env.NEXT_PUBLIC_PERP_SETTLEMENT_MODE;
  if (envMode === 'offchain' || envMode === 'onchain' || envMode === 'hybrid') {
    return envMode;
  }
  return PUBLIC_CONFIG.perpSettings.settlementMode;
}

/** Get hybrid batch interval in ms */
export function getHybridBatchInterval(): number {
  const envValue = process.env.NEXT_PUBLIC_HYBRID_BATCH_INTERVAL;
  if (envValue) return Number.parseInt(envValue, 10);
  return PUBLIC_CONFIG.perpSettings.hybridBatchInterval;
}

/** Get hybrid batch size */
export function getHybridBatchSize(): number {
  const envValue = process.env.NEXT_PUBLIC_HYBRID_BATCH_SIZE;
  if (envValue) return Number.parseInt(envValue, 10);
  return PUBLIC_CONFIG.perpSettings.hybridBatchSize;
}

// =============================================================================
// Game Speed Settings
// =============================================================================

/** Get default game speed in ms */
export function getGameSpeedDefault(): number {
  const envValue = process.env.GAME_SPEED_DEFAULT;
  if (envValue) return Number.parseInt(envValue, 10);
  return PUBLIC_CONFIG.gameSpeed.default;
}

/** Get minimum game speed in ms */
export function getGameSpeedMin(): number {
  const envValue = process.env.GAME_SPEED_MIN;
  if (envValue) return Number.parseInt(envValue, 10);
  return PUBLIC_CONFIG.gameSpeed.min;
}

/** Get maximum game speed in ms */
export function getGameSpeedMax(): number {
  const envValue = process.env.GAME_SPEED_MAX;
  if (envValue) return Number.parseInt(envValue, 10);
  return PUBLIC_CONFIG.gameSpeed.max;
}

// =============================================================================
// Oracle Settings
// =============================================================================

/** Get oracle gas multiplier */
export function getOracleGasMultiplier(): number {
  const envValue = process.env.ORACLE_GAS_MULTIPLIER;
  if (envValue) return Number.parseFloat(envValue);
  return PUBLIC_CONFIG.oracle.gasMultiplier;
}

/** Get oracle max gas price in gwei */
export function getOracleMaxGasPrice(): number {
  const envValue = process.env.ORACLE_MAX_GAS_PRICE;
  if (envValue) return Number.parseInt(envValue, 10);
  return PUBLIC_CONFIG.oracle.maxGasPrice;
}

/** Get oracle confirmations */
export function getOracleConfirmations(): number {
  const envValue = process.env.ORACLE_CONFIRMATIONS;
  if (envValue) return Number.parseInt(envValue, 10);
  return PUBLIC_CONFIG.oracle.confirmations;
}

// =============================================================================
// RL Training Settings
// =============================================================================

/** Get minimum trajectories for training */
export function getTrainingMinTrajectories(): number {
  const envValue = process.env.TRAINING_MIN_TRAJECTORIES;
  if (envValue) return Number.parseInt(envValue, 10);
  return PUBLIC_CONFIG.rlTraining.minTrajectories;
}

/** Get minimum group size for GRPO */
export function getTrainingMinGroupSize(): number {
  const envValue = process.env.TRAINING_MIN_GROUP_SIZE;
  if (envValue) return Number.parseInt(envValue, 10);
  return PUBLIC_CONFIG.rlTraining.minGroupSize;
}

/** Get game tick budget in ms */
export function getGameTickBudgetMs(): number {
  const envValue = process.env.GAME_TICK_BUDGET_MS;
  if (envValue) return Number.parseInt(envValue, 10);
  return PUBLIC_CONFIG.rlTraining.gameTickBudgetMs;
}

/** Get base model for RL */
export function getBaseModel(): string {
  const envValue = process.env.BASE_MODEL;
  if (envValue) return envValue;
  return PUBLIC_CONFIG.rlTraining.baseModel;
}

/** Check if RL model is enabled */
export function isRLModelEnabled(): boolean {
  const envValue = process.env.USE_RL_MODEL;
  if (envValue !== undefined) return envValue === 'true';
  return PUBLIC_CONFIG.rlTraining.useRLModel;
}

/** Check if fallback to base is enabled */
export function isRLFallbackEnabled(): boolean {
  const envValue = process.env.RL_FALLBACK_TO_BASE;
  if (envValue !== undefined) return envValue === 'true';
  return PUBLIC_CONFIG.rlTraining.fallbackToBase;
}

/** Check if trajectory recording is enabled */
export function isTrajectoryRecordingEnabled(): boolean {
  const envValue = process.env.RECORD_AGENT_TRAJECTORIES;
  if (envValue !== undefined) return envValue === 'true';
  return PUBLIC_CONFIG.rlTraining.recordTrajectories;
}

// =============================================================================
// Agent Settings
// =============================================================================

/** Check if agent auto trade is enabled */
export function isAgentAutoTradeEnabled(): boolean {
  const envValue = process.env.AGENT_AUTO_TRADE;
  if (envValue !== undefined) return envValue === 'true';
  return PUBLIC_CONFIG.agent.autoTrade;
}

/** Check if auto wallet creation is enabled */
export function isAutoCreateAgentWalletsEnabled(): boolean {
  const envValue = process.env.AUTO_CREATE_AGENT_WALLETS;
  if (envValue !== undefined) return envValue === 'true';
  return PUBLIC_CONFIG.agent.autoCreateWallets;
}

/** Check if Agent0 is enabled */
export function isAgent0Enabled(): boolean {
  const envValue = process.env.AGENT0_ENABLED;
  if (envValue !== undefined) return envValue === 'true';
  return PUBLIC_CONFIG.agent.agent0Enabled;
}

/** Get Agent0 network */
export function getAgent0Network(): string {
  const envValue = process.env.AGENT0_NETWORK;
  if (envValue) return envValue;
  return PUBLIC_CONFIG.agent.agent0Network;
}

// =============================================================================
// Logging
// =============================================================================

/** Get log level */
export function getLogLevel(): 'debug' | 'info' | 'warn' | 'error' {
  const envValue = process.env.LOG_LEVEL;
  if (envValue === 'debug' || envValue === 'info' || envValue === 'warn' || envValue === 'error') {
    return envValue;
  }
  return PUBLIC_CONFIG.logging.defaultLevel;
}
