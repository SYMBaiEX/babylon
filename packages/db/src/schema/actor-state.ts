import {
  boolean,
  decimal,
  index,
  integer,
  pgTable,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

/**
 * ActorState - Dynamic runtime state for actors (NPCs)
 *
 * Static actor data is in TypeScript (StaticDataRegistry from @babylon/engine).
 * This table stores only fields that change during gameplay.
 */
export const actorState = pgTable(
  'ActorState',
  {
    id: text('id').primaryKey(),
    tradingBalance: decimal('tradingBalance', { precision: 18, scale: 2 })
      .notNull()
      .default('10000'),
    reputationPoints: integer('reputationPoints').notNull().default(10000),
    hasPool: boolean('hasPool').notNull().default(false),
    createdAt: timestamp('createdAt', { mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updatedAt', { mode: 'date' }).notNull(),
  },
  (table) => [
    index('ActorState_hasPool_idx').on(table.hasPool),
    index('ActorState_reputationPoints_idx').on(table.reputationPoints),
  ]
);

// Type exports
export type ActorStateRow = typeof actorState.$inferSelect;
export type NewActorStateRow = typeof actorState.$inferInsert;
