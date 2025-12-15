/**
 * Game Bootstrap Service
 *
 * Ensures all game data is properly seeded and synced at tick start.
 * Replaces the need for manual seeding scripts.
 */

import {
  actorState,
  db,
  eq,
  games,
  generateSnowflakeId,
  organizationState,
  perpMarketSnapshots,
  pools,
  rssFeedSources,
  sql,
} from '@babylon/db';
import type { ActorTier } from '@babylon/shared';
import { logger } from '@babylon/shared';
import { CapitalAllocationService } from './capital-allocation-service';
import { StaticDataRegistry } from './static-data-registry';

// Minimum balance thresholds by tier
const MINIMUM_BALANCE_BY_TIER: Record<string, number> = {
  S_TIER: 50000,
  A_TIER: 25000,
  B_TIER: 10000,
  C_TIER: 5000,
};

const DEFAULT_MINIMUM_BALANCE = 5000;
const MAX_TOP_UP_AMOUNT = 100000;

// RSS Feed sources for news generation
const RSS_FEEDS = [
  {
    name: 'New York Times - Technology',
    feedUrl: 'https://rss.nytimes.com/services/xml/rss/nyt/Technology.xml',
    category: 'tech',
  },
  {
    name: 'New York Times - Business',
    feedUrl: 'https://rss.nytimes.com/services/xml/rss/nyt/Business.xml',
    category: 'business',
  },
  {
    name: 'TechCrunch',
    feedUrl: 'https://techcrunch.com/feed/',
    category: 'tech',
  },
  {
    name: 'Ars Technica',
    feedUrl: 'https://feeds.arstechnica.com/arstechnica/index',
    category: 'tech',
  },
  {
    name: 'The Verge',
    feedUrl: 'https://www.theverge.com/rss/index.xml',
    category: 'tech',
  },
  {
    name: 'Wired',
    feedUrl: 'https://www.wired.com/feed/rss',
    category: 'tech',
  },
  {
    name: 'CoinDesk',
    feedUrl: 'https://www.coindesk.com/arc/outboundfeeds/rss/',
    category: 'crypto',
  },
  {
    name: 'Cointelegraph',
    feedUrl: 'https://cointelegraph.com/rss',
    category: 'crypto',
  },
  {
    name: 'BBC - Technology',
    feedUrl: 'https://feeds.bbci.co.uk/news/technology/rss.xml',
    category: 'tech',
  },
];

export interface GameBootstrapResult {
  actorsCreated: number;
  actorsUpdated: number;
  actorsToppedUp: number;
  organizationsCreated: number;
  organizationsUpdated: number;
  poolsCreated: number;
  rssFeedsCreated: number;
  perpMarketsCreated: number;
  gameStateInitialized: boolean;
  totalTopUpAmount: number;
}

export class GameBootstrapService {
  private static lastBootstrapTime = 0;
  private static BOOTSTRAP_COOLDOWN_MS = 60000;
  private static isBootstrapping = false;

