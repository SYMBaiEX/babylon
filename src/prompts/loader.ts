/**
 * Prompt Loader Utility
 *
 * Loads and processes prompt templates from markdown files
 * with YAML frontmatter and variable substitution.
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import type { JsonValue } from '@/types/common';

interface PromptMetadata {
  id: string;
  version: string;
  category: string;
  description: string;
  temperature?: number;
  maxTokens?: number;
}

interface LoadedPrompt {
  metadata: PromptMetadata;
  template: string;
}

const promptCache = new Map<string, LoadedPrompt>();

/**
 * Load a prompt template from a markdown file
 * @param path - Path to prompt file (e.g., 'feed/world-events')
 * @returns Loaded prompt with metadata and template
 */
export function loadPromptTemplate(path: string): LoadedPrompt {
  const cacheKey = path;

  if (promptCache.has(cacheKey)) {
    return promptCache.get(cacheKey)!;
  }

  const promptPath = join(process.cwd(), 'src', 'prompts', `${path}.md`);
  const content = readFileSync(promptPath, 'utf-8');

  // Parse YAML frontmatter
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);

  if (!frontmatterMatch) {
    throw new Error(`Invalid prompt file format: ${path}`);
  }

  const frontmatter = frontmatterMatch[1];
  const template = frontmatterMatch[2];

  if (!frontmatter || !template) {
    throw new Error(`Invalid prompt file structure: ${path}`);
  }

  // Parse YAML (simple key: value parser)
  const metadata: Partial<PromptMetadata> = {};
  frontmatter.split('\n').forEach(line => {
    const [key, ...valueParts] = line.split(':');
    if (key && valueParts.length) {
      const value = valueParts.join(':').trim();
      const camelKey = key.trim().replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
      (metadata as Record<string, string | number>)[camelKey] =
        !isNaN(Number(value)) ? Number(value) : value;
    }
  });

  const loaded: LoadedPrompt = {
    metadata: metadata as PromptMetadata,
    template: template.trim()
  };

  promptCache.set(cacheKey, loaded);
  return loaded;
}

/**
 * Load and render a prompt with variable substitution
 * @param path - Path to prompt file
 * @param variables - Variables to substitute in template
 * @returns Rendered prompt string
 */
export function loadPrompt(path: string, variables: Record<string, JsonValue> = {}): string {
  const { template } = loadPromptTemplate(path);

  // Simple variable substitution: {{variableName}}
  let rendered = template;
  for (const [key, value] of Object.entries(variables)) {
    const pattern = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
    rendered = rendered.replace(pattern, String(value));
  }

  return rendered;
}

/**
 * Get prompt metadata without loading full template
 * @param path - Path to prompt file
 * @returns Prompt metadata
 */
export function getPromptMetadata(path: string): PromptMetadata {
  const { metadata } = loadPromptTemplate(path);
  return metadata;
}

/**
 * Clear the prompt cache (useful for testing)
 */
export function clearPromptCache(): void {
  promptCache.clear();
}
