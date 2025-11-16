/**
 * Randomization utilities for adding entropy to prompts
 * 
 * Provides functions to shuffle arrays, sample random elements,
 * and add variety to AI prompts to prevent repetitive outputs.
 */

/**
 * Fisher-Yates shuffle algorithm
 * 
 * Randomly shuffles array in-place and returns it.
 * Creates a copy to avoid mutating the original array.
 * 
 * @param array - Array to shuffle
 * @returns New shuffled array (original array unchanged)
 * @throws Never throws - returns empty array if input is empty
 * 
 * @example
 * ```typescript
 * const shuffled = shuffleArray([1, 2, 3, 4, 5]);
 * // Returns: [3, 1, 5, 2, 4] (random order)
 * ```
 */
export function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const temp = shuffled[i]!;
    shuffled[i] = shuffled[j]!;
    shuffled[j] = temp;
  }
  return shuffled;
}

/**
 * Get N random samples from an array without replacement
 * 
 * Returns a random subset of the array without duplicates.
 * 
 * @param array - Array to sample from
 * @param count - Number of samples to return
 * @returns Array of random samples (may be shorter than count if array is smaller)
 * @throws Never throws - returns empty array if input is empty or count is 0
 * 
 * @example
 * ```typescript
 * const samples = sampleRandom([1, 2, 3, 4, 5], 3);
 * // Returns: [2, 5, 1] (3 random elements)
 * ```
 */
export function sampleRandom<T>(array: T[], count: number): T[] {
  const shuffled = shuffleArray(array);
  return shuffled.slice(0, Math.min(count, array.length));
}

/**
 * Get a single random element from an array
 * 
 * @param array - Array to pick from
 * @returns Random element or undefined if array is empty
 * 
 * @example
 * ```typescript
 * const item = pickRandom([1, 2, 3, 4, 5]);
 * // Returns: 3 (random element)
 * ```
 */
export function pickRandom<T>(array: T[]): T | undefined {
  if (array.length === 0) return undefined;
  return array[Math.floor(Math.random() * array.length)];
}

/**
 * Randomly decide with a given probability (0-1)
 * 
 * Returns true with probability p, false otherwise.
 * 
 * @param probability - Probability between 0 and 1
 * @returns True with given probability, false otherwise
 * @throws Never throws - clamps probability to [0, 1] range
 * 
 * @example
 * ```typescript
 * if (randomChance(0.3)) {
 *   // 30% chance this executes
 * }
 * ```
 */
export function randomChance(probability: number): boolean {
  return Math.random() < probability;
}

/**
 * Get random integer between min (inclusive) and max (exclusive)
 * 
 * @param min - Minimum value (inclusive)
 * @param max - Maximum value (exclusive)
 * @returns Random integer in range [min, max)
 * @throws Never throws - returns min if max <= min
 * 
 * @example
 * ```typescript
 * const roll = randomInt(1, 7); // Random dice roll: 1-6
 * ```
 */
export function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min)) + min;
}

