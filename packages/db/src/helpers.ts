/**
 * Database Query Helpers
 *
 * Helper functions for common database operations using Drizzle ORM.
 */

import type { sql } from 'drizzle-orm';
import type postgres from 'postgres';
import type { DrizzleClient, SQLValue } from './client';
import type { Database } from './index';
import type { DatabaseErrorType } from './types';

// Re-export SQLValue for backward compatibility (also exported from index.ts)
export type { SQLValue };

/**
 * Execute a raw SQL query and return typed results
 */
export async function $queryRaw<
  T extends Record<string, SQLValue> = Record<string, SQLValue>,
>(db: Database, query: ReturnType<typeof sql>): Promise<T[]> {
  const result = await db.execute(query);
  // Drizzle's execute returns an array-like result (RowList) that can be treated as an array
  // This is safe because the caller provides the expected type T
  return Array.from(result) as T[];
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
      // Type guard: ensure error is DatabaseErrorType
      const dbError: DatabaseErrorType =
        error instanceof Error
          ? error
          : typeof error === 'object' && error !== null && 'message' in error
            ? (error as DatabaseErrorType)
            : new Error(String(error));

      lastError =
        dbError instanceof Error ? dbError : new Error(String(dbError));
      if (!isRetryableError(dbError) || attempt === maxRetries) {
        throw lastError;
      }
      await new Promise((resolve) =>
        setTimeout(resolve, delayMs * 2 ** attempt)
      );
    }
  }

  throw lastError;
}

/**
 * Check if an error is retryable
 */
export function isRetryableError(error: DatabaseErrorType): boolean {
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
  // Handle error-like objects
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const errorMessage = String(error.message || '').toLowerCase();
    return (
      errorMessage.includes('connection') ||
      errorMessage.includes('timeout') ||
      errorMessage.includes('deadlock') ||
      errorMessage.includes('econnrefused') ||
      errorMessage.includes('econnreset')
    );
  }
  return false;
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
  // Access global state directly to avoid circular dependency
  type PostgresClient = ReturnType<typeof postgres>;
  const globalForDb = globalThis as typeof globalThis & {
    postgresClient: PostgresClient | undefined;
    drizzleDb: Database | undefined;
    db: DrizzleClient | undefined;
  };

  if (globalForDb.postgresClient) {
    await globalForDb.postgresClient.end();
    globalForDb.postgresClient = undefined;
  }

  globalForDb.drizzleDb = undefined;
  globalForDb.db = undefined;
}
