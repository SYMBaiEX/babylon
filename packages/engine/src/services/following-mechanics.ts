/**
 * Following Mechanics Service
 *
 * Determines when NPCs follow players based on:
 * - Reply consistency (streak of hourly replies)
 * - Quality of replies (average quality score)
 * - Time invested (total number of quality replies)
 *
 * Following probability increases with:
 * - Longer streaks (5+ hourly replies in a row)
 * - Higher quality scores (0.7+)
 * - More total interactions (10+ quality replies)
 */

import {
  and,
  db,
  desc,
  eq,
  followStatuses,
  userInteractions,
} from '@babylon/db';
import { generateSnowflakeId, logger } from '@babylon/shared';
// Notification handled by API layer - engine doesn't depend on api

export interface FollowingChance {
  willFollow: boolean;
  probability: number; // 0-1
  reasons: string[];
  factors: {
    streak: number;
    quality: number;
    volume: number;
  };
}

export class FollowingMechanics {
  // Following probability factors
  private static readonly MIN_STREAK_FOR_FOLLOW = 5; // 5 consecutive hourly replies
  private static readonly MIN_QUALITY_SCORE = 0.7;
  private static readonly MIN_TOTAL_REPLIES = 10;

  // Base probabilities
  private static readonly BASE_FOLLOW_PROBABILITY = 0.05; // 5% base chance
  private static readonly MAX_FOLLOW_PROBABILITY = 0.8; // 80% max chance

  /**
   * Calculate if NPC should follow player after a reply
   */
  static async calculateFollowingChance(
    userId: string,
    npcId: string,
    currentStreak: number,
    currentQualityScore: number
  ): Promise<FollowingChance> {
    // Use currentQualityScore to calculate following probability
    // Higher quality interactions increase following chance
    const qualityMultiplier = Math.min(currentQualityScore * 1.5, 2.0); // Cap at 2x

    // Check if already following
    const existingFollow = await db
      .select()
      .from(followStatuses)
      .where(
        and(eq(followStatuses.userId, userId), eq(followStatuses.npcId, npcId))
      )
      .limit(1);

    if (existingFollow.length > 0 && existingFollow[0]?.isActive) {
      return {
        willFollow: false,
        probability: 0,
        reasons: ['Already following'],
        factors: { streak: 0, quality: 0, volume: 0 },
      };
    }

    // Get all interactions for quality and volume metrics
    const interactions = await db
      .select({
        qualityScore: userInteractions.qualityScore,
      })
      .from(userInteractions)
      .where(
        and(
          eq(userInteractions.userId, userId),
          eq(userInteractions.npcId, npcId)
        )
      );

    const totalReplies = interactions.length;
    const averageQuality =
      interactions.reduce((sum, i) => sum + i.qualityScore, 0) /
      Math.max(interactions.length, 1);

    // Calculate factor scores (0-1)
    const streakFactor = Math.min(
      currentStreak / FollowingMechanics.MIN_STREAK_FOR_FOLLOW,
      1
    );
    const qualityFactor = Math.min(
      averageQuality / FollowingMechanics.MIN_QUALITY_SCORE,
      1
    );
    const volumeFactor = Math.min(
      totalReplies / FollowingMechanics.MIN_TOTAL_REPLIES,
      1
    );

    // Calculate weighted probability
    // Streak is most important (50%), quality (30%), volume (20%)
    // Apply qualityMultiplier to boost probability for high-quality interactions
    const baseProbability =
      FollowingMechanics.BASE_FOLLOW_PROBABILITY +
      (FollowingMechanics.MAX_FOLLOW_PROBABILITY -
        FollowingMechanics.BASE_FOLLOW_PROBABILITY) *
        (streakFactor * 0.5 + qualityFactor * 0.3 + volumeFactor * 0.2);

    const probability = Math.min(
      baseProbability * qualityMultiplier,
      FollowingMechanics.MAX_FOLLOW_PROBABILITY
    );

    // Reasons for following (or not)
    const reasons: string[] = [];

    if (currentStreak >= FollowingMechanics.MIN_STREAK_FOR_FOLLOW) {
      reasons.push(`Consistent streak: ${currentStreak} hourly replies`);
    } else {
      reasons.push(
        `Need ${FollowingMechanics.MIN_STREAK_FOR_FOLLOW - currentStreak} more consecutive hourly replies`
      );
    }

    if (averageQuality >= FollowingMechanics.MIN_QUALITY_SCORE) {
      reasons.push(`High quality: ${(averageQuality * 100).toFixed(0)}% avg`);
    } else {
      reasons.push(
        `Improve quality to ${(FollowingMechanics.MIN_QUALITY_SCORE * 100).toFixed(0)}%+ for better chances`
      );
    }

    if (totalReplies >= FollowingMechanics.MIN_TOTAL_REPLIES) {
      reasons.push(`Engaged: ${totalReplies} quality replies`);
    } else {
      reasons.push(
        `Post ${FollowingMechanics.MIN_TOTAL_REPLIES - totalReplies} more quality replies`
      );
    }

    // Roll the dice
    const willFollow = Math.random() < probability;

    return {
      willFollow,
      probability,
      reasons,
      factors: {
        streak: streakFactor,
        quality: qualityFactor,
        volume: volumeFactor,
      },
    };
  }

