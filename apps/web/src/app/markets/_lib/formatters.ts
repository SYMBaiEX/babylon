/**
 * Utility functions for formatting values in the Markets page.
 */

/**
 * Formats a price value as USD currency.
 *
 * @param price - The price to format
 * @returns Formatted price string (e.g., "$123.45")
 */
export function formatPrice(price: number): string {
  return `$${price.toFixed(2)}`;
}

/**
 * Formats a volume value with appropriate suffix (K, M, B).
 *
 * @param volume - The volume to format
 * @returns Formatted volume string (e.g., "$1.23M")
 */
export function formatVolume(volume: number): string {
  if (volume >= 1e9) return `$${(volume / 1e9).toFixed(2)}B`;
  if (volume >= 1e6) return `$${(volume / 1e6).toFixed(2)}M`;
  return `$${(volume / 1e3).toFixed(2)}K`;
}

/**
 * Calculates days remaining until a target date.
 *
 * @param date - ISO date string or undefined
 * @returns Number of days remaining, or null if no date provided
 */
export function getDaysLeft(date?: string): number | null {
  if (!date) return null;
  const diff = Math.ceil(
    (new Date(date).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  );
  return Math.max(0, diff);
}

/**
 * Calculates YES/NO percentages from share counts.
 *
 * @param yesShares - Number of YES shares
 * @param noShares - Number of NO shares
 * @returns Object with yesPercent and noPercent
 */
export function calculateSharePercentages(
  yesShares: number | undefined,
  noShares: number | undefined
): { yesPercent: number; noPercent: number; totalShares: number } {
  const yes = yesShares ?? 0;
  const no = noShares ?? 0;
  const total = yes + no;

  if (total === 0) {
    return { yesPercent: 50, noPercent: 50, totalShares: 0 };
  }

  return {
    yesPercent: (yes / total) * 100,
    noPercent: (no / total) * 100,
    totalShares: total,
  };
}

