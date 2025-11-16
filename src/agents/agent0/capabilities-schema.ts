/**
 * Agent Capabilities Schema and Validation
 * 
 * @module agents/agent0/capabilities-schema
 * 
 * @description
 * Centralized Zod schema for validating agent capabilities across Agent0 integration.
 * Provides type-safe parsing with default values for missing fields.
 * Used throughout the agent discovery and registration flow.
 * 
 * Capabilities define what an agent can do:
 * - **strategies**: Trading/prediction strategies (e.g., 'prediction-markets', 'perpetuals')
 * - **markets**: Market types agent operates in (e.g., 'crypto', 'sports', 'politics')
 * - **actions**: Specific actions agent can perform (e.g., 'place-bet', 'analyze-odds')
 * - **version**: Capabilities schema version for compatibility
 */

import { z } from 'zod'

/**
 * Agent Capabilities Schema
 * 
 * @description
 * Zod schema for validating agent capability structure.
 * All fields optional to handle partial/legacy capability definitions.
 * 
 * @example
 * ```typescript
 * const capabilities = {
 *   strategies: ['prediction-markets'],
 *   markets: ['crypto', 'sports'],
 *   actions: ['place-bet', 'analyze-market'],
 *   version: '1.0.0'
 * }
 * 
 * const validated = CapabilitiesSchema.parse(capabilities)
 * ```
 */
export const CapabilitiesSchema = z.object({
  /** Trading/prediction strategies supported by agent */
  strategies: z.array(z.string()).optional(),
  /** Market categories agent operates in */
  markets: z.array(z.string()).optional(),
  /** Specific actions agent can perform */
  actions: z.array(z.string()).optional(),
  /** Capabilities schema version */
  version: z.string().optional(),
})

/**
 * Parse and validate agent capabilities with default fallbacks
 * 
 * @param capabilities - Raw capabilities data (from Agent0 or unknown source)
 * @param defaults - Default values for missing fields
 * @returns Validated capabilities object with defaults applied
 * 
 * @description
 * Safe parser that handles invalid or missing capabilities gracefully.
 * Returns default empty arrays if validation fails.
 * 
 * @example
 * ```typescript
 * // Parse valid capabilities
 * const caps = parseCapabilities({ strategies: ['trading'], markets: ['crypto'] })
 * 
 * // Handle invalid data gracefully
 * const emptyCaps = parseCapabilities(null) // Returns defaults
 * 
 * // Custom defaults
 * const customCaps = parseCapabilities(data, {
 *   strategies: ['default-strategy'],
 *   markets: [],
 *   actions: [],
 *   version: '2.0.0'
 * })
 * ```
 */
export function parseCapabilities(
  capabilities: unknown,
  defaults = {
    strategies: [] as string[],
    markets: [] as string[],
    actions: [] as string[],
    version: '1.0.0',
  }
): {
  strategies: string[]
  markets: string[]
  actions: string[]
  version: string
} {
  const validation = CapabilitiesSchema.safeParse(capabilities)
  
  if (!validation.success) {
    return defaults
  }
  
  return {
    strategies: validation.data.strategies ?? defaults.strategies,
    markets: validation.data.markets ?? defaults.markets,
    actions: validation.data.actions ?? defaults.actions,
    version: validation.data.version ?? defaults.version,
  }
}

