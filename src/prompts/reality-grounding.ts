/**
 * Reality Grounding - Current World State
 * 
 * Provides current date, prices, politics, culture, and tech landscape
 * to ground LLM outputs in current reality and prevent outdated predictions.
 * 
 * Facts are loaded from the database (seeded from data/reality-grounding.md)
 */

import { worldFactsService } from '@/lib/services/world-facts-service';

/**
 * Get current date and time context for prompts.
 * 
 * Returns various formatted date/time strings updated dynamically
 * at generation time. Used to ensure all generated content references
 * the current date correctly.
 * 
 * @returns Object containing:
 *   - `dateISO`: ISO 8601 formatted date string
 *   - `dateFull`: Full human-readable date (e.g., "Monday, November 16, 2025")
 *   - `time`: Formatted time (e.g., "3:45 PM")
 *   - `year`: Current year as string
 *   - `month`: Current month name (e.g., "November")
 *   - `day`: Current day of month as string
 */
export function getCurrentDateContext(): {
  dateISO: string;
  dateFull: string;
  time: string;
  year: string;
  month: string;
  day: string;
} {
  const now = new Date();
  return {
    dateISO: now.toISOString(),
    dateFull: now.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    }),
    time: now.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    }),
    year: now.getFullYear().toString(),
    month: now.toLocaleDateString('en-US', { month: 'long' }),
    day: now.getDate().toString(),
  };
}

/**
 * Get full reality grounding string from database.
 * 
 * Loads all reality grounding facts from the database and formats them
 * with the current date dynamically inserted.
 * 
 * @returns Full reality grounding string with current date and all facts
 */
export async function getFullRealityGrounding(): Promise<string> {
  const dateCtx = getCurrentDateContext();
  const facts = await worldFactsService.getRealityGroundingFacts();
  
  const factsText = facts
    .map(f => `- ${f.value}`)
    .join('\n');
  
  return `
=== CURRENT DATE: ${dateCtx.dateFull} ===

${factsText}
`.trim();
}

/**
 * Simple validation function for reality grounding
 * Checks for common outdated references
 */
export function checkRealityGrounding(text: string): string[] {
  const warnings: string[] = [];
  
  // Check for outdated years (hardcoded check - could be improved)
  if (text.includes('2023') || text.includes('2024')) {
    warnings.push('Content references outdated year - should reference current year');
  }
  
  // Check for outdated prices
  if (text.includes('Bitcoin') && (text.includes('$30K') || text.includes('$50K'))) {
    warnings.push('Content references outdated Bitcoin prices');
  }
  
  // Check for wrong president
  if (text.includes('Biden') && text.includes('president')) {
    warnings.push('Content references wrong president');
  }
  
  return warnings;
}

/**
 * Get a concise reality grounding string for prompts.
 * 
 * Returns a condensed version of current world facts including prices,
 * leadership, AI state, and key context. Includes current date
 * dynamically. Suitable for most prompts that need reality grounding.
 * 
 * @returns Concise reality grounding string with current date and key facts
 */
export async function getRealityGrounding(): Promise<string> {
  const dateCtx = getCurrentDateContext();
  const facts = await worldFactsService.getRealityGroundingFacts();
  
  // Format facts concisely (limit to first 20 for concise version)
  const factsText = facts
    .slice(0, 20)
    .map(f => `- ${f.value}`)
    .join('\n');
  
  return `
=== REALITY GROUNDING (${dateCtx.dateFull}) ===

${factsText}

CRITICAL: Ground all predictions in this reality. Use current dates, prices, and leadership.

FORBIDDEN TOPICS FOR PREDICTIONS:
- Cryptocurrency prices (BTC, ETH, SOL, DOGE, etc.) - too volatile, boring
- Currency exchange rates - not interesting
- Simple stock price movements - focus on events instead
- Weather - not relevant
Focus on: Company events, regulations, tech breakthroughs, political decisions, AI releases, mergers, scandals
`.trim();
}

/**
 * Get a minimal reality check string for quick context.
 * 
 * Returns a very brief summary of key current facts.
 * Useful when token limits are tight or only basic grounding is needed.
 * 
 * @returns Minimal reality grounding string
 */
export async function getMinimalRealityGrounding(): Promise<string> {
  const dateCtx = getCurrentDateContext();
  const facts = await worldFactsService.getRealityGroundingFacts();
  
  // Get first 5 facts for minimal version
  const keyFacts = facts
    .slice(0, 5)
    .map(f => f.value)
    .join(' | ');
  
  return `DATE: ${dateCtx.dateFull} | ${keyFacts}`;
}
