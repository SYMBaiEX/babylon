/**
 * Reality Grounding - Current World State
 * 
 * Provides current date, prices, politics, culture, and tech landscape
 * to ground LLM outputs in current reality and prevent outdated predictions.
 * 
 * Facts are loaded directly from data/reality-grounding.md
 */

import { readFileSync } from 'fs';
import { join } from 'path';

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
 * Get world event examples for style and tone context.
 * 
 * Reads from data/world-event-examples.md to provide the LLM with 
 * examples of the desired satirical/news style.
 */
export async function getWorldEventExamples(): Promise<string> {
  try {
    const filePath = join(process.cwd(), 'data', 'world-event-examples.md');
    const content = readFileSync(filePath, 'utf-8');
    return `=== WORLD EVENT EXAMPLES (FOR STYLE AND TONE) ===\n\n${content}`;
  } catch (error) {
    console.error('Failed to read world-event-examples.md', error);
    return '';
  }
}

/**
 * Helper to read reality grounding content from file
 */
function getRealityGroundingContent(): string {
  try {
    const filePath = join(process.cwd(), 'data', 'reality-grounding.md');
    return readFileSync(filePath, 'utf-8');
  } catch (error) {
    console.error('Failed to read reality-grounding.md', error);
    return '';
  }
}

/**
 * Get full reality grounding string from file.
 * 
 * Loads all reality grounding facts from the file and formats them
 * with the current date dynamically inserted.
 * 
 * @returns Full reality grounding string with current date and all facts
 */
export async function getFullRealityGrounding(): Promise<string> {
  const dateCtx = getCurrentDateContext();
  const content = getRealityGroundingContent();
  
  return `
=== CURRENT DATE: ${dateCtx.dateFull} ===

${content}
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
 * Returns the full content as it's designed to be injected whole.
 * 
 * @returns Concise reality grounding string with current date and key facts
 */
export async function getRealityGrounding(): Promise<string> {
  const dateCtx = getCurrentDateContext();
  const content = getRealityGroundingContent();
  
  return `
=== REALITY GROUNDING (${dateCtx.dateFull}) ===

${content}

CRITICAL: Ground all predictions in this reality. Use current dates, prices, and leadership.
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
  // For minimal, we might just want the date and maybe the first section of the file?
  // Or just the date if the file is too long.
  // Let's try to extract the first few lines.
  const content = getRealityGroundingContent();
  const lines = content.split('\n').filter(l => l.trim().length > 0 && !l.startsWith('#')).slice(0, 5);
  const keyFacts = lines.join(' | ');
  
  return `DATE: ${dateCtx.dateFull} | ${keyFacts}`;
}
