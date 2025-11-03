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



export interface SweepDecision {
  shouldRemove: boolean;
  reason?: string;
  stats: {
    hoursSinceLastMessage: number;
    messagesLast24h: number;
    averageQuality: number;
    totalMessages: number;
  };
}

export class GroupChatSweep {
  // Inactivity thresholds
  private static readonly MAX_INACTIVE_HOURS = 72; // 72 hours without posting

  // Over-posting thresholds
  private static readonly MAX_MESSAGES_PER_DAY = 10;

  // Quality thresholds
  private static readonly MIN_QUALITY_SCORE = 0.5;
  private static readonly MIN_MESSAGES_FOR_QUALITY_CHECK = 5;

  /**
   * Check if a user should be removed from a group chat
   */
  static async checkForRemoval(
    userId: string,
    chatId: string
  ): Promise<SweepDecision> {
    const membership = await prisma.groupChatMembership.findUnique({
      where: {
        userId_chatId: {
          userId,
          chatId,
        },
      },
    });

    if (!membership || !membership.isActive) {
      return {
        shouldRemove: false,
        reason: 'Not a member',
        stats: {
          hoursSinceLastMessage: 0,
          messagesLast24h: 0,
          averageQuality: 0,
          totalMessages: 0,
        },
      };
    }

    // Get messages from this user in this chat
    const allMessages = await prisma.message.findMany({
      where: {
        chatId,
        senderId: userId,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    const totalMessages = allMessages.length;

    // If no messages yet, give them grace period (24 hours)
    if (totalMessages === 0) {
      const hoursSinceJoin =
        (Date.now() - membership.joinedAt.getTime()) / (1000 * 60 * 60);

      if (hoursSinceJoin > 24) {
        return {
          shouldRemove: true,
          reason: 'Never posted after joining (24+ hours)',
          stats: {
            hoursSinceLastMessage: hoursSinceJoin,
            messagesLast24h: 0,
            averageQuality: 0,
            totalMessages: 0,
          },
        };
      }

      return {
        shouldRemove: false,
        stats: {
          hoursSinceLastMessage: hoursSinceJoin,
          messagesLast24h: 0,
          averageQuality: 0,
          totalMessages: 0,
        },
      };
    }

    // Check inactivity
    const lastMessage = allMessages[0]!;
    const hoursSinceLastMessage =
      (Date.now() - lastMessage.createdAt.getTime()) / (1000 * 60 * 60);

    if (hoursSinceLastMessage > this.MAX_INACTIVE_HOURS) {
      return {
        shouldRemove: true,
        reason: `Inactive for ${Math.floor(hoursSinceLastMessage)} hours`,
        stats: {
          hoursSinceLastMessage,
          messagesLast24h: 0,
          averageQuality: membership.qualityScore,
          totalMessages,
        },
      };
    }

    // Check over-posting
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const messagesLast24h = allMessages.filter(
      (m) => m.createdAt >= oneDayAgo
    ).length;

    if (messagesLast24h > this.MAX_MESSAGES_PER_DAY) {
      return {
        shouldRemove: true,
        reason: `Over-posting: ${messagesLast24h} messages in 24h (max ${this.MAX_MESSAGES_PER_DAY})`,
        stats: {
          hoursSinceLastMessage,
          messagesLast24h,
          averageQuality: membership.qualityScore,
          totalMessages,
        },
      };
    }

    // Check quality (only if enough messages)
    if (
      totalMessages >= this.MIN_MESSAGES_FOR_QUALITY_CHECK &&
      membership.qualityScore < this.MIN_QUALITY_SCORE
    ) {
      return {
        shouldRemove: true,
        reason: `Low quality: ${(membership.qualityScore * 100).toFixed(0)}% (min ${(this.MIN_QUALITY_SCORE * 100).toFixed(0)}%)`,
        stats: {
          hoursSinceLastMessage,
          messagesLast24h,
          averageQuality: membership.qualityScore,
          totalMessages,
        },
      };
    }

    // All checks passed
    return {
      shouldRemove: false,
      stats: {
        hoursSinceLastMessage,
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
    await prisma.groupChatMembership.updateMany({
      where: {
        userId,
        chatId,
        isActive: true,
      },
      data: {
        isActive: false,
        sweepReason: reason,
        removedAt: new Date(),
      },
    });
  }

  /**
   * Run sweep on all members of a chat
   */
  static async sweepChat(chatId: string): Promise<{
    checked: number;
    removed: number;
    reasons: Record<string, number>;
  }> {
    const memberships = await prisma.groupChatMembership.findMany({
      where: {
        chatId,
        isActive: true,
      },
    });

    let removed = 0;
    const reasons: Record<string, number> = {};

    for (const membership of memberships) {
      const decision = await this.checkForRemoval(membership.userId, chatId);

      if (decision.shouldRemove && decision.reason) {
        await this.removeFromChat(membership.userId, chatId, decision.reason);
        removed++;

        // Track reasons
        reasons[decision.reason] = (reasons[decision.reason] || 0) + 1;
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
    const chats = await prisma.chat.findMany({
      where: {
        isGroup: true,
      },
      select: {
        id: true,
      },
    });

    let totalRemoved = 0;
    const reasonsSummary: Record<string, number> = {};

    for (const chat of chats) {
      const result = await this.sweepChat(chat.id);
      totalRemoved += result.removed;

      // Merge reasons
      for (const [reason, count] of Object.entries(result.reasons)) {
        reasonsSummary[reason] = (reasonsSummary[reason] || 0) + count;
      }
    }

    return {
      chatsChecked: chats.length,
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
    const membership = await prisma.groupChatMembership.findUnique({
      where: {
        userId_chatId: {
          userId,
          chatId,
        },
      },
    });

    if (!membership) return;

    // Calculate new average quality
    const totalMessages = membership.messageCount + 1;
    const newAvgQuality =
      (membership.qualityScore * membership.messageCount + newMessageQuality) /
      totalMessages;

    await prisma.groupChatMembership.update({
      where: {
        userId_chatId: {
          userId,
          chatId,
        },
      },
      data: {
        messageCount: totalMessages,
        qualityScore: newAvgQuality,
        lastMessageAt: new Date(),
      },
    });
  }
}


