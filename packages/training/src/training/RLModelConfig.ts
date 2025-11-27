/**
 * RL Model Configuration
 *
 * Controls when and how RL-trained models are used for inference.
 * Designed to be:
 * - Enabled by default in local development
 * - Disabled by default in production
 * - Easy to toggle via environment variables
 * - Scalable to larger models when more memory is available
 */

/**
 * Model tiers for scaling based on available resources
 * Supports automatic selection based on GPU memory
 */
export type ModelTier = 'small' | 'medium' | 'large' | 'xlarge';

export interface ModelTierConfig {
  name: string;
  model: string;
  params: string;
  context: number;
  minVramGb: number;
}

/**
 * Available model tiers - scale up when resources allow
 * All models have 128K context (critical requirement)
 */
export const MODEL_TIERS: Record<ModelTier, ModelTierConfig> = {
  small: {
    name: 'Small (4B)',
    model: 'unsloth/Qwen3-4B-128K',
    params: '4B',
    context: 131072, // 128K context
    minVramGb: 8,
  },
  medium: {
    name: 'Medium (8B)',
    model: 'unsloth/Qwen3-8B-128K',
    params: '8B',
    context: 131072, // 128K context
    minVramGb: 16,
  },
  large: {
    name: 'Large (14B)',
    model: 'unsloth/Qwen3-14B-128K',
    params: '14B',
    context: 131072, // 128K context
    minVramGb: 24,
  },
  xlarge: {
    name: 'XLarge (32B)',
    model: 'unsloth/Qwen3-32B-128K',
    params: '32B',
    context: 131072, // 128K context
    minVramGb: 48,
  },
};

export interface RLModelConfig {
  enabled: boolean;
  atroposApiUrl?: string;
  vllmPort?: number;
  modelVersion?: string; // If specified, use this version. Otherwise use latest.
  fallbackToBase: boolean; // If RL model fails, fall back to base model
  baseModel: string;
  modelTier: ModelTier;
  availableVramGb?: number; // Auto-detected or set via env
}

/**
 * Archetype-specific model configuration
 * Allows different trained models per agent archetype
 */
export interface ArchetypeModelConfig {
  archetype: string;
  modelId: string;
  modelPath: string;
  baseModel: string;
  trainedAt?: Date;
  benchmarkScore?: number;
}

/**
 * Registry of trained models per archetype
 * Maps archetype -> best available model
 */
const archetypeModelRegistry: Map<string, ArchetypeModelConfig> = new Map();

/**
 * Register a trained model for an archetype
 */
export function registerArchetypeModel(config: ArchetypeModelConfig): void {
  const existing = archetypeModelRegistry.get(config.archetype);
  
  // Only replace if new model is better or no existing model
  if (!existing || (config.benchmarkScore && (!existing.benchmarkScore || config.benchmarkScore > existing.benchmarkScore))) {
    archetypeModelRegistry.set(config.archetype, config);
    console.log(`📦 Registered model for archetype '${config.archetype}': ${config.modelId}`);
  }
}

/**
 * Get the best model for a specific archetype
 * Falls back to base model if no archetype-specific model exists
 */
export function getModelForArchetype(archetype: string): ArchetypeModelConfig | null {
  const normalized = archetype.toLowerCase().trim().replace(/_/g, '-');
  return archetypeModelRegistry.get(normalized) || null;
}

/**
 * Get all registered archetype models
 */
export function getAllArchetypeModels(): ArchetypeModelConfig[] {
  return Array.from(archetypeModelRegistry.values());
}

/**
 * Check if an archetype has a trained model
 */
export function hasArchetypeModel(archetype: string): boolean {
  const normalized = archetype.toLowerCase().trim().replace(/_/g, '-');
  return archetypeModelRegistry.has(normalized);
}

/**
 * Clear all registered models (for testing)
 */
export function clearArchetypeModels(): void {
  archetypeModelRegistry.clear();
}

/**
 * Get the appropriate model tier based on available VRAM
 */
export function getModelTierForVram(vramGb: number): ModelTier {
  if (vramGb >= MODEL_TIERS.xlarge.minVramGb) return 'xlarge';
  if (vramGb >= MODEL_TIERS.large.minVramGb) return 'large';
  if (vramGb >= MODEL_TIERS.medium.minVramGb) return 'medium';
  return 'small';
}

/**
 * Get model for a specific tier
 */
export function getModelForTier(tier: ModelTier): string {
  return MODEL_TIERS[tier].model;
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

  // Check for explicit tier or VRAM override
  const explicitTier = process.env.MODEL_TIER as ModelTier | undefined;
  const explicitVram = process.env.AVAILABLE_VRAM_GB
    ? parseInt(process.env.AVAILABLE_VRAM_GB, 10)
    : undefined;

  // Determine tier: explicit tier > tier from VRAM > default small
  let modelTier: ModelTier = 'small';
  if (explicitTier && MODEL_TIERS[explicitTier]) {
    modelTier = explicitTier;
  } else if (explicitVram) {
    modelTier = getModelTierForVram(explicitVram);
  }

  // Use explicit BASE_MODEL if set, otherwise use tier-based model
  const baseModel =
    process.env.BASE_MODEL || getModelForTier(modelTier);

  return {
    enabled,
    atroposApiUrl: process.env.ATROPOS_API_URL || 'http://localhost:8000',
    vllmPort: parseInt(process.env.VLLM_PORT || '9001', 10),
    modelVersion: process.env.RL_MODEL_VERSION, // Optional: pin to specific version
    fallbackToBase: process.env.RL_FALLBACK_TO_BASE !== 'false', // Default: true
    baseModel,
    modelTier,
    availableVramGb: explicitVram,
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
  const tierConfig = MODEL_TIERS[config.modelTier];

  console.log('🤖 RL Model Configuration:', {
    enabled: config.enabled,
    available,
    atroposConfigured: !!config.atroposApiUrl,
    vllmPort: config.vllmPort,
    pinnedVersion: config.modelVersion || 'latest',
    fallbackEnabled: config.fallbackToBase,
    baseModel: config.baseModel,
    modelTier: config.modelTier,
    tierName: tierConfig.name,
    tierParams: tierConfig.params,
    contextWindow: tierConfig.context,
    availableVramGb: config.availableVramGb || 'auto',
  });
}

/**
 * Get all available model tiers with their configurations
 */
export function getAvailableModelTiers(): ModelTierConfig[] {
  return Object.values(MODEL_TIERS);
}

/**
 * Check if a specific model tier is available based on VRAM
 */
export function isTierAvailable(tier: ModelTier, vramGb: number): boolean {
  return vramGb >= MODEL_TIERS[tier].minVramGb;
}
