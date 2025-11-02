/**
 * Profile URL utility functions
 * Handles generating profile URLs with username preference
 */

/**
 * Generate a profile URL for a user
 * Prefers username if available, falls back to user ID
 */
export function getProfileUrl(userId: string, username?: string | null): string {
  if (username) {
    // Strip @ if present and use clean username
    const cleanUsername = username.startsWith('@') ? username.slice(1) : username
    return `/profile/${cleanUsername}`
  }
  return `/profile/${userId}`
}

/**
 * Check if a profile identifier is a username (not a user ID)
 * User IDs are typically long (like "did:privy:...") or contain dashes/UUIDs
 */
export function isUsername(identifier: string): boolean {
  // If it starts with @, it's definitely a username
  if (identifier.startsWith('@')) {
    return true
  }
  
  // If it contains "privy" anywhere, it's definitely a user ID, not a username
  if (identifier.toLowerCase().includes('privy')) {
    return false
  }
  
  // If it starts with "did:", it's a DID (user ID)
  if (identifier.startsWith('did:')) {
    return false
  }
  
  // If it's a UUID format (contains dashes in UUID pattern), it's a user ID
  // UUID format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (uuidPattern.test(identifier)) {
    return false
  }
  
  // If it's a short string without dashes and not a DID, it's likely a username
  // User IDs are typically: "did:privy:..." (long) or UUIDs (contain dashes)
  return identifier.length <= 42 && !identifier.includes('-')
}

/**
 * Extract username from identifier (removes @ prefix if present)
 */
export function extractUsername(identifier: string): string {
  return identifier.startsWith('@') ? identifier.slice(1) : identifier
}