  static async bootstrapIfNeeded(): Promise<GameBootstrapResult | null> {
    const now = Date.now();

    // Check if we've bootstrapped recently
    if (now - this.lastBootstrapTime < this.BOOTSTRAP_COOLDOWN_MS) {
      return null;
    }

    // Prevent concurrent bootstrapping
    if (this.isBootstrapping) {
      return null;
    }

    this.isBootstrapping = true;
    this.lastBootstrapTime = now;

    const result: GameBootstrapResult = {
      actorsCreated: 0,
      actorsUpdated: 0,
      actorsToppedUp: 0,
      organizationsCreated: 0,
      organizationsUpdated: 0,
      poolsCreated: 0,
      rssFeedsCreated: 0,
      perpMarketsCreated: 0,
      gameStateInitialized: false,
      totalTopUpAmount: 0,
    };

    try {
      // Get static data from registry (no file loading needed)
      const staticActors = StaticDataRegistry.getAllActors();
      const staticOrgs = StaticDataRegistry.getAllOrganizations();

      // Get existing database state from state tables
      const [existingActorStates, existingOrgStates] = await Promise.all([
        db.select({ id: actorState.id }).from(actorState),
        db.select({ id: organizationState.id }).from(organizationState),
      ]);
      const existingActorIds = new Set(existingActorStates.map((a) => a.id));
      const existingOrgIds = new Set(existingOrgStates.map((o) => o.id));

      // 1. Sync actor states (only dynamic data)
      for (const actor of staticActors) {
        if (!existingActorIds.has(actor.id)) {
          await this.seedActorState(actor);
          result.actorsCreated++;
        }
      }

      // 2. Sync organization states (only dynamic data)
      for (const org of staticOrgs) {
        if (!existingOrgIds.has(org.id)) {
          await this.seedOrganizationState(org);
          result.organizationsCreated++;
        }
      }

      // 3. Ensure minimum balances
      const topUpResult = await this.ensureMinimumBalances();
      result.actorsToppedUp = topUpResult.count;
      result.totalTopUpAmount = topUpResult.totalAmount;

      // 4. Ensure pools exist
      result.poolsCreated = await this.ensureActorPools();

      // 5. Ensure game state exists
      result.gameStateInitialized = await this.ensureGameState();

      // 6. Ensure RSS feeds
      result.rssFeedsCreated = await this.ensureRSSFeeds();

      // 7. Ensure perp market snapshots exist for all tradeable organizations
      result.perpMarketsCreated = await this.ensurePerpMarketSnapshots();

      // Log summary if anything changed
      const hasChanges =
        result.actorsCreated > 0 ||
        result.actorsToppedUp > 0 ||
        result.organizationsCreated > 0 ||
        result.poolsCreated > 0 ||
        result.rssFeedsCreated > 0 ||
        result.perpMarketsCreated > 0 ||
        result.gameStateInitialized;

      if (hasChanges) {
        logger.info('Game bootstrap complete', result, 'GameBootstrapService');
      }

      return result;
    } catch (error) {
      logger.error(
        'Game bootstrap failed',
        { error: String(error) },
        'GameBootstrapService'
      );
      throw error;
    } finally {
      this.isBootstrapping = false;
    }
  }

  static async forceFullSync(): Promise<GameBootstrapResult> {
    this.lastBootstrapTime = 0;
    this.isBootstrapping = false;

    const result: GameBootstrapResult = {
      actorsCreated: 0,
      actorsUpdated: 0,
      actorsToppedUp: 0,
      organizationsCreated: 0,
      organizationsUpdated: 0,
      poolsCreated: 0,
      rssFeedsCreated: 0,
      perpMarketsCreated: 0,
      gameStateInitialized: false,
      totalTopUpAmount: 0,
    };

    // Get static data from registry
    const staticActors = StaticDataRegistry.getAllActors();
    const staticOrgs = StaticDataRegistry.getAllOrganizations();

    // Sync all actor states (update existing, create missing)
    for (const actor of staticActors) {
      const syncResult = await this.syncActorState(actor);
      if (syncResult.created) result.actorsCreated++;
      if (syncResult.updated) result.actorsUpdated++;
    }

    // Sync all organization states
    for (const org of staticOrgs) {
      const syncResult = await this.syncOrganizationState(org);
      if (syncResult.created) result.organizationsCreated++;
      if (syncResult.updated) result.organizationsUpdated++;
    }

    // Ensure minimum balances
    const topUpResult = await this.ensureMinimumBalances();
    result.actorsToppedUp = topUpResult.count;
    result.totalTopUpAmount = topUpResult.totalAmount;

    result.poolsCreated = await this.ensureActorPools();

    result.gameStateInitialized = await this.ensureGameState();
    result.rssFeedsCreated = await this.ensureRSSFeeds();
    result.perpMarketsCreated = await this.ensurePerpMarketSnapshots();

    logger.info('Force full sync complete', result, 'GameBootstrapService');
    return result;
  }

