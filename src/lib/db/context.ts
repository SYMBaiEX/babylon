/**
 * Database Context
 * 
 * Provides database access with Row Level Security (RLS) context.
 * These functions set the PostgreSQL session variable `app.current_user_id`
 * which RLS policies use to filter queries automatically.
 * 
 * Usage:
 *   import { asUser, asSystem } from '@/lib/db/context'
 *   
 *   // User-scoped operation
 *   const authUser = await authenticate(request)
 *   const positions = await asUser(authUser, async (db) => {
 *     return await db.position.findMany()
 *   })
 *   
 *   // System operation (bypasses RLS)
 *   const allUsers = await asSystem(async (db) => {
 *     return await db.user.findMany()
 *   })
 */

import { prisma } from '@/lib/prisma'
import type { AuthenticatedUser } from '@/lib/api/auth-middleware'
import type { PrismaClient } from '@prisma/client'

/**
 * Internal: Execute a Prisma operation with RLS context
 * Sets the current user ID for the duration of the transaction
 */
async function executeWithRLS<T>(
  client: PrismaClient,
  userId: string,
  operation: (tx: PrismaClient) => Promise<T>
): Promise<T> {
  // Execute within a transaction to ensure session variable is scoped
  return await client.$transaction(async (tx) => {
    // Set the current user ID in the PostgreSQL session
    await tx.$executeRawUnsafe(
      `SET LOCAL app.current_user_id = '${userId.replace(/'/g, "''")}'`
    )

    // Execute the operation
    return await operation(tx as PrismaClient)
  })
}

/**
 * Internal: Execute a Prisma operation as system (bypass RLS)
 */
async function executeAsSystem<T>(
  client: PrismaClient,
  operation: (tx: PrismaClient) => Promise<T>
): Promise<T> {
  // Execute within a transaction with no user context
  return await client.$transaction(async (tx) => {
    // Explicitly unset the user ID (system access)
    await tx.$executeRawUnsafe(`SET LOCAL app.current_user_id = ''`)

    // Execute the operation
    return await operation(tx as PrismaClient)
  })
}

/**
 * Execute a database operation as a user (with RLS)
 * 
 * Sets the PostgreSQL session variable `app.current_user_id` to the authenticated
 * user's ID, which RLS policies use to filter queries automatically.
 * 
 * If authUser is null/undefined, the operation runs as system (no RLS filtering).
 * This allows the same function to handle both authenticated and unauthenticated requests.
 * 
 * @param authUser - The authenticated user (from authenticate() or optionalAuth())
 * @param operation - The database operation to execute with RLS context
 * 
 * @example
 * // Authenticated route
 * const authUser = await authenticate(request)
 * const positions = await asUser(authUser, async (db) => {
 *   return await db.position.findMany() // Only returns user's positions
 * })
 * 
 * @example
 * // Optional auth route
 * const authUser = await optionalAuth(request)
 * const posts = await asUser(authUser, async (db) => {
 *   return await db.post.findMany() // RLS applies if authenticated
 * })
 */
export async function asUser<T>(
  authUser: AuthenticatedUser | null | undefined,
  operation: (db: typeof prisma) => Promise<T>
): Promise<T> {
  if (!authUser) {
    // No user context - run as system (no RLS filtering)
    return await executeAsSystem(prisma, operation)
  }
  return await executeWithRLS(prisma, authUser.userId, operation)
}

/**
 * Execute a database operation as system (bypass RLS completely)
 * 
 * Use this for operations that need full database access:
 * - Admin operations
 * - Background jobs
 * - Cron tasks
 * - System-level operations
 * 
 * WARNING: This bypasses all RLS policies. Only use when necessary.
 * 
 * @param operation - The database operation to execute without RLS
 * 
 * @example
 * // Admin route
 * const allUsers = await asSystem(async (db) => {
 *   return await db.user.findMany() // Returns ALL users
 * })
 */
export async function asSystem<T>(
  operation: (db: typeof prisma) => Promise<T>
): Promise<T> {
  return await executeAsSystem(prisma, operation)
}

