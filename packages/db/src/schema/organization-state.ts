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
 * Static organization data (name, ticker, description, type, initialPrice, etc.)
 * is stored in TypeScript and accessed via StaticDataRegistry from @babylon/engine.
 * See: packages/engine/src/data/organizations/*.ts
 *
 * This table only stores fields that change during gameplay:
 * - currentPrice: The organization's current stock price
 *
 * Organization IDs are deterministic strings matching the static data
 * (e.g., 'openagi', 'teslai', 'maicrosoft', 'aipple')
 */
export const organizationState = pgTable(
  'OrganizationState',
  {
    // Organization ID - matches static data in packages/engine/src/data/organizations/*.ts
    id: text('id').primaryKey(),

    // Dynamic price state
    currentPrice: doublePrecision('currentPrice'),

    // Timestamps
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
