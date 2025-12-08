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

import { actorState, db, eq, organizationState, pools } from '@babylon/db';
import type { ActorTier } from '@babylon/shared';
import { logger } from '@babylon/shared';
import { CapitalAllocationService } from './capital-allocation-service';
import { StaticDataRegistry } from './static-data-registry';

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
      // Get static data from registry
      const staticActors = StaticDataRegistry.getAllActors();
      const staticOrgs = StaticDataRegistry.getAllOrganizations();

      // Check if database needs seeding (state tables)
      const existingActorStates = await db
        .select({ id: actorState.id })
        .from(actorState);
      const existingActorIds = new Set(existingActorStates.map((a) => a.id));

      // Seed missing actor states
      for (const actor of staticActors) {
        if (!existingActorIds.has(actor.id)) {
          await this.seedActorState(actor);
          result.actorsCreated++;
        }
      }

      // Seed missing organization states
      const existingOrgStates = await db
        .select({ id: organizationState.id })
        .from(organizationState);
      const existingOrgIds = new Set(existingOrgStates.map((o) => o.id));

      for (const org of staticOrgs) {
        if (!existingOrgIds.has(org.id)) {
          await this.seedOrganizationState(org);
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
   * Seed actor state (dynamic data only)
   */
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
      { actorId: actor.id, balance: capital.tradingBalance },
      'NPCBootstrapService'
    );
  }

  /**
   * Seed organization state (dynamic data only)
   */
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
      'NPCBootstrapService'
    );
  }

  /**
   * Ensure all actors have minimum trading balance
   */
  private static async ensureMinimumBalances(): Promise<{
    count: number;
    totalAmount: number;
  }> {
    // Get all actor states with their current balances
    const allActorStates = await db
      .select({
        id: actorState.id,
        tradingBalance: actorState.tradingBalance,
      })
      .from(actorState);

    let toppedUpCount = 0;
    let totalTopUp = 0;

    for (const state of allActorStates) {
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
    // Get actor states without pools
    const actorStatesWithoutPools = await db
      .select({
        id: actorState.id,
        tradingBalance: actorState.tradingBalance,
      })
      .from(actorState)
      .where(eq(actorState.hasPool, false));

    let created = 0;

    for (const state of actorStatesWithoutPools) {
      const staticActor = StaticDataRegistry.getActor(state.id);
      const poolId = state.id;
      const balance = Number(state.tradingBalance) || 10000;

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

  /**
   * Force a full reseed of all actor states (useful for admin/testing)
   */
  static async forceReseed(): Promise<BootstrapResult> {
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

    const staticActors = StaticDataRegistry.getAllActors();

    for (const actor of staticActors) {
      const existing = await db
        .select({
          id: actorState.id,
          tradingBalance: actorState.tradingBalance,
        })
        .from(actorState)
        .where(eq(actorState.id, actor.id))
        .limit(1);

      if (existing.length > 0) {
        const existingState = existing[0];
        if (!existingState) continue;

        const currentBalance = Number(existingState.tradingBalance) || 0;
        const tier = actor.tier || 'C_TIER';
        const minimumBalance =
          MINIMUM_BALANCE_BY_TIER[tier] || DEFAULT_MINIMUM_BALANCE;

        if (currentBalance < minimumBalance) {
          await db
            .update(actorState)
            .set({
              tradingBalance: minimumBalance.toString(),
              updatedAt: new Date(),
            })
            .where(eq(actorState.id, actor.id));
        }

        result.actorsUpdated++;
      } else {
        await this.seedActorState(actor);
        result.actorsCreated++;
      }
    }

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
