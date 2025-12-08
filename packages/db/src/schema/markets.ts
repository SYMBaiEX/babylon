import { relations } from 'drizzle-orm';
import {
  boolean,
  decimal,
  doublePrecision,
  index,
  integer,
  pgTable,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';
import { users } from './users';

// Market - Prediction markets
export const markets = pgTable(
  'Market',
  {
    id: text('id').primaryKey(),
    question: text('question').notNull(),
    description: text('description'),
    gameId: text('gameId'),
    dayNumber: integer('dayNumber'),
    yesShares: decimal('yesShares', { precision: 18, scale: 6 })
      .notNull()
      .default('0'),
    noShares: decimal('noShares', { precision: 18, scale: 6 })
      .notNull()
      .default('0'),
    liquidity: decimal('liquidity', { precision: 18, scale: 6 }).notNull(),
    resolved: boolean('resolved').notNull().default(false),
    resolution: boolean('resolution'),
    endDate: timestamp('endDate', { mode: 'date' }).notNull(),
    createdAt: timestamp('createdAt', { mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updatedAt', { mode: 'date' }).notNull(),
    onChainMarketId: text('onChainMarketId'),
    onChainResolutionTxHash: text('onChainResolutionTxHash'),
    onChainResolved: boolean('onChainResolved').notNull().default(false),
    oracleAddress: text('oracleAddress'),
  },
  (table) => [
    index('Market_createdAt_idx').on(table.createdAt),
    index('Market_gameId_dayNumber_idx').on(table.gameId, table.dayNumber),
    index('Market_onChainMarketId_idx').on(table.onChainMarketId),
    index('Market_resolved_endDate_idx').on(table.resolved, table.endDate),
  ]
);

// Question
export const questions = pgTable(
  'Question',
  {
    id: text('id').primaryKey(),
    questionNumber: integer('questionNumber').notNull().unique(),
    text: text('text').notNull(),
    scenarioId: integer('scenarioId').notNull(),
    outcome: boolean('outcome').notNull(),
    rank: integer('rank').notNull(),
    createdDate: timestamp('createdDate', { mode: 'date' })
      .notNull()
      .defaultNow(),
    resolutionDate: timestamp('resolutionDate', { mode: 'date' }).notNull(),
    status: text('status').notNull().default('active'),
    resolvedOutcome: boolean('resolvedOutcome'),
    createdAt: timestamp('createdAt', { mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updatedAt', { mode: 'date' }).notNull(),
    oracleCommitBlock: integer('oracleCommitBlock'),
    oracleCommitTxHash: text('oracleCommitTxHash'),
    oracleCommitment: text('oracleCommitment'),
    oracleError: text('oracleError'),
    oraclePublishedAt: timestamp('oraclePublishedAt', { mode: 'date' }),
    oracleRevealBlock: integer('oracleRevealBlock'),
    oracleRevealTxHash: text('oracleRevealTxHash'),
    oracleSaltEncrypted: text('oracleSaltEncrypted'),
    oracleSessionId: text('oracleSessionId').unique(),
    resolutionProofUrl: text('resolutionProofUrl'),
    resolutionDescription: text('resolutionDescription'),
  },
  (table) => [
    index('Question_createdDate_idx').on(table.createdDate),
    index('Question_oraclePublishedAt_idx').on(table.oraclePublishedAt),
    index('Question_oracleSessionId_idx').on(table.oracleSessionId),
    index('Question_status_resolutionDate_idx').on(
      table.status,
      table.resolutionDate
    ),
  ]
);

// Position
export const positions = pgTable(
  'Position',
  {
    id: text('id').primaryKey(),
    userId: text('userId').notNull(),
    marketId: text('marketId').notNull(),
    side: boolean('side').notNull(),
    shares: decimal('shares', { precision: 18, scale: 6 }).notNull(),
    avgPrice: decimal('avgPrice', { precision: 18, scale: 6 }).notNull(),
    createdAt: timestamp('createdAt', { mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updatedAt', { mode: 'date' }).notNull(),
    amount: decimal('amount', { precision: 18, scale: 2 })
      .notNull()
      .default('0'),
    outcome: boolean('outcome'),
    pnl: decimal('pnl', { precision: 18, scale: 2 }),
    questionId: integer('questionId'),
    resolvedAt: timestamp('resolvedAt', { mode: 'date' }),
    status: text('status').notNull().default('active'),
  },
  (table) => [
    index('Position_marketId_idx').on(table.marketId),
    index('Position_questionId_idx').on(table.questionId),
    index('Position_status_idx').on(table.status),
    index('Position_userId_idx').on(table.userId),
    index('Position_userId_marketId_idx').on(table.userId, table.marketId),
    index('Position_userId_status_idx').on(table.userId, table.status),
  ]
);

// PredictionPriceHistory
export const predictionPriceHistories = pgTable(
  'PredictionPriceHistory',
  {
    id: text('id').primaryKey(),
    marketId: text('marketId').notNull(),
    yesPrice: doublePrecision('yesPrice').notNull(),
    noPrice: doublePrecision('noPrice').notNull(),
    yesShares: decimal('yesShares', { precision: 24, scale: 8 }).notNull(),
    noShares: decimal('noShares', { precision: 24, scale: 8 }).notNull(),
    liquidity: decimal('liquidity', { precision: 24, scale: 8 }).notNull(),
    eventType: text('eventType').notNull(),
    source: text('source').notNull(),
    createdAt: timestamp('createdAt', { mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    index('PredictionPriceHistory_marketId_createdAt_idx').on(
      table.marketId,
      table.createdAt
    ),
  ]
);

/**
 * StockPrice - Historical price data for organizations (perp markets)
 *
 * Note: organizationId references organization IDs from StaticDataRegistry (static)
 * and organizationState (dynamic). Static organization data (name, ticker, type)
 * is accessed via StaticDataRegistry, current prices via organizationState.
 */
// StockPrice
export const stockPrices = pgTable(
  'StockPrice',
  {
    id: text('id').primaryKey(),
    organizationId: text('organizationId').notNull(),
    price: doublePrecision('price').notNull(),
    change: doublePrecision('change').notNull(),
    changePercent: doublePrecision('changePercent').notNull(),
    timestamp: timestamp('timestamp', { mode: 'date' }).notNull().defaultNow(),
    isSnapshot: boolean('isSnapshot').notNull().default(false),
    openPrice: doublePrecision('openPrice'),
    highPrice: doublePrecision('highPrice'),
    lowPrice: doublePrecision('lowPrice'),
    volume: doublePrecision('volume'),
  },
  (table) => [
    index('StockPrice_isSnapshot_timestamp_idx').on(
      table.isSnapshot,
      table.timestamp
    ),
    index('StockPrice_organizationId_timestamp_idx').on(
      table.organizationId,
      table.timestamp
    ),
    index('StockPrice_timestamp_idx').on(table.timestamp),
  ]
);

// PerpPosition
export const perpPositions = pgTable(
  'PerpPosition',
  {
    id: text('id').primaryKey(),
    userId: text('userId').notNull(),
    ticker: text('ticker').notNull(),
    organizationId: text('organizationId').notNull(),
    side: text('side').notNull(),
    entryPrice: doublePrecision('entryPrice').notNull(),
    currentPrice: doublePrecision('currentPrice').notNull(),
    size: doublePrecision('size').notNull(),
    leverage: integer('leverage').notNull(),
    liquidationPrice: doublePrecision('liquidationPrice').notNull(),
    unrealizedPnL: doublePrecision('unrealizedPnL').notNull(),
    unrealizedPnLPercent: doublePrecision('unrealizedPnLPercent').notNull(),
    fundingPaid: doublePrecision('fundingPaid').notNull().default(0),
    openedAt: timestamp('openedAt', { mode: 'date' }).notNull().defaultNow(),
    lastUpdated: timestamp('lastUpdated', { mode: 'date' }).notNull(),
    closedAt: timestamp('closedAt', { mode: 'date' }),
    realizedPnL: doublePrecision('realizedPnL'),
    settledAt: timestamp('settledAt', { mode: 'date' }),
    settledToChain: boolean('settledToChain').notNull().default(false),
    settlementTxHash: text('settlementTxHash'),
  },
  (table) => [
    index('PerpPosition_organizationId_idx').on(table.organizationId),
    index('PerpPosition_settledToChain_idx').on(table.settledToChain),
    index('PerpPosition_ticker_idx').on(table.ticker),
    index('PerpPosition_userId_closedAt_idx').on(table.userId, table.closedAt),
  ]
);

// Relations
export const marketsRelations = relations(markets, ({ many }) => ({
  positions: many(positions),
  priceHistory: many(predictionPriceHistories),
}));

export const questionsRelations = relations(questions, ({ many }) => ({
  positions: many(positions),
}));

export const positionsRelations = relations(positions, ({ one }) => ({
  Market: one(markets, {
    fields: [positions.marketId],
    references: [markets.id],
  }),
  Question: one(questions, {
    fields: [positions.questionId],
    references: [questions.questionNumber],
  }),
  User: one(users, {
    fields: [positions.userId],
    references: [users.id],
  }),
}));

export const predictionPriceHistoriesRelations = relations(
  predictionPriceHistories,
  ({ one }) => ({
    market: one(markets, {
      fields: [predictionPriceHistories.marketId],
      references: [markets.id],
    }),
  })
);

// Type exports
export type Market = typeof markets.$inferSelect;
export type NewMarket = typeof markets.$inferInsert;
export type Question = typeof questions.$inferSelect;
export type NewQuestion = typeof questions.$inferInsert;
export type Position = typeof positions.$inferSelect;
export type NewPosition = typeof positions.$inferInsert;
export type PredictionPriceHistory =
  typeof predictionPriceHistories.$inferSelect;
export type NewPredictionPriceHistory =
  typeof predictionPriceHistories.$inferInsert;
export type StockPrice = typeof stockPrices.$inferSelect;
export type NewStockPrice = typeof stockPrices.$inferInsert;
export type PerpPosition = typeof perpPositions.$inferSelect;
export type NewPerpPosition = typeof perpPositions.$inferInsert;
