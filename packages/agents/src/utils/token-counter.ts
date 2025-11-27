/**
 * Token Counter Utility for @babylon/agents
 *
 * Provides token counting and text truncation for LLM context management.
 * Uses character-based approximation for sync operations and tiktoken for async.
 */

import type { Tiktoken } from 'tiktoken';

// Lazy-load encoding to avoid startup overhead
let encoding: Tiktoken | null = null;

/**
 * Get the tiktoken encoding (lazy-loaded)
 */
async function getEncoding(): Promise<Tiktoken> {
  if (!encoding) {
    const tiktoken = await import('tiktoken');
    encoding = tiktoken.encoding_for_model('gpt-4');
  }
  return encoding;
}

/**
 * Count tokens in text (async, accurate)
 */
export async function countTokens(text: string): Promise<number> {
  const enc = await getEncoding();
  const tokens = enc.encode(text);
  return tokens.length;
}

/**
 * Count tokens in text (synchronous approximation)
 * Uses 1 token per 4 characters approximation
 */
export function countTokensSync(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Truncate text to fit within token limit (async, accurate)
 */
export async function truncateToTokenLimit(
  text: string,
  maxTokens: number,
  options: {
    ellipsis?: boolean;
    preserveEnd?: boolean;
  } = {}
): Promise<{ text: string; tokens: number }> {
  const { ellipsis = true, preserveEnd = false } = options;

  const currentTokens = await countTokens(text);

  if (currentTokens <= maxTokens) {
    return { text, tokens: currentTokens };
  }

  const ellipsisText = ellipsis ? '...' : '';
  const ellipsisTokens = ellipsis ? await countTokens(ellipsisText) : 0;
  const targetTokens = maxTokens - ellipsisTokens;

  let low = 0;
  let high = text.length;
  let bestLength = 0;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const slice = preserveEnd
      ? text.slice(text.length - mid)
      : text.slice(0, mid);
    const tokens = await countTokens(slice);

    if (tokens <= targetTokens) {
      bestLength = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  const truncated = preserveEnd
    ? ellipsisText + text.slice(text.length - bestLength)
    : text.slice(0, bestLength) + ellipsisText;

  const finalTokens = await countTokens(truncated);

  return { text: truncated, tokens: finalTokens };
}

/**
 * Truncate text to fit within token limit (synchronous approximation)
 */
export function truncateToTokenLimitSync(
  text: string,
  maxTokens: number,
  options: {
    ellipsis?: boolean;
    preserveEnd?: boolean;
  } = {}
): { text: string; tokens: number } {
  const { ellipsis = true, preserveEnd = false } = options;

  const currentTokens = countTokensSync(text);

  if (currentTokens <= maxTokens) {
    return { text, tokens: currentTokens };
  }

  const ellipsisText = ellipsis ? '...' : '';
  const ellipsisTokens = ellipsis ? countTokensSync(ellipsisText) : 0;
  const targetTokens = maxTokens - ellipsisTokens;

  // Approximate character length based on token limit
  const targetChars = Math.floor(targetTokens * 4);

  const truncated = preserveEnd
    ? ellipsisText + text.slice(text.length - targetChars)
    : text.slice(0, targetChars) + ellipsisText;

  const finalTokens = countTokensSync(truncated);

  return { text: truncated, tokens: finalTokens };
}

/**
 * Model-specific INPUT CONTEXT token limits
 */
export const MODEL_TOKEN_LIMITS: Record<string, number> = {
  // OpenAI
  'gpt-5.1': 128000,
  'gpt-5-nano': 128000,
  'gpt-5.1-turbo': 128000,
  'gpt-3.5-turbo': 16385,
  'gpt-3.5-turbo-16k': 16385,

  // Groq Models
  'qwen/qwen3-32b': 131072,
  'OpenPipe/Qwen3-14B-Instruct': 32768,
  'Qwen/Qwen2.5-32B-Instruct': 131072,
  'llama-3.1-8b-instant': 131072,
  'llama-3.3-70b-versatile': 131072,
  'llama-3.1-70b-versatile': 131072,
  'mixtral-8x7b-32768': 32768,

  // Anthropic - Claude
  'claude-sonnet-4-5': 200000,
  'claude-sonnet-4-5-20250929': 200000,
  'claude-haiku-4-5': 200000,
  'claude-haiku-4-5-20251001': 200000,
  'claude-opus-4-1': 200000,
  'claude-opus-4-1-20250805': 200000,
};

/**
 * Get maximum token limit for a model
 */
export function getModelTokenLimit(model: string): number {
  return MODEL_TOKEN_LIMITS[model] || 8192;
}

/**
 * Calculate safe context limit with safety margin
 */
export function getSafeContextLimit(
  model: string,
  _outputTokens = 8000,
  safetyMargin = 0.02
): number {
  const inputLimit = getModelTokenLimit(model);
  const safeLimit = Math.floor(inputLimit * (1 - safetyMargin));
  return Math.max(1000, safeLimit);
}

/**
 * Budget tokens across multiple sections
 */
export function budgetTokens(
  totalTokens: number,
  sections: Array<{ name: string; priority: number; minTokens?: number }>
): Record<string, number> {
  const budget: Record<string, number> = {};

  let remaining = totalTokens;

  for (const section of sections) {
    const min = section.minTokens || 0;
    remaining -= min;
    budget[section.name] = min;
  }

  if (remaining < 0) {
    const scale = totalTokens / (totalTokens - remaining);
    for (const section of sections) {
      budget[section.name] = Math.floor((section.minTokens || 0) * scale);
    }
    return budget;
  }

  const totalPriority = sections.reduce((sum, s) => sum + s.priority, 0);

  for (const section of sections) {
    const share = (section.priority / totalPriority) * remaining;
    budget[section.name] = (budget[section.name] || 0) + Math.floor(share);
  }

  return budget;
}

