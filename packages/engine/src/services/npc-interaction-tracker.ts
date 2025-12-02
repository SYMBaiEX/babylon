/**
 * NPC Interaction Tracker
 *
 * Tracks all user interactions with NPCs:
 * - Replies to NPC posts
 * - Likes on NPC posts
 * - Shares/retweets of NPC posts
 *
 * Calculates engagement scores for group invite eligibility
 */

import {
  and,
  count,
  db,
  eq,
  gte,
  inArray,
  lte,
  posts,
  reactions,
  shares,
  userInteractions,
  users,
} from '@babylon/db';
import { logger } from '@babylon/shared';

export interface NPCInteractionScore {
  userId: string;
  npcId: string;
  replyCount: number;
  likeCount: number;
  shareCount: number;
  totalInteractions: number;
  avgQualityScore: number;
  engagementScore: number; // 0-100 score
  isEligibleForInvite: boolean;
  reasons: string[];
}

export interface InteractionWindow {
  startDate: Date;
  endDate: Date;
}

export class NPCInteractionTracker {
  // Thresholds for healthy engagement
  private static readonly MIN_REPLIES = 3;
  private static readonly MIN_LIKES = 5;
  private static readonly MIN_TOTAL_INTERACTIONS = 10;
  private static readonly MAX_INTERACTIONS_PER_DAY = 50; // Prevent spam

  // Weights for engagement score
  private static readonly REPLY_WEIGHT = 3.0; // Replies are most valuable
  private static readonly LIKE_WEIGHT = 1.0;
  private static readonly SHARE_WEIGHT = 2.0;

  /**
   * Track a like interaction
   */
  static async trackLike(userId: string, postId: string): Promise<void> {
    // Get post author (should be an NPC)
    const [post] = await db
      .select({ authorId: posts.authorId })
      .from(posts)
      .where(eq(posts.id, postId))
      .limit(1);

    if (!post) {
      return;
    }

    // Check if author is an NPC
    const [author] = await db
      .select({ isActor: users.isActor })
      .from(users)
      .where(eq(users.id, post.authorId))
      .limit(1);

    if (!author?.isActor) {
      return; // Not an NPC post
    }

    // We don't need to store individual likes in UserInteraction
    // They're already in the Reaction table
    // This method is just for validation

    logger.debug(
      `User ${userId} liked NPC ${post.authorId}'s post`,
      undefined,
      'NPCInteractionTracker'
    );
  }

  /**
   * Track a share/retweet interaction
   */
  static async trackShare(userId: string, postId: string): Promise<void> {
    // Get post author (should be an NPC)
    const [post] = await db
      .select({ authorId: posts.authorId })
      .from(posts)
      .where(eq(posts.id, postId))
      .limit(1);

    if (!post) {
      return;
    }

    // Check if author is an NPC
    const [author] = await db
      .select({ isActor: users.isActor })
      .from(users)
      .where(eq(users.id, post.authorId))
      .limit(1);

    if (!author?.isActor) {
      return; // Not an NPC post
    }

    // We don't need to store individual shares in UserInteraction
    // They're already in the Share table

    logger.debug(
      `User ${userId} shared NPC ${post.authorId}'s post`,
      undefined,
      'NPCInteractionTracker'
    );
  }

