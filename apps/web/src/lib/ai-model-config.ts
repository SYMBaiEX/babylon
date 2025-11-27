/**
 * AI Model Configuration Helper
 *
 * @description Loads system-wide AI model settings from database with in-memory
 * caching to avoid excessive database queries. Provides access to WANDB model
 * configuration and enables/disables WANDB integration.
 */

import { db, eq, systemSettings } from '@/db';

/**
 * AI Model Configuration
 *
 * @description Contains WANDB model configuration and enabled status.
 */
interface AIModelConfig {
  wandbModel: string | null;
  wandbEnabled: boolean;
}

let cachedConfig: AIModelConfig | null = null;
let lastFetch = 0;
const CACHE_TTL_MS = 60000; // 1 minute cache

/**
 * Get the current AI model configuration
 *
 * @description Retrieves AI model configuration from database with 1-minute
 * in-memory caching. Falls back to environment variables if database config
 * is not available.
 *
 * @returns {Promise<AIModelConfig>} Current AI model configuration
 *
 * @example
 * ```typescript
 * const config = await getAIModelConfig();
 * if (config.wandbEnabled && config.wandbModel) {
 *   // Use WANDB model
 * }
 * ```
 */
export async function getAIModelConfig(): Promise<AIModelConfig> {
  const now = Date.now();

  // Return cached config if still valid
  if (cachedConfig && now - lastFetch < CACHE_TTL_MS) {
    return cachedConfig;
  }

  const [settings] = await db
    .select({
      wandbModel: systemSettings.wandbModel,
      wandbEnabled: systemSettings.wandbEnabled,
    })
    .from(systemSettings)
    .where(eq(systemSettings.id, 'system'))
    .limit(1);

  const envWandbModel = process.env.WANDB_MODEL || null;
  const wandbApiKeyPresent = !!process.env.WANDB_API_KEY;

  cachedConfig = {
    wandbModel: settings?.wandbModel || envWandbModel,
    wandbEnabled: settings?.wandbEnabled ?? wandbApiKeyPresent,
  };
  lastFetch = now;

  return cachedConfig;
}

/**
 * Clear the configuration cache
 *
 * @description Clears the in-memory cache for AI model configuration. Call this
 * after updating the configuration in the database to force a fresh fetch.
 *
 * @returns {void}
 */
export function clearAIModelConfigCache(): void {
  cachedConfig = null;
  lastFetch = 0;
}

/**
 * Get the wandb model to use (from config or environment)
 *
 * @description Returns the WANDB model identifier if WANDB is enabled and
 * a model is configured. Falls back to environment variable if database config
 * is not available.
 *
 * @returns {Promise<string | undefined>} WANDB model identifier or undefined
 *
 * @example
 * ```typescript
 * const model = await getWandbModel();
 * if (model) {
 *   // Use WANDB model for inference
 * }
 * ```
 */
export async function getWandbModel(): Promise<string | undefined> {
  const config = await getAIModelConfig();

  if (config.wandbEnabled && config.wandbModel) {
    return config.wandbModel;
  }

  // Fallback to environment variable
  return process.env.WANDB_MODEL || undefined;
}
