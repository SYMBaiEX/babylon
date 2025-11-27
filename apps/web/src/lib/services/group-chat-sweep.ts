/**
 * Group Chat Sweep Service
 *
 * Manages removal of players from group chats for:
 * - Inactivity (not posting for 72+ hours)
 * - Over-posting (more than 10 messages per day)
 * - Low quality (average quality < 0.5)
 * - Spam behavior
 *
 * Sweeps run periodically (daily) to maintain chat quality
 */

import { and, chats, db, desc, eq, groupChatMemberships, messages } from '@/db';

export interface SweepDecision {
  kickChance: number;
  reason?: string;
  stats: {
    hoursSinceLastMessage: number;
    messagesLast24h: number;
    averageQuality: number;
    totalMessages: number;
  };
}

export class GroupChatSweep {
  // Base probability of being kicked per tick for ideal users
  // At 1440 ticks/day, 0.00007 = ~10 day average retention
  private static readonly BASE_KICK_PROBABILITY = 0.00007; // ~10 day retention

  // Inactivity thresholds (in ticks, not hours)
  // 1 tick = 60 seconds, 1440 ticks = 1 day
  private static readonly INACTIVITY_GRACE_PERIOD_TICKS = 1440; // 1 day
  private static readonly INACTIVITY_MAX_TICKS = 7200; // 5 days

  // Activity thresholds (messages per day)
  private static readonly ACTIVITY_SWEET_SPOT_MIN = 1; // At least 1 message per day
  private static readonly ACTIVITY_SWEET_SPOT_MAX = 3; // Up to 3 messages per day is ideal
  private static readonly ACTIVITY_HARD_CAP = 10; // More than 10/day = spamming

  /**
   * Calculate the probability that a user should be removed from a group chat.
   */
  static async calculateKickChance(
    userId: string,
    chatId: string
  ): Promise<SweepDecision> {
    const [membership] = await db
      .select()
      .from(groupChatMemberships)
      .where(
        and(
          eq(groupChatMemberships.userId, userId),
          eq(groupChatMemberships.chatId, chatId)
        )
      )
      .limit(1);

    const baseStats = {
      hoursSinceLastMessage: 0,
      messagesLast24h: 0,
      averageQuality: 0,
      totalMessages: 0,
    };

    if (!membership || !membership.isActive) {
      return {
        kickChance: 0,
        reason: 'Not an active member',
        stats: baseStats,
      };
    }

    // Get messages from this user in this chat
    const allMessages = await db
      .select()
      .from(messages)
      .where(and(eq(messages.chatId, chatId), eq(messages.senderId, userId)))
      .orderBy(desc(messages.createdAt));

    const totalMessages = allMessages.length;
    const ticksSinceJoin =
      (Date.now() - membership.joinedAt.getTime()) / (1000 * 60); // Convert to ticks (60 sec each)

    // If no messages yet, give them a grace period
    if (totalMessages === 0) {
      if (ticksSinceJoin > GroupChatSweep.INACTIVITY_GRACE_PERIOD_TICKS) {
        return {
          kickChance: GroupChatSweep.BASE_KICK_PROBABILITY * 100, // 100× multiplier for never posted
          reason: `Never posted after joining (${Math.floor(ticksSinceJoin / 60)} hours ago)`,
          stats: { ...baseStats, hoursSinceLastMessage: ticksSinceJoin / 60 },
        };
      }
      // Safe for now if they just joined
      return {
        kickChance: 0,
        stats: { ...baseStats, hoursSinceLastMessage: ticksSinceJoin / 60 },
      };
    }

    // --- Calculate inactivity multiplier ---
    let inactivityMultiplier = 1;
    let reason = '';
    if (allMessages.length === 0) {
      return {
        kickChance: 0,
        reason: 'No messages found',
        stats: {
          hoursSinceLastMessage: 0,
          messagesLast24h: 0,
          averageQuality: 0,
          totalMessages: 0,
        },
      };
    }
    const lastMessage = allMessages[0];
    if (!lastMessage) {
      return {
        kickChance: 0,
        reason: 'No messages found',
        stats: {
          hoursSinceLastMessage: 0,
          messagesLast24h: 0,
          averageQuality: 0,
          totalMessages: 0,
        },
      };
    }
    const ticksSinceLastMessage =
      (Date.now() - lastMessage!.createdAt.getTime()) / (1000 * 60); // Convert to ticks

    if (ticksSinceLastMessage > GroupChatSweep.INACTIVITY_GRACE_PERIOD_TICKS) {
      const excessTicks =
        ticksSinceLastMessage - GroupChatSweep.INACTIVITY_GRACE_PERIOD_TICKS;
      const range =
        GroupChatSweep.INACTIVITY_MAX_TICKS -
        GroupChatSweep.INACTIVITY_GRACE_PERIOD_TICKS;
      // Scale from 1× to 10× as inactivity increases
      inactivityMultiplier = 1 + Math.min(excessTicks / range, 1) * 9;
      reason = `Inactive for ${Math.floor(ticksSinceLastMessage / 60)} hours`;
    }

    // --- Calculate over-activity multiplier ---
    let overactivityMultiplier = 1;
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const messagesLast24h = allMessages.filter(
      (m) => m.createdAt >= oneDayAgo
    ).length;

    if (messagesLast24h > GroupChatSweep.ACTIVITY_HARD_CAP) {
      // Spam: 20× multiplier
      overactivityMultiplier = 20;
      reason = `Spamming: ${messagesLast24h} messages in 24h`;
    } else if (messagesLast24h > GroupChatSweep.ACTIVITY_SWEET_SPOT_MAX) {
      // Over-active but not spam: 2-5× multiplier
      const excess = messagesLast24h - GroupChatSweep.ACTIVITY_SWEET_SPOT_MAX;
      const range =
        GroupChatSweep.ACTIVITY_HARD_CAP -
        GroupChatSweep.ACTIVITY_SWEET_SPOT_MAX;
      overactivityMultiplier = 2 + (excess / range) * 3; // Scale 2× to 5×
      reason = `Over-active: ${messagesLast24h} messages in 24h`;
    } else if (messagesLast24h < GroupChatSweep.ACTIVITY_SWEET_SPOT_MIN) {
      // Under-active: 3× multiplier
      overactivityMultiplier = 3;
      reason = `Low participation: ${messagesLast24h} messages in 24h`;
    }

    // --- Combine multipliers ---
    const finalMultiplier = Math.max(
      inactivityMultiplier,
      overactivityMultiplier
    );
    const kickChance = Math.min(
      1,
      GroupChatSweep.BASE_KICK_PROBABILITY * finalMultiplier
    );

    return {
      kickChance,
      reason:
        kickChance > GroupChatSweep.BASE_KICK_PROBABILITY ? reason : undefined,
      stats: {
        hoursSinceLastMessage: ticksSinceLastMessage / 60, // Convert back to hours for display
        messagesLast24h,
        averageQuality: membership.qualityScore,
        totalMessages,
      },
    };
  }

