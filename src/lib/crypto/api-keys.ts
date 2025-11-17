/**
 * API Key Generation and Validation
 *
 * Secure API key management for external agent authentication
 */

import crypto from 'crypto'

/**
 * Generate a secure random API key
 * Format: bab_live_<32 random hex characters>
 *
 * @returns A new API key string
 */
export function generateApiKey(): string {
  const randomBytes = crypto.randomBytes(32)
  const hex = randomBytes.toString('hex')
  return `bab_live_${hex}`
}

/**
 * Hash an API key for secure storage
 * Uses SHA-256 one-way hash
 *
 * @param apiKey - The API key to hash
 * @returns Hashed API key (hex string)
 */
export function hashApiKey(apiKey: string): string {
  return crypto
    .createHash('sha256')
    .update(apiKey)
    .digest('hex')
}

/**
 * Verify an API key against a stored hash
 *
 * @param apiKey - The API key to verify
 * @param storedHash - The stored hash to compare against
 * @returns True if the API key matches the hash
 */
export function verifyApiKey(apiKey: string, storedHash: string): boolean {
  const inputHash = hashApiKey(apiKey)
  return crypto.timingSafeEqual(
    Buffer.from(inputHash),
    Buffer.from(storedHash)
  )
}

/**
 * Generate a test API key for development
 * Format: bab_test_<32 random hex characters>
 *
 * @returns A test API key string
 */
export function generateTestApiKey(): string {
  const randomBytes = crypto.randomBytes(32)
  const hex = randomBytes.toString('hex')
  return `bab_test_${hex}`
}
