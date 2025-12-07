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
 * Static actor data (name, description, personality, tier, etc.) is stored
 * in TypeScript and accessed via StaticDataRegistry from @babylon/engine.
 *
 * This table only stores fields that change during gameplay:
 * - tradingBalance: NPC's current trading balance
 * - reputationPoints: Current reputation score
 * - hasPool: Whether the actor has a trading pool
 *
 * Actor IDs are deterministic strings matching the static data
 * (e.g., 'ailon-musk', 'sam-ailtman', 'vitailik-buterin')
 */
export const actorState = pgTable(
  'ActorState',
  {
    // Actor ID - matches static data in packages/engine/src/data/actors/*.ts
    id: text('id').primaryKey(),

    // Dynamic trading state
    tradingBalance: decimal('tradingBalance', { precision: 18, scale: 2 })
      .notNull()
      .default('10000'),

    // Dynamic reputation state
    reputationPoints: integer('reputationPoints').notNull().default(10000),

    // Pool state - can change during gameplay
    hasPool: boolean('hasPool').notNull().default(false),

    // Timestamps
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