  /**
   * Calculate engagement score for a user with an NPC
   */
  static async calculateEngagementScore(
    userId: string,
    npcId: string,
    window?: InteractionWindow
  ): Promise<NPCInteractionScore> {
    const endDate = window?.endDate || new Date();
    const startDate =
      window?.startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30 days

    // Get all NPC posts in the time window (up to current time)
    const now = new Date();
    const effectiveEndDate = endDate > now ? now : endDate;
    const npcPosts = await db
      .select({ id: posts.id })
      .from(posts)
      .where(
        and(
          eq(posts.authorId, npcId),
          gte(posts.timestamp, startDate),
          lte(posts.timestamp, effectiveEndDate)
        )
      );

    const npcPostIds = npcPosts.map((p) => p.id);

    // Count replies (from UserInteraction table)
    const replyInteractions = await db
      .select({ qualityScore: userInteractions.qualityScore })
      .from(userInteractions)
      .where(
        and(
          eq(userInteractions.userId, userId),
          eq(userInteractions.npcId, npcId),
          gte(userInteractions.timestamp, startDate),
          lte(userInteractions.timestamp, endDate)
        )
      );

    const replyCount = replyInteractions.length;
    const avgQualityScore =
      replyCount > 0
        ? replyInteractions.reduce((sum, i) => sum + i.qualityScore, 0) /
          replyCount
        : 0;

    // Count likes
    let likeCount = 0;
    if (npcPostIds.length > 0) {
      const [likeResult] = await db
        .select({ count: count() })
        .from(reactions)
        .where(
          and(
            eq(reactions.userId, userId),
            inArray(reactions.postId, npcPostIds),
            eq(reactions.type, 'like'),
            gte(reactions.createdAt, startDate),
            lte(reactions.createdAt, endDate)
          )
        );
      likeCount = likeResult?.count ?? 0;
    }

    // Count shares
    let shareCount = 0;
    if (npcPostIds.length > 0) {
      const [shareResult] = await db
        .select({ count: count() })
        .from(shares)
        .where(
          and(
            eq(shares.userId, userId),
            inArray(shares.postId, npcPostIds),
            gte(shares.createdAt, startDate),
            lte(shares.createdAt, endDate)
          )
        );
      shareCount = shareResult?.count ?? 0;
    }

    const totalInteractions = replyCount + likeCount + shareCount;

    // Calculate engagement score (0-100)
    const replyScore = replyCount * NPCInteractionTracker.REPLY_WEIGHT;
    const likeScore = likeCount * NPCInteractionTracker.LIKE_WEIGHT;
    const shareScore = shareCount * NPCInteractionTracker.SHARE_WEIGHT;

    const rawScore = replyScore + likeScore + shareScore;

    // Normalize to 0-100 scale (cap at reasonable max)
    const maxExpectedScore = 100; // Roughly 20 replies + 20 likes + 10 shares
    const engagementScore = Math.min(100, (rawScore / maxExpectedScore) * 100);

    // Quality multiplier (if avg quality is high, boost score)
    const qualityMultiplier = avgQualityScore > 0.8 ? 1.2 : 1.0;
    const finalScore = Math.min(100, engagementScore * qualityMultiplier);

    // Determine eligibility
    const reasons: string[] = [];
    let isEligible = true;

    if (replyCount < NPCInteractionTracker.MIN_REPLIES) {
      isEligible = false;
      reasons.push(
        `Need ${NPCInteractionTracker.MIN_REPLIES - replyCount} more replies`
      );
    }

    if (likeCount < NPCInteractionTracker.MIN_LIKES) {
      isEligible = false;
      reasons.push(
        `Need ${NPCInteractionTracker.MIN_LIKES - likeCount} more likes`
      );
    }

    if (totalInteractions < NPCInteractionTracker.MIN_TOTAL_INTERACTIONS) {
      isEligible = false;
      reasons.push(
        `Need ${NPCInteractionTracker.MIN_TOTAL_INTERACTIONS - totalInteractions} more total interactions`
      );
    }

    // Check for spam (too many interactions per day)
    const daysSinceStart =
      (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24);
    const interactionsPerDay = totalInteractions / daysSinceStart;

    if (interactionsPerDay > NPCInteractionTracker.MAX_INTERACTIONS_PER_DAY) {
      isEligible = false;
      reasons.push('Too many interactions per day (possible spam)');
    }

    // Quality threshold
    if (avgQualityScore < 0.7 && replyCount > 0) {
      isEligible = false;
      reasons.push('Reply quality is too low');
    }

    if (isEligible) {
      reasons.push('Eligible for group invite!');
      reasons.push(`Engagement score: ${finalScore.toFixed(0)}/100`);
    }

    return {
      userId,
      npcId,
      replyCount,
      likeCount,
      shareCount,
      totalInteractions,
      avgQualityScore,
      engagementScore: finalScore,
      isEligibleForInvite: isEligible,
      reasons,
    };
  }

  /**
   * Get top users by engagement with an NPC
   */
  static async getTopEngagedUsers(
    npcId: string,
    limit = 10,
    window?: InteractionWindow
  ): Promise<NPCInteractionScore[]> {
    // Build conditions
    const conditions = [eq(userInteractions.npcId, npcId)];
    if (window) {
      conditions.push(gte(userInteractions.timestamp, window.startDate));
      conditions.push(lte(userInteractions.timestamp, window.endDate));
    }

    // Get all users who have interacted with this NPC
    const interactions = await db
      .selectDistinct({ userId: userInteractions.userId })
      .from(userInteractions)
      .where(and(...conditions));

    const userIds = interactions.map((i) => i.userId);

    // Calculate scores for each user
    const scores = await Promise.all(
      userIds.map((userId) =>
        NPCInteractionTracker.calculateEngagementScore(userId, npcId, window)
      )
    );

    // Sort by engagement score and return top N
    return scores
      .sort((a, b) => b.engagementScore - a.engagementScore)
      .slice(0, limit);
  }

  /**
   * Get all NPCs a user has engaged with
   */
  static async getUserEngagedNPCs(
    userId: string,
    window?: InteractionWindow
  ): Promise<string[]> {
    // Build conditions
    const conditions = [eq(userInteractions.userId, userId)];
    if (window) {
      conditions.push(gte(userInteractions.timestamp, window.startDate));
      conditions.push(lte(userInteractions.timestamp, window.endDate));
    }

    const interactions = await db
      .selectDistinct({ npcId: userInteractions.npcId })
      .from(userInteractions)
      .where(and(...conditions));

    return interactions.map((i) => i.npcId);
  }
}
