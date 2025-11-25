/**
 * Database Access Layer
 *
 * @description This module provides the main database access layer for the application.
 * Currently uses Prisma ORM. Drizzle ORM is available at @/db for future migration.
 *
 * All database operations should be imported from this module:
 *
 * @example
 * ```typescript
 * import { prisma } from '@/lib/db';
 * import { asUser, asSystem } from '@/lib/db/context';
 *
 * // Direct queries
 * const users = await prisma.user.findMany();
 *
 * // With RLS context
 * const positions = await asUser(authUser, async (db) => {
 *   return await db.position.findMany();
 * });
 *
 * // System operations
 * const allData = await asSystem(async (db) => {
 *   return await db.actor.findMany();
 * }, 'admin-operation');
 * ```
 */

// Re-export the Prisma client and types
export { prisma, prismaBase } from '@/lib/prisma';
export type { PrismaClient } from '@prisma/client';

// Re-export RLS context functions
export { asUser, asSystem, asPublic } from '@/lib/db/context';
