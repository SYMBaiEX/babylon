/**
 * NPC Bootstrap Service
 *
 * Ensures all NPCs from data files are seeded in the database and maintain
 * minimum balances for trading. This service is called at the start of each
 * game tick to ensure the game world is properly populated.
 *
 * Features:
 * - Auto-seeds actors from data files if not present in database
 * - Ensures minimum trading balance for all NPCs
 * - Uses tier-based capital allocation for fair distribution
 * - Maintains system liquidity by topping up underfunded NPCs
 */

import { actors, db, eq, organizations, pools } from '@babylon/db';
import type { ActorTier } from '@babylon/shared';
import { logger } from '@babylon/shared';
import { existsSync } from 'fs';
import { join } from 'path';
import { loadActorsData } from '../actors-loader';
import { CapitalAllocationService } from './capital-allocation-service';

// Minimum balance thresholds by tier
const MINIMUM_BALANCE_BY_TIER: Record<string, number> = {
  S_TIER: 50000, // High-profile NPCs need capital to make meaningful trades
  A_TIER: 25000,
  B_TIER: 10000,
  C_TIER: 5000,
};

// Default minimum for unknown tiers
const DEFAULT_MINIMUM_BALANCE = 5000;

// Maximum we'll top up to in a single tick (prevents runaway inflation)
const MAX_TOP_UP_AMOUNT = 100000;

export interface BootstrapResult {
  actorsCreated: number;
  actorsUpdated: number;
  actorsToppedUp: number;
  organizationsCreated: number;
  organizationsUpdated: number;
  poolsCreated: number;
  totalTopUpAmount: number;
}

export class NPCBootstrapService {
  private static lastBootstrapTime = 0;
  private static BOOTSTRAP_COOLDOWN_MS = 60000; // Only check once per minute

  /**
   * Bootstrap NPCs if needed
   * Called at the start of each game tick
   */
  static async bootstrapIfNeeded(): Promise<BootstrapResult | null> {
    const now = Date.now();

    // Check if we've bootstrapped recently
    if (now - this.lastBootstrapTime < this.BOOTSTRAP_COOLDOWN_MS) {
      return null;
    }

    this.lastBootstrapTime = now;

    const result: BootstrapResult = {
      actorsCreated: 0,
      actorsUpdated: 0,
      actorsToppedUp: 0,
      organizationsCreated: 0,
      organizationsUpdated: 0,
      poolsCreated: 0,
      totalTopUpAmount: 0,
    };

    try {
      // Load actors from data files
      const actorsData = loadActorsData();

      // Check if database needs seeding
      const existingActors = await db.select({ id: actors.id }).from(actors);
      const existingActorIds = new Set(existingActors.map((a) => a.id));

      // Seed missing actors
      for (const actor of actorsData.actors) {
        if (!existingActorIds.has(actor.id)) {
          await this.seedActor(actor);
          result.actorsCreated++;
        }
      }

      // Seed missing organizations
      const existingOrgs = await db
        .select({ id: organizations.id })
        .from(organizations);
      const existingOrgIds = new Set(existingOrgs.map((o) => o.id));

      for (const org of actorsData.organizations) {
        if (!existingOrgIds.has(org.id)) {
          await this.seedOrganization(org);
          result.organizationsCreated++;
        }
      }

      // Ensure minimum balances for all actors
      const topUpResult = await this.ensureMinimumBalances();
      result.actorsToppedUp = topUpResult.count;
      result.totalTopUpAmount = topUpResult.totalAmount;

      // Ensure all actors have pools
      const poolsResult = await this.ensureActorPools();
      result.poolsCreated = poolsResult;

      // Log summary if anything changed
      if (
        result.actorsCreated > 0 ||
        result.actorsToppedUp > 0 ||
        result.organizationsCreated > 0 ||
        result.poolsCreated > 0
      ) {
        logger.info(
          'NPC Bootstrap complete',
          {
            actorsCreated: result.actorsCreated,
            actorsToppedUp: result.actorsToppedUp,
            totalTopUpAmount: result.totalTopUpAmount,
            organizationsCreated: result.organizationsCreated,
            poolsCreated: result.poolsCreated,
          },
          'NPCBootstrapService'
        );
      }

      return result;
    } catch (error) {
      logger.error(
        'NPC Bootstrap failed',
        { error: String(error) },
        'NPCBootstrapService'
      );
      throw error;
    }
  }

