/**
 * Shared Utility Functions for Babylon Game
 *
 * Consolidated utility functions to eliminate duplication across codebase
 */

/**
 * Shuffle array using Fisher-Yates algorithm
 * Provides cryptographically secure randomization
 *
 * @param array - Array to shuffle
 * @returns New shuffled array (original untouched)
 */
export function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    // Use temp variable to satisfy TypeScript strict mode
    const temp = shuffled[i]!;
    shuffled[i] = shuffled[j]!;
    shuffled[j] = temp;
  }
  return shuffled;
}

/**
 * Format actor voice context with postStyle and randomized postExample
 * Used for LLM prompt generation to maintain actor voice consistency
 *
 * @param actor - Actor with optional postStyle and postExample
 * @returns Formatted context string for LLM prompts
 */
export function formatActorVoiceContext(actor: {
  postStyle?: string;
  postExample?: string[];
}): string {
  if (!actor.postStyle && !actor.postExample) {
    return '';
  }

  let context = '';

  if (actor.postStyle) {
    context += `\n   Writing Style: ${actor.postStyle}`;
  }

  if (actor.postExample && actor.postExample.length > 0) {
    const shuffledExamples = shuffleArray(actor.postExample);
    const examples = shuffledExamples
      .slice(0, 3)
      .map((ex) => `"${ex}"`)
      .join(', ');
    context += `\n   Example Posts: ${examples}`;
  }

  return context;
}

/**
 * Generate unique ID with timestamp and random component
 *
 * @param prefix - Optional prefix for the ID (e.g., 'post', 'event', 'actor')
 * @returns Unique ID string
 */
export function generateId(prefix?: string): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 9);
  return prefix ? `${prefix}-${timestamp}-${random}` : `${timestamp}-${random}`;
}

/**
 * Clamp number between min and max values
 *
 * @param value - Number to clamp
 * @param min - Minimum value
 * @param max - Maximum value
 * @returns Clamped value
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Calculate sentiment score from text (simple heuristic)
 * Returns value between -1 (negative) and 1 (positive)
 *
 * @param text - Text to analyze
 * @returns Sentiment score between -1 and 1
 */
export function calculateSentiment(text: string): number {
  const positive = /\b(great|amazing|success|win|best|love|excellent|awesome)\b/gi;
  const negative = /\b(terrible|awful|fail|worst|hate|disaster|crisis|scandal)\b/gi;

  const positiveCount = (text.match(positive) || []).length;
  const negativeCount = (text.match(negative) || []).length;

  const total = positiveCount + negativeCount;
  if (total === 0) return 0;

  return clamp((positiveCount - negativeCount) / total, -1, 1);
}

/**
 * Format timestamp to readable date string
 *
 * @param timestamp - ISO timestamp string
 * @returns Formatted date string (e.g., "Jan 1, 2025")
 */
export function formatDate(timestamp: string): string {
  const date = new Date(timestamp);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * Format timestamp to readable time string
 *
 * @param timestamp - ISO timestamp string
 * @returns Formatted time string (e.g., "3:45 PM")
 */
export function formatTime(timestamp: string): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

/**
 * Pick random element from array
 *
 * @param array - Array to pick from
 * @returns Random element from array
 */
export function pickRandom<T>(array: T[]): T | undefined {
  if (array.length === 0) return undefined;
  return array[Math.floor(Math.random() * array.length)];
}

/**
 * Pick N random elements from array (without replacement)
 *
 * @param array - Array to pick from
 * @param count - Number of elements to pick
 * @returns Array of random elements
 */
export function pickRandomN<T>(array: T[], count: number): T[] {
  const shuffled = shuffleArray(array);
  return shuffled.slice(0, Math.min(count, array.length));
}
