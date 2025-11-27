/**
 * RL Model Configuration
 *
 * Controls when and how RL-trained models are used for inference.
 * Designed to be:
 * - Enabled by default in local development
 * - Disabled by default in production
 * - Easy to toggle via environment variables
 */

export interface RLModelConfig {
  enabled: boolean;
  atroposApiUrl?: string;
  vllmPort?: number;
  modelVersion?: string; // If specified, use this version. Otherwise use latest.
  fallbackToBase: boolean; // If RL model fails, fall back to base model
  baseModel: string;
}

/**
 * Get RL model configuration from environment
 */
export function getRLModelConfig(): RLModelConfig {
  const isProduction = process.env.NODE_ENV === 'production';
  const isLocal = process.env.NODE_ENV === 'development' || !isProduction;

  // Explicit enable/disable flag
  const explicitFlag = process.env.USE_RL_MODEL;

  // Determine if enabled:
  // - If USE_RL_MODEL is explicitly set, use that value
  // - Otherwise, enabled in local, disabled in production
  const enabled = explicitFlag ? explicitFlag === 'true' : isLocal;

  return {
    enabled,
    atroposApiUrl: process.env.ATROPOS_API_URL || 'http://localhost:8000',
    vllmPort: parseInt(process.env.VLLM_PORT || '9001', 10),
    modelVersion: process.env.RL_MODEL_VERSION, // Optional: pin to specific version
    fallbackToBase: process.env.RL_FALLBACK_TO_BASE !== 'false', // Default: true
    baseModel: process.env.BASE_MODEL || 'unsloth/Qwen3-4B-128K', // 4B params, 128K context - ideal for fine-tuning
  };
}

/**
 * Check if RL models are available and configured
 */
export function isRLModelAvailable(): boolean {
  const config = getRLModelConfig();

  if (!config.enabled) {
    return false;
  }

  // Need Atropos API URL to fetch RL models
  if (!config.atroposApiUrl) {
    console.warn(
      'RL models enabled but Atropos API URL missing. Set ATROPOS_API_URL.'
    );
    return false;
  }

  return true;
}

/**
 * Log configuration on startup
 */
export function logRLModelConfig(): void {
  const config = getRLModelConfig();
  const available = isRLModelAvailable();

  console.log('🤖 RL Model Configuration:', {
    enabled: config.enabled,
    available,
    atroposConfigured: !!config.atroposApiUrl,
    vllmPort: config.vllmPort,
    pinnedVersion: config.modelVersion || 'latest',
    fallbackEnabled: config.fallbackToBase,
    baseModel: config.baseModel,
  });
}
