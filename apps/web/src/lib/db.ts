/**
 * Database Export
 *
 * @description Re-exports the database client for backward compatibility.
 * Use `import { db } from '@/lib/db'` or `import { db } from '@/db'`.
 */

export type { Database, Transaction } from '@/db';
// Re-export Drizzle operators for convenience
export {
  and,
  asc,
  asPublic,
  asSystem,
  asUser,
  avg,
  between,
  checkDatabaseHealth,
  closeDatabase,
  count,
  db,
  desc,
  eq,
  executeRaw,
  exists,
  gt,
  gte,
  ilike,
  inArray,
  isNotNull,
  isNull,
  like,
  lt,
  lte,
  max,
  min,
  ne,
  not,
  notExists,
  notInArray,
  or,
  schema,
  sql,
  sum,
  withTransaction,
} from '@/db';