  /**
   * Remove a user from a group chat
   */
  static async removeFromChat(
    userId: string,
    chatId: string,
    reason: string
  ): Promise<void> {
    await db
      .update(groupChatMemberships)
      .set({
        isActive: false,
        sweepReason: reason,
        removedAt: new Date(),
      })
      .where(
        and(
          eq(groupChatMemberships.userId, userId),
          eq(groupChatMemberships.chatId, chatId),
          eq(groupChatMemberships.isActive, true)
        )
      );
  }

  /**
   * Run sweep on all members of a chat
   */
  static async sweepChat(chatId: string): Promise<{
    checked: number;
    removed: number;
    reasons: Record<string, number>;
  }> {
    const memberships = await db
      .select()
      .from(groupChatMemberships)
      .where(
        and(
          eq(groupChatMemberships.chatId, chatId),
          eq(groupChatMemberships.isActive, true)
        )
      );

    let removed = 0;
    const reasons: Record<string, number> = {};

    for (const membership of memberships) {
      const decision = await GroupChatSweep.calculateKickChance(
        membership.userId,
        chatId
      );

      if (Math.random() < decision.kickChance && decision.reason) {
        await GroupChatSweep.removeFromChat(
          membership.userId,
          chatId,
          decision.reason
        );
        removed++;

        // Track reasons
        const genericReason = decision.reason.split(':')[0] || 'Unknown';
        reasons[genericReason] = (reasons[genericReason] || 0) + 1;
      }
    }

    return {
      checked: memberships.length,
      removed,
      reasons,
    };
  }

  /**
   * Run sweep on all group chats
   */
  static async sweepAllChats(): Promise<{
    chatsChecked: number;
    totalRemoved: number;
    reasonsSummary: Record<string, number>;
  }> {
    const groupChats = await db
      .select({ id: chats.id })
      .from(chats)
      .where(eq(chats.isGroup, true));

    let totalRemoved = 0;
    const reasonsSummary: Record<string, number> = {};

    for (const chat of groupChats) {
      const result = await GroupChatSweep.sweepChat(chat.id);
      totalRemoved += result.removed;

      // Merge reasons
      for (const [reason, count] of Object.entries(result.reasons)) {
        reasonsSummary[reason] = (reasonsSummary[reason] || 0) + count;
      }
    }

    return {
      chatsChecked: groupChats.length,
      totalRemoved,
      reasonsSummary,
    };
  }

  /**
   * Update user's quality score in chat
   */
  static async updateQualityScore(
    userId: string,
    chatId: string,
    newMessageQuality: number
  ): Promise<void> {
    const [membership] = await db
      .select()
      .from(groupChatMemberships)
      .where(
        and(
          eq(groupChatMemberships.userId, userId),
          eq(groupChatMemberships.chatId, chatId)
        )
      )
      .limit(1);

    if (!membership) return;

    // Calculate new average quality
    const totalMessages = membership.messageCount + 1;
    const newAvgQuality =
      (membership.qualityScore * membership.messageCount + newMessageQuality) /
      totalMessages;

    await db
      .update(groupChatMemberships)
      .set({
        messageCount: totalMessages,
        qualityScore: newAvgQuality,
        lastMessageAt: new Date(),
      })
      .where(
        and(
          eq(groupChatMemberships.userId, userId),
          eq(groupChatMemberships.chatId, chatId)
        )
      );
  }
}
