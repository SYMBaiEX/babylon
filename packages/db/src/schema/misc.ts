import { relations } from 'drizzle-orm';
import {
  bigint,
  boolean,
  index,
  integer,
  json,
  pgTable,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';
import type { JsonValue } from '../types';
import { realtimeOutboxStatusEnum } from './enums';

// Game
export const games = pgTable(
  'Game',
  {
    id: text('id').primaryKey(),
    currentDay: integer('currentDay').notNull().default(1),
    currentDate: timestamp('currentDate', { mode: 'date' })
      .notNull()
      .defaultNow(),
    isRunning: boolean('isRunning').notNull().default(false),
    isContinuous: boolean('isContinuous').notNull().default(true),
    speed: integer('speed').notNull().default(60000),
    startedAt: timestamp('startedAt', { mode: 'date' }),
    pausedAt: timestamp('pausedAt', { mode: 'date' }),
    completedAt: timestamp('completedAt', { mode: 'date' }),
    lastTickAt: timestamp('lastTickAt', { mode: 'date' }),
    lastSnapshotAt: timestamp('lastSnapshotAt', { mode: 'date' }),
    activeQuestions: integer('activeQuestions').notNull().default(0),
    createdAt: timestamp('createdAt', { mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updatedAt', { mode: 'date' }).notNull(),
  },
  (table) => [
    index('Game_isContinuous_idx').on(table.isContinuous),
    index('Game_isRunning_idx').on(table.isRunning),
  ]
);

// GameConfig
export const gameConfigs = pgTable(
  'GameConfig',
  {
    id: text('id').primaryKey(),
    key: text('key').notNull().unique(),
    value: json('value').$type<JsonValue>().notNull(),
    createdAt: timestamp('createdAt', { mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updatedAt', { mode: 'date' }).notNull(),
  },
  (table) => [index('GameConfig_key_idx').on(table.key)]
);

// RealtimeOutbox
export const realtimeOutboxes = pgTable(
  'RealtimeOutbox',
  {
    id: text('id').primaryKey(),
    channel: text('channel').notNull(),
    type: text('type').notNull(),
    version: text('version').default('v1'),
    payload: json('payload').$type<JsonValue>().notNull(),
    status: realtimeOutboxStatusEnum('status').notNull().default('pending'),
    attempts: integer('attempts').notNull().default(0),
    lastError: text('lastError'),
    createdAt: timestamp('createdAt', { mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updatedAt', { mode: 'date' }).notNull(),
  },
  (table) => [
    index('RealtimeOutbox_status_createdAt_idx').on(
      table.status,
      table.createdAt
    ),
    index('RealtimeOutbox_channel_status_idx').on(table.channel, table.status),
  ]
);

// OAuthState
export const oAuthStates = pgTable(
  'OAuthState',
  {
    id: text('id').primaryKey(),
    state: text('state').notNull().unique(),
    codeVerifier: text('codeVerifier').notNull(),
    userId: text('userId'),
    returnPath: text('returnPath'),
    expiresAt: timestamp('expiresAt', { mode: 'date' }).notNull(),
    createdAt: timestamp('createdAt', { mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    index('OAuthState_expiresAt_idx').on(table.expiresAt),
    index('OAuthState_state_idx').on(table.state),
  ]
);

// OracleCommitment
export const oracleCommitments = pgTable(
  'OracleCommitment',
  {
    id: text('id').primaryKey(),
    questionId: text('questionId').notNull().unique(),
    sessionId: text('sessionId').notNull(),
    saltEncrypted: text('saltEncrypted').notNull(),
    commitment: text('commitment').notNull(),
    createdAt: timestamp('createdAt', { mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    index('OracleCommitment_createdAt_idx').on(table.createdAt),
    index('OracleCommitment_questionId_idx').on(table.questionId),
    index('OracleCommitment_sessionId_idx').on(table.sessionId),
  ]
);

// OracleTransaction
export const oracleTransactions = pgTable(
  'OracleTransaction',
  {
    id: text('id').primaryKey(),
    questionId: text('questionId'),
    txType: text('txType').notNull(),
    txHash: text('txHash').notNull().unique(),
    status: text('status').notNull(),
    blockNumber: integer('blockNumber'),
    gasUsed: bigint('gasUsed', { mode: 'bigint' }),
    gasPrice: bigint('gasPrice', { mode: 'bigint' }),
    error: text('error'),
    retryCount: integer('retryCount').notNull().default(0),
    createdAt: timestamp('createdAt', { mode: 'date' }).notNull().defaultNow(),
    confirmedAt: timestamp('confirmedAt', { mode: 'date' }),
  },
  (table) => [
    index('OracleTransaction_questionId_idx').on(table.questionId),
    index('OracleTransaction_status_createdAt_idx').on(
      table.status,
      table.createdAt
    ),
    index('OracleTransaction_txHash_idx').on(table.txHash),
    index('OracleTransaction_txType_idx').on(table.txType),
  ]
);

// WidgetCache
export const widgetCaches = pgTable(
  'WidgetCache',
  {
    widget: text('widget').primaryKey(),
    data: json('data').$type<JsonValue>().notNull(),
    updatedAt: timestamp('updatedAt', { mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    index('WidgetCache_widget_updatedAt_idx').on(table.widget, table.updatedAt),
  ]
);

// WorldEvent
export const worldEvents = pgTable(
  'WorldEvent',
  {
    id: text('id').primaryKey(),
    eventType: text('eventType').notNull(),
    description: text('description').notNull(),
    actors: text('actors').array().notNull().default([]),
    relatedQuestion: integer('relatedQuestion'),
    pointsToward: text('pointsToward'),
    visibility: text('visibility').notNull().default('public'),
    gameId: text('gameId'),
    dayNumber: integer('dayNumber'),
    timestamp: timestamp('timestamp', { mode: 'date' }).notNull().defaultNow(),
    createdAt: timestamp('createdAt', { mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    index('WorldEvent_gameId_dayNumber_idx').on(table.gameId, table.dayNumber),
    index('WorldEvent_relatedQuestion_idx').on(table.relatedQuestion),
    index('WorldEvent_timestamp_idx').on(table.timestamp),
  ]
);

// WorldFact
export const worldFacts = pgTable(
  'WorldFact',
  {
    id: text('id').primaryKey(),
    category: text('category').notNull(),
    key: text('key').notNull(),
    label: text('label').notNull(),
    value: text('value').notNull(),
    source: text('source'),
    lastUpdated: timestamp('lastUpdated', { mode: 'date' }).notNull(),
    isActive: boolean('isActive').notNull().default(true),
    priority: integer('priority').notNull().default(0),
    createdAt: timestamp('createdAt', { mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updatedAt', { mode: 'date' }).notNull(),
  },
  (table) => [
    index('WorldFact_category_isActive_idx').on(table.category, table.isActive),
    index('WorldFact_priority_idx').on(table.priority),
    index('WorldFact_lastUpdated_idx').on(table.lastUpdated),
  ]
);

// SystemSettings
export const systemSettings = pgTable('SystemSettings', {
  id: text('id').primaryKey().default('system'),
  createdAt: timestamp('createdAt', { mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updatedAt', { mode: 'date' }).notNull(),
});

// GenerationLock
export const generationLocks = pgTable(
  'GenerationLock',
  {
    id: text('id').primaryKey().default('game-tick-lock'),
    lockedBy: text('lockedBy').notNull(),
    lockedAt: timestamp('lockedAt', { mode: 'date' }).notNull().defaultNow(),
    expiresAt: timestamp('expiresAt', { mode: 'date' }).notNull(),
    operation: text('operation').notNull().default('game-tick'),
  },
  (table) => [index('GenerationLock_expiresAt_idx').on(table.expiresAt)]
);

// RSSFeedSource
export const rssFeedSources = pgTable(
  'RSSFeedSource',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    feedUrl: text('feedUrl').notNull(),
    category: text('category').notNull(),
    isActive: boolean('isActive').notNull().default(true),
    lastFetched: timestamp('lastFetched', { mode: 'date' }),
    fetchErrors: integer('fetchErrors').notNull().default(0),
    createdAt: timestamp('createdAt', { mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updatedAt', { mode: 'date' }).notNull(),
  },
  (table) => [
    index('RSSFeedSource_isActive_lastFetched_idx').on(
      table.isActive,
      table.lastFetched
    ),
    index('RSSFeedSource_category_idx').on(table.category),
  ]
);

// RSSHeadline
export const rssHeadlines = pgTable(
  'RSSHeadline',
  {
    id: text('id').primaryKey(),
    sourceId: text('sourceId').notNull(),
    title: text('title').notNull(),
    link: text('link'),
    publishedAt: timestamp('publishedAt', { mode: 'date' }).notNull(),
    summary: text('summary'),
    content: text('content'),
    rawData: json('rawData').$type<JsonValue>(),
    fetchedAt: timestamp('fetchedAt', { mode: 'date' }).notNull(),
  },
  (table) => [
    index('RSSHeadline_sourceId_publishedAt_idx').on(
      table.sourceId,
      table.publishedAt
    ),
    index('RSSHeadline_publishedAt_idx').on(table.publishedAt),
  ]
);

// ParodyHeadline
export const parodyHeadlines = pgTable(
  'ParodyHeadline',
  {
    id: text('id').primaryKey(),
    originalHeadlineId: text('originalHeadlineId').notNull().unique(),
    originalTitle: text('originalTitle').notNull(),
    originalSource: text('originalSource').notNull(),
    parodyTitle: text('parodyTitle').notNull(),
    parodyContent: text('parodyContent'),
    characterMappings: json('characterMappings').$type<JsonValue>().notNull(),
    organizationMappings: json('organizationMappings')
      .$type<JsonValue>()
      .notNull(),
    generatedAt: timestamp('generatedAt', { mode: 'date' }).notNull(),
    isUsed: boolean('isUsed').notNull().default(false),
    usedAt: timestamp('usedAt', { mode: 'date' }),
    createdAt: timestamp('createdAt', { mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    index('ParodyHeadline_isUsed_generatedAt_idx').on(
      table.isUsed,
      table.generatedAt
    ),
    index('ParodyHeadline_generatedAt_idx').on(table.generatedAt),
  ]
);

// CharacterMapping
export const characterMappings = pgTable(
  'CharacterMapping',
  {
    id: text('id').primaryKey(),
    realName: text('realName').notNull().unique(),
    parodyName: text('parodyName').notNull(),
    category: text('category').notNull(),
    aliases: text('aliases').array().notNull().default([]),
    isActive: boolean('isActive').notNull().default(true),
    priority: integer('priority').notNull().default(0),
    createdAt: timestamp('createdAt', { mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updatedAt', { mode: 'date' }).notNull(),
  },
  (table) => [
    index('CharacterMapping_category_isActive_idx').on(
      table.category,
      table.isActive
    ),
    index('CharacterMapping_priority_idx').on(table.priority),
  ]
);

// OrganizationMapping
export const organizationMappings = pgTable(
  'OrganizationMapping',
  {
    id: text('id').primaryKey(),
    realName: text('realName').notNull().unique(),
    parodyName: text('parodyName').notNull(),
    category: text('category').notNull(),
    aliases: text('aliases').array().notNull().default([]),
    isActive: boolean('isActive').notNull().default(true),
    priority: integer('priority').notNull().default(0),
    createdAt: timestamp('createdAt', { mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updatedAt', { mode: 'date' }).notNull(),
  },
  (table) => [
    index('OrganizationMapping_category_isActive_idx').on(
      table.category,
      table.isActive
    ),
    index('OrganizationMapping_priority_idx').on(table.priority),
  ]
);

// Relations
export const rssFeedSourcesRelations = relations(
  rssFeedSources,
  ({ many }) => ({
    headlines: many(rssHeadlines),
  })
);

export const rssHeadlinesRelations = relations(rssHeadlines, ({ one }) => ({
  source: one(rssFeedSources, {
    fields: [rssHeadlines.sourceId],
    references: [rssFeedSources.id],
  }),
  parodyHeadline: one(parodyHeadlines, {
    fields: [rssHeadlines.id],
    references: [parodyHeadlines.originalHeadlineId],
  }),
}));

export const parodyHeadlinesRelations = relations(
  parodyHeadlines,
  ({ one }) => ({
    originalHeadline: one(rssHeadlines, {
      fields: [parodyHeadlines.originalHeadlineId],
      references: [rssHeadlines.id],
    }),
  })
);

// Type exports
export type Game = typeof games.$inferSelect;
export type NewGame = typeof games.$inferInsert;
export type GameConfig = typeof gameConfigs.$inferSelect;
export type NewGameConfig = typeof gameConfigs.$inferInsert;
export type RealtimeOutbox = typeof realtimeOutboxes.$inferSelect;
export type NewRealtimeOutbox = typeof realtimeOutboxes.$inferInsert;
export type OAuthState = typeof oAuthStates.$inferSelect;
export type NewOAuthState = typeof oAuthStates.$inferInsert;
export type OracleCommitment = typeof oracleCommitments.$inferSelect;
export type NewOracleCommitment = typeof oracleCommitments.$inferInsert;
export type OracleTransaction = typeof oracleTransactions.$inferSelect;
export type NewOracleTransaction = typeof oracleTransactions.$inferInsert;
export type WidgetCache = typeof widgetCaches.$inferSelect;
export type NewWidgetCache = typeof widgetCaches.$inferInsert;
export type WorldEvent = typeof worldEvents.$inferSelect;
export type NewWorldEvent = typeof worldEvents.$inferInsert;
export type WorldFact = typeof worldFacts.$inferSelect;
export type NewWorldFact = typeof worldFacts.$inferInsert;
export type SystemSettings = typeof systemSettings.$inferSelect;
export type NewSystemSettings = typeof systemSettings.$inferInsert;
export type GenerationLock = typeof generationLocks.$inferSelect;
export type NewGenerationLock = typeof generationLocks.$inferInsert;
export type RSSFeedSource = typeof rssFeedSources.$inferSelect;
export type NewRSSFeedSource = typeof rssFeedSources.$inferInsert;
export type RSSHeadline = typeof rssHeadlines.$inferSelect;
export type NewRSSHeadline = typeof rssHeadlines.$inferInsert;
export type ParodyHeadline = typeof parodyHeadlines.$inferSelect;
export type NewParodyHeadline = typeof parodyHeadlines.$inferInsert;
export type CharacterMapping = typeof characterMappings.$inferSelect;
export type NewCharacterMapping = typeof characterMappings.$inferInsert;
export type OrganizationMapping = typeof organizationMappings.$inferSelect;
export type NewOrganizationMapping = typeof organizationMappings.$inferInsert;


