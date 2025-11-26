/**
 * ERC-8004 Reputation Sync Service
 * 
 * Syncs reputation scores and ban status to ERC-8004 via Agent0
 */

import { db, eq, users, agentPerformanceMetrics } from '@/db';
import { logger } from '@/lib/logger';
import { generateSnowflakeId } from '@/lib/snowflake';

interface ReputationSyncData {
  reputationScore: number;
  isBanned: boolean;
  isScammer: boolean;
  isCSAM: boolean;
}

/**
 * Sync SYSTEM-LEVEL reputation to local metrics
 * 
 * This syncs system-calculated reputation (bans, flags, activity scores) to local database.
 * This is different from USER-SUBMITTED feedback, which is handled by:
 * - submitFeedbackToAgent0() in agent0-reputation-sync.ts - Submits user ratings to Agent0
 * - Agent0FeedbackService.submitFeedback() - Full Agent0 SDK integration with signatures
 * 
 * This function is called when:
 * - User is banned/unbanned
 * - User is flagged as scammer/CSAM
 * - Reputation score is recalculated
 * 
 * It updates local AgentPerformanceMetrics but does NOT submit feedback to Agent0 network.
 * User feedback submission is handled separately via the feedback endpoints.
 */
export async function syncReputationToERC8004(
  userId: string,
  data: ReputationSyncData
): Promise<void> {
  const [user] = await db
    .select({
      id: users.id,
      agent0TokenId: users.agent0TokenId,
      username: users.username,
      displayName: users.displayName,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user || !user.agent0TokenId) {
    logger.debug('User has no Agent0 token ID, skipping ERC-8004 sync', { userId }, 'ERC8004Sync');
    return;
  }

  // Calculate reputation score based on status
  let reputationScore = data.reputationScore;

  // Banned users get 0
  if (data.isBanned) {
    reputationScore = 0;
  }
  // Scammers/CSAM get very low score (but not 0 to distinguish from banned)
  else if (data.isScammer || data.isCSAM) {
    reputationScore = 5;
  }

  // Convert reputation score (0-100) to Agent0 feedback score (0-100)
  // Agent0 uses 0-100 scale, same as our reputation score
  const agent0Score = Math.round(Math.max(0, Math.min(100, reputationScore)));
  
  logger.info('Syncing system reputation to local metrics', {
    userId,
    agent0TokenId: user.agent0TokenId,
    reputationScore,
    agent0Score,
    isBanned: data.isBanned,
    isScammer: data.isScammer,
    isCSAM: data.isCSAM,
  }, 'ERC8004Sync');

  // Update local AgentPerformanceMetrics with system-calculated reputation
  // Note: This does NOT submit feedback to Agent0 network (that's handled separately)
  
  // Check if metrics exist
  const [existingMetrics] = await db
    .select()
    .from(agentPerformanceMetrics)
    .where(eq(agentPerformanceMetrics.userId, userId))
    .limit(1);
  
  if (existingMetrics) {
    await db
      .update(agentPerformanceMetrics)
      .set({
        reputationScore,
        updatedAt: new Date(),
      })
      .where(eq(agentPerformanceMetrics.userId, userId));
  } else {
    await db.insert(agentPerformanceMetrics).values({
      id: await generateSnowflakeId(),
      userId,
      reputationScore,
      updatedAt: new Date(),
    });
  }

  logger.info('✅ Reputation synced to ERC-8004', {
    userId,
    agent0TokenId: user.agent0TokenId,
    reputationScore,
  }, 'ERC8004Sync');
}

/**
 * Sync all user reputations to ERC-8004
 * Useful for batch operations or migrations
 */
export async function syncAllReputationsToERC8004(): Promise<void> {
  const userList = await db
    .select({
      id: users.id,
      agent0TokenId: users.agent0TokenId,
      isBanned: users.isBanned,
      isScammer: users.isScammer,
      isCSAM: users.isCSAM,
    })
    .from(users)
    .where(eq(users.isBanned, false))
    .limit(100); // Process in batches

  logger.info(`Syncing ${userList.length} user reputations to ERC-8004`, undefined, 'ERC8004Sync');

  for (const user of userList) {
    if (!user.agent0TokenId) continue;
    
    try {
      // Get the user's performance metrics for reputation score
      const [metrics] = await db
        .select()
        .from(agentPerformanceMetrics)
        .where(eq(agentPerformanceMetrics.userId, user.id))
        .limit(1);
      
      await syncReputationToERC8004(user.id, {
        reputationScore: metrics?.reputationScore ?? 50,
        isBanned: user.isBanned,
        isScammer: user.isScammer,
        isCSAM: user.isCSAM,
      });
    } catch (error) {
      logger.error('Failed to sync user reputation', {
        userId: user.id,
        agent0TokenId: user.agent0TokenId,
        error,
      }, 'ERC8004Sync');
      // Continue with next user
    }
  }
}