  private static async seedActorState(actor: {
    id: string;
    name: string;
    tier: ActorTier | null;
    domain: string[];
  }): Promise<void> {
    const capital = CapitalAllocationService.calculateCapital({
      id: actor.id,
      name: actor.name,
      description: undefined,
      domain: actor.domain,
      tier: actor.tier ?? undefined,
    });

    await db.insert(actorState).values({
      id: actor.id,
      tradingBalance: capital.tradingBalance.toString(),
      reputationPoints: capital.reputationPoints,
      hasPool: false,
      updatedAt: new Date(),
    });

    logger.debug(
      `Seeded actor state ${actor.name} with $${capital.tradingBalance}`,
      { actorId: actor.id },
      'GameBootstrapService'
    );
  }

  private static async syncActorState(actor: {
    id: string;
    name: string;
    tier: ActorTier | null;
    domain: string[];
  }): Promise<{ created: boolean; updated: boolean }> {
    const existing = await db
      .select({
        id: actorState.id,
        tradingBalance: actorState.tradingBalance,
      })
      .from(actorState)
      .where(eq(actorState.id, actor.id))
      .limit(1);

    if (existing.length === 0) {
      await this.seedActorState(actor);
      return { created: true, updated: false };
    }

    const existingState = existing[0];
    if (!existingState) return { created: false, updated: false };

    const tier = actor.tier || 'C_TIER';
    const minimumBalance =
      MINIMUM_BALANCE_BY_TIER[tier] || DEFAULT_MINIMUM_BALANCE;
    const currentBalance = Number(existingState.tradingBalance) || 0;

    // Only update balance if below minimum
    if (currentBalance < minimumBalance) {
      await db
        .update(actorState)
        .set({
          tradingBalance: minimumBalance.toString(),
          updatedAt: new Date(),
        })
        .where(eq(actorState.id, actor.id));
    }

    return { created: false, updated: true };
  }

  private static async seedOrganizationState(org: {
    id: string;
    name: string;
    initialPrice: number | null;
  }): Promise<void> {
    await db.insert(organizationState).values({
      id: org.id,
      currentPrice: org.initialPrice,
      updatedAt: new Date(),
    });

    logger.debug(
      `Seeded organization state ${org.name}`,
      { orgId: org.id },
      'GameBootstrapService'
    );
  }

  private static async syncOrganizationState(org: {
    id: string;
    name: string;
    initialPrice: number | null;
  }): Promise<{ created: boolean; updated: boolean }> {
    const existing = await db
      .select({
        id: organizationState.id,
        currentPrice: organizationState.currentPrice,
      })
      .from(organizationState)
      .where(eq(organizationState.id, org.id))
      .limit(1);

    if (existing.length === 0) {
      await this.seedOrganizationState(org);
      return { created: true, updated: false };
    }

    const existingState = existing[0];
    if (!existingState) return { created: false, updated: false };

    // Organization state only contains currentPrice - no update needed for static data
    // Price updates happen via the normal game tick flow
    return { created: false, updated: false };
  }

