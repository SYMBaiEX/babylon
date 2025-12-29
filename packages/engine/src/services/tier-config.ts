/**
 * Tiered Group System Configuration
 *
 * Extends GROUP_CONFIG from @babylon/shared with tier-specific settings.
 * NPC groups can have 3 tiers with different capacities and content levels:
 * - Tier 1 (Inner Circle): Exclusive, full alpha
 * - Tier 2 (Community): Medium engagement, partial alpha
 * - Tier 3 (Followers): Low barrier, public content
 */

import { type AlphaLevel, GROUP_CONFIG, type TierLevel } from '@babylon/shared';

// Re-export for convenience
export type { AlphaLevel, TierLevel } from '@babylon/shared';

/** Valid tier levels */
const VALID_TIERS: readonly TierLevel[] = [1, 2, 3] as const;

/** Type guard to check if a value is a valid TierLevel */
export function isValidTier(value: unknown): value is TierLevel {
  return typeof value === 'number' && VALID_TIERS.includes(value as TierLevel);
}

/** Assert and return a valid TierLevel, throws if invalid */
export function assertTierLevel(value: unknown): TierLevel {
  if (!isValidTier(value)) {
    throw new Error(`Invalid tier value: ${value}. Expected 1, 2, or 3.`);
  }
  return value;
}

export interface TierConfig {
  name: string;
  suffix: string;
  maxMembers: number;
  minEngagementScore: number;
  messageFrequency: number;
  alphaLevel: AlphaLevel;
  inviteProbability: number;
  promotionWaitDays: number;
  demotionInactiveDays: number;
}

export const TIER_CONFIG: Record<TierLevel, TierConfig> = {
  1: {
    name: 'Inner Circle',
    suffix: "'s Inner Circle",
    maxMembers: GROUP_CONFIG.MAX_GROUP_SIZE, // 12
    minEngagementScore: 80,
    messageFrequency: 0.25,
    alphaLevel: 'full',
    inviteProbability: 0.005,
    promotionWaitDays: 30,
    demotionInactiveDays: 30,
  },
  2: {
    name: 'Community',
    suffix: "'s Community",
    maxMembers: 50,
    minEngagementScore: 50,
    messageFrequency: 0.15,
    alphaLevel: 'partial',
    inviteProbability: 0.02,
    promotionWaitDays: 14,
    demotionInactiveDays: 60,
  },
  3: {
    name: 'Followers',
    suffix: "'s Followers",
    maxMembers: 500,
    minEngagementScore: 20,
    messageFrequency: 0.05,
    alphaLevel: 'public',
    inviteProbability: 0.1,
    promotionWaitDays: 0,
    demotionInactiveDays: 90,
  },
};

export const ALL_TIERS: TierLevel[] = [1, 2, 3];

/** Get configuration for a specific tier */
export const getTierConfig = (tier: TierLevel): TierConfig => TIER_CONFIG[tier];

/** Get the tier suffix for group naming */
export const getTierSuffix = (tier: TierLevel): string =>
  TIER_CONFIG[tier].suffix;

/** Get the full group name for an NPC at a tier */
export const getTierGroupName = (npcName: string, tier: TierLevel): string =>
  `${npcName}${TIER_CONFIG[tier].suffix}`;

/** Determine which tier a user qualifies for based on engagement score */
export function getTierForEngagementScore(score: number): TierLevel | null {
  if (score >= TIER_CONFIG[1].minEngagementScore) return 1;
  if (score >= TIER_CONFIG[2].minEngagementScore) return 2;
  if (score >= TIER_CONFIG[3].minEngagementScore) return 3;
  return null;
}

/** Check if user is eligible for promotion to next tier */
export function isEligibleForPromotion(
  currentTier: TierLevel,
  engagementScore: number,
  daysInCurrentTier: number
): boolean {
  if (currentTier === 1) return false;
  const targetTier = (currentTier - 1) as TierLevel;
  const targetConfig = TIER_CONFIG[targetTier];
  const currentConfig = TIER_CONFIG[currentTier];
  return (
    engagementScore >= targetConfig.minEngagementScore &&
    daysInCurrentTier >= currentConfig.promotionWaitDays
  );
}

/** Check if user should be demoted due to inactivity */
export function shouldDemote(
  currentTier: TierLevel,
  daysSinceLastActivity: number
): boolean {
  return daysSinceLastActivity >= TIER_CONFIG[currentTier].demotionInactiveDays;
}

/** Get the next lower tier (for demotion) */
export function getLowerTier(currentTier: TierLevel): TierLevel | null {
  if (currentTier === 3) return null;
  return (currentTier + 1) as TierLevel;
}

/** Get the next higher tier (for promotion) */
export function getHigherTier(currentTier: TierLevel): TierLevel | null {
  if (currentTier === 1) return null;
  return (currentTier - 1) as TierLevel;
}

/** Total capacity per NPC across all tiers */
export const getTotalNpcCapacity = (): number =>
  TIER_CONFIG[1].maxMembers +
  TIER_CONFIG[2].maxMembers +
  TIER_CONFIG[3].maxMembers;

/**
 * Tier-specific message guidance for NPC group chat content generation.
 * These prompts control the alpha/insider information level shared in each tier.
 */
export const TIER_MESSAGE_GUIDANCE: Record<TierLevel, string> = {
  1: `TIER 1 INNER CIRCLE - share FULL ALPHA:
- "Just loaded up $50k on [ticker] before the announcement"
- "Between us, [company] Q3 is $2.3B but they'll announce $2.1B"
- "Get out of [ticker] before 3pm - trust me"
- Specific positions, amounts, dates, sources
- Contradict your public statements with real strategy`,

  2: `TIER 2 COMMUNITY - share PARTIAL ALPHA (hints, not specifics):
- "Feeling bearish on tech this week"
- "Smart money is moving out of [sector]"
- Directional hints without exact amounts
- Industry insights and sentiment
- NO exact dollar amounts or dates`,

  3: `TIER 3 FOLLOWERS - PUBLIC-FACING content only:
- "Did you see what happened at [event]? Wild!"
- "Markets are crazy right now"
- Personality, banter, engagement
- NO insider info, NO trading hints`,
};

/** Get message guidance for a tier, defaults to Tier 1 for null/legacy groups */
export function getTierMessageGuidance(tier: TierLevel | null): string {
  if (tier === null || !isValidTier(tier)) {
    return TIER_MESSAGE_GUIDANCE[1]; // Legacy groups get full alpha
  }
  return TIER_MESSAGE_GUIDANCE[tier];
}
