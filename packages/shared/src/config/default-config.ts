/**
 * Default Configuration for Babylon
 *
 * This file contains all public, non-secret default values.
 * These can be overridden by environment variables where noted.
 *
 * Usage:
 *   import { getDefaultConfig } from '@babylon/shared/config/default-config';
 *   const config = getDefaultConfig();
 */

import type { Address } from 'viem';

// =============================================================================
// Types
// =============================================================================

/** Core contract addresses */
export interface CoreContractAddresses {
  diamond: Address;
  identityRegistry: Address;
  reputationSystem: Address;
  predictionMarketFacet: Address;
  oracleFacet: Address;
}

/** Local network has additional contracts */
export interface LocalContractAddresses extends CoreContractAddresses {
  babylonOracle: Address;
  prediMarket: Address;
  marketFactory: Address;
  contestOracle: Address;
  testToken: Address;
  banManager: Address;
  reportingSystem: Address;
  labelManager: Address;
}

/** Network configuration */
export interface NetworkConfig {
  chainId: number;
  name: string;
  rpcUrl: string;
  contracts: CoreContractAddresses | LocalContractAddresses;
}

/** API endpoints */
export interface EndpointsConfig {
  apiBaseUrl: string;
  a2aEndpoint: string;
  mcpEndpoint: string;
}

/** Perp/Settlement settings */
export interface PerpSettings {
  settlementMode: 'offchain' | 'onchain' | 'hybrid';
  hybridBatchInterval: number;
  hybridBatchSize: number;
}

/** Game speed settings */
export interface GameSpeedSettings {
  default: number;
  min: number;
  max: number;
}

/** Oracle configuration */
export interface OracleSettings {
  gasMultiplier: number;
  maxGasPrice: number;
  confirmations: number;
}

/** RL Training configuration */
export interface RLTrainingSettings {
  minTrajectories: number;
  minGroupSize: number;
  gameTickBudgetMs: number;
  baseModel: string;
  useRLModel: boolean;
  fallbackToBase: boolean;
  recordTrajectories: boolean;
}

/** Agent settings */
export interface AgentSettings {
  autoTrade: boolean;
  autoCreateWallets: boolean;
  agent0Enabled: boolean;
  agent0Network: string;
}

/** Complete public configuration */
export interface DefaultConfig {
  version: string;
  networks: {
    local: NetworkConfig;
    baseSepolia: NetworkConfig;
    base: NetworkConfig;
  };
  environments: {
    development: { network: string; endpoints: EndpointsConfig };
    staging: { network: string; endpoints: EndpointsConfig };
    production: { network: string; endpoints: EndpointsConfig };
  };
  perpSettings: PerpSettings;
  gameSpeed: GameSpeedSettings;
  oracle: OracleSettings;
  rlTraining: RLTrainingSettings;
  agent: AgentSettings;
  logging: {
    defaultLevel: 'debug' | 'info' | 'warn' | 'error';
  };
}

// =============================================================================
// Default Configuration
// =============================================================================

/**
 * Get the default configuration for Babylon.
 * All values here are public/non-secret defaults.
 * Environment variables can override these where appropriate.
 */
