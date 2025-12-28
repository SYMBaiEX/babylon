/**
 * Tiered Group System Configuration
 *
 * Extends GROUP_CONFIG from @babylon/shared with tier-specific settings.
 * NPC groups can have 3 tiers with different capacities and content levels:
 * - Tier 1 (Inner Circle): Exclusive, full alpha
 * - Tier 2 (Community): Medium engagement, partial alpha
 * - Tier 3 (Followers): Low barrier, public content
 */

import { GROUP_CONFIG } from '@babylon/shared';

export type TierLevel = 1 | 2 | 3;
export type AlphaLevel = 'full' | 'partial' | 'public';

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
