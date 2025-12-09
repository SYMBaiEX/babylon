/**
 * Date Utilities
 * Shared date parsing and extraction utilities for the game engine.
 */

/**
 * Extract day number from timestamp string.
 * Assumes game runs in October 2025 format: "2025-10-DDTHH:MM:SSZ"
 */
export function extractDayFromTimestamp(timestamp: string): number {
  // Try ISO format: "2025-10-15T12:00:00Z"
  const isoMatch = timestamp.match(/2025-10-(\d{2})/);
  if (isoMatch) {
    return Number.parseInt(isoMatch[1]!, 10);
  }

  // Fallback: try to extract from any date format
  const dateMatch = timestamp.match(/-(\d{2})T/);
  if (dateMatch) {
    return Number.parseInt(dateMatch[1]!, 10);
  }

  return 0;
}

/**
 * Extract day number from an event object (handles different formats)
 */
export function extractDayFromEvent(event: { day?: number; timestamp?: Date | string }): number {
  if (event.day) return event.day;
  if (event.timestamp) {
    return extractDayFromTimestamp(
      typeof event.timestamp === 'string' ? event.timestamp : event.timestamp.toISOString()
    );
  }
  return 0;
}

/**
 * Extract day number from a post object
 */
export function extractDayFromPost(post: { day?: number; createdAt?: Date | string }): number {
  if (post.day) return post.day;
  if (post.createdAt) {
    return extractDayFromTimestamp(
      typeof post.createdAt === 'string' ? post.createdAt : post.createdAt.toISOString()
    );
  }
  return 0;
}

