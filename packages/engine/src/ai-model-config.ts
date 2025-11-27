/**
 * AI Model Configuration Helper
 *
 * @description Provides configuration for AI model settings.
 * Priority: Groq > Claude > OpenAI
 */

/**
 * AI Model Configuration
 */
interface AIModelConfig {
  provider: 'groq' | 'claude' | 'openai';
}

/**
 * Get the current AI model configuration based on available API keys
 * Priority: Groq > Claude > OpenAI
 *
 * @returns {Promise<AIModelConfig>} Current AI model configuration
 */
export async function getAIModelConfig(): Promise<AIModelConfig> {
  if (process.env.GROQ_API_KEY) {
    return { provider: 'groq' };
  }
  if (process.env.ANTHROPIC_API_KEY) {
    return { provider: 'claude' };
  }
  return { provider: 'openai' };
}

/**
 * Clear the configuration cache (no-op for backwards compatibility)
 */
export function clearAIModelConfigCache(): void {
  // No-op
}