  /**
   * Record an NPC following a player
   */
  static async recordFollow(
    userId: string,
    npcId: string,
    reason: string
  ): Promise<void> {
    // Check if exists
    const existing = await db
      .select({ id: followStatuses.id })
      .from(followStatuses)
      .where(
        and(eq(followStatuses.userId, userId), eq(followStatuses.npcId, npcId))
      )
      .limit(1);

    if (existing.length > 0) {
      // Update existing
      await db
        .update(followStatuses)
        .set({
          isActive: true,
          followedAt: new Date(),
          unfollowedAt: null,
          followReason: reason,
        })
        .where(
          and(
            eq(followStatuses.userId, userId),
            eq(followStatuses.npcId, npcId)
          )
        );
    } else {
      // Create new
      await db.insert(followStatuses).values({
        id: await generateSnowflakeId(),
        userId,
        npcId,
        followReason: reason,
      });
    }

    // Mark the interaction that triggered the follow
    await db
      .update(userInteractions)
      .set({ wasFollowed: true })
      .where(
        and(
          eq(userInteractions.userId, userId),
          eq(userInteractions.npcId, npcId)
        )
      );

    // Create notification for the user (NPCs follow users, not the other way around)
    // For NPC follows, use the NPC's ID as actorId since they're not real users
    // Notification handled by API layer - engine doesn't manage notifications
    try {
      const { notifyFollow } = await import('@babylon/api');
      await notifyFollow(userId, npcId);
    } catch (error) {
      // Notification is optional - engine can work without it
      logger.debug(
        'Follow notification skipped (API layer handles notifications)',
        { userId, npcId, error },
        'FollowingMechanics'
      );
    }
  }

  /**
   * Check if an NPC is following a player
   */
  static async isFollowing(userId: string, npcId: string): Promise<boolean> {
    const follow = await db
      .select({ isActive: followStatuses.isActive })
      .from(followStatuses)
      .where(
        and(eq(followStatuses.userId, userId), eq(followStatuses.npcId, npcId))
      )
      .limit(1);

    return follow[0]?.isActive ?? false;
  }

  /**
   * Get all NPCs following a player
   */
  static async getFollowers(userId: string) {
    const follows = await db
      .select()
      .from(followStatuses)
      .where(
        and(
          eq(followStatuses.userId, userId),
          eq(followStatuses.isActive, true)
        )
      )
      .orderBy(desc(followStatuses.followedAt));

    return follows;
  }

  /**
   * Unfollow (if quality drops or streak breaks badly)
   */
  static async unfollow(
    userId: string,
    npcId: string,
    reason: string
  ): Promise<void> {
    // Log unfollow reason for analytics and monitoring
    logger.info(
      `User ${userId} unfollowed ${npcId}. Reason: ${reason}`,
      undefined,
      'FollowingMechanics'
    );

    await db
      .update(followStatuses)
      .set({
        isActive: false,
        unfollowedAt: new Date(),
      })
      .where(
        and(
          eq(followStatuses.userId, userId),
          eq(followStatuses.npcId, npcId),
          eq(followStatuses.isActive, true)
        )
      );
  }

  /**
   * Check if follow should be revoked (periodic check)
   */
  static async shouldUnfollow(userId: string, npcId: string): Promise<boolean> {
    const interactions = await db
      .select({
        qualityScore: userInteractions.qualityScore,
        timestamp: userInteractions.timestamp,
      })
      .from(userInteractions)
      .where(
        and(
          eq(userInteractions.userId, userId),
          eq(userInteractions.npcId, npcId)
        )
      )
      .orderBy(desc(userInteractions.timestamp))
      .limit(10);

    if (interactions.length === 0) return false;

    // Check for sustained low quality
    const recentQuality =
      interactions.reduce((sum, i) => sum + (i.qualityScore ?? 0), 0) /
      interactions.length;

    if (recentQuality < 0.4) {
      return true; // Quality dropped too low
    }

    // Check for long gaps (no replies for 24+ hours)
    if (interactions.length === 0) {
      return false; // No interactions found
    }
    const lastInteraction = interactions[0]?.timestamp;
    if (!lastInteraction) {
      return false; // No valid interaction timestamp
    }
    const hoursSinceLastReply =
      (Date.now() - lastInteraction.getTime()) / (1000 * 60 * 60);

    if (hoursSinceLastReply > 24) {
      return true; // Stopped engaging
    }

    return false;
  }
}
