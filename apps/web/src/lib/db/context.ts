/**
 * Database Context
 *
 * @description Re-exports RLS context functions from the main database module.
 * @deprecated Use `import { asUser, asPublic, asSystem } from '@/db'` instead
 */

export type { Database, Transaction } from '@/db';
export { asPublic, asSystem, asUser, db, withTransaction } from '@/db';