  /**
   * Seed a single actor from data file
   */
  private static async seedActor(actor: {
    id: string;
    name: string;
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
  }): Promise<void> {
    // Check if actor image exists
    const imagePath = join(
      process.cwd(),
      'public',
      'images',
      'actors',
      `${actor.id}.jpg`
    );
    const profileImageUrl = existsSync(imagePath)
      ? `/images/actors/${actor.id}.jpg`
      : null;

    // Calculate capital based on tier
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
      { actorId: actor.id, balance: capital.tradingBalance },
      'NPCBootstrapService'
    );
  }

  /**
   * Seed a single organization from data file
   */
  private static async seedOrganization(org: {
    id: string;
    name: string;
    ticker?: string;
    description?: string;
    type?: string;
    canBeInvolved?: boolean;
    initialPrice?: number;
  }): Promise<void> {
    // Check if org image exists
    const imagePath = join(
      process.cwd(),
      'public',
      'images',
      'organizations',
      `${org.id}.jpg`
    );
    const imageUrl = existsSync(imagePath)
      ? `/images/organizations/${org.id}.jpg`
      : null;

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
      'NPCBootstrapService'
    );
  }

  /**
   * Ensure all actors have minimum trading balance
   * Top up actors who fall below the threshold
   */
  private static async ensureMinimumBalances(): Promise<{
    count: number;
    totalAmount: number;
  }> {
    // Get all actors with their current balances
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

      // Check if actor needs top up
      if (currentBalance < minimumBalance) {
        // Calculate top up amount (to get to minimum, capped at max)
        const deficit = minimumBalance - currentBalance;
        const topUpAmount = Math.min(deficit, MAX_TOP_UP_AMOUNT);
        const newBalance = currentBalance + topUpAmount;

        // Update actor balance
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
          {
            actorId: actor.id,
            oldBalance: currentBalance,
            newBalance,
            topUpAmount,
          },
          'NPCBootstrapService'
        );
      }
    }

    return { count: toppedUpCount, totalAmount: totalTopUp };
  }

  /**
   * Ensure all actors have pools for trading
   */
  private static async ensureActorPools(): Promise<number> {
    // Get actors without pools
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
      // Create pool for actor
      const poolId = actor.id; // Use actor ID as pool ID
      const balance = Number(actor.tradingBalance) || 10000;

      // Check if pool already exists
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

        // Mark actor as having pool
        await db
          .update(actors)
          .set({ hasPool: true, updatedAt: new Date() })
          .where(eq(actors.id, actor.id));

        created++;
      }
    }

    return created;
  }

  /**
   * Force a full reseed of all actors (useful for admin/testing)
   * This updates existing actors to match data files
   */
  static async forceReseed(): Promise<BootstrapResult> {
    // Reset the cooldown
    this.lastBootstrapTime = 0;

    const result: BootstrapResult = {
      actorsCreated: 0,
      actorsUpdated: 0,
      actorsToppedUp: 0,
      organizationsCreated: 0,
      organizationsUpdated: 0,
      poolsCreated: 0,
      totalTopUpAmount: 0,
    };

    const actorsData = loadActorsData();

    // Update or create all actors
    for (const actor of actorsData.actors) {
      const existing = await db
        .select({ id: actors.id, tradingBalance: actors.tradingBalance })
        .from(actors)
        .where(eq(actors.id, actor.id))
        .limit(1);

      if (existing.length > 0) {
        const existingActor = existing[0];
        if (!existingActor) continue;

        // Keep existing balance if above minimum
        const currentBalance = Number(existingActor.tradingBalance) || 0;
        const tier = actor.tier || 'C_TIER';
        const minimumBalance =
          MINIMUM_BALANCE_BY_TIER[tier] || DEFAULT_MINIMUM_BALANCE;

        // Only update balance if below minimum
        const newBalance = Math.max(currentBalance, minimumBalance);

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
            tradingBalance:
              currentBalance < minimumBalance
                ? newBalance.toString()
                : undefined,
            updatedAt: new Date(),
          })
          .where(eq(actors.id, actor.id));

        result.actorsUpdated++;
      } else {
        await this.seedActor(actor);
        result.actorsCreated++;
      }
    }

    // Ensure pools and balances
    result.poolsCreated = await this.ensureActorPools();
    const topUpResult = await this.ensureMinimumBalances();
    result.actorsToppedUp = topUpResult.count;
    result.totalTopUpAmount = topUpResult.totalAmount;

    logger.info('Force reseed complete', result, 'NPCBootstrapService');

    return result;
  }

  /**
   * Get the minimum balance for a given tier
   */
  static getMinimumBalance(tier: string): number {
    return MINIMUM_BALANCE_BY_TIER[tier] || DEFAULT_MINIMUM_BALANCE;
  }
}

// Export for use in game-tick.ts
export async function bootstrapNPCsIfNeeded(): Promise<BootstrapResult | null> {
  return NPCBootstrapService.bootstrapIfNeeded();
}
