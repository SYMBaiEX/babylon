/**
 * Database Context
 *
 * @description Re-exports RLS context functions from the main database module.
 * @deprecated Use `import { asUser, asPublic, asSystem } from '@/db'` instead
 */

export { asUser, asPublic, asSystem, withTransaction, db } from '@/db';
export type { Database, Transaction } from '@/db';

