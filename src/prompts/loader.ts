/**
 * Prompt Loader Utility
 *
 * Simplified TypeScript-based prompt system for rendering prompts with
 * variable substitution. No bundling required - works natively in Vercel
 * serverless environments.
 */

import type { PromptDefinition } from './define-prompt';
import type { JsonValue } from '@/types/common';

/**
 * Render a prompt template with variable substitution.
 * 
 * Replaces {{variable}} placeholders in the prompt template with actual
 * values from the variables object. Validates that required variables
 * are present and non-empty (unless marked as optional).
 * 
 * @param prompt - Prompt definition to render
 * @param variables - Variables to substitute in template (key-value pairs)
 * @param options - Rendering options:
 *   - `allowEmpty`: If true, allows empty string values for variables
 *   - `optionalVars`: List of variable names that are allowed to be empty
 * @returns Rendered prompt string with all variables substituted
 * @throws Error if required variables are missing or empty
 * 
 * @example
 * ```ts
 * const rendered = renderPrompt(ambientPost, {
 *   actorName: 'Alice',
 *   day: 5,
 *   worldActors: '...'
 * });
 * ```
 */
export function renderPrompt(
  prompt: PromptDefinition,
  variables: Record<string, JsonValue> = {},
  options: {
    /**
     * If true, allows empty string values for variables.
     * If false (default), throws on empty/undefined required variables.
     */
    allowEmpty?: boolean;
    /**
     * List of variable names that are allowed to be empty.
     * Useful for optional contextual data like trendContext.
     */
    optionalVars?: string[];
  } = {}
): string {
  const { allowEmpty = false, optionalVars = ['trendContext', 'previousPostsContext', 'worldActors', 'currentMarkets', 'activePredictions', 'recentTrades', 'realityGrounding', 'currentDateTime', 'currentDate', 'currentTime', 'currentYear', 'currentMonth', 'currentDay'] } = options;
  
  let rendered = prompt.template;
  
  for (const [key, value] of Object.entries(variables)) {
    const stringValue = String(value ?? '');
    
    // Validate non-optional variables are not empty
    if (!allowEmpty && !optionalVars.includes(key)) {
      if (value === undefined || value === null) {
        throw new Error(`Required variable "${key}" is undefined/null in prompt "${prompt.id}"`);
      }
      if (typeof value === 'string' && value.trim().length === 0) {
        throw new Error(`Required variable "${key}" is empty string in prompt "${prompt.id}"`);
      }
    }
    
    const pattern = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
    rendered = rendered.replace(pattern, stringValue);
  }
  
  return rendered;
}

/**
 * Get LLM parameters from a prompt definition.
 * 
 * Extracts temperature and maxTokens settings from a prompt definition
 * for use in LLM API calls. Returns undefined for values that aren't set.
 * 
 * @param prompt - Prompt definition to extract parameters from
 * @returns Object with temperature and maxTokens (may be undefined)
 * 
 * @example
 * ```ts
 * const params = getPromptParams(ambientPost);
 * // { temperature: 0.9, maxTokens: 5000 }
 * 
 * await callLLM({
 *   ...params,
 *   prompt: renderedPrompt
 * });
 * ```
 */
export function getPromptParams(prompt: PromptDefinition): {
  temperature?: number;
  maxTokens?: number;
} {
  return {
    temperature: prompt.temperature,
    maxTokens: prompt.maxTokens,
  };
}