  private static async ensureMinimumBalances(): Promise<{
    count: number;
    totalAmount: number;
  }> {
    // Get all actor states with their balances
    const allActorStates = await db
      .select({
        id: actorState.id,
        tradingBalance: actorState.tradingBalance,
      })
      .from(actorState);

    let toppedUpCount = 0;
    let totalTopUp = 0;

    for (const state of allActorStates) {
      // Get static actor data for tier info
      const staticActor = StaticDataRegistry.getActor(state.id);
      const currentBalance = Number(state.tradingBalance) || 0;
      const tier = staticActor?.tier || 'C_TIER';
      const minimumBalance =
        MINIMUM_BALANCE_BY_TIER[tier] || DEFAULT_MINIMUM_BALANCE;

      if (currentBalance < minimumBalance) {
        const deficit = minimumBalance - currentBalance;
        const topUpAmount = Math.min(deficit, MAX_TOP_UP_AMOUNT);
        const newBalance = currentBalance + topUpAmount;

        await db
          .update(actorState)
          .set({
            tradingBalance: newBalance.toString(),
            updatedAt: new Date(),
          })
          .where(eq(actorState.id, state.id));

        toppedUpCount++;
        totalTopUp += topUpAmount;

        logger.debug(
          `Topped up ${staticActor?.name ?? state.id}: $${currentBalance} → $${newBalance}`,
          { actorId: state.id, topUpAmount },
          'GameBootstrapService'
        );
      }
    }

    return { count: toppedUpCount, totalAmount: totalTopUp };
  }

  private static async ensureActorPools(): Promise<number> {
    // Get actor states that don't have pools
    const actorStatesWithoutPools = await db
      .select({
        id: actorState.id,
        tradingBalance: actorState.tradingBalance,
      })
      .from(actorState)
      .where(eq(actorState.hasPool, false));

    let created = 0;

    for (const state of actorStatesWithoutPools) {
      const poolId = state.id;
      const balance = Number(state.tradingBalance) || 10000;
      const staticActor = StaticDataRegistry.getActor(state.id);

      const existingPool = await db
        .select({ id: pools.id })
        .from(pools)
        .where(eq(pools.id, poolId))
        .limit(1);

      if (existingPool.length === 0) {
        await db.insert(pools).values({
          id: poolId,
          name: `${staticActor?.name ?? state.id}'s Pool`,
          npcActorId: state.id,
          totalValue: balance.toString(),
          totalDeposits: balance.toString(),
          availableBalance: balance.toString(),
          lifetimePnL: '0',
          performanceFeeRate: 0.05,
          totalFeesCollected: '0',
          isActive: true,
          status: 'ACTIVE',
          updatedAt: new Date(),
        });

        await db
          .update(actorState)
          .set({ hasPool: true, updatedAt: new Date() })
          .where(eq(actorState.id, state.id));

        created++;
      }
    }

    return created;
  }

  private static async ensureGameState(): Promise<boolean> {
    const existingGame = await db
      .select()
      .from(games)
      .where(eq(games.isContinuous, true))
      .limit(1);

    if (existingGame.length === 0) {
      const now = new Date();
      const gameId = await generateSnowflakeId();

      await db.insert(games).values({
        id: gameId,
        isContinuous: true,
        isRunning: true,
        currentDate: now,
        currentDay: 1,
        speed: 60000,
        startedAt: now,
        updatedAt: now,
      });

      logger.info('Game state initialized', undefined, 'GameBootstrapService');
      return true;
    }

    // Ensure game is running
    const game = existingGame[0];
    if (game && !game.isRunning) {
      await db
        .update(games)
        .set({
          isRunning: true,
          startedAt: game.startedAt || new Date(),
          pausedAt: null,
        })
        .where(eq(games.id, game.id));
      return true;
    }

    return false;
  }

  private static async ensureRSSFeeds(): Promise<number> {
    let created = 0;

    for (const feed of RSS_FEEDS) {
      const existing = await db
        .select({ id: rssFeedSources.id })
        .from(rssFeedSources)
        .where(eq(rssFeedSources.feedUrl, feed.feedUrl))
        .limit(1);

      if (existing.length === 0) {
        await db.insert(rssFeedSources).values({
          id: await generateSnowflakeId(),
          name: feed.name,
          feedUrl: feed.feedUrl,
          category: feed.category,
          updatedAt: new Date(),
        });
        created++;
      }
    }

    return created;
  }

