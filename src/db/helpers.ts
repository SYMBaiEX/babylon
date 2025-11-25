/**
 * Database Query Helpers
 *
 * Helper functions for common database operations using Drizzle ORM.
 */

import type { sql } from 'drizzle-orm';
import type { Database } from './index';

/**
 * Execute a raw SQL query and return typed results
 */
export async function $queryRaw<T>(
  db: Database,
  query: ReturnType<typeof sql>
): Promise<T[]> {
  const result = await db.execute(query);
  return result as unknown as T[];
}

/**
 * Execute a raw SQL statement (INSERT, UPDATE, DELETE)
 */
export async function $executeRaw(
  db: Database,
  query: ReturnType<typeof sql>
): Promise<number> {
  await db.execute(query);
  return 1; // Drizzle doesn't return affected rows count directly
}

/**
 * Generate a random UUID
 */
export function generateId(): string {
  return crypto.randomUUID();
}

/**
 * Export withRetry and isRetryableError for backward compatibility
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  maxRetries = 3,
  delayMs = 100
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (!isRetryableError(error) || attempt === maxRetries) {
        throw lastError;
      }
      await new Promise((r) => setTimeout(r, delayMs * Math.pow(2, attempt)));
    }
  }

  throw lastError;
}

/**
 * Check if an error is retryable
 */
export function isRetryableError(error: unknown): boolean {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return (
      message.includes('connection') ||
      message.includes('timeout') ||
      message.includes('deadlock') ||
      message.includes('econnrefused') ||
      message.includes('econnreset')
    );
  }
  return false;
}

/**
 * Get current timestamp
 */
export function now(): Date {
  return new Date();
}

/**
 * Connect to database (no-op for Drizzle, kept for API compatibility)
 */
export async function $connect(): Promise<void> {
  // No-op - Drizzle handles connections automatically
}

/**
 * Disconnect from database
 */
export async function $disconnect(): Promise<void> {
  // Import closeDatabase to avoid circular dependency
  const { closeDatabase } = await import('./index');
  await closeDatabase();
}
