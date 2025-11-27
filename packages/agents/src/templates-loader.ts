/**
 * Agent Templates Loader
 *
 * Loads agent templates from TypeScript data files.
 * Uses direct imports for optimal performance and type safety.
 *
 * **Architecture:**
 * - Individual TypeScript files for each template
 * - Index file exports all templates
 * - In-memory caching for performance
 * - Direct imports for template lookups
 *
 * **Performance:**
 * - First load: <1ms (direct imports, no file I/O)
 * - Subsequent loads: <1ms (uses cache)
 * - Template lookups: Direct import (fastest)
 */

import { templates, templateIds } from './templates';
import type { AgentTemplate } from './types/agent-template';

/**
 * In-memory cache for loaded templates
 */
const templateCache: Map<string, AgentTemplate> = new Map();

/**
 * Initialize cache from imported data
 */
function initializeCache(): void {
  if (templateCache.size === 0) {
    // Convert readonly arrays to mutable objects and populate cache
    templates.forEach((template) => {
      // Create a mutable copy of the template data
      const templateData = { ...template } as AgentTemplate;
      templateCache.set(templateData.archetype, templateData);
    });
  }
}

/**
 * Get all available template IDs
 *
 * @returns Array of template archetype IDs
 */
export function getTemplateIds(): readonly string[] {
  return templateIds;
}

/**
 * Get all templates
 *
 * @returns Array of all agent templates
 */
export function getAllTemplates(): AgentTemplate[] {
  initializeCache();
  return Array.from(templateCache.values());
}

/**
 * Get a template by archetype ID
 *
 * @param archetype The archetype ID (e.g., 'trader', 'researcher')
 * @returns Template data or null if not found
 */
export function getTemplate(archetype: string): AgentTemplate | null {
  initializeCache();
  return templateCache.get(archetype) ?? null;
}

/**
 * Get a random template
 *
 * @returns Random template or null if no templates available
 */
export function getRandomTemplate(): AgentTemplate | null {
  initializeCache();
  const allTemplates = Array.from(templateCache.values());
  if (allTemplates.length === 0) {
    return null;
  }
  const randomIndex = Math.floor(Math.random() * allTemplates.length);
  return allTemplates[randomIndex] ?? null;
}