export function getDefaultConfig(): DefaultConfig {
  return {
    version: '1.0.0',

    // =========================================================================
    // Network Configuration
    // =========================================================================
    networks: {
      local: {
        chainId: 31337,
        name: 'Localnet (Hardhat)',
        rpcUrl: 'http://localhost:8545',
        contracts: {
          diamond: '0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9' as Address,
          identityRegistry: '0x0DCd1Bf9A1b36cE34237eEaFef220932846BCD82' as Address,
          reputationSystem: '0x9A676e781A523b5d0C0e43731313A708CB607508' as Address,
          predictionMarketFacet: '0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0' as Address,
          oracleFacet: '0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9' as Address,
          babylonOracle: '0xc6e7DF5E7b4f2A278906862b61205850344D4e7d' as Address,
          prediMarket: '0x59b670e9fA9D0A427751Af201D676719a970857b' as Address,
          marketFactory: '0x4ed7c70F96B99c776995fB64377f0d4aB3B0e1C1' as Address,
          contestOracle: '0x322813Fd9A801c5507c9de605d63CEA4f2CE6c44' as Address,
          testToken: '0x3Aa5ebB10DC797CAC828524e59A333d0A371443c' as Address,
          banManager: '0xa85233C63b9Ee964Add6F2cffe00Fd84eb32338f' as Address,
          reportingSystem: '0x7a2088a1bFc9d81c55368AE168C2C02570cB814F' as Address,
          labelManager: '0x4A679253410272dd5232B3Ff7cF5dbB88f295319' as Address,
        },
      },
      baseSepolia: {
        chainId: 84532,
        name: 'Base Sepolia (Staging)',
        rpcUrl: 'https://sepolia.base.org',
        contracts: {
          diamond: '0xdC3f0aD2f76Cea9379af897fa8EAD4A6d5e43990' as Address,
          identityRegistry: '0x4102F9b209796b53a18B063A438D05C7C9Af31A2' as Address,
          reputationSystem: '0x7960E6044bbeE480F5388be1903b3A1dd69c126D' as Address,
          predictionMarketFacet: '0x95A1aEe004de01267daDD1e55C1a3fc2818636cE' as Address,
          oracleFacet: '0x58A0Cd5307CdE4F2ccD8E2cA71510206F1365D9B' as Address,
        },
      },
      base: {
        chainId: 8453,
        name: 'Base Mainnet (Production)',
        rpcUrl: 'https://mainnet.base.org',
        contracts: {
          diamond: '0x0000000000000000000000000000000000000000' as Address,
          identityRegistry: '0x0000000000000000000000000000000000000000' as Address,
          reputationSystem: '0x0000000000000000000000000000000000000000' as Address,
          predictionMarketFacet: '0x0000000000000000000000000000000000000000' as Address,
          oracleFacet: '0x0000000000000000000000000000000000000000' as Address,
        },
      },
    },

    // =========================================================================
    // Environment-specific Endpoints
    // =========================================================================
    environments: {
      development: {
        network: 'local',
        endpoints: {
          apiBaseUrl: 'http://localhost:3000/api',
          a2aEndpoint: 'ws://localhost:3001/ws/a2a',
          mcpEndpoint: 'http://localhost:3000/mcp',
        },
      },
      staging: {
        network: 'baseSepolia',
        endpoints: {
          apiBaseUrl: 'https://staging.babylon.market/api',
          a2aEndpoint: 'wss://staging.babylon.market/ws/a2a',
          mcpEndpoint: 'https://staging.babylon.market/mcp',
        },
      },
      production: {
        network: 'base',
        endpoints: {
          apiBaseUrl: 'https://babylon.market/api',
          a2aEndpoint: 'wss://babylon.market/ws/a2a',
          mcpEndpoint: 'https://babylon.market/mcp',
        },
      },
    },

    // =========================================================================
    // Perp/Settlement Settings
    // Override with: NEXT_PUBLIC_PERP_SETTLEMENT_MODE, NEXT_PUBLIC_HYBRID_BATCH_*
    // =========================================================================
    perpSettings: {
      settlementMode: 'offchain',
      hybridBatchInterval: 3600000, // 1 hour
      hybridBatchSize: 100,
    },

    // =========================================================================
    // Game Speed Settings
    // Override with: GAME_SPEED_DEFAULT, GAME_SPEED_MIN, GAME_SPEED_MAX
    // =========================================================================
    gameSpeed: {
      default: 5000, // 5 seconds per game event
      min: 1000, // 1 second (fastest)
      max: 60000, // 60 seconds (slowest)
    },

    // =========================================================================
    // Oracle Settings
    // Override with: ORACLE_GAS_MULTIPLIER, ORACLE_MAX_GAS_PRICE, ORACLE_CONFIRMATIONS
    // =========================================================================
    oracle: {
      gasMultiplier: 1.2,
      maxGasPrice: 100, // gwei
      confirmations: 1,
    },

    // =========================================================================
    // RL Training Settings
    // Override with: TRAINING_*, GAME_TICK_BUDGET_MS, BASE_MODEL, USE_RL_MODEL, etc.
    // =========================================================================
    rlTraining: {
      minTrajectories: 1000,
      minGroupSize: 5,
      gameTickBudgetMs: 180000, // 3 minutes
      baseModel: 'OpenPipe/Qwen3-14B-Instruct',
      useRLModel: true,
      fallbackToBase: true,
      recordTrajectories: true,
    },

    // =========================================================================
    // Agent Settings
    // Override with: AGENT_AUTO_TRADE, AUTO_CREATE_AGENT_WALLETS, AGENT0_*
    // =========================================================================
    agent: {
      autoTrade: true,
      autoCreateWallets: true,
      agent0Enabled: true,
      agent0Network: 'sepolia',
    },

    // =========================================================================
    // Logging
    // Override with: LOG_LEVEL
    // =========================================================================
    logging: {
      defaultLevel: 'info',
    },
  };
}

// =============================================================================
// Singleton instance for convenience
// =============================================================================

let _configInstance: DefaultConfig | null = null;

/**
 * Get the singleton config instance.
 * Use this for most cases to avoid repeated object creation.
 */
export function getConfig(): DefaultConfig {
  if (!_configInstance) {
    _configInstance = getDefaultConfig();
  }
  return _configInstance;
}

/**
 * Reset the singleton config (useful for testing).
 */
export function resetConfig(): void {
  _configInstance = null;
}
