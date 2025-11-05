/**
 * Prompt Loader Utility
 *
 * Simplified TypeScript-based prompt system.
 * No bundling required - works natively in Vercel serverless.
 */

import type { PromptDefinition } from './define-prompt';
import type { JsonValue } from '@/types/common';

/**
 * Render a prompt with variable substitution
 * @param prompt - Prompt definition to render
 * @param variables - Variables to substitute in template
 * @returns Rendered prompt string
 */
export function renderPrompt(
  prompt: PromptDefinition,
  variables: Record<string, JsonValue> = {}
): string {
  let rendered = prompt.template;
  
  for (const [key, value] of Object.entries(variables)) {
    const pattern = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
    rendered = rendered.replace(pattern, String(value ?? ''));
  }
  
  return rendered;
}

/**
 * Get LLM parameters from prompt definition
 * @param prompt - Prompt definition
 * @returns Temperature and maxTokens for LLM call
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
