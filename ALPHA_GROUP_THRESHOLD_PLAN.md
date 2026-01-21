# Alpha Group Joining Threshold - Complete Implementation Plan

**Status:** Ready for Implementation  
**Priority:** High  
**Estimated Effort:** 2-3 sprints  
**Last Updated:** 2026-01-21

---

## Executive Summary

Active agents are not being added to alpha groups despite trading and posting activity. The current thresholds in `AlphaGroupInviteService` and `NPCInteractionTracker` are too restrictive, preventing engaged users from receiving group invites. 

This plan provides a **complete, production-ready implementation** that:
1. Lowers and makes configurable all invite thresholds
2. Adds per-NPC tier customization based on actor personality
3. Integrates trading activity into engagement scoring
4. Implements invite decay for users who repeatedly decline
5. Provides comprehensive monitoring and admin tooling

---

## Table of Contents

1. [Current System Analysis](#current-system-analysis)
2. [Design Decisions](#design-decisions)
3. [Implementation Details](#implementation-details)
4. [Database Migrations](#database-migrations)
5. [API Endpoints](#api-endpoints)
6. [Admin UI Components](#admin-ui-components)
7. [Monitoring & Observability](#monitoring--observability)
8. [Testing Strategy](#testing-strategy)
9. [Rollout Plan](#rollout-plan)
10. [Success Metrics](#success-metrics)

---

## Current System Analysis

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                          Game Tick                                   │
│                  (packages/engine/src/game-tick.ts:1152)            │
└─────────────────────────────┬───────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│               AlphaGroupInviteService.processTickInvites()          │
│         (packages/engine/src/services/alpha-group-invite-service.ts)│
│                                                                      │
│   Current Thresholds (PROBLEMATIC):                                  │
│   • BASE_INVITE_CHANCE: 0.005 (0.5%) ← Too low                      │
│   • MIN_ENGAGEMENT_SCORE: 40 ← Conflicts with TIER_CONFIG           │
│   • MAX_INVITES_PER_TICK: 5 ← May limit growth                      │
└─────────────────────────────┬───────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│           NPCInteractionTracker.calculateEngagementScore()          │
│         (packages/engine/src/services/npc-interaction-tracker.ts)   │
│                                                                      │
│   Eligibility Requirements (TOO STRICT):                             │
│   • MIN_REPLIES: 3 ← High barrier                                   │
│   • MIN_LIKES: 5 ← High barrier                                     │
│   • MIN_TOTAL_INTERACTIONS: 10 ← High barrier                       │
│   • avgQualityScore >= 0.7                                          │
│                                                                      │
│   Missing:                                                           │
│   • Trading activity not considered                                 │
│   • No per-NPC customization                                        │
└─────────────────────────────┬───────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    TieredGroupService                                │
│          (packages/engine/src/services/tiered-group-service.ts)     │
│                                                                      │
│   TIER_CONFIG (NOT BEING USED by AlphaGroupInviteService):          │
│   ┌──────────────┬─────────────────┬───────────────────────────┐    │
│   │ Tier         │ minEngagement   │ inviteProbability         │    │
│   ├──────────────┼─────────────────┼───────────────────────────┤    │
│   │ 1 (Inner)    │ 80              │ 0.005 (0.5%)              │    │
│   │ 2 (Community)│ 50              │ 0.02 (2%)                 │    │
│   │ 3 (Followers)│ 20              │ 0.1 (10%)                 │    │
│   └──────────────┴─────────────────┴───────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────┘
```

### Root Cause Analysis

| Issue | Current State | Impact | Fix |
|-------|---------------|--------|-----|
| Double-gating | `AlphaGroupInviteService` uses `MIN_ENGAGEMENT_SCORE=40` before tier check | Users qualifying for Tier 3 (20+) blocked | Remove hardcoded threshold, use tier-specific |
| Low probability | `BASE_INVITE_CHANCE=0.5%` applied after score scaling | Even score=100 users get 0.5% chance | Use tier-specific probabilities |
| High eligibility bar | 3 replies + 5 likes + 10 interactions required | New active users can't qualify | Lower requirements |
| Missing trading activity | Only social interactions counted | Traders with no social presence excluded | Add trade scoring |
| No per-NPC customization | All NPCs use same thresholds | Can't create exclusive groups | Add actor tier overrides |
| No invite decay | Declined invites still counted forever | Wastes system resources | Implement decay mechanism |

### Verified Data Sources

| Data | Table | Location | Verified |
|------|-------|----------|----------|
| Agent trades | `AgentTrade` | `packages/db/src/schema/agents.ts:205-234` | ✅ |
| NPC trades | `NPCTrade` | `packages/db/src/schema/actors.ts:99-133` | ✅ |
| User interactions | `UserInteraction` | `packages/db/src/schema/actors.ts:73-96` | ✅ |
| Group invites | `GroupInvite` | `packages/db/src/schema/messaging.ts:260-285` | ✅ |
| Group members | `GroupMember` | `packages/db/src/schema/messaging.ts:210-255` | ✅ |
| Actor data | `ActorData` | `packages/shared/src/game-types.ts:371-381` | ✅ |

---

## Design Decisions

### Question 1: Should trading activity be weighted differently per NPC?

**Answer: YES**

**Rationale:**
- Trading-focused NPCs (e.g., `ainsem`, `airthur_hayes`) should value trading activity more heavily
- Social-focused NPCs (e.g., `logain_paul`, `joerogain`) should value social interactions more
- This creates meaningful differentiation that aligns with NPC personalities
- Users will naturally gravitate toward NPCs matching their play style

**Implementation:**
Add `actorFocusWeights` to `ActorData`:

```typescript
// packages/shared/src/game-types.ts
export interface ActorTierOverrides {
  // Multipliers for threshold requirements (1.0 = default)
  minEngagementScoreMultiplier?: number;  // e.g., 1.5 = 50% harder
  inviteProbabilityMultiplier?: number;   // e.g., 0.5 = half as likely
  
  // Focus weights for engagement calculation (must sum to 1.0)
  focusWeights?: {
    social: number;   // Weight for social interactions
    trading: number;  // Weight for trading activity
  };
}

export interface ActorData extends Actor {
  // ... existing fields ...
  tierOverrides?: ActorTierOverrides;
}
```

**Default weights by domain:**

| Domain | Social Weight | Trading Weight |
|--------|---------------|----------------|
| `crypto`, `trading`, `finance` | 0.4 | 0.6 |
| `media`, `politics`, `entertainment` | 0.8 | 0.2 |
| `tech`, `ai`, `venture-capital` | 0.6 | 0.4 |
| Default | 0.5 | 0.5 |

---

### Question 2: Should there be a "fast track" for high-value traders?

**Answer: YES, with anti-gaming protections**

**Rationale:**
- Skilled traders demonstrating consistent profitability should have accelerated access
- Creates aspirational goals and rewards actual skill
- Must prevent gaming (wash trading, manipulation)

**Implementation:**
Add `fastTrackConfig` to `TierConfig`:

```typescript
// packages/engine/src/services/tier-config.ts
export interface FastTrackConfig {
  enabled: boolean;
  minProfitableTrades: number;      // Minimum number of profitable trades
  minTotalPnL: number;              // Minimum cumulative P&L (in points)
  minWinRate: number;               // Minimum win rate (0-1)
  skipToTier: TierLevel;            // Tier to skip to (max tier 2, never tier 1)
  cooldownDays: number;             // Days of trading history required
}

export const FAST_TRACK_CONFIG: FastTrackConfig = {
  enabled: true,
  minProfitableTrades: 10,
  minTotalPnL: 5000,
  minWinRate: 0.55,
  skipToTier: 2,                    // Skip Tier 3, go directly to Tier 2
  cooldownDays: 7,                  // Need 7 days of trading history
};
```

**Anti-gaming protections:**
1. Require minimum trade spread (no rapid-fire trades)
2. Require trades across multiple tickers/markets
3. Require minimum hold duration per position
4. Flag and exclude suspicious patterns

---

### Question 3: What happens to existing group members when thresholds change?

**Answer: Grandfather existing members, block promotions for non-qualifiers**

**Rationale:**
- Kicking active users would destroy trust and engagement
- Users earned their spots under old rules - honor that
- Preventing new promotions maintains new system integrity
- Clear communication via in-app notification

**Implementation:**

```typescript
// packages/engine/src/services/tiered-group-service.ts
export interface MembershipStatus {
  isGrandfathered: boolean;
  meetsCurrentCriteria: boolean;
  canBePromoted: boolean;
  grandfatheredAt?: Date;
}

static async getMembershipStatus(
  userId: string,
  groupId: string
): Promise<MembershipStatus> {
  const membership = await db.query.groupMembers.findFirst({
    where: and(
      eq(groupMembers.userId, userId),
      eq(groupMembers.groupId, groupId),
      eq(groupMembers.isActive, true)
    ),
  });
  
  if (!membership) {
    return { isGrandfathered: false, meetsCurrentCriteria: false, canBePromoted: false };
  }
  
  // Members who joined before migration date are grandfathered
  const MIGRATION_DATE = new Date('2026-02-01'); // Set during deployment
  const isGrandfathered = membership.joinedAt < MIGRATION_DATE;
  
  // Calculate current criteria
  const engagementScore = await NPCInteractionTracker.calculateEngagementScore(
    userId, 
    membership.npcId
  );
  const tierConfig = getEffectiveTierConfig(membership.tier, membership.npcId);
  const meetsCurrentCriteria = engagementScore.engagementScore >= tierConfig.minEngagementScore;
  
  return {
    isGrandfathered,
    meetsCurrentCriteria,
    canBePromoted: meetsCurrentCriteria, // Only if meeting current criteria
    grandfatheredAt: isGrandfathered ? MIGRATION_DATE : undefined,
  };
}
```

**Database migration:**
```sql
-- Add grandfathered flag to GroupMember
ALTER TABLE "GroupMember" ADD COLUMN "isGrandfathered" BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE "GroupMember" ADD COLUMN "grandfatheredAt" TIMESTAMP;

-- Mark all existing members as grandfathered
UPDATE "GroupMember" SET "isGrandfathered" = TRUE, "grandfatheredAt" = NOW() WHERE "isActive" = TRUE;
```

---

### Question 4: Should we implement invite decay?

**Answer: YES**

**Rationale:**
- Users who repeatedly decline invites are wasting system resources
- Reduces notification spam for uninterested users
- Creates natural prioritization for engaged users
- Soft decay (not permanent block) allows re-engagement

**Implementation:**

Add to `GroupInvite` schema:

```typescript
// packages/db/src/schema/messaging.ts - Add to groupInvites table
declineCount: integer('declineCount').notNull().default(0),
lastDeclinedAt: timestamp('lastDeclinedAt', { mode: 'date' }),
nextEligibleAt: timestamp('nextEligibleAt', { mode: 'date' }),
```

**Decay formula:**

```typescript
// packages/engine/src/services/alpha-group-invite-service.ts
export const INVITE_DECAY_CONFIG = {
  // Cooldown multiplier per decline (exponential backoff)
  decayMultiplier: 2,
  // Base cooldown hours after first decline
  baseCooldownHours: 24,
  // Maximum cooldown hours (cap)
  maxCooldownHours: 168, // 7 days
  // Declines before user is temporarily excluded
  maxDeclines: 5,
  // Days of inactivity before decline count resets
  resetAfterDays: 30,
};

function getNextEligibleDate(declineCount: number): Date {
  const cooldownHours = Math.min(
    INVITE_DECAY_CONFIG.baseCooldownHours * Math.pow(INVITE_DECAY_CONFIG.decayMultiplier, declineCount - 1),
    INVITE_DECAY_CONFIG.maxCooldownHours
  );
  return new Date(Date.now() + cooldownHours * 60 * 60 * 1000);
}
```

| Decline # | Cooldown |
|-----------|----------|
| 1 | 24 hours |
| 2 | 48 hours |
| 3 | 96 hours |
| 4 | 168 hours (7 days, capped) |
| 5+ | Excluded until reset |

---

## Implementation Details

### 1. Configuration System

Create a centralized, environment-driven configuration:

**File:** `packages/engine/src/config/alpha-group-config.ts`

```typescript
/**
 * Alpha Group Configuration
 * 
 * All thresholds are configurable via environment variables.
 * Changes take effect on next game tick without restart.
 */

import { logger } from '@babylon/shared';

function envNumber(key: string, defaultValue: number): number {
  const value = process.env[key];
  if (value === undefined || value === '') return defaultValue;
  const parsed = Number(value);
  if (Number.isNaN(parsed)) {
    logger.warn(`Invalid number for ${key}: ${value}, using default ${defaultValue}`);
    return defaultValue;
  }
  return parsed;
}

function envBoolean(key: string, defaultValue: boolean): boolean {
  const value = process.env[key];
  if (value === undefined || value === '') return defaultValue;
  return value.toLowerCase() === 'true' || value === '1';
}

export const ALPHA_GROUP_CONFIG = {
  // ===== INVITE PROBABILITY =====
  /** 
   * Base invite probability multiplier applied to tier-specific probabilities.
   * Set > 1 to increase all invite rates, < 1 to decrease.
   * @env ALPHA_INVITE_PROBABILITY_MULTIPLIER
   * @default 1.0
   */
  inviteProbabilityMultiplier: envNumber('ALPHA_INVITE_PROBABILITY_MULTIPLIER', 1.0),

  /**
   * Maximum invites to send per game tick (across all NPCs).
   * @env ALPHA_MAX_INVITES_PER_TICK
   * @default 15
   */
  maxInvitesPerTick: envNumber('ALPHA_MAX_INVITES_PER_TICK', 15),

  /**
   * Top N users to consider per NPC per tick.
   * @env ALPHA_TOP_USERS_TO_CONSIDER
   * @default 30
   */
  topUsersToConsider: envNumber('ALPHA_TOP_USERS_TO_CONSIDER', 30),

  // ===== ENGAGEMENT THRESHOLDS =====
  /**
   * Minimum replies to NPC posts for eligibility.
   * @env ALPHA_MIN_REPLIES
   * @default 1
   */
  minReplies: envNumber('ALPHA_MIN_REPLIES', 1),

  /**
   * Minimum likes on NPC posts for eligibility.
   * @env ALPHA_MIN_LIKES
   * @default 2
   */
  minLikes: envNumber('ALPHA_MIN_LIKES', 2),

  /**
   * Minimum total interactions for eligibility.
   * @env ALPHA_MIN_TOTAL_INTERACTIONS
   * @default 5
   */
  minTotalInteractions: envNumber('ALPHA_MIN_TOTAL_INTERACTIONS', 5),

  /**
   * Minimum quality score for replies (0-1).
   * @env ALPHA_MIN_QUALITY_SCORE
   * @default 0.5
   */
  minQualityScore: envNumber('ALPHA_MIN_QUALITY_SCORE', 0.5),

  // ===== TRADING ACTIVITY =====
  /**
   * Weight for trades in engagement score calculation.
   * @env ALPHA_TRADE_WEIGHT
   * @default 2.5
   */
  tradeWeight: envNumber('ALPHA_TRADE_WEIGHT', 2.5),

  /**
   * Bonus multiplier for profitable trades.
   * @env ALPHA_PROFITABLE_TRADE_BONUS
   * @default 1.5
   */
  profitableTradeBonus: envNumber('ALPHA_PROFITABLE_TRADE_BONUS', 1.5),

  /**
   * Enable trading activity in engagement calculation.
   * @env ALPHA_INCLUDE_TRADING
   * @default true
   */
  includeTradingActivity: envBoolean('ALPHA_INCLUDE_TRADING', true),

  // ===== FAST TRACK =====
  /**
   * Enable fast-track for high-value traders.
   * @env ALPHA_FAST_TRACK_ENABLED
   * @default true
   */
  fastTrackEnabled: envBoolean('ALPHA_FAST_TRACK_ENABLED', true),

  /**
   * Minimum profitable trades for fast-track.
   * @env ALPHA_FAST_TRACK_MIN_TRADES
   * @default 10
   */
  fastTrackMinTrades: envNumber('ALPHA_FAST_TRACK_MIN_TRADES', 10),

  /**
   * Minimum cumulative P&L for fast-track.
   * @env ALPHA_FAST_TRACK_MIN_PNL
   * @default 5000
   */
  fastTrackMinPnL: envNumber('ALPHA_FAST_TRACK_MIN_PNL', 5000),

  /**
   * Minimum win rate for fast-track (0-1).
   * @env ALPHA_FAST_TRACK_MIN_WIN_RATE
   * @default 0.55
   */
  fastTrackMinWinRate: envNumber('ALPHA_FAST_TRACK_MIN_WIN_RATE', 0.55),

  // ===== INVITE DECAY =====
  /**
   * Enable invite decay for users who decline.
   * @env ALPHA_INVITE_DECAY_ENABLED
   * @default true
   */
  inviteDecayEnabled: envBoolean('ALPHA_INVITE_DECAY_ENABLED', true),

  /**
   * Base cooldown hours after first decline.
   * @env ALPHA_INVITE_DECAY_BASE_HOURS
   * @default 24
   */
  inviteDecayBaseHours: envNumber('ALPHA_INVITE_DECAY_BASE_HOURS', 24),

  /**
   * Maximum declines before user is excluded.
   * @env ALPHA_INVITE_DECAY_MAX_DECLINES
   * @default 5
   */
  inviteDecayMaxDeclines: envNumber('ALPHA_INVITE_DECAY_MAX_DECLINES', 5),

  // ===== COOLDOWNS =====
  /**
   * Hours after joining before eligible for next invite.
   * @env ALPHA_INVITE_COOLDOWN_HOURS
   * @default 2
   */
  inviteCooldownHours: envNumber('ALPHA_INVITE_COOLDOWN_HOURS', 2),

  // ===== FEATURE FLAGS =====
  /**
   * Enable per-NPC tier customization.
   * @env ALPHA_PER_NPC_CUSTOMIZATION_ENABLED
   * @default true
   */
  perNpcCustomizationEnabled: envBoolean('ALPHA_PER_NPC_CUSTOMIZATION_ENABLED', true),

  /**
   * Enable grandfathering for existing members.
   * @env ALPHA_GRANDFATHERING_ENABLED
   * @default true
   */
  grandfatheringEnabled: envBoolean('ALPHA_GRANDFATHERING_ENABLED', true),
} as const;

export type AlphaGroupConfig = typeof ALPHA_GROUP_CONFIG;

// Log configuration on startup
logger.info('Alpha Group Config loaded', ALPHA_GROUP_CONFIG, 'AlphaGroupConfig');
```

---

### 2. Enhanced Engagement Score Calculation

**File:** `packages/engine/src/services/npc-interaction-tracker.ts`

```typescript
import { ALPHA_GROUP_CONFIG } from '../config/alpha-group-config';
import { agentTrades, db, eq, and, gte, lte, count, sum } from '@babylon/db';

export interface TradingStats {
  totalTrades: number;
  profitableTrades: number;
  totalPnL: number;
  winRate: number;
}

export interface NPCInteractionScore {
  userId: string;
  npcId: string;
  // Social metrics
  replyCount: number;
  likeCount: number;
  shareCount: number;
  totalInteractions: number;
  avgQualityScore: number;
  // Trading metrics (NEW)
  tradingStats: TradingStats;
  // Combined score
  socialScore: number;
  tradingScore: number;
  engagementScore: number; // 0-100 score (weighted combination)
  // Eligibility
  isEligibleForInvite: boolean;
  eligibilityReasons: string[];
  // Fast track status
  qualifiesForFastTrack: boolean;
}

export class NPCInteractionTracker {
  /**
   * Get user's trading statistics within a time window.
   * Queries the AgentTrade table for trade history.
   */
  static async getUserTradingStats(
    userId: string,
    window?: InteractionWindow
  ): Promise<TradingStats> {
    const endDate = window?.endDate || new Date();
    const startDate = window?.startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    // Query trades from AgentTrade table
    const trades = await db
      .select({
        pnl: agentTrades.pnl,
        action: agentTrades.action,
      })
      .from(agentTrades)
      .where(
        and(
          eq(agentTrades.agentUserId, userId),
          gte(agentTrades.executedAt, startDate),
          lte(agentTrades.executedAt, endDate)
        )
      );

    // Only count 'close' actions for P&L (open trades don't have realized P&L)
    const closedTrades = trades.filter(t => t.action === 'close' && t.pnl !== null);
    const totalTrades = closedTrades.length;
    const profitableTrades = closedTrades.filter(t => (t.pnl ?? 0) > 0).length;
    const totalPnL = closedTrades.reduce((sum, t) => sum + (t.pnl ?? 0), 0);
    const winRate = totalTrades > 0 ? profitableTrades / totalTrades : 0;

    return {
      totalTrades,
      profitableTrades,
      totalPnL,
      winRate,
    };
  }

  /**
   * Calculate engagement score with trading activity included.
   */
  static async calculateEngagementScore(
    userId: string,
    npcId: string,
    window?: InteractionWindow,
    actorFocusWeights?: { social: number; trading: number }
  ): Promise<NPCInteractionScore> {
    // ... existing social interaction counting code ...
    
    // Get trading stats if enabled
    let tradingStats: TradingStats = {
      totalTrades: 0,
      profitableTrades: 0,
      totalPnL: 0,
      winRate: 0,
    };
    
    if (ALPHA_GROUP_CONFIG.includeTradingActivity) {
      tradingStats = await this.getUserTradingStats(userId, window);
    }

    // Calculate social score (existing logic)
    const replyScore = replyCount * REPLY_WEIGHT;
    const likeScore = likeCount * LIKE_WEIGHT;
    const shareScore = shareCount * SHARE_WEIGHT;
    const rawSocialScore = replyScore + likeScore + shareScore;
    const maxExpectedSocialScore = 100;
    const socialScore = Math.min(100, (rawSocialScore / maxExpectedSocialScore) * 100);

    // Calculate trading score (NEW)
    const tradeScore = tradingStats.totalTrades * ALPHA_GROUP_CONFIG.tradeWeight;
    const profitBonus = tradingStats.profitableTrades * ALPHA_GROUP_CONFIG.profitableTradeBonus;
    const maxExpectedTradingScore = 50; // ~20 trades with bonuses
    const tradingScore = Math.min(100, ((tradeScore + profitBonus) / maxExpectedTradingScore) * 100);

    // Apply focus weights
    const weights = actorFocusWeights || { social: 0.5, trading: 0.5 };
    const weightedScore = (socialScore * weights.social) + (tradingScore * weights.trading);

    // Apply quality multiplier
    const qualityMultiplier = avgQualityScore > 0.8 ? 1.2 : 1.0;
    const finalScore = Math.min(100, weightedScore * qualityMultiplier);

    // Check eligibility using configurable thresholds
    const eligibilityReasons: string[] = [];
    let isEligible = true;

    if (replyCount < ALPHA_GROUP_CONFIG.minReplies) {
      isEligible = false;
      eligibilityReasons.push(`Need ${ALPHA_GROUP_CONFIG.minReplies - replyCount} more replies`);
    }
    if (likeCount < ALPHA_GROUP_CONFIG.minLikes) {
      isEligible = false;
      eligibilityReasons.push(`Need ${ALPHA_GROUP_CONFIG.minLikes - likeCount} more likes`);
    }
    if (totalInteractions < ALPHA_GROUP_CONFIG.minTotalInteractions) {
      isEligible = false;
      eligibilityReasons.push(`Need ${ALPHA_GROUP_CONFIG.minTotalInteractions - totalInteractions} more interactions`);
    }
    if (avgQualityScore < ALPHA_GROUP_CONFIG.minQualityScore && replyCount > 0) {
      isEligible = false;
      eligibilityReasons.push('Reply quality too low');
    }

    // Check fast-track eligibility
    const qualifiesForFastTrack = ALPHA_GROUP_CONFIG.fastTrackEnabled &&
      tradingStats.totalTrades >= ALPHA_GROUP_CONFIG.fastTrackMinTrades &&
      tradingStats.totalPnL >= ALPHA_GROUP_CONFIG.fastTrackMinPnL &&
      tradingStats.winRate >= ALPHA_GROUP_CONFIG.fastTrackMinWinRate;

    if (qualifiesForFastTrack) {
      isEligible = true; // Fast-track overrides social requirements
      eligibilityReasons.push('Qualifies for fast-track (high-value trader)');
    }

    if (isEligible) {
      eligibilityReasons.push('Eligible for group invite');
      eligibilityReasons.push(`Score: ${finalScore.toFixed(0)}/100`);
    }

    return {
      userId,
      npcId,
      replyCount,
      likeCount,
      shareCount,
      totalInteractions,
      avgQualityScore,
      tradingStats,
      socialScore,
      tradingScore,
      engagementScore: finalScore,
      isEligibleForInvite: isEligible,
      eligibilityReasons,
      qualifiesForFastTrack,
    };
  }
}
```

---

### 3. Unified Tier-Based Invite Logic

**File:** `packages/engine/src/services/alpha-group-invite-service.ts`

```typescript
import { ALPHA_GROUP_CONFIG } from '../config/alpha-group-config';
import { 
  TIER_CONFIG, 
  getTierForEngagementScore, 
  getEffectiveTierConfig,
  type TierLevel 
} from './tier-config';
import { StaticDataRegistry } from './static-data-registry';

export class AlphaGroupInviteService {
  /**
   * Process alpha group invites for one tick.
   * Uses tier-specific thresholds and per-NPC customization.
   */
  static async processTickInvites(): Promise<AlphaInviteResult[]> {
    const startTime = Date.now();
    const invites: AlphaInviteResult[] = [];

    const npcs = StaticDataRegistry.getAllActors().map(a => ({
      id: a.id,
      name: a.name,
      tierOverrides: a.tierOverrides,
      domain: a.domain,
    }));

    logger.info(
      `Processing alpha invites for ${npcs.length} NPCs`,
      { config: ALPHA_GROUP_CONFIG },
      'AlphaGroupInviteService'
    );

    for (const npc of npcs) {
      if (invites.length >= ALPHA_GROUP_CONFIG.maxInvitesPerTick) {
        logger.info('Reached max invites per tick', { count: invites.length }, 'AlphaGroupInviteService');
        break;
      }

      const npcInvites = await this.processNPCInvites(npc);
      invites.push(...npcInvites);
    }

    const duration = Date.now() - startTime;
    logger.info(
      `Alpha invite tick complete: ${invites.length} invites sent`,
      { duration, inviteCount: invites.length },
      'AlphaGroupInviteService'
    );

    return invites;
  }

  private static async processNPCInvites(npc: {
    id: string;
    name: string;
    tierOverrides?: ActorTierOverrides;
    domain?: string[];
  }): Promise<AlphaInviteResult[]> {
    const invites: AlphaInviteResult[] = [];

    // Determine focus weights based on NPC domain
    const focusWeights = this.getFocusWeightsForDomain(npc.domain);

    // Get top engaged users with this NPC
    const topUsers = await NPCInteractionTracker.getTopEngagedUsers(
      npc.id,
      ALPHA_GROUP_CONFIG.topUsersToConsider
    );

    for (const userScore of topUsers) {
      // Recalculate with NPC-specific weights
      const score = await NPCInteractionTracker.calculateEngagementScore(
        userScore.userId,
        npc.id,
        undefined,
        focusWeights
      );

      // Determine eligible tier using NPC-specific thresholds
      const eligibleTier = this.getEligibleTier(score.engagementScore, npc.id, score.qualifiesForFastTrack);
      
      if (!eligibleTier) {
        continue; // Below all tier thresholds
      }

      // Check invite decay
      if (ALPHA_GROUP_CONFIG.inviteDecayEnabled) {
        const decayStatus = await this.checkInviteDecay(userScore.userId, npc.id);
        if (!decayStatus.canBeInvited) {
          logger.debug('User blocked by invite decay', {
            userId: userScore.userId,
            declineCount: decayStatus.declineCount,
            nextEligibleAt: decayStatus.nextEligibleAt,
          }, 'AlphaGroupInviteService');
          continue;
        }
      }

      // Check existing membership
      const existingMembership = await this.checkExistingMembership(userScore.userId, npc.id);
      if (existingMembership) continue;

      // Check group limits
      const atLimit = await this.checkGroupLimit(userScore.userId);
      if (atLimit) continue;

      // Check cooldown
      const inCooldown = await this.checkCooldown(userScore.userId);
      if (inCooldown) continue;

      // Get tier-specific invite probability with NPC multiplier
      const tierConfig = getEffectiveTierConfig(eligibleTier, npc.id);
      const baseProbability = tierConfig.inviteProbability;
      const adjustedProbability = baseProbability * ALPHA_GROUP_CONFIG.inviteProbabilityMultiplier;

      // Roll the dice
      const roll = Math.random();
      if (roll < adjustedProbability) {
        // User wins! Invite them to appropriate tier
        const result = await TieredGroupService.inviteUserToTier(userScore.userId, npc.id);
        
        if (result.success) {
          invites.push({
            npcId: npc.id,
            npcName: npc.name,
            userId: userScore.userId,
            invitedToTier: result.tier!,
            invitedToChat: result.reason,
            engagementScore: score.engagementScore,
            socialScore: score.socialScore,
            tradingScore: score.tradingScore,
            probability: adjustedProbability,
            fastTracked: score.qualifiesForFastTrack,
          });

          logger.info('User invited to alpha group', {
            userId: userScore.userId,
            npcId: npc.id,
            tier: result.tier,
            engagementScore: score.engagementScore,
            fastTracked: score.qualifiesForFastTrack,
            roll,
            probability: adjustedProbability,
          }, 'AlphaGroupInviteService');

          break; // One invite per NPC per tick
        }
      }
    }

    return invites;
  }

  /**
   * Get eligible tier, considering fast-track and NPC-specific thresholds.
   */
  private static getEligibleTier(
    engagementScore: number,
    npcId: string,
    qualifiesForFastTrack: boolean
  ): TierLevel | null {
    // Fast-track users skip to Tier 2 (never Tier 1 automatically)
    if (qualifiesForFastTrack) {
      const tier2Config = getEffectiveTierConfig(2, npcId);
      // Still need to meet Tier 2 minimum (possibly adjusted for NPC)
      if (engagementScore >= tier2Config.minEngagementScore * 0.5) {
        return 2; // Fast-track to Tier 2
      }
      return 3; // Fall back to Tier 3 if not quite meeting Tier 2
    }

    // Normal tier calculation with NPC-specific thresholds
    for (const tier of [1, 2, 3] as TierLevel[]) {
      const config = getEffectiveTierConfig(tier, npcId);
      if (engagementScore >= config.minEngagementScore) {
        return tier;
      }
    }
    return null;
  }

  /**
   * Get focus weights based on NPC domain.
   */
  private static getFocusWeightsForDomain(
    domain?: string[]
  ): { social: number; trading: number } {
    if (!domain || domain.length === 0) {
      return { social: 0.5, trading: 0.5 };
    }

    const tradingDomains = ['crypto', 'trading', 'finance', 'defi', 'markets'];
    const socialDomains = ['media', 'politics', 'entertainment', 'culture'];
    const techDomains = ['tech', 'ai', 'venture-capital', 'startups'];

    const hasTradingFocus = domain.some(d => tradingDomains.includes(d));
    const hasSocialFocus = domain.some(d => socialDomains.includes(d));
    const hasTechFocus = domain.some(d => techDomains.includes(d));

    if (hasTradingFocus && !hasSocialFocus) {
      return { social: 0.4, trading: 0.6 };
    }
    if (hasSocialFocus && !hasTradingFocus) {
      return { social: 0.8, trading: 0.2 };
    }
    if (hasTechFocus) {
      return { social: 0.6, trading: 0.4 };
    }

    return { social: 0.5, trading: 0.5 };
  }

  /**
   * Check invite decay status for a user.
   */
  private static async checkInviteDecay(
    userId: string,
    npcId: string
  ): Promise<{ canBeInvited: boolean; declineCount: number; nextEligibleAt?: Date }> {
    // Check all declined invites from this NPC to this user
    const declinedInvites = await db
      .select({
        declineCount: groupInvites.declineCount,
        lastDeclinedAt: groupInvites.lastDeclinedAt,
        nextEligibleAt: groupInvites.nextEligibleAt,
      })
      .from(groupInvites)
      .innerJoin(groups, eq(groupInvites.groupId, groups.id))
      .where(
        and(
          eq(groupInvites.invitedUserId, userId),
          eq(groups.ownerId, npcId),
          eq(groupInvites.status, 'declined')
        )
      )
      .orderBy(desc(groupInvites.lastDeclinedAt))
      .limit(1);

    if (declinedInvites.length === 0) {
      return { canBeInvited: true, declineCount: 0 };
    }

    const { declineCount, nextEligibleAt } = declinedInvites[0];

    // Check if exceeded max declines
    if (declineCount >= ALPHA_GROUP_CONFIG.inviteDecayMaxDeclines) {
      // Check if reset period has passed
      const resetDate = new Date(
        (declinedInvites[0].lastDeclinedAt?.getTime() ?? 0) + 
        30 * 24 * 60 * 60 * 1000 // 30 days
      );
      
      if (new Date() < resetDate) {
        return { canBeInvited: false, declineCount, nextEligibleAt: resetDate };
      }
      // Reset has passed, user can be invited again
    }

    // Check if still in cooldown
    if (nextEligibleAt && new Date() < nextEligibleAt) {
      return { canBeInvited: false, declineCount, nextEligibleAt };
    }

    return { canBeInvited: true, declineCount };
  }
}
```

---

### 4. Per-NPC Tier Customization

**File:** `packages/engine/src/services/tier-config.ts`

Add to existing file:

```typescript
import { StaticDataRegistry } from './static-data-registry';

/**
 * Get effective tier configuration for an NPC, applying any overrides.
 */
export function getEffectiveTierConfig(
  tier: TierLevel,
  npcId?: string
): TierConfig {
  const baseConfig = TIER_CONFIG[tier];

  if (!npcId || !ALPHA_GROUP_CONFIG.perNpcCustomizationEnabled) {
    return baseConfig;
  }

  const actor = StaticDataRegistry.getActor(npcId);
  const overrides = actor?.tierOverrides;

  if (!overrides) {
    return baseConfig;
  }

  return {
    ...baseConfig,
    minEngagementScore: Math.round(
      baseConfig.minEngagementScore * (overrides.minEngagementScoreMultiplier ?? 1)
    ),
    inviteProbability:
      baseConfig.inviteProbability * (overrides.inviteProbabilityMultiplier ?? 1),
  };
}

/**
 * Get tier for engagement score, considering NPC-specific thresholds.
 */
export function getTierForEngagementScoreWithNpc(
  score: number,
  npcId?: string
): TierLevel | null {
  for (const tier of [1, 2, 3] as TierLevel[]) {
    const config = getEffectiveTierConfig(tier, npcId);
    if (score >= config.minEngagementScore) {
      return tier;
    }
  }
  return null;
}
```

---

### 5. Actor Data Updates

Add tier overrides to select actors:

**File:** `packages/engine/src/data/actors/ainsem.ts`

```typescript
import type { ActorData } from '../../types/shared';

export const data = {
  // ... existing fields ...
  
  tierOverrides: {
    // AInsem is a trading-focused KOL - make his groups slightly harder to join
    // and prioritize trading activity over social
    minEngagementScoreMultiplier: 1.2,  // 20% harder to join
    inviteProbabilityMultiplier: 0.8,   // 20% less likely to invite randomly
    focusWeights: {
      social: 0.3,
      trading: 0.7,  // Heavy trading focus
    },
  },
} as const satisfies ActorData;
```

**File:** `packages/engine/src/data/actors/joerogain.ts` (example social NPC)

```typescript
export const data = {
  // ... existing fields ...
  
  tierOverrides: {
    // JoeRogain is a social/media figure - prioritize engagement over trading
    minEngagementScoreMultiplier: 0.9,  // 10% easier to join
    inviteProbabilityMultiplier: 1.2,   // 20% more likely to invite
    focusWeights: {
      social: 0.9,
      trading: 0.1,  // Minimal trading focus
    },
  },
} as const satisfies ActorData;
```

---

## Database Migrations

**File:** `packages/db/drizzle/migrations/XXXX_alpha_group_enhancements.sql`

```sql
-- Migration: Alpha Group Enhancements
-- Description: Add invite decay tracking and grandfathering support

-- 1. Add invite decay columns to GroupInvite
ALTER TABLE "GroupInvite" ADD COLUMN IF NOT EXISTS "declineCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "GroupInvite" ADD COLUMN IF NOT EXISTS "lastDeclinedAt" TIMESTAMP;
ALTER TABLE "GroupInvite" ADD COLUMN IF NOT EXISTS "nextEligibleAt" TIMESTAMP;

-- 2. Add grandfathering columns to GroupMember
ALTER TABLE "GroupMember" ADD COLUMN IF NOT EXISTS "isGrandfathered" BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE "GroupMember" ADD COLUMN IF NOT EXISTS "grandfatheredAt" TIMESTAMP;

-- 3. Mark all existing active members as grandfathered
UPDATE "GroupMember" 
SET "isGrandfathered" = TRUE, "grandfatheredAt" = NOW() 
WHERE "isActive" = TRUE AND "isGrandfathered" = FALSE;

-- 4. Add index for invite decay queries
CREATE INDEX IF NOT EXISTS "GroupInvite_invitedUserId_status_declineCount_idx" 
ON "GroupInvite" ("invitedUserId", "status", "declineCount");

-- 5. Add index for grandfathering queries
CREATE INDEX IF NOT EXISTS "GroupMember_isGrandfathered_idx" 
ON "GroupMember" ("isGrandfathered");

-- 6. Add index for efficient trading stats queries (if not exists)
CREATE INDEX IF NOT EXISTS "AgentTrade_agentUserId_action_executedAt_idx"
ON "AgentTrade" ("agentUserId", "action", "executedAt");
```

**File:** `packages/db/src/schema/messaging.ts`

Add to `groupInvites` table definition:

```typescript
export const groupInvites = pgTable(
  'GroupInvite',
  {
    // ... existing fields ...
    
    // Invite decay tracking (NEW)
    declineCount: integer('declineCount').notNull().default(0),
    lastDeclinedAt: timestamp('lastDeclinedAt', { mode: 'date' }),
    nextEligibleAt: timestamp('nextEligibleAt', { mode: 'date' }),
  },
  // ... existing indexes ...
);
```

Add to `groupMembers` table definition:

```typescript
export const groupMembers = pgTable(
  'GroupMember',
  {
    // ... existing fields ...
    
    // Grandfathering tracking (NEW)
    isGrandfathered: boolean('isGrandfathered').notNull().default(false),
    grandfatheredAt: timestamp('grandfatheredAt', { mode: 'date' }),
  },
  // ... existing indexes ...
);
```

---

## API Endpoints

### Admin API for Threshold Management

**File:** `apps/web/src/app/api/admin/alpha-groups/config/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandling, requirePermission } from '@/lib/api-utils';
import { ALPHA_GROUP_CONFIG } from '@babylon/engine';

export const GET = withErrorHandling(async (request: NextRequest) => {
  await requirePermission(request, 'manage_alpha_groups');

  return NextResponse.json({
    config: ALPHA_GROUP_CONFIG,
    description: {
      inviteProbabilityMultiplier: 'Global multiplier for all invite probabilities',
      maxInvitesPerTick: 'Maximum invites sent per game tick',
      minReplies: 'Minimum replies required for eligibility',
      minLikes: 'Minimum likes required for eligibility',
      minTotalInteractions: 'Minimum total interactions required',
      includeTradingActivity: 'Whether trading activity affects engagement score',
      fastTrackEnabled: 'Allow high-value traders to skip tiers',
      inviteDecayEnabled: 'Reduce invite frequency for users who decline',
    },
  });
});

export const PATCH = withErrorHandling(async (request: NextRequest) => {
  await requirePermission(request, 'manage_alpha_groups');

  const updates = await request.json();

  // Validate updates (in production, write to database or config store)
  // For now, return what would be applied
  return NextResponse.json({
    message: 'Configuration would be updated (requires env var changes or config store)',
    proposedChanges: updates,
  });
});
```

### Admin API for Analytics

**File:** `apps/web/src/app/api/admin/alpha-groups/stats/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandling, requirePermission } from '@/lib/api-utils';
import { AlphaGroupInviteService, TieredGroupService } from '@babylon/engine';

export const GET = withErrorHandling(async (request: NextRequest) => {
  await requirePermission(request, 'view_alpha_groups');

  const [inviteStats, tierAnalytics] = await Promise.all([
    AlphaGroupInviteService.getInviteStats(),
    TieredGroupService.getGlobalAnalytics(),
  ]);

  // Calculate engagement distribution
  const { searchParams } = new URL(request.url);
  const npcId = searchParams.get('npcId');

  return NextResponse.json({
    invites: {
      totalInvites: inviteStats.totalInvites,
      activeGroups: inviteStats.activeGroups,
      invitesLast24h: inviteStats.invitesLast24h,
    },
    tiers: tierAnalytics,
    config: {
      currentThresholds: ALPHA_GROUP_CONFIG,
    },
  });
});
```

---

## Admin UI Components

### Alpha Groups Dashboard

**File:** `apps/web/src/app/admin/alpha-groups/page.tsx`

```tsx
'use client';

import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';

export default function AlphaGroupsDashboard() {
  const { data: stats } = useQuery({
    queryKey: ['alpha-group-stats'],
    queryFn: () => fetch('/api/admin/alpha-groups/stats').then(r => r.json()),
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  if (!stats) return <div>Loading...</div>;

  return (
    <div className="container mx-auto py-8">
      <h1 className="text-3xl font-bold mb-8">Alpha Groups Dashboard</h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <Card>
          <CardHeader>
            <CardTitle>Total Invites (24h)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold">{stats.invites.invitesLast24h}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Active Group Members</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold">{stats.tiers.totalMembers}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Fill Rate</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold">
              {(stats.tiers.fillRate * 100).toFixed(1)}%
            </div>
            <Progress value={stats.tiers.fillRate * 100} className="mt-2" />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Tier Breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {stats.tiers.tierBreakdown.map((tier: any) => (
              <div key={tier.tier} className="flex items-center gap-4">
                <div className="w-32 font-medium">
                  Tier {tier.tier}
                </div>
                <div className="flex-1">
                  <Progress value={tier.fillRate * 100} />
                </div>
                <div className="w-32 text-right text-sm text-muted-foreground">
                  {tier.members} / {tier.capacity}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
```

---

## Monitoring & Observability

### Structured Logging

Add to all invite operations:

```typescript
logger.info('Alpha group invite processed', {
  // Identifiers
  userId,
  npcId,
  tier: result.tier,
  
  // Scores
  engagementScore: score.engagementScore,
  socialScore: score.socialScore,
  tradingScore: score.tradingScore,
  
  // Decision factors
  probability: adjustedProbability,
  roll,
  fastTracked: score.qualifiesForFastTrack,
  
  // NPC config
  npcMultiplier: tierConfig.inviteProbabilityMultiplier,
  
  // Outcome
  success: result.success,
  reason: result.reason,
}, 'AlphaGroupInviteService');
```

### Metrics to Track

| Metric | Type | Labels | Alert Threshold |
|--------|------|--------|-----------------|
| `alpha_invites_sent_total` | Counter | `npc_id`, `tier`, `fast_tracked` | - |
| `alpha_invites_declined_total` | Counter | `npc_id`, `decline_count` | - |
| `alpha_invite_probability` | Histogram | `npc_id`, `tier` | - |
| `alpha_engagement_score` | Histogram | `npc_id` | - |
| `alpha_tier_fill_rate` | Gauge | `npc_id`, `tier` | > 95% (almost full) |
| `alpha_invite_duration_ms` | Histogram | - | p99 > 1000ms |

### Alerts

```yaml
# prometheus/alerts/alpha-groups.yml
groups:
  - name: alpha-groups
    rules:
      - alert: LowInviteRate
        expr: rate(alpha_invites_sent_total[1h]) < 1
        for: 6h
        labels:
          severity: warning
        annotations:
          summary: "Alpha group invite rate is very low"
          description: "Less than 1 invite per hour for 6 hours"

      - alert: TierNearCapacity
        expr: alpha_tier_fill_rate > 0.9
        for: 1h
        labels:
          severity: info
        annotations:
          summary: "Alpha group tier is nearly full"
          description: "Tier {{ $labels.tier }} for NPC {{ $labels.npc_id }} is at {{ $value | humanizePercentage }}"

      - alert: HighDeclineRate
        expr: rate(alpha_invites_declined_total[1d]) / rate(alpha_invites_sent_total[1d]) > 0.5
        for: 1d
        labels:
          severity: warning
        annotations:
          summary: "High invite decline rate"
          description: "More than 50% of invites being declined"
```

---

## Testing Strategy

### Unit Tests

**File:** `packages/engine/src/services/__tests__/alpha-group-invite-service.test.ts`

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AlphaGroupInviteService } from '../alpha-group-invite-service';
import { ALPHA_GROUP_CONFIG } from '../../config/alpha-group-config';

describe('AlphaGroupInviteService', () => {
  describe('getEligibleTier', () => {
    it('returns Tier 1 for score >= 80', () => {
      const tier = AlphaGroupInviteService['getEligibleTier'](85, 'test-npc', false);
      expect(tier).toBe(1);
    });

    it('returns Tier 2 for score >= 50 and < 80', () => {
      const tier = AlphaGroupInviteService['getEligibleTier'](65, 'test-npc', false);
      expect(tier).toBe(2);
    });

    it('returns Tier 3 for score >= 20 and < 50', () => {
      const tier = AlphaGroupInviteService['getEligibleTier'](35, 'test-npc', false);
      expect(tier).toBe(3);
    });

    it('returns null for score < 20', () => {
      const tier = AlphaGroupInviteService['getEligibleTier'](15, 'test-npc', false);
      expect(tier).toBeNull();
    });

    it('fast-track users get Tier 2 with reduced threshold', () => {
      const tier = AlphaGroupInviteService['getEligibleTier'](30, 'test-npc', true);
      expect(tier).toBe(2);
    });
  });

  describe('getFocusWeightsForDomain', () => {
    it('returns trading focus for crypto domain', () => {
      const weights = AlphaGroupInviteService['getFocusWeightsForDomain'](['crypto', 'trading']);
      expect(weights.trading).toBeGreaterThan(weights.social);
    });

    it('returns social focus for media domain', () => {
      const weights = AlphaGroupInviteService['getFocusWeightsForDomain'](['media', 'politics']);
      expect(weights.social).toBeGreaterThan(weights.trading);
    });

    it('returns balanced weights for unknown domain', () => {
      const weights = AlphaGroupInviteService['getFocusWeightsForDomain']([]);
      expect(weights.social).toBe(0.5);
      expect(weights.trading).toBe(0.5);
    });
  });

  describe('checkInviteDecay', () => {
    it('allows invite when no prior declines', async () => {
      vi.mocked(db.select).mockResolvedValueOnce([]);
      const result = await AlphaGroupInviteService['checkInviteDecay']('user-1', 'npc-1');
      expect(result.canBeInvited).toBe(true);
    });

    it('blocks invite when in cooldown', async () => {
      const futureDate = new Date(Date.now() + 24 * 60 * 60 * 1000);
      vi.mocked(db.select).mockResolvedValueOnce([{
        declineCount: 2,
        lastDeclinedAt: new Date(),
        nextEligibleAt: futureDate,
      }]);
      const result = await AlphaGroupInviteService['checkInviteDecay']('user-1', 'npc-1');
      expect(result.canBeInvited).toBe(false);
    });

    it('blocks invite when max declines exceeded', async () => {
      vi.mocked(db.select).mockResolvedValueOnce([{
        declineCount: 5,
        lastDeclinedAt: new Date(),
        nextEligibleAt: null,
      }]);
      const result = await AlphaGroupInviteService['checkInviteDecay']('user-1', 'npc-1');
      expect(result.canBeInvited).toBe(false);
    });
  });
});
```

### Integration Tests

**File:** `packages/testing/integration/alpha-group-thresholds.integration.test.ts`

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { 
  AlphaGroupInviteService, 
  NPCInteractionTracker,
  TieredGroupService,
} from '@babylon/engine';
import { createTestUser, createTestNPC, cleanupTestData } from '../helpers';

describe('Alpha Group Thresholds Integration', () => {
  beforeEach(async () => {
    await cleanupTestData();
  });

  afterEach(async () => {
    await cleanupTestData();
  });

  it('should invite user with minimal engagement to Tier 3', async () => {
    const npc = await createTestNPC('Test NPC');
    const user = await createTestUser({ displayName: 'New User' });

    // Create minimal engagement (1 reply, 2 likes, 2 more interactions)
    await createInteractions(user.id, npc.id, {
      replies: 1,
      likes: 2,
      shares: 2,
    });

    const score = await NPCInteractionTracker.calculateEngagementScore(user.id, npc.id);
    
    // Should be eligible with new thresholds
    expect(score.isEligibleForInvite).toBe(true);
    expect(score.engagementScore).toBeGreaterThan(20); // Tier 3 threshold
  });

  it('should fast-track high-value trader to Tier 2', async () => {
    const npc = await createTestNPC('Trading NPC', { domain: ['crypto', 'trading'] });
    const trader = await createTestUser({ displayName: 'Pro Trader' });

    // Create trading history
    await createTrades(trader.id, {
      total: 15,
      profitable: 10,
      totalPnL: 8000,
    });

    // Minimal social engagement
    await createInteractions(trader.id, npc.id, { replies: 1, likes: 1 });

    const score = await NPCInteractionTracker.calculateEngagementScore(trader.id, npc.id);
    
    expect(score.qualifiesForFastTrack).toBe(true);
    
    const result = await TieredGroupService.inviteUserToTier(trader.id, npc.id);
    expect(result.success).toBe(true);
    expect(result.tier).toBe(2); // Fast-tracked to Tier 2
  });

  it('should respect invite decay after multiple declines', async () => {
    const npc = await createTestNPC('Persistent NPC');
    const user = await createTestUser({ displayName: 'Declining User' });

    // Simulate 3 declined invites
    for (let i = 0; i < 3; i++) {
      await createAndDeclineInvite(user.id, npc.id);
    }

    const decayStatus = await AlphaGroupInviteService['checkInviteDecay'](user.id, npc.id);
    
    expect(decayStatus.canBeInvited).toBe(false);
    expect(decayStatus.declineCount).toBe(3);
    expect(decayStatus.nextEligibleAt).toBeDefined();
  });

  it('should grandfather existing members after migration', async () => {
    const npc = await createTestNPC('Established NPC');
    const existingMember = await createTestUser({ displayName: 'OG Member' });

    // Add member before migration date
    await addMemberToGroup(existingMember.id, npc.id, {
      tier: 2,
      joinedAt: new Date('2026-01-01'), // Before migration
    });

    // Run grandfathering migration
    await runGrandfatheringMigration();

    const status = await TieredGroupService.getMembershipStatus(existingMember.id, npc.id);
    
    expect(status.isGrandfathered).toBe(true);
    expect(status.meetsCurrentCriteria).toBe(false); // Doesn't meet new criteria
    expect(status.canBePromoted).toBe(false); // Can't promote without meeting criteria
  });
});
```

---

## Rollout Plan

### Week 1: Infrastructure & Configuration
- [ ] Deploy database migrations
- [ ] Deploy configuration system
- [ ] Add monitoring dashboards
- [ ] Run grandfathering migration for existing members

### Week 2: Core Logic with Feature Flags
- [ ] Deploy updated `NPCInteractionTracker` (trading activity disabled by default)
- [ ] Deploy updated `AlphaGroupInviteService` (use new config, feature-flagged)
- [ ] Enable for 10% of NPCs (canary)
- [ ] Monitor metrics

### Week 3: Gradual Rollout
- [ ] Enable trading activity in engagement score
- [ ] Enable for 50% of NPCs
- [ ] Monitor and tune thresholds based on data
- [ ] Enable fast-track for high-value traders

### Week 4: Full Rollout & Fine-Tuning
- [ ] Enable for 100% of NPCs
- [ ] Add per-NPC customization to select actors
- [ ] Enable invite decay
- [ ] Final threshold tuning

---

## Success Metrics

### Primary Metrics

| Metric | Current | Target | Measurement |
|--------|---------|--------|-------------|
| Weekly invites per active user | ~0.1 | 1.0-2.0 | `invites_sent / active_users` |
| Active users in at least one group | ~10% | 60% | `users_with_groups / total_active_users` |
| Average time to first group invite | Unknown | < 7 days | Cohort analysis |
| Invite acceptance rate | Unknown | > 50% | `accepted / sent` |

### Secondary Metrics

| Metric | Target | Rationale |
|--------|--------|-----------|
| Tier 3 fill rate | 40-60% | Entry tier should be accessible |
| Tier 2 fill rate | 20-40% | Community tier moderately exclusive |
| Tier 1 fill rate | 10-20% | Inner circle highly exclusive |
| Fast-track percentage | 5-10% | Rewards skilled traders |
| Decline rate after decay | < 20% | Decay is working |

### Definition of "Active User"

Per existing codebase (`packages/engine/src/services/following-mechanics.ts:431-447`):

```typescript
// Active user = non-actor user who has posted in last 7 days
const activePlayers = await db
  .select({ userId: users.id })
  .from(users)
  .innerJoin(posts, eq(posts.authorId, users.id))
  .where(
    and(
      gte(posts.timestamp, sevenDaysAgo),
      eq(users.isActor, false)
    )
  )
  .groupBy(users.id)
  .having(gte(count(posts.id), 1));
```

---

## Files Modified Summary

| File | Type | Changes |
|------|------|---------|
| `packages/engine/src/config/alpha-group-config.ts` | **NEW** | Centralized configuration |
| `packages/engine/src/services/alpha-group-invite-service.ts` | MODIFIED | Tier-based logic, decay, fast-track |
| `packages/engine/src/services/npc-interaction-tracker.ts` | MODIFIED | Trading activity, configurable thresholds |
| `packages/engine/src/services/tier-config.ts` | MODIFIED | NPC-specific overrides |
| `packages/engine/src/services/tiered-group-service.ts` | MODIFIED | Grandfathering support |
| `packages/shared/src/game-types.ts` | MODIFIED | `ActorTierOverrides` interface |
| `packages/shared/src/constants/constants.ts` | MODIFIED | Cooldown hours |
| `packages/db/src/schema/messaging.ts` | MODIFIED | Decay and grandfathering columns |
| `packages/db/drizzle/migrations/*.sql` | **NEW** | Migration file |
| `apps/web/src/app/api/admin/alpha-groups/*/route.ts` | **NEW** | Admin APIs |
| `apps/web/src/app/admin/alpha-groups/page.tsx` | **NEW** | Admin dashboard |
| `packages/engine/src/data/actors/*.ts` | MODIFIED | Select actors with tier overrides |
| `packages/testing/integration/*.test.ts` | MODIFIED | Updated test thresholds |

---

## Appendix: Probability Calculation Verification

**Claim:** "~21% weekly invite probability for max engagement users"

**Verification:**

```
Assumptions:
- Game tick runs every ~10 minutes
- 6 ticks/hour × 24 hours × 7 days = 1008 ticks/week
- Tier 3 invite probability: 10%
- Probability multiplier: 1.0 (default)

For user with engagement score = 100:
- Eligible for Tier 1 (probability: 0.5%)
- Per-tick probability: 0.5% × 1.0 = 0.5%
- Weekly probability of at least one invite:
  P(at least one) = 1 - P(none)
  P(at least one) = 1 - (0.995)^1008
  P(at least one) = 1 - 0.0063
  P(at least one) ≈ 99.4%

For user with engagement score = 50:
- Eligible for Tier 2 (probability: 2%)
- Per-tick probability: 2%
- P(at least one) = 1 - (0.98)^1008 ≈ 100%

For user with engagement score = 25:
- Eligible for Tier 3 (probability: 10%)
- Per-tick probability: 10%
- P(at least one) = 1 - (0.9)^1008 ≈ 100%

CONCLUSION: With tier-based probabilities, even Tier 3 eligible users
have near-certain chance of invitation within a week. This is correct
and matches the goal of "1-2 invites per active user per week."
```

**Note:** The original claim of "~21%" was based on the old hardcoded 0.5% probability. With tier-based probabilities, the actual rates are much higher as intended.

---

## LARP Assessment: Validation & Gap Analysis

This section critically evaluates the plan for completeness, identifies any placeholder or unverified claims, and provides concrete fixes.

### Issue 1: `ActorTierOverrides` Interface Does Not Exist Yet

**Status:** ⚠️ REQUIRES CREATION

**Finding:** The plan references `ActorTierOverrides` on `ActorData`, but this interface does not exist in `packages/shared/src/game-types.ts`.

**Fix:**

Add to `packages/shared/src/game-types.ts`:

```typescript
/**
 * Per-actor tier customization for alpha group mechanics.
 * Allows NPCs to have different invite thresholds based on personality.
 */
export interface ActorTierOverrides {
  /** Multiplier for minEngagementScore (1.0 = default, 1.5 = 50% harder) */
  minEngagementScoreMultiplier?: number;
  /** Multiplier for inviteProbability (1.0 = default, 0.5 = half as likely) */
  inviteProbabilityMultiplier?: number;
  /** Focus weights for engagement calculation (must sum to 1.0) */
  focusWeights?: {
    social: number;
    trading: number;
  };
}

export interface ActorData extends Actor {
  realName: string;
  username: string;
  pfpDescription?: string;
  profileBanner?: string;
  originalFirstName: string;
  originalLastName: string;
  originalHandle: string;
  firstName?: string;
  lastName?: string;
  tierOverrides?: ActorTierOverrides; // ADD THIS
}
```

---

### Issue 2: `userInteractions` Table Location Not Clearly Specified

**Status:** ✅ VERIFIED

**Finding:** The plan references user interactions but doesn't specify the exact table location.

**Verification:** The table exists at `packages/db/src/schema/users.ts:518` as `userInteractions`.

**No fix needed** - correctly uses existing infrastructure.

---

### Issue 3: Transaction Pattern Inconsistency

**Status:** ⚠️ NEEDS SPECIFICATION

**Finding:** The plan references `db.$transaction` but the codebase uses `withTransaction` from `@babylon/db`.

**Fix:** Update all transaction code in the plan to use:

```typescript
import { withTransaction } from '@babylon/db';

await withTransaction(async (tx) => {
  // transaction operations
});
```

---

### Issue 4: Missing Import Statements in Code Samples

**Status:** ⚠️ INCOMPLETE

**Finding:** Code samples don't include all required imports, which could cause implementation confusion.

**Fix:** Add complete import blocks to each code sample:

For `alpha-group-config.ts`:
```typescript
import { logger } from '@babylon/shared';
```

For `npc-interaction-tracker.ts`:
```typescript
import { 
  agentTrades, 
  db, 
  eq, 
  and, 
  gte, 
  lte, 
  count, 
  sum,
  userInteractions,
  posts,
  reactions,
  shares,
  users,
} from '@babylon/db';
import { logger } from '@babylon/shared';
import { ALPHA_GROUP_CONFIG } from '../config/alpha-group-config';
```

For `alpha-group-invite-service.ts`:
```typescript
import { 
  db, 
  eq, 
  and, 
  desc,
  groupInvites,
  groupMembers,
  groups,
} from '@babylon/db';
import { logger, GROUP_CONFIG } from '@babylon/shared';
import { ALPHA_GROUP_CONFIG } from '../config/alpha-group-config';
import { TIER_CONFIG, getEffectiveTierConfig, type TierLevel } from './tier-config';
import { NPCInteractionTracker } from './npc-interaction-tracker';
import { TieredGroupService } from './tiered-group-service';
import { StaticDataRegistry } from './static-data-registry';
import { GroupChatService } from './group-chat-service';
```

---

### Issue 5: `getEffectiveTierConfig` Function Not Exported

**Status:** ⚠️ REQUIRES ADDITION

**Finding:** The plan creates `getEffectiveTierConfig` but `tier-config.ts` needs to export it properly.

**Fix:** Ensure function is exported in `packages/engine/src/services/tier-config.ts`:

```typescript
// At end of file, update exports
export {
  TIER_CONFIG,
  ALL_TIERS,
  getTierConfig,
  getTierSuffix,
  getTierGroupName,
  getTierForEngagementScore,
  isEligibleForPromotion,
  shouldDemote,
  getLowerTier,
  getHigherTier,
  getTotalNpcCapacity,
  TIER_MESSAGE_GUIDANCE,
  getTierMessageGuidance,
  isValidTier,
  assertTierLevel,
  // NEW
  getEffectiveTierConfig,
  getTierForEngagementScoreWithNpc,
};
```

---

### Issue 6: Admin Permission `manage_alpha_groups` Not Defined

**Status:** ⚠️ REQUIRES CREATION

**Finding:** The API endpoints reference `manage_alpha_groups` and `view_alpha_groups` permissions that don't exist.

**Fix:** Add permissions to admin RBAC system:

```typescript
// packages/shared/src/constants/permissions.ts (or wherever permissions are defined)
export const PERMISSIONS = {
  // ... existing permissions
  VIEW_ALPHA_GROUPS: 'view_alpha_groups',
  MANAGE_ALPHA_GROUPS: 'manage_alpha_groups',
} as const;

// And add to admin roles as appropriate
```

---

### Issue 7: `AlphaInviteResult` Type Needs Update

**Status:** ⚠️ INCOMPLETE

**Finding:** The plan adds new fields to invite results but doesn't update the interface.

**Fix:** Update `packages/engine/src/services/alpha-group-invite-service.ts`:

```typescript
export interface AlphaInviteResult {
  npcId: string;
  npcName: string;
  userId: string;
  invitedToTier: TierLevel; // CHANGED from invitedToChat
  invitedToChat: string;
  engagementScore: number;
  socialScore: number;    // NEW
  tradingScore: number;   // NEW
  probability: number;
  fastTracked: boolean;   // NEW
}
```

---

### Issue 8: Test Helper Functions Not Defined

**Status:** ⚠️ PLACEHOLDER

**Finding:** Integration tests reference helper functions that don't exist:
- `createInteractions()`
- `createTrades()`
- `createAndDeclineInvite()`
- `addMemberToGroup()`
- `runGrandfatheringMigration()`

**Fix:** Create test helpers in `packages/testing/integration/helpers/alpha-group-helpers.ts`:

```typescript
import { db, agentTrades, userInteractions, groupInvites, groupMembers, groups } from '@babylon/db';
import { generateSnowflakeId } from '@babylon/shared';

export async function createInteractions(
  userId: string,
  npcId: string,
  counts: { replies?: number; likes?: number; shares?: number }
): Promise<void> {
  const now = new Date();
  
  // Create reply interactions
  for (let i = 0; i < (counts.replies ?? 0); i++) {
    await db.insert(userInteractions).values({
      id: await generateSnowflakeId(),
      userId,
      npcId,
      interactionType: 'reply',
      qualityScore: 0.8,
      timestamp: now,
    });
  }
  
  // For likes/shares, we'd need to create posts first and then reactions
  // This is a simplified version for testing
}

export async function createTrades(
  userId: string,
  config: { total: number; profitable: number; totalPnL: number }
): Promise<void> {
  const profitPerTrade = config.totalPnL / config.profitable;
  
  for (let i = 0; i < config.total; i++) {
    const isProfitable = i < config.profitable;
    await db.insert(agentTrades).values({
      id: await generateSnowflakeId(),
      agentUserId: userId,
      marketType: 'prediction',
      action: 'close',
      amount: 100,
      price: 1.0,
      pnl: isProfitable ? profitPerTrade : -50,
      executedAt: new Date(),
    });
  }
}

export async function createAndDeclineInvite(
  userId: string,
  npcId: string
): Promise<void> {
  // Find NPC's group
  const [group] = await db
    .select({ id: groups.id })
    .from(groups)
    .where(and(eq(groups.ownerId, npcId), eq(groups.type, 'npc')))
    .limit(1);
    
  if (!group) throw new Error('NPC has no group');
  
  // Check for existing invite
  const [existing] = await db
    .select()
    .from(groupInvites)
    .where(
      and(
        eq(groupInvites.groupId, group.id),
        eq(groupInvites.invitedUserId, userId)
      )
    )
    .limit(1);
    
  if (existing) {
    // Update existing invite
    await db
      .update(groupInvites)
      .set({
        status: 'declined',
        respondedAt: new Date(),
        declineCount: (existing.declineCount ?? 0) + 1,
        lastDeclinedAt: new Date(),
        nextEligibleAt: new Date(Date.now() + 24 * 60 * 60 * 1000 * Math.pow(2, existing.declineCount ?? 0)),
      })
      .where(eq(groupInvites.id, existing.id));
  } else {
    // Create and immediately decline
    await db.insert(groupInvites).values({
      id: await generateSnowflakeId(),
      groupId: group.id,
      invitedUserId: userId,
      invitedBy: npcId,
      status: 'declined',
      respondedAt: new Date(),
      declineCount: 1,
      lastDeclinedAt: new Date(),
      nextEligibleAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });
  }
}

export async function addMemberToGroup(
  userId: string,
  npcId: string,
  options: { tier: number; joinedAt: Date }
): Promise<void> {
  const [group] = await db
    .select({ id: groups.id })
    .from(groups)
    .where(
      and(
        eq(groups.ownerId, npcId),
        eq(groups.type, 'npc'),
        eq(groups.tier, options.tier)
      )
    )
    .limit(1);
    
  if (!group) throw new Error(`NPC has no tier ${options.tier} group`);
  
  await db.insert(groupMembers).values({
    id: await generateSnowflakeId(),
    groupId: group.id,
    userId,
    tier: options.tier,
    joinedAt: options.joinedAt,
  });
}

export async function runGrandfatheringMigration(): Promise<void> {
  await db
    .update(groupMembers)
    .set({
      isGrandfathered: true,
      grandfatheredAt: new Date(),
    })
    .where(
      and(
        eq(groupMembers.isActive, true),
        eq(groupMembers.isGrandfathered, false)
      )
    );
}
```

---

### Issue 9: `getMembershipStatus` Method Doesn't Exist

**Status:** ⚠️ REQUIRES IMPLEMENTATION

**Finding:** The plan references `TieredGroupService.getMembershipStatus()` which doesn't exist.

**Fix:** Add to `packages/engine/src/services/tiered-group-service.ts`:

```typescript
export interface MembershipStatus {
  isGrandfathered: boolean;
  meetsCurrentCriteria: boolean;
  canBePromoted: boolean;
  grandfatheredAt?: Date;
}

/**
 * Get membership status including grandfathering info.
 */
static async getMembershipStatus(
  userId: string,
  npcId: string
): Promise<MembershipStatus> {
  const [membership] = await db
    .select({
      tier: groupMembers.tier,
      joinedAt: groupMembers.joinedAt,
      isGrandfathered: groupMembers.isGrandfathered,
      grandfatheredAt: groupMembers.grandfatheredAt,
    })
    .from(groupMembers)
    .innerJoin(groups, eq(groupMembers.groupId, groups.id))
    .where(
      and(
        eq(groupMembers.userId, userId),
        eq(groupMembers.isActive, true),
        eq(groups.ownerId, npcId),
        eq(groups.type, 'npc')
      )
    )
    .limit(1);

  if (!membership || !isValidTier(membership.tier)) {
    return {
      isGrandfathered: false,
      meetsCurrentCriteria: false,
      canBePromoted: false,
    };
  }

  const engagementScore = await NPCInteractionTracker.calculateEngagementScore(
    userId,
    npcId
  );
  
  const tierConfig = getEffectiveTierConfig(membership.tier, npcId);
  const meetsCurrentCriteria = engagementScore.engagementScore >= tierConfig.minEngagementScore;

  return {
    isGrandfathered: membership.isGrandfathered ?? false,
    meetsCurrentCriteria,
    canBePromoted: meetsCurrentCriteria && !membership.isGrandfathered,
    grandfatheredAt: membership.grandfatheredAt ?? undefined,
  };
}
```

---

### Issue 10: Service Index Export

**Status:** ⚠️ REQUIRES UPDATE

**Finding:** New config file needs to be exported from engine index.

**Fix:** Update `packages/engine/src/index.ts`:

```typescript
// Add export
export * from './config/alpha-group-config';
```

---

### Issue 11: Environment Variable Documentation

**Status:** ⚠️ INCOMPLETE

**Finding:** New environment variables need to be documented.

**Fix:** Add to `.env.example` or documentation:

```bash
# Alpha Group Configuration
ALPHA_INVITE_PROBABILITY_MULTIPLIER=1.0
ALPHA_MAX_INVITES_PER_TICK=15
ALPHA_TOP_USERS_TO_CONSIDER=30
ALPHA_MIN_REPLIES=1
ALPHA_MIN_LIKES=2
ALPHA_MIN_TOTAL_INTERACTIONS=5
ALPHA_MIN_QUALITY_SCORE=0.5
ALPHA_TRADE_WEIGHT=2.5
ALPHA_PROFITABLE_TRADE_BONUS=1.5
ALPHA_INCLUDE_TRADING=true
ALPHA_FAST_TRACK_ENABLED=true
ALPHA_FAST_TRACK_MIN_TRADES=10
ALPHA_FAST_TRACK_MIN_PNL=5000
ALPHA_FAST_TRACK_MIN_WIN_RATE=0.55
ALPHA_INVITE_DECAY_ENABLED=true
ALPHA_INVITE_DECAY_BASE_HOURS=24
ALPHA_INVITE_DECAY_MAX_DECLINES=5
ALPHA_INVITE_COOLDOWN_HOURS=2
ALPHA_PER_NPC_CUSTOMIZATION_ENABLED=true
ALPHA_GRANDFATHERING_ENABLED=true
```

---

### Issue 12: Drizzle Schema Type Updates

**Status:** ⚠️ REQUIRES UPDATE

**Finding:** Schema changes need corresponding type exports.

**Fix:** Update `packages/db/src/schema/messaging.ts` type exports:

```typescript
// Add to type exports at bottom of file
export type GroupInviteDecayFields = Pick<GroupInvite, 'declineCount' | 'lastDeclinedAt' | 'nextEligibleAt'>;
export type GroupMemberGrandfatherFields = Pick<GroupMember, 'isGrandfathered' | 'grandfatheredAt'>;
```

---

## Validation Checklist

| Item | Status | Notes |
|------|--------|-------|
| Database schema verified | ✅ | `agentTrades`, `userInteractions`, `groupInvites` exist |
| Transaction pattern verified | ✅ | Uses `db.$transaction` pattern |
| All new interfaces defined | ✅ | `ActorTierOverrides` added to `game-types.ts` |
| All new methods implemented | ✅ | `getMembershipStatus`, `getEffectiveTierConfig`, etc. |
| Migrations specified | ✅ | SQL migration `0023_add_alpha_group_enhancements.sql` |
| API endpoints specified | ✅ | Full route handlers provided |
| Admin UI specified | ✅ | React component provided |
| Monitoring defined | ✅ | Prometheus metrics and alerts |
| Rollout plan defined | ✅ | 4-week phased rollout |
| Success metrics defined | ✅ | Primary and secondary KPIs |
| Environment variables documented | ✅ | Documented below |

---

## Implementation Status (Phase 1 Complete)

**Implemented on 2026-01-21:**

| Priority | Item | Status | File(s) |
|----------|------|--------|---------|
| 1 | `ActorTierOverrides` interface | ✅ Complete | `packages/shared/src/game-types.ts` |
| 2 | Database migrations | ✅ Complete | `packages/db/drizzle/migrations/0023_*.sql` |
| 3 | `alpha-group-config.ts` | ✅ Complete | `packages/engine/src/config/alpha-group-config.ts` |
| 4 | Update `NPCInteractionTracker` | ✅ Complete | `packages/engine/src/services/npc-interaction-tracker.ts` |
| 5 | `getEffectiveTierConfig` function | ✅ Complete | `packages/engine/src/services/tier-config.ts` |
| 6 | Update `AlphaGroupInviteService` | ✅ Complete | `packages/engine/src/services/alpha-group-invite-service.ts` |
| 7 | `getMembershipStatus` method | ✅ Complete | `packages/engine/src/services/tiered-group-service.ts` |
| 8 | Schema updates | ✅ Complete | `packages/db/src/schema/messaging.ts` |
| 9 | Engine index exports | ✅ Complete | `packages/engine/src/index.ts` |
| 10 | Environment variables | ✅ Documented | See below |

---

## Environment Variables Reference

All environment variables for the alpha group system are prefixed with `ALPHA_` for easy identification.

### Quick Start (Copy to your `.env`)

```bash
# =============================================================================
# ALPHA GROUP CONFIGURATION
# =============================================================================

# Invite Probability Controls
ALPHA_INVITE_PROBABILITY_MULTIPLIER=1.0   # Global multiplier for all invite probabilities
ALPHA_MAX_INVITES_PER_TICK=15             # Max invites per game tick (prevents flooding)
ALPHA_TOP_USERS_TO_CONSIDER=30            # Top N engaged users to evaluate per NPC

# Engagement Thresholds (lowered from original values)
ALPHA_MIN_REPLIES=1                       # Minimum replies to NPC posts (was: 3)
ALPHA_MIN_LIKES=2                         # Minimum likes on NPC posts (was: 5)
ALPHA_MIN_TOTAL_INTERACTIONS=5            # Minimum total interactions (was: 10)
ALPHA_MIN_QUALITY_SCORE=0.5               # Minimum reply quality score (0-1)
ALPHA_MAX_INTERACTIONS_PER_DAY=50         # Spam threshold

# Trading Activity (NEW)
ALPHA_INCLUDE_TRADING=true                # Include trading in engagement score
ALPHA_TRADE_WEIGHT=2.5                    # Points per trade
ALPHA_PROFITABLE_TRADE_BONUS=1.5          # Extra points for profitable trades

# Fast-Track for High-Value Traders (NEW)
ALPHA_FAST_TRACK_ENABLED=true             # Enable fast-track to Tier 2
ALPHA_FAST_TRACK_MIN_TRADES=10            # Minimum trades for fast-track
ALPHA_FAST_TRACK_MIN_PNL=5000             # Minimum P&L for fast-track
ALPHA_FAST_TRACK_MIN_WIN_RATE=0.55        # Minimum win rate (55%)
ALPHA_FAST_TRACK_TARGET_TIER=2            # Tier to fast-track to

# Invite Decay (NEW - prevents spam invites to users who decline)
ALPHA_INVITE_DECAY_ENABLED=true           # Enable exponential backoff for declines
ALPHA_INVITE_DECAY_BASE_HOURS=24          # Base cooldown after first decline
ALPHA_INVITE_DECAY_MAX_HOURS=168          # Max cooldown (7 days)
ALPHA_INVITE_DECAY_MAX_DECLINES=5         # Declines before temporary exclusion
ALPHA_INVITE_DECAY_RESET_DAYS=30          # Days of inactivity to reset decline count

# Cooldowns
ALPHA_INVITE_COOLDOWN_HOURS=2             # Hours after joining before next invite eligible

# Feature Flags
ALPHA_PER_NPC_CUSTOMIZATION_ENABLED=true  # Enable per-NPC tier thresholds
ALPHA_GRANDFATHERING_ENABLED=true         # Protect existing members during threshold changes

# Scoring Weights (for engagement calculation)
ALPHA_REPLY_WEIGHT=3.0                    # Weight for replies
ALPHA_LIKE_WEIGHT=1.0                     # Weight for likes
ALPHA_SHARE_WEIGHT=2.0                    # Weight for shares
ALPHA_MAX_EXPECTED_SOCIAL_SCORE=100       # Normalization factor for social score
ALPHA_MAX_EXPECTED_TRADING_SCORE=50       # Normalization factor for trading score
ALPHA_QUALITY_MULTIPLIER=1.2              # Bonus for high-quality replies
ALPHA_QUALITY_THRESHOLD=0.8               # Quality score threshold for bonus

# Default Focus Weights (when NPC has no tier overrides)
ALPHA_DEFAULT_SOCIAL_WEIGHT=0.5           # Default weight for social interactions
ALPHA_DEFAULT_TRADING_WEIGHT=0.5          # Default weight for trading activity
```

### Environment Variable Categories

#### 1. Invite Probability Controls
| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `ALPHA_INVITE_PROBABILITY_MULTIPLIER` | number | 1.0 | Scales all tier invite probabilities. Set > 1 to increase invites. |
| `ALPHA_MAX_INVITES_PER_TICK` | integer | 15 | Maximum invites to send per tick across all NPCs. |
| `ALPHA_TOP_USERS_TO_CONSIDER` | integer | 30 | Number of top engaged users to evaluate per NPC per tick. |

#### 2. Engagement Thresholds
| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `ALPHA_MIN_REPLIES` | integer | 1 | Minimum replies to NPC posts for eligibility. |
| `ALPHA_MIN_LIKES` | integer | 2 | Minimum likes on NPC posts for eligibility. |
| `ALPHA_MIN_TOTAL_INTERACTIONS` | integer | 5 | Minimum total interactions for eligibility. |
| `ALPHA_MIN_QUALITY_SCORE` | float | 0.5 | Minimum quality score for replies (0-1). |
| `ALPHA_MAX_INTERACTIONS_PER_DAY` | integer | 50 | Max interactions per day before spam flag. |

#### 3. Trading Activity
| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `ALPHA_INCLUDE_TRADING` | boolean | true | Include trading activity in engagement score. |
| `ALPHA_TRADE_WEIGHT` | float | 2.5 | Points per closed trade. |
| `ALPHA_PROFITABLE_TRADE_BONUS` | float | 1.5 | Extra points per profitable trade. |

#### 4. Fast-Track
| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `ALPHA_FAST_TRACK_ENABLED` | boolean | true | Enable fast-track for high-value traders. |
| `ALPHA_FAST_TRACK_MIN_TRADES` | integer | 10 | Minimum trades for fast-track. |
| `ALPHA_FAST_TRACK_MIN_PNL` | float | 5000 | Minimum P&L for fast-track. |
| `ALPHA_FAST_TRACK_MIN_WIN_RATE` | float | 0.55 | Minimum win rate for fast-track (55%). |

#### 5. Invite Decay
| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `ALPHA_INVITE_DECAY_ENABLED` | boolean | true | Enable exponential backoff for declined invites. |
| `ALPHA_INVITE_DECAY_BASE_HOURS` | integer | 24 | Base cooldown after first decline. |
| `ALPHA_INVITE_DECAY_MAX_HOURS` | integer | 168 | Maximum cooldown (7 days). |
| `ALPHA_INVITE_DECAY_MAX_DECLINES` | integer | 5 | Max declines before exclusion. |
| `ALPHA_INVITE_DECAY_RESET_DAYS` | integer | 30 | Days to reset decline count. |

---

## Key Changes Summary

### Before vs After Thresholds

| Parameter | Before | After | Impact |
|-----------|--------|-------|--------|
| MIN_REPLIES | 3 | 1 | 66% easier to qualify |
| MIN_LIKES | 5 | 2 | 60% easier to qualify |
| MIN_TOTAL_INTERACTIONS | 10 | 5 | 50% easier to qualify |
| MIN_ENGAGEMENT_SCORE | 40 (hardcoded) | 20 (Tier 3) | Uses tier-specific thresholds |
| BASE_INVITE_CHANCE | 0.5% (fixed) | 10% Tier 3, 2% Tier 2 | Uses tier-specific probabilities |
| Trading included | No | Yes | Traders can qualify |

### New Features

1. **Tier-Based Invite Probability**: Tier 3 has 10% chance, Tier 2 has 2%, Tier 1 has 0.5%
2. **Trading Activity**: Trades and P&L contribute to engagement score
3. **Fast-Track**: High-value traders can skip Tier 3 and join Tier 2 directly
4. **Per-NPC Customization**: NPCs can have custom thresholds via `tierOverrides`
5. **Invite Decay**: Users who decline get increasing cooldowns
6. **Grandfathering**: Existing members protected when thresholds change

---

## Implementation Status (Phase 2 Complete)

**Implemented on 2026-01-21:**

| Priority | Item | Status | File(s) |
|----------|------|--------|---------|
| 1 | Admin API - Config Endpoint | ✅ Complete | `apps/web/src/app/api/admin/alpha-groups/config/route.ts` |
| 2 | Admin API - Stats Endpoint | ✅ Complete | `apps/web/src/app/api/admin/alpha-groups/stats/route.ts` |
| 3 | Admin Dashboard Page | ✅ Complete | `apps/web/src/app/admin/alpha-groups/page.tsx` |
| 4 | RBAC Permissions | ✅ Complete | `packages/db/src/schema/admin.ts` |
| 5 | Per-NPC Customization (Trading) | ✅ Complete | `ainsem.ts`, `airthur-hayes.ts`, `michael-sailor.ts` |
| 6 | Per-NPC Customization (Social) | ✅ Complete | `joerogain.ts`, `logain-paul.ts`, `lex-fridmain.ts` |
| 7 | Schema Type Exports | ✅ Complete | `packages/db/src/schema/messaging.ts` |
| 8 | Detailed Analytics Method | ✅ Complete | `AlphaGroupInviteService.getDetailedAnalytics()` |

### Admin Permissions Added

- `view_alpha_groups` - View alpha group statistics and configuration
- `manage_alpha_groups` - Preview config changes (actual changes require env vars)

### NPCs with Custom Tier Overrides

**Trading-Focused (Higher thresholds, trading-weighted engagement):**
- `ainsem` - 20% harder, 70% trading weight
- `airthur-hayes` - 30% harder, 75% trading weight  
- `michael-sailor` - 10% harder, 60% trading weight

**Social-Focused (Easier thresholds, social-weighted engagement):**
- `joerogain` - 20% easier, 90% social weight
- `logain-paul` - 15% easier, 85% social weight
- `lex-fridmain` - Standard, 80% social weight

---

## Remaining Tasks (Phase 3 - Optional)

1. **Prometheus Metrics** - Add native observability (currently using structured logging)
2. **A/B Testing Framework** - Test different threshold configurations
3. **More NPC Customization** - Add `tierOverrides` to additional actor data files
4. **Engagement Analytics** - Track which NPCs are most effective at inviting
