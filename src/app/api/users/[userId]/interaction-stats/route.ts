/**
 * API Route: /api/users/[userId]/interaction-stats
 * Methods: GET (get user's interaction stats, following status, group chat membership)
 */

import { NextRequest } from 'next/server';
import { successResponse, errorResponse, optionalAuth } from '@/lib/api/auth-middleware';
import { ReplyRateLimiter } from '@/services/ReplyRateLimiter';
import { FollowingMechanics } from '@/services/FollowingMechanics';
import { GroupChatInvite } from '@/services/GroupChatInvite';
import { MessageQualityChecker } from '@/services/MessageQualityChecker';

/**
 * GET /api/users/[userId]/interaction-stats
 * Get user's interaction statistics
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const { userId } = await params;

    // Optional auth - only show detailed stats if requesting own
    const user = await optionalAuth(request);
    const isOwnProfile = user?.userId === userId;

    // Get reply stats for all NPCs
    const replyStats = await ReplyRateLimiter.getAllReplyStats(userId);

    // Get following status
    const followers = await FollowingMechanics.getFollowers(userId);

    // Get group chats
    const groupChats = await GroupChatInvite.getUserGroupChats(userId);

    // Get quality stats
    const qualityStats = await MessageQualityChecker.getUserQualityStats(userId);

    // Summary stats
    const summary = {
      totalReplies: replyStats.reduce((sum, s) => sum + s.totalReplies, 0),
      npcsRepliedTo: replyStats.length,
      followedByCount: followers.length,
      groupChatsCount: groupChats.length,
      averageQuality: qualityStats.averageScore,
      highQualityMessages: qualityStats.highQualityCount,
      lowQualityMessages: qualityStats.lowQualityCount,
    };

    // Return detailed stats if requesting own profile
    if (isOwnProfile) {
      return successResponse({
        summary,
        replyStats: replyStats.map((s) => ({
          npcId: s.npcId,
          totalReplies: s.totalReplies,
          currentStreak: s.currentStreak,
          longestStreak: s.longestStreak,
          averageQuality: s.averageQuality,
          lastReplyAt: s.lastReplyAt,
        })),
        followers: followers.map((f) => ({
          npcId: f.npcId,
          followedAt: f.followedAt,
          reason: f.followReason,
        })),
        groupChats: groupChats.map((g) => ({
          chatId: g.chatId,
          npcAdminId: g.npcAdminId,
          joinedAt: g.joinedAt,
          lastMessageAt: g.lastMessageAt,
          messageCount: g.messageCount,
          qualityScore: g.qualityScore,
        })),
        qualityStats,
        timestamp: new Date().toISOString(),
      });
    }

    // Public view - just summary
    return successResponse({
      summary,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error fetching interaction stats:', error);
    return errorResponse('Failed to fetch interaction stats');
  }
}


