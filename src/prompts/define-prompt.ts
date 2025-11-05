/**
 * Prompt Definition System
 * 
 * Type-safe prompt definitions for LLM interactions
 */

export interface PromptDefinition {
  id: string;
  version: string;
  category: string;
  description: string;
  temperature?: number;
  maxTokens?: number;
  template: string;
}

/**
 * Helper to define a prompt with full type safety
 */
export function definePrompt(prompt: PromptDefinition): PromptDefinition {
  return prompt;
}

/**
 * Helper to render a prompt template with variables
 */
export function renderTemplate(
  template: string,
  variables: Record<string, string | number | boolean | null | undefined>
): string {
  let rendered = template;
  for (const [key, value] of Object.entries(variables)) {
    const pattern = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
    rendered = rendered.replace(pattern, String(value ?? ''));
  }
  return rendered;
}

