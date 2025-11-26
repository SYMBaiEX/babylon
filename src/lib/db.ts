/**
 * Database Export
 *
 * @description Re-exports the database client for backward compatibility.
 * Use `import { db } from '@/lib/db'` or `import { db } from '@/db'`.
 */

export { db, schema, withTransaction, asUser, asSystem, asPublic, checkDatabaseHealth, closeDatabase, executeRaw } from '@/db';
export type { Database, Transaction } from '@/db';

// Re-export Drizzle operators for convenience
export { eq, ne, gt, gte, lt, lte, like, ilike, and, or, not, inArray, notInArray, isNull, isNotNull, sql, desc, asc, count, sum, avg, min, max, between, exists, notExists } from '@/db';
