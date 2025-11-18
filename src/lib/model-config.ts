/**
 * AI Model Configuration
 * 
 * @description Centralized model selection based on use case. Provides model
 * constants and configuration for different operation types. Optimizes model
 * selection for cost, quality, and speed based on operation requirements.
 * 
 * Model Categories:
 * - Content Generation: High quality, user-visible content (qwen/qwen3-32b)
 * - Background Operations: Speed and reliability for automated tasks (qwen/qwen3-32b)
 * - Fast Evaluation: Low cost, fast response for frequent operations (llama-3.1-8b-instant)
 */

/**
 * Model for generating user-visible content
 * 
 * @description High-quality model for generating user-facing content that
 * requires creativity and coherence. Used for events, questions, articles,
 * posts, and group chats. Prioritizes quality and creativity over speed.
 * 
 * Priority: Quality and creativity
 * Provider: Groq
 */
export const CONTENT_GENERATION_MODEL = 'qwen/qwen3-32b'; // Quality content generation

/**
 * Model for background processing and operations
 * 
 * @description Reliable model for automated background operations that don't
 * require user-facing quality. Used for market decisions, NPC trading, and
 * data processing. Prioritizes speed and reliability.
 * 
 * Priority: Speed and reliability
 * Provider: Groq
 */
export const BACKGROUND_WORKER_MODEL = 'qwen/qwen3-32b';

/**
 * Model for small, frequent operations
 * 
 * @description Fast, cost-effective model for high-frequency operations that
 * don't require high quality. Used for comments, DMs, tag generation, and evaluations.
 * Optimized for low cost and fast response times.
 * 
 * Priority: Low cost, fast response
 * Provider: Groq
 */
export const FAST_EVAL_MODEL = 'llama-3.1-8b-instant';

/**
 * Default model for agents when WANDB is not configured
 * 
 * @description Fast and efficient model for agent operations when WANDB-trained
 * models are not available. Suitable for free tier usage. Provides good balance
 * of speed and capability for autonomous agent operations.
 * 
 * Provider: Groq
 */
export const AGENT_DEFAULT_MODEL = 'llama-3.1-8b-instant';

/**
 * Model configuration for different contexts
 * 
 * @description Maps use cases to appropriate models. Provides centralized
 * model selection based on operation type and requirements. Ensures consistent
 * model usage across the application.
 */
export const MODEL_CONFIG = {
  // Content generation (user-facing, important)
  events: CONTENT_GENERATION_MODEL,
  questions: CONTENT_GENERATION_MODEL,
  articles: CONTENT_GENERATION_MODEL,
  posts: CONTENT_GENERATION_MODEL,
  groupChats: CONTENT_GENERATION_MODEL,
  
  // Background operations (not user-facing)
  marketDecisions: BACKGROUND_WORKER_MODEL,
  trading: BACKGROUND_WORKER_MODEL,
  dataProcessing: BACKGROUND_WORKER_MODEL,
  
  // Fast evaluation (frequent, small operations)
  comments: FAST_EVAL_MODEL,
  dms: FAST_EVAL_MODEL,
  tags: FAST_EVAL_MODEL,
  evaluation: FAST_EVAL_MODEL,
  
  // Agents
  agentDefault: AGENT_DEFAULT_MODEL,
} as const;

/**
 * Get model for specific use case
 * 
 * @description Returns the configured model for a specific use case.
 * 
 * @param {keyof typeof MODEL_CONFIG} useCase - Use case identifier
 * @returns {string} Model identifier
 * 
 * @example
 * ```typescript
 * const model = getModelForUseCase('events'); // Returns 'qwen/qwen3-32b'
 * const model = getModelForUseCase('comments'); // Returns 'llama-3.1-8b-instant'
 * ```
 */
export function getModelForUseCase(useCase: keyof typeof MODEL_CONFIG): string {
  return MODEL_CONFIG[useCase];
}

/**
 * Check if a model is available via Groq
 * 
 * @description Determines if a model is supported by Groq's inference API.
 * Used to route model requests to the appropriate provider.
 * 
 * @param {string} model - Model identifier to check
 * @returns {boolean} True if model is available via Groq
 * 
 * @example
 * ```typescript
 * if (isGroqModel(model)) {
 *   // Use Groq API
 * }
 * ```
 */
export function isGroqModel(model: string): boolean {
  const groqModels = [
    'llama-3.1-8b-instant',
    'qwen/qwen3-32b',
  ];
  return groqModels.includes(model);
}

/**
 * Check if a model is available via WANDB
 * 
 * @description Determines if a model is supported by WANDB's inference API.
 * Includes trained models and base models available through WANDB.
 * 
 * @param {string} model - Model identifier to check
 * @returns {boolean} True if model is available via WANDB
 * 
 * @example
 * ```typescript
 * if (isWandbModel(model)) {
 *   // Use WANDB API
 * }
 * ```
 */
export function isWandbModel(model: string): boolean {
  const wandbModels = [
    'OpenPipe/Qwen3-14B-Instruct',      // Our trained model (for Eliza agents)
    'meta-llama/Llama-3.1-8B-Instruct',
    'Qwen/Qwen2.5-32B-Instruct',
  ];
  return wandbModels.includes(model);
}

