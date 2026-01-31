/**
 * UUID generation utility
 *
 * Provides a cross-browser UUID generator with fallback for older browsers
 * that don't support crypto.randomUUID() (Safari < 15.4, Chrome < 92)
 */

/**
 * Generate a UUID v4 string.
 *
 * Uses crypto.randomUUID() when available, with a fallback for older browsers.
 * The fallback generates a pseudo-random string using Date.now() and Math.random().
 *
 * @returns A unique identifier string
 */
export function generateUUID(): string {
  if (
    typeof crypto !== 'undefined' &&
    typeof crypto.randomUUID === 'function'
  ) {
    return crypto.randomUUID();
  }
  // Fallback for older browsers (Safari < 15.4, Chrome < 92)
  return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}
