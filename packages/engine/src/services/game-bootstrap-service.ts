/**
 * Game Bootstrap Service
 *
 * Unified service that ensures all game data is properly seeded and synced.
 * This runs automatically at the start of each game tick to ensure:
 * - All actors from data files are in the database
 * - All organizations from data files are in the database
 * - All NPCs have minimum trading balances
 * - All NPCs have pools for trading
 * - Character/organization mappings are synced
 * - Game state is initialized
 * - RSS feeds are configured
 *
 * This replaces the need for manual seeding scripts for game data.
 */

import {
  actors,
  db,
  eq,
  games,
  generateSnowflakeId,
  organizations,
  pools,
  rssFeedSources,
  sql,
} from '@babylon/db';
import type { ActorTier } from '@babylon/shared';
import { logger } from '@babylon/shared';
import { existsSync } from 'fs';
import { join } from 'path';
import { loadActorsData } from '../actors-loader';
import { CapitalAllocationService } from './capital-allocation-service';

// =============================================================================
// CONFIGURATION
// =============================================================================

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

// =============================================================================
// TYPES
// =============================================================================

export interface GameBootstrapResult {
  actorsCreated: number;
  actorsUpdated: number;
  actorsToppedUp: number;
  organizationsCreated: number;
  organizationsUpdated: number;
  poolsCreated: number;
  rssFeedsCreated: number;
  gameStateInitialized: boolean;
  totalTopUpAmount: number;
}

interface ActorDataInput {
  id: string;
  name: string;
  realName?: string;
  lastName?: string;
  originalLastName?: string;
  description?: string;
  domain?: string[];
  personality?: string;
  tier?: string;
  affiliations?: string[];
  postStyle?: string;
  postExample?: string[];
  role?: string;
  initialLuck?: string;
  initialMood?: number;
}

interface OrgDataInput {
  id: string;
  name: string;
  ticker?: string;
  description?: string;
  type?: string;
  canBeInvolved?: boolean;
  initialPrice?: number;
  originalName?: string;
  originalHandle?: string;
}

// =============================================================================
// GAME BOOTSTRAP SERVICE
// =============================================================================

export class GameBootstrapService {
  private static lastBootstrapTime = 0;
  private static BOOTSTRAP_COOLDOWN_MS = 60000; // Only check once per minute
  private static isBootstrapping = false;

