/**
 * Runtime Configuration - Centralized, typed environment config.
 */

const DEFAULT_BUDGET_MS = 180000;
const DEFAULT_RESERVE_MS = 60000;

export const GAME_TICK_CONFIG = {
  budgetMs: Number(process.env.GAME_TICK_BUDGET_MS) || DEFAULT_BUDGET_MS,
  criticalOpsReserveMs: DEFAULT_RESERVE_MS,
  getContentDeadline: (startedAt: number) =>
    startedAt +
    (Number(process.env.GAME_TICK_BUDGET_MS) || DEFAULT_BUDGET_MS) -
    DEFAULT_RESERVE_MS,
  getDeadline: (startedAt: number) =>
    startedAt + (Number(process.env.GAME_TICK_BUDGET_MS) || DEFAULT_BUDGET_MS),
} as const;

export const MARKET_DECISION_CONFIG = {
  model: process.env.MARKET_DECISION_MODEL || 'qwen/qwen3-32b',
  maxOutputTokens:
    Number(process.env.MARKET_DECISION_MAX_OUTPUT_TOKENS) || 32000,
  strictValidation: process.env.STRICT_LLM_VALIDATION === 'true',
} as const;

export const ORACLE_CONFIG = {
  address: process.env.NEXT_PUBLIC_BABYLON_ORACLE,
  privateKey: process.env.ORACLE_PRIVATE_KEY,
  isConfigured: () =>
    !!(
      process.env.NEXT_PUBLIC_BABYLON_ORACLE && process.env.ORACLE_PRIVATE_KEY
    ),
} as const;

export const WORLD_FACTS_CONFIG = {
  updateIntervalHours:
    Number(process.env.WORLD_FACTS_UPDATE_INTERVAL_HOURS) || 8,
  updateIntervalMs:
    (Number(process.env.WORLD_FACTS_UPDATE_INTERVAL_HOURS) || 8) * 3600000,
  lockDurationMinutes:
    Number(process.env.WORLD_FACTS_LOCK_DURATION_MINUTES) || 30,
  lockDurationMs:
    (Number(process.env.WORLD_FACTS_LOCK_DURATION_MINUTES) || 30) * 60000,
} as const;

export const BLOCKCHAIN_CONFIG = {
  deployerPrivateKey: process.env.DEPLOYER_PRIVATE_KEY,
  isConfigured: () => !!process.env.DEPLOYER_PRIVATE_KEY,
} as const;

export const ENV_CONFIG = {
  nodeEnv: process.env.NODE_ENV || 'development',
  isProduction: process.env.NODE_ENV === 'production',
  isTest: process.env.NODE_ENV === 'test' || process.env.BUN_ENV === 'test',
  isDevelopment:
    process.env.NODE_ENV === 'development' || !process.env.NODE_ENV,
} as const;

export function hasTimeRemaining(deadline: number): boolean {
  return Date.now() < deadline;
}

export function getTimeRemaining(deadline: number): number {
  return Math.max(0, deadline - Date.now());
}

export function createDeadline(budgetMs: number): number {
  return Date.now() + budgetMs;
}

export const RUNTIME_CONFIG = {
  gameTick: GAME_TICK_CONFIG,
  marketDecision: MARKET_DECISION_CONFIG,
  oracle: ORACLE_CONFIG,
  worldFacts: WORLD_FACTS_CONFIG,
  blockchain: BLOCKCHAIN_CONFIG,
  env: ENV_CONFIG,
} as const;
