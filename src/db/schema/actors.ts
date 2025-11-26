import {
  pgTable,
  text,
  timestamp,
  boolean,
  integer,
  doublePrecision,
  decimal,
  index,
  json,
} from 'drizzle-orm/pg-core';
import type { JsonValue } from '../client';
import { relations } from 'drizzle-orm';

// Actor - NPCs in the game
export const actors = pgTable(
  'Actor',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    description: text('description'),
    domain: text('domain').array().notNull().default([]),
    personality: text('personality'),
    tier: text('tier'),
    affiliations: text('affiliations').array().notNull().default([]),
    postStyle: text('postStyle'),
    postExample: text('postExample').array().notNull().default([]),
    role: text('role'),
    initialLuck: text('initialLuck').notNull().default('medium'),
    initialMood: doublePrecision('initialMood').notNull().default(0),
    createdAt: timestamp('createdAt', { mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updatedAt', { mode: 'date' }).notNull(),
    hasPool: boolean('hasPool').notNull().default(false),
    profileImageUrl: text('profileImageUrl'),
    reputationPoints: integer('reputationPoints').notNull().default(10000),
    tradingBalance: decimal('tradingBalance', { precision: 18, scale: 2 })
      .notNull()
      .default('10000'),
    isTest: boolean('isTest').notNull().default(false),
  },
  (table) => [
    index('Actor_hasPool_idx').on(table.hasPool),
    index('Actor_reputationPoints_idx').on(table.reputationPoints),
    index('Actor_role_idx').on(table.role),
    index('Actor_tier_idx').on(table.tier),
  ]
);

// ActorFollow - NPC follow relationships
export const actorFollows = pgTable(
  'ActorFollow',
  {
    id: text('id').primaryKey(),
    followerId: text('followerId').notNull(),
    followingId: text('followingId').notNull(),
    createdAt: timestamp('createdAt', { mode: 'date' }).notNull().defaultNow(),
    isMutual: boolean('isMutual').notNull().default(false),
  },
  (table) => [
    index('ActorFollow_followerId_idx').on(table.followerId),
    index('ActorFollow_followingId_idx').on(table.followingId),
    index('ActorFollow_isMutual_idx').on(table.isMutual),
  ]
);

// ActorRelationship - Relationships between NPCs
export const actorRelationships = pgTable(
  'ActorRelationship',
  {
    id: text('id').primaryKey(),
    actor1Id: text('actor1Id').notNull(),
    actor2Id: text('actor2Id').notNull(),
    relationshipType: text('relationshipType').notNull(),
    strength: doublePrecision('strength').notNull(),
    sentiment: doublePrecision('sentiment').notNull(),
    isPublic: boolean('isPublic').notNull().default(true),
    history: text('history'),
    affects: json('affects').$type<JsonValue>(),
    createdAt: timestamp('createdAt', { mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updatedAt', { mode: 'date' }).notNull(),
    lastInteraction: timestamp('lastInteraction', { mode: 'date' }),
    interactionCount: integer('interactionCount').notNull().default(0),
    evolutionCount: integer('evolutionCount').notNull().default(0),
  },
  (table) => [
    index('ActorRelationship_actor1Id_idx').on(table.actor1Id),
    index('ActorRelationship_actor2Id_idx').on(table.actor2Id),
    index('ActorRelationship_relationshipType_idx').on(table.relationshipType),
    index('ActorRelationship_sentiment_idx').on(table.sentiment),
    index('ActorRelationship_strength_idx').on(table.strength),
    index('ActorRelationship_lastInteraction_idx').on(table.lastInteraction),
  ]
);

// NPCInteraction - Interactions between NPCs
export const npcInteractions = pgTable(
  'NPCInteraction',
  {
    id: text('id').primaryKey(),
    actor1Id: text('actor1Id').notNull(),
    actor2Id: text('actor2Id').notNull(),
    interactionType: text('interactionType').notNull(),
    sentiment: doublePrecision('sentiment').notNull().default(0),
    context: text('context').notNull(),
    metadata: json('metadata').$type<JsonValue>(),
    timestamp: timestamp('timestamp', { mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    index('NPCInteraction_actor1Id_actor2Id_timestamp_idx').on(
      table.actor1Id,
      table.actor2Id,
      table.timestamp
    ),
    index('NPCInteraction_timestamp_idx').on(table.timestamp),
    index('NPCInteraction_actor1Id_idx').on(table.actor1Id),
    index('NPCInteraction_actor2Id_idx').on(table.actor2Id),
    index('NPCInteraction_interactionType_idx').on(table.interactionType),
  ]
);

// NPCTrade - Trades made by NPCs
export const npcTrades = pgTable(
  'NPCTrade',
  {
    id: text('id').primaryKey(),
    npcActorId: text('npcActorId').notNull(),
    poolId: text('poolId'),
    marketType: text('marketType').notNull(),
    ticker: text('ticker'),
    marketId: text('marketId'),
    action: text('action').notNull(),
    side: text('side'),
    amount: doublePrecision('amount').notNull(),
    price: doublePrecision('price').notNull(),
    sentiment: doublePrecision('sentiment'),
    reason: text('reason'),
    postId: text('postId'),
    executedAt: timestamp('executedAt', { mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    index('NPCTrade_executedAt_idx').on(table.executedAt),
    index('NPCTrade_marketType_ticker_idx').on(table.marketType, table.ticker),
    index('NPCTrade_npcActorId_executedAt_idx').on(
      table.npcActorId,
      table.executedAt
    ),
    index('NPCTrade_poolId_executedAt_idx').on(table.poolId, table.executedAt),
  ]
);

// Relations
export const actorsRelations = relations(actors, ({ many }) => ({
  followerActorFollows: many(actorFollows, {
    relationName: 'ActorFollow_followerIdToActor',
  }),
  followingActorFollows: many(actorFollows, {
    relationName: 'ActorFollow_followingIdToActor',
  }),
  actor1Relationships: many(actorRelationships, {
    relationName: 'ActorRelationship_actor1IdToActor',
  }),
  actor2Relationships: many(actorRelationships, {
    relationName: 'ActorRelationship_actor2IdToActor',
  }),
  actor1Interactions: many(npcInteractions, {
    relationName: 'NPCInteraction_actor1IdToActor',
  }),
  actor2Interactions: many(npcInteractions, {
    relationName: 'NPCInteraction_actor2IdToActor',
  }),
  npcTrades: many(npcTrades),
}));

export const actorFollowsRelations = relations(actorFollows, ({ one }) => ({
  follower: one(actors, {
    fields: [actorFollows.followerId],
    references: [actors.id],
    relationName: 'ActorFollow_followerIdToActor',
  }),
  following: one(actors, {
    fields: [actorFollows.followingId],
    references: [actors.id],
    relationName: 'ActorFollow_followingIdToActor',
  }),
}));

export const actorRelationshipsRelations = relations(
  actorRelationships,
  ({ one }) => ({
    actor1: one(actors, {
      fields: [actorRelationships.actor1Id],
      references: [actors.id],
      relationName: 'ActorRelationship_actor1IdToActor',
    }),
    actor2: one(actors, {
      fields: [actorRelationships.actor2Id],
      references: [actors.id],
      relationName: 'ActorRelationship_actor2IdToActor',
    }),
  })
);

export const npcInteractionsRelations = relations(npcInteractions, ({ one }) => ({
  actor1: one(actors, {
    fields: [npcInteractions.actor1Id],
    references: [actors.id],
    relationName: 'NPCInteraction_actor1IdToActor',
  }),
  actor2: one(actors, {
    fields: [npcInteractions.actor2Id],
    references: [actors.id],
    relationName: 'NPCInteraction_actor2IdToActor',
  }),
}));

export const npcTradesRelations = relations(npcTrades, ({ one }) => ({
  actor: one(actors, {
    fields: [npcTrades.npcActorId],
    references: [actors.id],
  }),
}));

// Type exports
export type Actor = typeof actors.$inferSelect;
export type NewActor = typeof actors.$inferInsert;
export type ActorFollow = typeof actorFollows.$inferSelect;
export type NewActorFollow = typeof actorFollows.$inferInsert;
export type ActorRelationship = typeof actorRelationships.$inferSelect;
export type NewActorRelationship = typeof actorRelationships.$inferInsert;
export type NPCInteraction = typeof npcInteractions.$inferSelect;
export type NewNPCInteraction = typeof npcInteractions.$inferInsert;
export type NPCTrade = typeof npcTrades.$inferSelect;
export type NewNPCTrade = typeof npcTrades.$inferInsert;