  /**
   * Bootstrap all game data if needed
   * Called at the start of each game tick
   */
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
      gameStateInitialized: false,
      totalTopUpAmount: 0,
    };

    try {
      // Load data from files
      const actorsData = loadActorsData();

      // Get existing database state
      const [existingActors, existingOrgs] = await Promise.all([
        db.select({ id: actors.id }).from(actors),
        db.select({ id: organizations.id }).from(organizations),
      ]);
      const existingActorIds = new Set(existingActors.map((a) => a.id));
      const existingOrgIds = new Set(existingOrgs.map((o) => o.id));

      // 1. Sync actors
      for (const actor of actorsData.actors) {
        if (!existingActorIds.has(actor.id)) {
          await this.seedActor(actor as ActorDataInput);
          result.actorsCreated++;
        }
      }

      // 2. Sync organizations
      for (const org of actorsData.organizations) {
        if (!existingOrgIds.has(org.id)) {
          await this.seedOrganization(org as OrgDataInput);
          result.organizationsCreated++;
        }
      }

      // 3. Ensure minimum balances
      const topUpResult = await this.ensureMinimumBalances();
      result.actorsToppedUp = topUpResult.count;
      result.totalTopUpAmount = topUpResult.totalAmount;

      // 4. Ensure pools exist
      result.poolsCreated = await this.ensureActorPools();

      // 5. Character/organization mappings are now handled by StaticDataRegistry
      // (no database sync needed - data is loaded from TypeScript files)

      // 6. Ensure game state exists
      result.gameStateInitialized = await this.ensureGameState();

      // 7. Ensure RSS feeds
      result.rssFeedsCreated = await this.ensureRSSFeeds();

      // Log summary if anything changed
      const hasChanges =
        result.actorsCreated > 0 ||
        result.actorsToppedUp > 0 ||
        result.organizationsCreated > 0 ||
        result.poolsCreated > 0 ||
        result.rssFeedsCreated > 0 ||
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

  /**
   * Force a full sync of all data (for admin/testing)
   */
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
      gameStateInitialized: false,
      totalTopUpAmount: 0,
    };

    const actorsData = loadActorsData();

    // Sync all actors (update existing, create missing)
    for (const actor of actorsData.actors) {
      const syncResult = await this.syncActor(actor as ActorDataInput);
      if (syncResult.created) result.actorsCreated++;
      if (syncResult.updated) result.actorsUpdated++;
    }

    // Sync all organizations
    for (const org of actorsData.organizations) {
      const syncResult = await this.syncOrganization(org as OrgDataInput);
      if (syncResult.created) result.organizationsCreated++;
      if (syncResult.updated) result.organizationsUpdated++;
    }

    // Ensure minimum balances
    const topUpResult = await this.ensureMinimumBalances();
    result.actorsToppedUp = topUpResult.count;
    result.totalTopUpAmount = topUpResult.totalAmount;

    // Ensure pools
    result.poolsCreated = await this.ensureActorPools();

    // Character/organization mappings are now handled by StaticDataRegistry
    // (no database sync needed - data is loaded from TypeScript files)

    // Ensure game state and RSS feeds
    result.gameStateInitialized = await this.ensureGameState();
    result.rssFeedsCreated = await this.ensureRSSFeeds();

    logger.info('Force full sync complete', result, 'GameBootstrapService');
    return result;
  }

  // ===========================================================================
  // ACTOR OPERATIONS
  // ===========================================================================

  private static async seedActor(actor: ActorDataInput): Promise<void> {
    const profileImageUrl = this.getActorImageUrl(actor.id);
    const capital = CapitalAllocationService.calculateCapital({
      id: actor.id,
      name: actor.name,
      description: actor.description,
      domain: actor.domain,
      tier: actor.tier as ActorTier | undefined,
    });

    await db.insert(actors).values({
      id: actor.id,
      name: actor.name,
      description: actor.description ?? null,
      domain: actor.domain ?? [],
      personality: actor.personality ?? null,
      tier: actor.tier ?? null,
      affiliations: actor.affiliations ?? [],
      postStyle: actor.postStyle ?? null,
      postExample: actor.postExample ?? [],
      role: actor.role ?? null,
      initialLuck: actor.initialLuck ?? 'medium',
      initialMood: actor.initialMood ?? 0,
      tradingBalance: capital.tradingBalance.toString(),
      reputationPoints: capital.reputationPoints,
      profileImageUrl,
      hasPool: false,
      isTest: false,
      updatedAt: new Date(),
    });

    logger.debug(
      `Seeded actor ${actor.name} with $${capital.tradingBalance}`,
      { actorId: actor.id },
      'GameBootstrapService'
    );
  }

  private static async syncActor(
    actor: ActorDataInput
  ): Promise<{ created: boolean; updated: boolean }> {
    const existing = await db
      .select({
        id: actors.id,
        tradingBalance: actors.tradingBalance,
      })
      .from(actors)
      .where(eq(actors.id, actor.id))
      .limit(1);

    if (existing.length === 0) {
      await this.seedActor(actor);
      return { created: true, updated: false };
    }

    const existingActor = existing[0];
    if (!existingActor) return { created: false, updated: false };

    const profileImageUrl = this.getActorImageUrl(actor.id);
    const tier = actor.tier || 'C_TIER';
    const minimumBalance =
      MINIMUM_BALANCE_BY_TIER[tier] || DEFAULT_MINIMUM_BALANCE;
    const currentBalance = Number(existingActor.tradingBalance) || 0;

    // Only update balance if below minimum
    const newBalance =
      currentBalance < minimumBalance ? minimumBalance : undefined;

    await db
      .update(actors)
      .set({
        name: actor.name,
        description: actor.description ?? null,
        domain: actor.domain ?? [],
        personality: actor.personality ?? null,
        tier: actor.tier ?? null,
        affiliations: actor.affiliations ?? [],
        postStyle: actor.postStyle ?? null,
        postExample: actor.postExample ?? [],
        profileImageUrl: profileImageUrl ?? undefined,
        tradingBalance: newBalance?.toString(),
        updatedAt: new Date(),
      })
      .where(eq(actors.id, actor.id));

    return { created: false, updated: true };
  }

  private static getActorImageUrl(actorId: string): string | null {
    const imagePath = join(
      process.cwd(),
      'public',
      'images',
      'actors',
      `${actorId}.jpg`
    );
    return existsSync(imagePath) ? `/images/actors/${actorId}.jpg` : null;
  }

  // ===========================================================================
  // ORGANIZATION OPERATIONS
  // ===========================================================================

  private static async seedOrganization(org: OrgDataInput): Promise<void> {
    const imageUrl = this.getOrgImageUrl(org.id);

    await db.insert(organizations).values({
      id: org.id,
      name: org.name,
      ticker: org.ticker ?? null,
      description: org.description ?? '',
      type: org.type ?? 'company',
      canBeInvolved: org.canBeInvolved !== false,
      initialPrice: org.initialPrice ?? null,
      currentPrice: org.initialPrice ?? null,
      imageUrl,
      updatedAt: new Date(),
    });

    logger.debug(
      `Seeded organization ${org.name}`,
      { orgId: org.id },
      'GameBootstrapService'
    );
  }

  private static async syncOrganization(
    org: OrgDataInput
  ): Promise<{ created: boolean; updated: boolean }> {
    const existing = await db
      .select({
        id: organizations.id,
        currentPrice: organizations.currentPrice,
      })
      .from(organizations)
      .where(eq(organizations.id, org.id))
      .limit(1);

    if (existing.length === 0) {
      await this.seedOrganization(org);
      return { created: true, updated: false };
    }

    const existingOrg = existing[0];
    if (!existingOrg) return { created: false, updated: false };

    const imageUrl = this.getOrgImageUrl(org.id);

    await db
      .update(organizations)
      .set({
        name: org.name,
        ticker: org.ticker ?? null,
        description: org.description ?? '',
        type: org.type ?? 'company',
        canBeInvolved: org.canBeInvolved !== false,
        initialPrice: org.initialPrice ?? null,
        currentPrice: org.initialPrice || existingOrg.currentPrice || null,
        imageUrl: imageUrl ?? undefined,
        updatedAt: new Date(),
      })
      .where(eq(organizations.id, org.id));

    return { created: false, updated: true };
  }

  private static getOrgImageUrl(orgId: string): string | null {
    const imagePath = join(
      process.cwd(),
      'public',
      'images',
      'organizations',
      `${orgId}.jpg`
    );
    return existsSync(imagePath) ? `/images/organizations/${orgId}.jpg` : null;
  }

  // ===========================================================================
  // BALANCE MANAGEMENT
  // ===========================================================================

  private static async ensureMinimumBalances(): Promise<{
    count: number;
    totalAmount: number;
  }> {
    const allActors = await db
      .select({
        id: actors.id,
        name: actors.name,
        tier: actors.tier,
        tradingBalance: actors.tradingBalance,
      })
      .from(actors);

    let toppedUpCount = 0;
    let totalTopUp = 0;

    for (const actor of allActors) {
      const currentBalance = Number(actor.tradingBalance) || 0;
      const tier = actor.tier || 'C_TIER';
      const minimumBalance =
        MINIMUM_BALANCE_BY_TIER[tier] || DEFAULT_MINIMUM_BALANCE;

      if (currentBalance < minimumBalance) {
        const deficit = minimumBalance - currentBalance;
        const topUpAmount = Math.min(deficit, MAX_TOP_UP_AMOUNT);
        const newBalance = currentBalance + topUpAmount;

        await db
          .update(actors)
          .set({
            tradingBalance: newBalance.toString(),
            updatedAt: new Date(),
          })
          .where(eq(actors.id, actor.id));

        toppedUpCount++;
        totalTopUp += topUpAmount;

        logger.debug(
          `Topped up ${actor.name}: $${currentBalance} → $${newBalance}`,
          { actorId: actor.id, topUpAmount },
          'GameBootstrapService'
        );
      }
    }

    return { count: toppedUpCount, totalAmount: totalTopUp };
  }

  // ===========================================================================
  // POOL MANAGEMENT
  // ===========================================================================

  private static async ensureActorPools(): Promise<number> {
    const actorsWithoutPools = await db
      .select({
        id: actors.id,
        name: actors.name,
        tradingBalance: actors.tradingBalance,
      })
      .from(actors)
      .where(eq(actors.hasPool, false));

    let created = 0;

    for (const actor of actorsWithoutPools) {
      const poolId = actor.id;
      const balance = Number(actor.tradingBalance) || 10000;

      const existingPool = await db
        .select({ id: pools.id })
        .from(pools)
        .where(eq(pools.id, poolId))
        .limit(1);

      if (existingPool.length === 0) {
        await db.insert(pools).values({
          id: poolId,
          name: `${actor.name}'s Pool`,
          npcActorId: actor.id,
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
          .update(actors)
          .set({ hasPool: true, updatedAt: new Date() })
          .where(eq(actors.id, actor.id));

        created++;
      }
    }

    return created;
  }

  // ===========================================================================
  // GAME STATE
  // ===========================================================================

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

  // ===========================================================================
  // RSS FEEDS
  // ===========================================================================

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

  // ===========================================================================
  // UTILITY METHODS
  // ===========================================================================

  /**
   * Get the minimum balance for a given tier
   */
  static getMinimumBalance(tier: string): number {
    return MINIMUM_BALANCE_BY_TIER[tier] || DEFAULT_MINIMUM_BALANCE;
  }

  /**
   * Get database statistics
   */
  static async getStats(): Promise<{
    actors: number;
    organizations: number;
    pools: number;
    characterMappings: number;
    organizationMappings: number;
    rssFeedSources: number;
  }> {
    const [actorCount, orgCount, poolCount, feedCount] = await Promise.all([
      db.select({ count: sql<number>`count(*)` }).from(actors),
      db.select({ count: sql<number>`count(*)` }).from(organizations),
      db.select({ count: sql<number>`count(*)` }).from(pools),
      db.select({ count: sql<number>`count(*)` }).from(rssFeedSources),
    ]);

    // Character and organization mappings are now from StaticDataRegistry
    const { StaticDataRegistry } = await import('./static-data-registry');

    return {
      actors: Number(actorCount[0]?.count ?? 0),
      organizations: Number(orgCount[0]?.count ?? 0),
      pools: Number(poolCount[0]?.count ?? 0),
      characterMappings: StaticDataRegistry.getAllCharacterMappings().length,
      organizationMappings:
        StaticDataRegistry.getAllOrganizationMappings().length,
      rssFeedSources: Number(feedCount[0]?.count ?? 0),
    };
  }
}

// Export convenience function for game tick
export async function bootstrapGameIfNeeded(): Promise<GameBootstrapResult | null> {
  return GameBootstrapService.bootstrapIfNeeded();
}
