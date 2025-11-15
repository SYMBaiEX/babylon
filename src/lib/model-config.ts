/**
 * AI Model Configuration
 * 
 * Centralized model selection based on use case:
 * - Content Generation (events, articles, posts, chats): High quality, user-visible
 * - Background Operations (market decisions, trading): Speed and reliability
 * - Fast Evaluation (comments, DMs, tags): Small operations, high frequency
 */

/**
 * Model for generating user-visible content
 * Used for: events, questions, articles, posts, group chats
 * Priority: Quality and creativity
 */
export const CONTENT_GENERATION_MODEL = 'qwen/qwen3-32b'; // Quality content generation

/**
 * Model for background processing and operations
 * Used for: market decisions, NPC trading, data processing
 * Priority: Speed and reliability
 */
export const BACKGROUND_WORKER_MODEL = 'qwen/qwen3-32b';

/**
 * Model for small, frequent operations
 * Used for: comments, DMs, tag generation, evaluations
 * Priority: Low cost, fast response
 */
export const FAST_EVAL_MODEL = 'llama-3.1-8b-instant';

/**
 * Default model for agents when WANDB is not configured
 * Free tier: Fast and efficient for agent operations
 */
export const AGENT_DEFAULT_MODEL = 'llama-3.1-8b-instant';

/**
 * Model configuration for different contexts
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
 */
export function getModelForUseCase(useCase: keyof typeof MODEL_CONFIG): string {
  return MODEL_CONFIG[useCase];
}

/**
 * Check if a model is available via Groq
 * These models are supported on Groq's API
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
 * These models are supported on WANDB's inference API
 */
export function isWandbModel(model: string): boolean {
  const wandbModels = [
    'OpenPipe/Qwen3-14B-Instruct',      // Our trained model (for Eliza agents)
    'meta-llama/Llama-3.1-8B-Instruct',
    'Qwen/Qwen2.5-32B-Instruct',
  ];
  return wandbModels.includes(model);
}