  /**
   * Ensure perp market snapshots exist for all organizations with tickers.
   * This is required for the perpetual markets to be tradeable.
   */
  private static async ensurePerpMarketSnapshots(): Promise<number> {
    let created = 0;

    // Get all organizations with tickers (these are tradeable as perps)
    const staticOrgs = StaticDataRegistry.getAllOrganizations();
    const tradeableOrgs = staticOrgs.filter((o) => o.ticker);

    // Get existing perp market snapshots
    const existingSnapshots = await db
      .select({ ticker: perpMarketSnapshots.ticker })
      .from(perpMarketSnapshots);
    const existingTickers = new Set(existingSnapshots.map((s) => s.ticker));

    // Get organization states for current prices
    const orgStates = await db.select().from(organizationState);
    const priceMap = new Map<string, number | null>(
      orgStates.map((s) => [s.id, s.currentPrice])
    );

    const now = new Date();
    const defaultFundingRate = {
      rate: 0.01, // 1% APR base
      nextFundingTime: new Date(now.getTime() + 8 * 60 * 60 * 1000).toISOString(), // 8 hours
      predictedRate: 0.01,
    };

    for (const org of tradeableOrgs) {
      if (!org.ticker || existingTickers.has(org.ticker)) {
        continue;
      }

      // Use current price from state, or initial price, or default
      const currentPrice =
        priceMap.get(org.id) ?? org.initialPrice ?? 100;

      await db.insert(perpMarketSnapshots).values({
        ticker: org.ticker,
        organizationId: org.id,
        name: org.name,
        currentPrice,
        price24hAgo: currentPrice,
        price24hAgoUpdatedAt: now,
        metrics24hResetAt: now,
        change24h: 0,
        changePercent24h: 0,
        high24h: currentPrice,
        low24h: currentPrice,
        volume24h: 0,
        openInterest: 0,
        fundingRate: defaultFundingRate,
        maxLeverage: 100,
        minOrderSize: 10,
        markPrice: currentPrice,
        indexPrice: currentPrice,
        createdAt: now,
        updatedAt: now,
      });

      created++;
      logger.debug(
        `Created perp market snapshot for ${org.ticker} (${org.name})`,
        { ticker: org.ticker, price: currentPrice },
        'GameBootstrapService'
      );
    }

    if (created > 0) {
      logger.info(
        `Created ${created} perp market snapshots`,
        { created },
        'GameBootstrapService'
      );
    }

    return created;
  }

  static getMinimumBalance(tier: string): number {
    return MINIMUM_BALANCE_BY_TIER[tier] || DEFAULT_MINIMUM_BALANCE;
  }

  static async getStats(): Promise<{
    actors: number;
    organizations: number;
    pools: number;
    characterMappings: number;
    organizationMappings: number;
    rssFeedSources: number;
    perpMarkets: number;
  }> {
    const [actorCount, orgCount, poolCount, feedCount, perpMarketCount] =
      await Promise.all([
        db.select({ count: sql<number>`count(*)` }).from(actorState),
        db.select({ count: sql<number>`count(*)` }).from(organizationState),
        db.select({ count: sql<number>`count(*)` }).from(pools),
        db.select({ count: sql<number>`count(*)` }).from(rssFeedSources),
        db.select({ count: sql<number>`count(*)` }).from(perpMarketSnapshots),
      ]);

    return {
      actors: Number(actorCount[0]?.count ?? 0),
      organizations: Number(orgCount[0]?.count ?? 0),
      pools: Number(poolCount[0]?.count ?? 0),
      characterMappings: StaticDataRegistry.getAllCharacterMappings().length,
      organizationMappings:
        StaticDataRegistry.getAllOrganizationMappings().length,
      rssFeedSources: Number(feedCount[0]?.count ?? 0),
      perpMarkets: Number(perpMarketCount[0]?.count ?? 0),
    };
  }
}

// Export convenience function for game tick
export async function bootstrapGameIfNeeded(): Promise<GameBootstrapResult | null> {
  return GameBootstrapService.bootstrapIfNeeded();
}
