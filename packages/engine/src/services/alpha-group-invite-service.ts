/**
 * Alpha Group Invite Service
 *
 * Invites users to NPC group chats based on positive interactions.
 * Runs on game ticks with small random chance for eligible users.
 *
 * Criteria:
 * - User has positive interactions with NPC (replies, likes, shares)
 * - Not too many interactions (avoid spam)
 * - Not already in a group with this NPC
 * - Small random chance each tick (0.5% for highly engaged users)
 */

import {
  and,
  count,
  db,
  desc,
  eq,
  groupChatMemberships,
  gte,
} from '@babylon/db';
import { logger } from '@babylon/shared';
import { GroupChatService } from './group-chat-service';
import { NPCInteractionTracker } from './npc-interaction-tracker';
import { StaticDataRegistry } from './static-data-registry';

export interface AlphaInviteResult {
  npcId: string;
  npcName: string;
  userId: string;
  invitedToChat: string;
  engagementScore: number;
  probability: number;
}

export class AlphaGroupInviteService {
  // Base invite probability per tick (0.5% for top engaged users)
  private static readonly BASE_INVITE_CHANCE = 0.005; // 0.5%

  // Minimum engagement score to be considered (0-100 scale)
  private static readonly MIN_ENGAGEMENT_SCORE = 40;

  // Maximum invites per tick (prevent too many at once)
  private static readonly MAX_INVITES_PER_TICK = 5;

  // User group participation limits (prevent unlimited accumulation)
  private static readonly MAX_ACTIVE_USER_GROUPS = 5; // Max groups a user can be in simultaneously
  private static readonly INVITE_COOLDOWN_HOURS = 4; // Hours after joining before next invite eligible

  /**
   * Process alpha group invites for one tick
   * Checks all NPCs and their top engaged users
   */
  static async processTickInvites(): Promise<AlphaInviteResult[]> {
    const startTime = Date.now();
    const invites: AlphaInviteResult[] = [];

    // Get all NPCs (actors) from static registry
    const npcs = StaticDataRegistry.getAllActors().map((a) => ({
      id: a.id,
      name: a.name,
    }));

    logger.info(
      `Processing alpha invites for ${npcs.length} NPCs`,
      undefined,
      'AlphaGroupInviteService'
    );

    // Process each NPC
    for (const npc of npcs) {
      if (invites.length >= AlphaGroupInviteService.MAX_INVITES_PER_TICK) {
        logger.info(
          'Reached max invites per tick',
          { count: invites.length },
          'AlphaGroupInviteService'
        );
        break;
      }

      const npcInvites = await AlphaGroupInviteService.processNPCInvites(
        npc.id,
        npc.name
      );
      invites.push(...npcInvites);
    }

    const duration = Date.now() - startTime;
    logger.info(
      `Alpha invite tick complete: ${invites.length} invites sent`,
      { duration, invites: invites.length },
      'AlphaGroupInviteService'
    );

    return invites;
  }

  /**
   * Process invites for a single NPC
   */
  private static async processNPCInvites(
    npcId: string,
    npcName: string
  ): Promise<AlphaInviteResult[]> {
    const invites: AlphaInviteResult[] = [];

    // Get top engaged users with this NPC
    const topUsers = await NPCInteractionTracker.getTopEngagedUsers(npcId, 20); // Top 20 users

    for (const userScore of topUsers) {
      // Only consider users with sufficient engagement
      if (
        userScore.engagementScore < AlphaGroupInviteService.MIN_ENGAGEMENT_SCORE
      ) {
        continue;
      }

      // Check if already invited to a group with this NPC
      const [existingMembership] = await db
        .select()
        .from(groupChatMemberships)
        .where(
          and(
            eq(groupChatMemberships.userId, userScore.userId),
            eq(groupChatMemberships.npcAdminId, npcId),
            eq(groupChatMemberships.isActive, true)
          )
        )
        .limit(1);

      if (existingMembership) {
        continue; // Already in a group
      }

      // Check if user is at their group limit
      const [activeGroupResult] = await db
        .select({ count: count() })
        .from(groupChatMemberships)
        .where(
          and(
            eq(groupChatMemberships.userId, userScore.userId),
            eq(groupChatMemberships.isActive, true)
          )
        );

      const activeGroupCount = activeGroupResult?.count ?? 0;

      if (activeGroupCount >= AlphaGroupInviteService.MAX_ACTIVE_USER_GROUPS) {
        logger.debug(
          'User at group limit, skipping invite',
          {
            userId: userScore.userId,
            activeGroups: activeGroupCount,
            maxGroups: AlphaGroupInviteService.MAX_ACTIVE_USER_GROUPS,
          },
          'AlphaGroupInviteService'
        );
        continue;
      }

      // Check if user is in invite cooldown
      const [latestMembership] = await db
        .select()
        .from(groupChatMemberships)
        .where(
          and(
            eq(groupChatMemberships.userId, userScore.userId),
            eq(groupChatMemberships.isActive, true)
          )
        )
        .orderBy(desc(groupChatMemberships.joinedAt))
        .limit(1);

      if (latestMembership) {
        const hoursSinceJoin =
          (Date.now() - latestMembership.joinedAt.getTime()) / (1000 * 60 * 60);

        if (hoursSinceJoin < AlphaGroupInviteService.INVITE_COOLDOWN_HOURS) {
          logger.debug(
            'User in invite cooldown, skipping',
            {
              userId: userScore.userId,
              hoursSinceJoin: hoursSinceJoin.toFixed(2),
              cooldownRequired: AlphaGroupInviteService.INVITE_COOLDOWN_HOURS,
            },
            'AlphaGroupInviteService'
          );
          continue;
        }
      }

      // Calculate invite probability based on engagement score
      // Higher engagement = higher chance
      const scoreFactor = userScore.engagementScore / 100; // 0-1
      const inviteProbability =
        AlphaGroupInviteService.BASE_INVITE_CHANCE * scoreFactor;

      // Roll the dice
      const roll = Math.random();

      if (roll < inviteProbability) {
        // User wins the lottery! Invite them
        const chatId = `${npcId}-alpha-chat`;
        const chatName = `${npcName}'s Alpha Group`;

        await GroupChatService.recordInvite(
          userScore.userId,
          npcId,
          chatId,
          chatName
        );

        invites.push({
          npcId,
          npcName,
          userId: userScore.userId,
          invitedToChat: chatName,
          engagementScore: userScore.engagementScore,
          probability: inviteProbability,
        });

        logger.info(
          'User invited to alpha group',
          {
            userId: userScore.userId,
            npcId,
            npcName,
            chatName,
            engagementScore: userScore.engagementScore,
            probability: inviteProbability,
            roll,
          },
          'AlphaGroupInviteService'
        );

        // Only one invite per NPC per tick
        break;
      }
    }

    return invites;
  }

  /**
   * Get invite statistics for monitoring and analysis
   */
  static async getInviteStats(): Promise<{
    totalInvites: number;
    activeGroups: number;
    invitesLast24h: number;
  }> {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [totalResult] = await db
      .select({ count: count() })
      .from(groupChatMemberships);

    const [activeResult] = await db
      .select({ count: count() })
      .from(groupChatMemberships)
      .where(eq(groupChatMemberships.isActive, true));

    const [recentResult] = await db
      .select({ count: count() })
      .from(groupChatMemberships)
      .where(gte(groupChatMemberships.joinedAt, oneDayAgo));

    return {
      totalInvites: totalResult?.count ?? 0,
      activeGroups: activeResult?.count ?? 0,
      invitesLast24h: recentResult?.count ?? 0,
    };
  }
}
