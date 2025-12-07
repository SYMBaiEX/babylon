import {
  doublePrecision,
  index,
  pgTable,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

/**
 * OrganizationState - Dynamic runtime state for organizations
 *
 * Static organization data is in TypeScript (StaticDataRegistry from @babylon/engine).
 * This table stores only fields that change during gameplay.
 */
export const organizationState = pgTable(
  'OrganizationState',
  {
    id: text('id').primaryKey(),
    currentPrice: doublePrecision('currentPrice'),
    createdAt: timestamp('createdAt', { mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updatedAt', { mode: 'date' }).notNull(),
  },
  (table) => [
    index('OrganizationState_currentPrice_idx').on(table.currentPrice),
  ]
);

// Type exports
export type OrganizationStateRow = typeof organizationState.$inferSelect;
export type NewOrganizationStateRow = typeof organizationState.$inferInsert;
