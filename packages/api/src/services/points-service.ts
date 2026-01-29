/**
 * Points Service
 *
 * @description Centralized service for managing reputation points and rewards.
 * Tracks all point transactions and ensures no duplicate awards. Handles different
 * point types (reputation, invite, bonus) and provides leaderboard functionality.
 */
import {
  actorState,
  and,
  asc,
  count,
  db,
  desc,
  eq,
  gt,
  gte,
  isNull,
  type JsonValue,
  ne,
  pointsTransactions,
  referrals,
  sql,
  users,
} from '@babylon/db';
import { StaticDataRegistry } from '@babylon/engine';
import {
  generateSnowflakeId,
  logger,
  POINTS,
  type PointsReason,
} from '@babylon/shared';

/**
 * Maximum number of unqualified referrals that can earn signup points at any time.
 * When a referral becomes qualified (user links social account), a slot opens for
 * pending referrals to receive their deferred signup points (FIFO order).
 */
const UNQUALIFIED_REFERRAL_LIMIT = 10;

/**
 * Leaderboard category type
 *
 * @description Categories for filtering leaderboard results.
 */
type LeaderboardCategory = 'all' | 'earned' | 'referral' | 'total';

/**
 * Result of awarding points to a user
 *
 * @description Contains success status, points awarded, new total, and optional
 * error information.
 */
interface AwardPointsResult {
  success: boolean;
  pointsAwarded: number;
  newTotal: number;
  alreadyAwarded?: boolean;
  error?: string;
}

/**
 * Points Service Class
 *
 * @description Static service class for managing user points and rewards.
 * Provides methods for awarding points, checking duplicates, and retrieving
 * leaderboards.
 */
export class PointsService {
  /**
   * Award points to a user with transaction tracking
   */
  static async awardPoints(
    userId: string,
    amount: number,
    reason: PointsReason,
    metadata?: Record<string, JsonValue>
  ): Promise<AwardPointsResult> {
    // Get current user state
    const userResult = await db
      .select({
        reputationPoints: users.reputationPoints,
        invitePoints: users.invitePoints,
        earnedPoints: users.earnedPoints,
        bonusPoints: users.bonusPoints,
        pointsAwardedForProfile: users.pointsAwardedForProfile,
        pointsAwardedForFarcaster: users.pointsAwardedForFarcaster,
        pointsAwardedForFarcasterFollow: users.pointsAwardedForFarcasterFollow,
        pointsAwardedForTwitter: users.pointsAwardedForTwitter,
        pointsAwardedForTwitterFollow: users.pointsAwardedForTwitterFollow,
        pointsAwardedForDiscord: users.pointsAwardedForDiscord,
        pointsAwardedForDiscordJoin: users.pointsAwardedForDiscordJoin,
        pointsAwardedForWallet: users.pointsAwardedForWallet,
        pointsAwardedForReferralBonus: users.pointsAwardedForReferralBonus,
        pointsAwardedForShare: users.pointsAwardedForShare,
        pointsAwardedForPrivateGroup: users.pointsAwardedForPrivateGroup,
        pointsAwardedForPrivateChannel: users.pointsAwardedForPrivateChannel,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    const user = userResult[0];

    if (!user) {
      return {
        success: false,
        pointsAwarded: 0,
        newTotal: 0,
        error: 'User not found',
      };
    }

    // Check if points were already awarded for this reason
    const alreadyAwarded = PointsService.checkAlreadyAwarded(user, reason);
    if (alreadyAwarded) {
      return {
        success: true,
        pointsAwarded: 0,
        newTotal: user.reputationPoints,
        alreadyAwarded: true,
      };
    }

    const pointsBefore = user.reputationPoints;
    const pointsAfter = pointsBefore + amount;

    // Build update data
    const updateData: Partial<{
      reputationPoints: number;
      invitePoints: number;
      bonusPoints: number;
      pointsAwardedForProfile: boolean;
      pointsAwardedForFarcaster: boolean;
      pointsAwardedForFarcasterFollow: boolean;
      pointsAwardedForTwitter: boolean;
      pointsAwardedForTwitterFollow: boolean;
      pointsAwardedForDiscord: boolean;
      pointsAwardedForDiscordJoin: boolean;
      pointsAwardedForWallet: boolean;
      pointsAwardedForReferralBonus: boolean;
      pointsAwardedForShare: boolean;
      pointsAwardedForPrivateGroup: boolean;
      pointsAwardedForPrivateChannel: boolean;
    }> = {
      reputationPoints: pointsAfter,
    };

    // Set the appropriate tracking flag and update correct point type
    switch (reason) {
      case 'referral_signup':
        updateData.invitePoints = user.invitePoints + amount;
        break;
      case 'profile_completion':
        updateData.bonusPoints = user.bonusPoints + amount;
        updateData.pointsAwardedForProfile = true;
        break;
      case 'farcaster_link':
        updateData.bonusPoints = user.bonusPoints + amount;
        updateData.pointsAwardedForFarcaster = true;
        break;
      case 'farcaster_follow':
        updateData.bonusPoints = user.bonusPoints + amount;
        updateData.pointsAwardedForFarcasterFollow = true;
        break;
      case 'twitter_link':
        updateData.bonusPoints = user.bonusPoints + amount;
        updateData.pointsAwardedForTwitter = true;
        break;
      case 'twitter_follow':
        updateData.bonusPoints = user.bonusPoints + amount;
        updateData.pointsAwardedForTwitterFollow = true;
        break;
      case 'discord_link':
        updateData.bonusPoints = user.bonusPoints + amount;
        updateData.pointsAwardedForDiscord = true;
        break;
      case 'discord_join':
        updateData.bonusPoints = user.bonusPoints + amount;
        updateData.pointsAwardedForDiscordJoin = true;
        break;
      case 'wallet_connect':
        updateData.bonusPoints = user.bonusPoints + amount;
        updateData.pointsAwardedForWallet = true;
        break;
      case 'referral_bonus':
        updateData.bonusPoints = user.bonusPoints + amount;
        updateData.pointsAwardedForReferralBonus = true;
        break;
      case 'share_action':
      case 'share_to_twitter':
        updateData.bonusPoints = user.bonusPoints + amount;
        updateData.pointsAwardedForShare = true;
        break;
      case 'private_group_create':
        updateData.bonusPoints = user.bonusPoints + amount;
        updateData.pointsAwardedForPrivateGroup = true;
        break;
      case 'private_channel_create':
        updateData.bonusPoints = user.bonusPoints + amount;
        updateData.pointsAwardedForPrivateChannel = true;
        break;
      default:
        // For admin awards, purchases, etc - add to bonus
        updateData.bonusPoints = user.bonusPoints + amount;
        break;
    }

    // Execute in transaction
    await db.transaction(async (tx) => {
      await tx.update(users).set(updateData).where(eq(users.id, userId));

      await tx.insert(pointsTransactions).values({
        id: await generateSnowflakeId(),
        userId,
        amount,
        pointsBefore,
        pointsAfter,
        reason,
        metadata: metadata ? JSON.stringify(metadata) : null,
      });
    });

    logger.info(
      `Awarded ${amount} points to user ${userId} for ${reason}`,
      { userId, amount, reason, pointsBefore, pointsAfter },
      'PointsService'
    );

    return {
      success: true,
      pointsAwarded: amount,
      newTotal: pointsAfter,
    };
  }

  /**
   * Award points for profile completion (username + image + bio)
   */
  static async awardProfileCompletion(
    userId: string
  ): Promise<AwardPointsResult> {
    return PointsService.awardPoints(
      userId,
      POINTS.PROFILE_COMPLETION,
      'profile_completion'
    );
  }

  /**
   * Award points for Farcaster link
   */
  static async awardFarcasterLink(
    userId: string,
    farcasterUsername?: string
  ): Promise<AwardPointsResult> {
    return PointsService.awardPoints(
      userId,
      POINTS.FARCASTER_LINK,
      'farcaster_link',
      farcasterUsername ? { farcasterUsername } : undefined
    );
  }

  /**
   * Award points for Farcaster follow
   */
  static async awardFarcasterFollow(
    userId: string
  ): Promise<AwardPointsResult> {
    return PointsService.awardPoints(
      userId,
      POINTS.FARCASTER_FOLLOW,
      'farcaster_follow',
      { action: 'follow_playbabylon' }
    );
  }

  /**
   * Award points for Twitter follow
   */
  static async awardTwitterFollow(userId: string): Promise<AwardPointsResult> {
    return PointsService.awardPoints(
      userId,
      POINTS.TWITTER_FOLLOW,
      'twitter_follow',
      { action: 'follow_playbabylon' }
    );
  }

  static async awardDiscordLink(
    userId: string,
    discordUsername?: string
  ): Promise<AwardPointsResult> {
    return PointsService.awardPoints(
      userId,
      POINTS.DISCORD_LINK,
      'discord_link',
      discordUsername ? { discordUsername } : undefined
    );
  }

  static async awardDiscordJoin(
    userId: string,
    discordUsername?: string
  ): Promise<AwardPointsResult> {
    return PointsService.awardPoints(
      userId,
      POINTS.DISCORD_JOIN,
      'discord_join',
      discordUsername ? { discordUsername } : undefined
    );
  }

  /**
   * Award points for Twitter link
   */
  static async awardTwitterLink(
    userId: string,
    twitterUsername?: string
  ): Promise<AwardPointsResult> {
    return PointsService.awardPoints(
      userId,
      POINTS.TWITTER_LINK,
      'twitter_link',
      twitterUsername ? { twitterUsername } : undefined
    );
  }

  /**
   * Award points for wallet connection
   */
  static async awardWalletConnect(
    userId: string,
    walletAddress?: string
  ): Promise<AwardPointsResult> {
    return PointsService.awardPoints(
      userId,
      POINTS.WALLET_CONNECT,
      'wallet_connect',
      walletAddress ? { walletAddress } : undefined
    );
  }

  /**
   * Award points for share action
   */
  static async awardShareAction(
    userId: string,
    platform: string,
    contentType: string,
    contentId?: string
  ): Promise<AwardPointsResult> {
    const amount =
      platform === 'twitter' ? POINTS.SHARE_TO_TWITTER : POINTS.SHARE_ACTION;
    const reason = platform === 'twitter' ? 'share_to_twitter' : 'share_action';

    return PointsService.awardPoints(userId, amount, reason, {
      platform,
      contentType,
      ...(contentId ? { contentId } : {}),
    });
  }

  /**
   * Award points for creating a private group
   */
  static async awardPrivateGroupCreate(
    userId: string,
    groupId?: string
  ): Promise<AwardPointsResult> {
    return PointsService.awardPoints(
      userId,
      POINTS.PRIVATE_GROUP_CREATE,
      'private_group_create',
      groupId ? { groupId } : undefined
    );
  }

  /**
   * Award points for creating a private channel
   */
  static async awardPrivateChannelCreate(
    userId: string,
    channelId?: string
  ): Promise<AwardPointsResult> {
    return PointsService.awardPoints(
      userId,
      POINTS.PRIVATE_CHANNEL_CREATE,
      'private_channel_create',
      channelId ? { channelId } : undefined
    );
  }

  /**
   * Award points for referral signup
   * Enforces rolling limit of 10 unqualified referrals at any time
   * When limit is reached, referral is tracked but points are deferred until a slot opens
   * Checks IP addresses to detect self-referrals
   */
  static async awardReferralSignup(
    referrerId: string,
    referredUserId: string
  ): Promise<AwardPointsResult> {
    // Count unqualified referrals with points already awarded (toward the limit)
    // Unqualified = completed AND qualifiedAt IS NULL AND signupPointsAwarded = true
    const [unqualifiedCountResult] = await db
      .select({ count: count() })
      .from(referrals)
      .where(
        and(
          eq(referrals.referrerId, referrerId),
          eq(referrals.status, 'completed'),
          isNull(referrals.qualifiedAt),
          eq(referrals.signupPointsAwarded, true)
        )
      );

    const unqualifiedCount = unqualifiedCountResult?.count ?? 0;
    const shouldAwardPoints = unqualifiedCount < UNQUALIFIED_REFERRAL_LIMIT;

    if (!shouldAwardPoints) {
      logger.info(
        `Unqualified referral limit reached for user ${referrerId}. Points deferred.`,
        { referrerId, unqualifiedCount, limit: UNQUALIFIED_REFERRAL_LIMIT },
        'PointsService'
      );
      // Don't return error - we still track the referral, just defer points
    }

    // Check IP addresses and other identifiers for self-referral detection
    const [referrerResult, referredUserResult] = await Promise.all([
      db
        .select({
          registrationIpHash: users.registrationIpHash,
          createdAt: users.createdAt,
          walletAddress: users.walletAddress,
          privyId: users.privyId,
          farcasterFid: users.farcasterFid,
          twitterId: users.twitterId,
        })
        .from(users)
        .where(eq(users.id, referrerId))
        .limit(1),
      db
        .select({
          registrationIpHash: users.registrationIpHash,
          createdAt: users.createdAt,
          walletAddress: users.walletAddress,
          privyId: users.privyId,
          farcasterFid: users.farcasterFid,
          twitterId: users.twitterId,
        })
        .from(users)
        .where(eq(users.id, referredUserId))
        .limit(1),
    ]);

    const referrer = referrerResult[0];
    const referredUser = referredUserResult[0];

    // Check if IP addresses match (potential self-referral)
    if (referrer?.registrationIpHash && referredUser?.registrationIpHash) {
      if (referrer.registrationIpHash === referredUser.registrationIpHash) {
        const timeDiff =
          referredUser.createdAt.getTime() - referrer.createdAt.getTime();
        const fifteenMinutes = 15 * 60 * 1000;
        const twentyFourHours = 24 * 60 * 60 * 1000;

        // Check if users have different identifiers
        const hasDifferentWallet =
          referrer.walletAddress &&
          referredUser.walletAddress &&
          referrer.walletAddress !== referredUser.walletAddress;
        const hasDifferentPrivyId =
          referrer.privyId &&
          referredUser.privyId &&
          referrer.privyId !== referredUser.privyId;
        const hasDifferentFarcaster =
          referrer.farcasterFid &&
          referredUser.farcasterFid &&
          referrer.farcasterFid !== referredUser.farcasterFid;
        const hasDifferentTwitter =
          referrer.twitterId &&
          referredUser.twitterId &&
          referrer.twitterId !== referredUser.twitterId;

        const hasDifferentIdentifiers =
          hasDifferentWallet ||
          hasDifferentPrivyId ||
          hasDifferentFarcaster ||
          hasDifferentTwitter;

        // Only block if same IP AND no different identifiers AND within 15 minutes
        if (
          timeDiff >= 0 &&
          timeDiff < fifteenMinutes &&
          !hasDifferentIdentifiers
        ) {
          logger.warn(
            'Self-referral detected: same IP within 15 minutes with no different identifiers',
            {
              referrerId,
              referredUserId,
              timeDiffMs: timeDiff,
              referrerWallet: referrer.walletAddress,
              referredWallet: referredUser.walletAddress,
              referrerPrivyId: referrer.privyId,
              referredPrivyId: referredUser.privyId,
            },
            'PointsService'
          );
          return {
            success: false,
            pointsAwarded: 0,
            newTotal: 0,
            error:
              'Self-referral detected: accounts created from same IP within 15 minutes with no different identifiers',
          };
        }

        // Same IP within 24 hours = flag for review (still award but mark suspicious)
        if (
          timeDiff >= 0 &&
          timeDiff < twentyFourHours &&
          !hasDifferentIdentifiers
        ) {
          logger.warn(
            'Potential self-referral: same IP within 24 hours with no different identifiers',
            {
              referrerId,
              referredUserId,
              timeDiffMs: timeDiff,
              referrerWallet: referrer.walletAddress,
              referredWallet: referredUser.walletAddress,
            },
            'PointsService'
          );
          // Continue to award points but mark as suspicious
        } else if (hasDifferentIdentifiers) {
          logger.info(
            'Allowing referral despite same IP: users have different identifiers',
            {
              referrerId,
              referredUserId,
              timeDiffMs: timeDiff,
              hasDifferentWallet,
              hasDifferentPrivyId,
              hasDifferentFarcaster,
              hasDifferentTwitter,
            },
            'PointsService'
          );
        }
      }
    }

    // Award points only if under the unqualified limit
    let result: AwardPointsResult;

    if (shouldAwardPoints) {
      result = await this.awardPoints(
        referrerId,
        POINTS.REFERRAL_SIGNUP,
        'referral_signup',
        {
          referredUserId,
          referrerIpHash: referrer?.registrationIpHash || null,
          referredIpHash: referredUser?.registrationIpHash || null,
          sameIp:
            referrer?.registrationIpHash === referredUser?.registrationIpHash,
        }
      );
    } else {
      // Points deferred - return success but with 0 points awarded
      const userResult = await db
        .select({ reputationPoints: users.reputationPoints })
        .from(users)
        .where(eq(users.id, referrerId))
        .limit(1);

      result = {
        success: true,
        pointsAwarded: 0,
        newTotal: userResult[0]?.reputationPoints ?? 0,
      };
    }

    // Find the referral record to update
    const referralRecordResult = await db
      .select({ id: referrals.id })
      .from(referrals)
      .where(
        and(
          eq(referrals.referrerId, referrerId),
          eq(referrals.referredUserId, referredUserId)
        )
      )
      .orderBy(desc(referrals.createdAt))
      .limit(1);

    const referralRecord = referralRecordResult[0];

    if (referralRecord) {
      // Build update object
      const updateData: {
        signupPointsAwarded?: boolean;
        suspiciousReferralFlags?: JsonValue;
      } = {};

      // Mark signupPointsAwarded based on whether points were actually awarded
      updateData.signupPointsAwarded = shouldAwardPoints && result.success;

      // Check for suspicious flags if IPs match
      if (referrer?.registrationIpHash && referredUser?.registrationIpHash) {
        if (referrer.registrationIpHash === referredUser.registrationIpHash) {
          const timeDiff =
            referredUser.createdAt.getTime() - referrer.createdAt.getTime();
          const oneHour = 60 * 60 * 1000;
          const twentyFourHours = 24 * 60 * 60 * 1000;

          const isSuspicious = timeDiff >= 0 && timeDiff < twentyFourHours;
          const isBlocked = timeDiff >= 0 && timeDiff < oneHour;

          if (isSuspicious || isBlocked) {
            updateData.suspiciousReferralFlags = {
              sameIp: true,
              timeDiffMs: timeDiff,
              flaggedAt: new Date().toISOString(),
              blocked: isBlocked,
              flagged: isSuspicious && !isBlocked,
            };
          }
        }
      }

      await db
        .update(referrals)
        .set(updateData)
        .where(eq(referrals.id, referralRecord.id));
    }

    // Also increment referral count only if points were successfully awarded
    if (shouldAwardPoints && result.success) {
      await db
        .update(users)
        .set({
          referralCount: sql`${users.referralCount} + 1`,
          lastReferralIpHash: referredUser?.registrationIpHash || null,
        })
        .where(eq(users.id, referrerId));
    }

    return result;
  }

  /**
   * Award pending referral signup points when a slot opens
   * Called when a referral becomes qualified, which frees up a slot for pending referrals
   * Uses FIFO ordering based on completedAt timestamp
   */
  static async awardPendingReferralSignupPoints(
    referrerId: string
  ): Promise<AwardPointsResult | null> {
    // Check current unqualified count to see if there's a slot available
    const [unqualifiedCountResult] = await db
      .select({ count: count() })
      .from(referrals)
      .where(
        and(
          eq(referrals.referrerId, referrerId),
          eq(referrals.status, 'completed'),
          isNull(referrals.qualifiedAt),
          eq(referrals.signupPointsAwarded, true)
        )
      );

    const unqualifiedCount = unqualifiedCountResult?.count ?? 0;

    // If still at or above limit, no slot available
    if (unqualifiedCount >= UNQUALIFIED_REFERRAL_LIMIT) {
      return null;
    }

    // Find the oldest pending referral (FIFO) that hasn't received signup points yet
    const pendingReferralResult = await db
      .select({
        id: referrals.id,
        referredUserId: referrals.referredUserId,
        completedAt: referrals.completedAt,
      })
      .from(referrals)
      .where(
        and(
          eq(referrals.referrerId, referrerId),
          eq(referrals.status, 'completed'),
          eq(referrals.signupPointsAwarded, false)
        )
      )
      .orderBy(asc(referrals.completedAt))
      .limit(1);

    const pendingReferral = pendingReferralResult[0];

    if (!pendingReferral) {
      // No pending referrals waiting for points
      return null;
    }

    // Award the deferred signup points
    const result = await this.awardPoints(
      referrerId,
      POINTS.REFERRAL_SIGNUP,
      'referral_signup',
      {
        referredUserId: pendingReferral.referredUserId,
        deferredAward: true,
        originalCompletedAt: pendingReferral.completedAt?.toISOString() ?? null,
      }
    );

    if (result.success) {
      // Mark this referral as having received signup points
      await db
        .update(referrals)
        .set({ signupPointsAwarded: true })
        .where(eq(referrals.id, pendingReferral.id));

      // Increment referral count for deferred awards
      await db
        .update(users)
        .set({
          referralCount: sql`${users.referralCount} + 1`,
        })
        .where(eq(users.id, referrerId));

      logger.info(
        `Awarded deferred referral signup points to user ${referrerId}`,
        {
          referrerId,
          referredUserId: pendingReferral.referredUserId,
          referralId: pendingReferral.id,
          pointsAwarded: result.pointsAwarded,
        },
        'PointsService'
      );
    }

    return result;
  }

  /**
   * Check and qualify referral when referred user links social account
   */
  static async checkAndQualifyReferral(
    referredUserId: string
  ): Promise<AwardPointsResult | null> {
    // Get user with referrer info and social account status
    const userResult = await db
      .select({
        referredBy: users.referredBy,
        hasFarcaster: users.hasFarcaster,
        hasTwitter: users.hasTwitter,
        walletAddress: users.walletAddress,
      })
      .from(users)
      .where(eq(users.id, referredUserId))
      .limit(1);

    const user = userResult[0];

    if (!user || !user.referredBy) {
      return null;
    }

    // Check if user has at least one social account linked
    const hasSocialAccount =
      user.hasFarcaster || user.hasTwitter || !!user.walletAddress;
    if (!hasSocialAccount) {
      return null;
    }

    // Find the referral record
    const referralResult = await db
      .select({
        id: referrals.id,
        qualifiedAt: referrals.qualifiedAt,
      })
      .from(referrals)
      .where(
        and(
          eq(referrals.referrerId, user.referredBy),
          eq(referrals.referredUserId, referredUserId),
          eq(referrals.status, 'completed')
        )
      )
      .orderBy(desc(referrals.completedAt))
      .limit(1);

    const referral = referralResult[0];

    if (!referral) {
      logger.warn(
        `No referral record found for referrer ${user.referredBy} and referred user ${referredUserId}`,
        { referrerId: user.referredBy, referredUserId },
        'PointsService'
      );
      return null;
    }

    // Check if already qualified
    if (referral.qualifiedAt) {
      return null;
    }

    // Qualify the referral and award bonus points to referrer
    const qualificationResult = await PointsService.awardPoints(
      user.referredBy,
      POINTS.REFERRAL_QUALIFIED,
      'referral_qualified',
      {
        referredUserId,
        qualifiedAt: new Date().toISOString(),
      }
    );

    if (qualificationResult.success) {
      // Update referral record to mark as qualified
      await db
        .update(referrals)
        .set({ qualifiedAt: new Date() })
        .where(eq(referrals.id, referral.id));

      logger.info(
        `Referral qualified: referrer ${user.referredBy} earned ${POINTS.REFERRAL_QUALIFIED} points for qualified referral`,
        {
          referrerId: user.referredBy,
          referredUserId,
          referralId: referral.id,
          pointsAwarded: qualificationResult.pointsAwarded,
        },
        'PointsService'
      );

      // When a referral becomes qualified, a slot opens for pending referrals
      // Award signup points to the oldest pending referral (FIFO)
      await this.awardPendingReferralSignupPoints(user.referredBy);
    }

    return qualificationResult;
  }

  /**
   * Purchase trading points (virtual balance) via payment (100 points = $1)
   *
   * Supports multiple payment providers:
   * - 'crypto': On-chain ETH payment via x402
   * - 'stripe': Credit card payment via Stripe Checkout
   *
   * NOTE: This adds to virtualBalance (trading balance), NOT reputationPoints.
   * Users buy trading points to trade on the platform.
   *
   * CONCURRENCY: Uses atomic SQL update to prevent race conditions.
   * IDEMPOTENCY: Checks paymentRequestId inside transaction to prevent duplicates.
   *
   * @param userId - User ID to credit points to
   * @param amountUSD - Amount paid in USD
   * @param paymentRequestId - Unique payment identifier (x402 request ID or Stripe session ID)
   * @param paymentTxHash - Optional transaction hash (blockchain tx or Stripe payment intent ID)
   * @param paymentProvider - Payment provider used ('crypto' or 'stripe')
   */
  static async purchasePoints(
    userId: string,
    amountUSD: number,
    paymentRequestId: string,
    paymentTxHash?: string,
    paymentProvider: 'crypto' | 'stripe' = 'crypto'
  ): Promise<AwardPointsResult> {
    const pointsAmount = Math.floor(amountUSD * 100);

    // Execute everything in a transaction for atomicity
    const result = await db.transaction(async (tx) => {
      // Idempotency check: has this payment already been processed?
      const existingTransaction = await tx
        .select({ id: pointsTransactions.id })
        .from(pointsTransactions)
        .where(eq(pointsTransactions.paymentRequestId, paymentRequestId))
        .limit(1);

      if (existingTransaction.length > 0) {
        logger.info(
          `Purchase already processed for paymentRequestId ${paymentRequestId}`,
          { userId, paymentRequestId, paymentProvider },
          'PointsService'
        );
        return {
          success: true,
          pointsAwarded: 0,
          newTotal: 0,
          alreadyAwarded: true,
        };
      }

      // Get current balance (inside transaction for consistency)
      const userResult = await tx
        .select({ virtualBalance: users.virtualBalance })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      const user = userResult[0];

      if (!user) {
        return {
          success: false,
          pointsAwarded: 0,
          newTotal: 0,
          error: 'User not found',
        };
      }

      const balanceBefore = Number(user.virtualBalance ?? 0);
      const balanceAfter = balanceBefore + pointsAmount;

      // Atomic balance update
      await tx
        .update(users)
        .set({
          virtualBalance: sql`COALESCE(CAST("virtualBalance" AS NUMERIC), 0) + ${pointsAmount}`,
        })
        .where(eq(users.id, userId));

      // Record the transaction
      await tx.insert(pointsTransactions).values({
        id: await generateSnowflakeId(),
        userId,
        amount: pointsAmount,
        pointsBefore: balanceBefore,
        pointsAfter: balanceAfter,
        reason: 'purchase',
        metadata: JSON.stringify({
          amountUSD,
          pointsPerDollar: 100,
          purchasedAt: new Date().toISOString(),
          paymentProvider,
        }),
        paymentRequestId,
        paymentTxHash,
        paymentAmount: amountUSD.toFixed(2),
        paymentVerified: true,
        paymentProvider,
      });

      return {
        success: true,
        pointsAwarded: pointsAmount,
        newTotal: balanceAfter,
      };
    });

    if (result.success && !result.alreadyAwarded) {
      logger.info(
        `User ${userId} purchased ${pointsAmount} trading points for $${amountUSD} via ${paymentProvider}`,
        { userId, pointsAmount, amountUSD, paymentRequestId, paymentProvider },
        'PointsService'
      );
    }

    return result;
  }

  /**
   * Reverse a points purchase due to refund or dispute
   *
   * Deducts points from the user's trading balance (virtualBalance).
   * Used by Stripe webhook handlers for:
   * - charge.refunded: Full or partial refund processed
   * - charge.dispute.created: Customer initiated chargeback
   *
   * NOTE: Points are deducted from virtualBalance, floored at 0.
   * If user has already spent the points, they will have a 0 balance.
   *
   * CONCURRENCY: Uses atomic SQL update to prevent race conditions.
   * IDEMPOTENCY: Checks stripeEventId inside transaction to prevent duplicates.
   *
   * @param userId - User ID to deduct points from
   * @param paymentIntentId - Stripe Payment Intent ID to find original transaction
   * @param reason - 'refund' or 'dispute'
   * @param amountUSD - Amount being refunded/disputed in USD
   * @param stripeEventId - Stripe event ID for idempotency
   */
  static async reversePointsPurchase(
    userId: string,
    paymentIntentId: string,
    reason: 'refund' | 'dispute',
    amountUSD: number,
    stripeEventId: string
  ): Promise<AwardPointsResult> {
    const pointsToDeduct = Math.floor(amountUSD * 100);
    const transactionReason =
      reason === 'refund' ? 'purchase_refund' : 'purchase_dispute';

    // Execute everything in a transaction for atomicity
    const result = await db.transaction(async (tx) => {
      // Idempotency check: has this event already been processed?
      const existingReversal = await tx
        .select({ id: pointsTransactions.id })
        .from(pointsTransactions)
        .where(eq(pointsTransactions.paymentRequestId, stripeEventId))
        .limit(1);

      if (existingReversal.length > 0) {
        logger.info(
          `Reversal already processed for event ${stripeEventId}`,
          { userId, stripeEventId, reason },
          'PointsService'
        );
        return {
          success: true,
          pointsAwarded: 0,
          newTotal: 0,
          alreadyAwarded: true,
        };
      }

      // Get current user balance (inside transaction for consistency)
      const userResult = await tx
        .select({ virtualBalance: users.virtualBalance })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      const user = userResult[0];

      if (!user) {
        logger.error(
          `Cannot reverse points: user not found`,
          { userId, paymentIntentId, reason },
          'PointsService'
        );
        return {
          success: false,
          pointsAwarded: 0,
          newTotal: 0,
          error: 'User not found',
        };
      }

      const balanceBefore = Number(user.virtualBalance ?? 0);
      // Floor at 0 - we don't allow negative trading balance
      const balanceAfter = Math.max(0, balanceBefore - pointsToDeduct);
      const actualDeduction = balanceBefore - balanceAfter;

      // Atomic balance update - deduct but floor at 0
      await tx
        .update(users)
        .set({
          virtualBalance: sql`GREATEST(0, COALESCE(CAST("virtualBalance" AS NUMERIC), 0) - ${pointsToDeduct})`,
        })
        .where(eq(users.id, userId));

      // Record the transaction
      await tx.insert(pointsTransactions).values({
        id: await generateSnowflakeId(),
        userId,
        amount: -actualDeduction, // Negative for deduction
        pointsBefore: balanceBefore,
        pointsAfter: balanceAfter,
        reason: transactionReason,
        metadata: JSON.stringify({
          amountUSD,
          pointsRequested: pointsToDeduct,
          pointsActuallyDeducted: actualDeduction,
          originalPaymentIntentId: paymentIntentId,
          stripeEventId,
          reversalReason: reason,
          reversedAt: new Date().toISOString(),
        }),
        paymentRequestId: stripeEventId, // Use event ID for idempotency
        paymentTxHash: paymentIntentId,
        paymentAmount: amountUSD.toFixed(2),
        paymentVerified: true,
        paymentProvider: 'stripe',
      });

      logger.info(
        `Reversed ${actualDeduction} trading points from user ${userId} due to ${reason}`,
        {
          userId,
          paymentIntentId,
          reason,
          pointsRequested: pointsToDeduct,
          pointsDeducted: actualDeduction,
          balanceBefore,
          balanceAfter,
          stripeEventId,
        },
        'PointsService'
      );

      return {
        success: true,
        pointsAwarded: -actualDeduction,
        newTotal: balanceAfter,
      };
    });

    return result;
  }

  /**
   * Re-credit points after winning a dispute
   *
   * When a merchant wins a chargeback dispute, re-credit the points
   * that were previously deducted.
   *
   * CONCURRENCY: Uses atomic SQL update to prevent race conditions.
   * IDEMPOTENCY: Checks stripeEventId inside transaction to prevent duplicates.
   *
   * @param userId - User ID to credit points to
   * @param disputeId - Stripe Dispute ID
   * @param amountUSD - Original dispute amount in USD
   * @param stripeEventId - Stripe event ID for idempotency
   */
  static async creditDisputeWon(
    userId: string,
    disputeId: string,
    amountUSD: number,
    stripeEventId: string
  ): Promise<AwardPointsResult> {
    const pointsToCredit = Math.floor(amountUSD * 100);

    // Execute everything in a transaction for atomicity
    const result = await db.transaction(async (tx) => {
      // Idempotency check: has this event already been processed?
      const existingCredit = await tx
        .select({ id: pointsTransactions.id })
        .from(pointsTransactions)
        .where(eq(pointsTransactions.paymentRequestId, stripeEventId))
        .limit(1);

      if (existingCredit.length > 0) {
        logger.info(
          `Dispute win credit already processed for event ${stripeEventId}`,
          { userId, stripeEventId, disputeId },
          'PointsService'
        );
        return {
          success: true,
          pointsAwarded: 0,
          newTotal: 0,
          alreadyAwarded: true,
        };
      }

      // Get current user balance (inside transaction for consistency)
      const userResult = await tx
        .select({ virtualBalance: users.virtualBalance })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      const user = userResult[0];

      if (!user) {
        logger.error(
          `Cannot credit dispute win: user not found`,
          { userId, disputeId },
          'PointsService'
        );
        return {
          success: false,
          pointsAwarded: 0,
          newTotal: 0,
          error: 'User not found',
        };
      }

      const balanceBefore = Number(user.virtualBalance ?? 0);
      const balanceAfter = balanceBefore + pointsToCredit;

      // Atomic balance update
      await tx
        .update(users)
        .set({
          virtualBalance: sql`COALESCE(CAST("virtualBalance" AS NUMERIC), 0) + ${pointsToCredit}`,
        })
        .where(eq(users.id, userId));

      // Record the transaction
      await tx.insert(pointsTransactions).values({
        id: await generateSnowflakeId(),
        userId,
        amount: pointsToCredit,
        pointsBefore: balanceBefore,
        pointsAfter: balanceAfter,
        reason: 'purchase_dispute_won',
        metadata: JSON.stringify({
          amountUSD,
          pointsCredited: pointsToCredit,
          disputeId,
          stripeEventId,
          creditedAt: new Date().toISOString(),
        }),
        paymentRequestId: stripeEventId, // Use event ID for idempotency
        paymentTxHash: disputeId,
        paymentAmount: amountUSD.toFixed(2),
        paymentVerified: true,
        paymentProvider: 'stripe',
      });

      logger.info(
        `Re-credited ${pointsToCredit} trading points to user ${userId} after winning dispute`,
        {
          userId,
          disputeId,
          pointsCredited: pointsToCredit,
          balanceBefore,
          balanceAfter,
          stripeEventId,
        },
        'PointsService'
      );

      return {
        success: true,
        pointsAwarded: pointsToCredit,
        newTotal: balanceAfter,
      };
    });

    return result;
  }

  /**
   * Check if points were already awarded for a specific reason
   */
  private static checkAlreadyAwarded(
    user: {
      pointsAwardedForProfile: boolean;
      pointsAwardedForFarcaster: boolean;
      pointsAwardedForFarcasterFollow: boolean;
      pointsAwardedForTwitter: boolean;
      pointsAwardedForTwitterFollow: boolean;
      pointsAwardedForDiscord: boolean;
      pointsAwardedForDiscordJoin: boolean;
      pointsAwardedForWallet: boolean;
      pointsAwardedForReferralBonus: boolean;
      pointsAwardedForShare: boolean;
    },
    reason: PointsReason
  ): boolean {
    switch (reason) {
      case 'profile_completion':
        return user.pointsAwardedForProfile;
      case 'farcaster_link':
        return user.pointsAwardedForFarcaster;
      case 'farcaster_follow':
        return user.pointsAwardedForFarcasterFollow;
      case 'twitter_link':
        return user.pointsAwardedForTwitter;
      case 'twitter_follow':
        return user.pointsAwardedForTwitterFollow;
      case 'discord_link':
        return user.pointsAwardedForDiscord;
      case 'discord_join':
        return user.pointsAwardedForDiscordJoin;
      case 'wallet_connect':
        return user.pointsAwardedForWallet;
      case 'referral_bonus':
        return user.pointsAwardedForReferralBonus;
      case 'referral_qualified':
        return false;
      case 'share_action':
      case 'share_to_twitter':
        return user.pointsAwardedForShare;
      default:
        return false;
    }
  }

  /**
   * Get user's points and transaction history
   */
  static async getUserPoints(userId: string) {
    const userResult = await db
      .select({
        reputationPoints: users.reputationPoints,
        referralCount: users.referralCount,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    const user = userResult[0];

    if (!user) {
      return null;
    }

    const transactions = await db
      .select()
      .from(pointsTransactions)
      .where(eq(pointsTransactions.userId, userId))
      .orderBy(desc(pointsTransactions.createdAt))
      .limit(50);

    return {
      points: user.reputationPoints,
      referralCount: user.referralCount,
      transactions,
    };
  }

  /**
   * Get leaderboard with pagination (includes both Users and Actors with pools)
   */
  static async getLeaderboard(
    page = 1,
    pageSize = 100,
    minPoints = 500,
    pointsCategory: LeaderboardCategory = 'all'
  ) {
    const skip = (page - 1) * pageSize;

    // Common user select fields for leaderboard
    const userSelectFields = {
      id: users.id,
      username: users.username,
      displayName: users.displayName,
      profileImageUrl: users.profileImageUrl,
      reputationPoints: users.reputationPoints,
      invitePoints: users.invitePoints,
      earnedPoints: users.earnedPoints,
      bonusPoints: users.bonusPoints,
      referralCount: users.referralCount,
      virtualBalance: users.virtualBalance,
      lifetimePnL: users.lifetimePnL,
      totalPoints: users.totalPoints,
      createdAt: users.createdAt,
      onChainRegistered: users.onChainRegistered,
      nftTokenId: users.nftTokenId,
    };

    // Build users query based on category
    // All modes exclude actors (isActor=false) AND agents (isAgent=false)
    let usersResult;
    let totalCountForTotal: number | null = null;
    if (pointsCategory === 'total') {
      // Use DB-level ordering and pagination for 'total' mode
      const [countResult] = await db
        .select({ count: count() })
        .from(users)
        .where(
          and(eq(users.isActor, false), eq(users.isAgent, false))
        );
      totalCountForTotal = countResult?.count ?? 0;

      usersResult = await db
        .select(userSelectFields)
        .from(users)
        .where(
          and(eq(users.isActor, false), eq(users.isAgent, false))
        )
        .orderBy(desc(users.totalPoints))
        .limit(pageSize)
        .offset(skip);
    } else if (pointsCategory === 'all') {
      usersResult = await db
        .select(userSelectFields)
        .from(users)
        .where(
          and(eq(users.isActor, false), eq(users.isAgent, false), gte(users.reputationPoints, minPoints))
        );
    } else if (pointsCategory === 'earned') {
      usersResult = await db
        .select(userSelectFields)
        .from(users)
        .where(and(eq(users.isActor, false), eq(users.isAgent, false), ne(users.earnedPoints, 0)));
    } else {
      usersResult = await db
        .select(userSelectFields)
        .from(users)
        .where(and(eq(users.isActor, false), eq(users.isAgent, false), gt(users.invitePoints, 0)));
    }

    const combined = [
      ...usersResult.map((user) => ({
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        profileImageUrl: user.profileImageUrl,
        allPoints: user.reputationPoints,
        invitePoints: user.invitePoints,
        earnedPoints: user.earnedPoints,
        bonusPoints: user.bonusPoints,
        totalPoints: Number(user.totalPoints ?? 0),
        referralCount: user.referralCount,
        balance: Number(user.virtualBalance ?? 0),
        lifetimePnL: Number(user.lifetimePnL ?? 0),
        createdAt: user.createdAt,
        isActor: false,
        tier: null as string | null,
        onChainRegistered: user.onChainRegistered,
        nftTokenId: user.nftTokenId,
      })),
    ];

    if (pointsCategory === 'all') {
      // Get actor states with sufficient reputation points
      const actorStates = await db
        .select({
          id: actorState.id,
          reputationPoints: actorState.reputationPoints,
          createdAt: actorState.createdAt,
        })
        .from(actorState)
        .where(gte(actorState.reputationPoints, minPoints));

      // Combine with static data
      combined.push(
        ...actorStates
          .map((state) => {
            const staticActor = StaticDataRegistry.getActor(state.id);
            if (!staticActor) return null;
            return {
              id: state.id,
              username: state.id,
              displayName: staticActor.name,
              profileImageUrl:
                staticActor.profileImageUrl ?? (null as string | null),
              allPoints: state.reputationPoints,
              invitePoints: 0,
              earnedPoints: 0,
              bonusPoints: 0,
              totalPoints: 0,
              referralCount: 0,
              balance: 0,
              lifetimePnL: 0,
              createdAt: state.createdAt,
              isActor: true,
              tier: staticActor.tier,
              onChainRegistered: false,
              nftTokenId: null as number | null,
            };
          })
          .filter((a): a is NonNullable<typeof a> => a !== null)
      );
    }

    const sortField: 'allPoints' | 'earnedPoints' | 'invitePoints' | 'totalPoints' =
      pointsCategory === 'total'
        ? 'totalPoints'
        : pointsCategory === 'all'
          ? 'allPoints'
          : pointsCategory === 'earned'
            ? 'earnedPoints'
            : 'invitePoints';

    // For 'total' mode, DB already handled ordering and pagination
    if (pointsCategory !== 'total') {
      combined.sort((a, b) => {
        const comparison = b[sortField] - a[sortField];
        if (comparison !== 0) {
          return comparison;
        }

        if (pointsCategory === 'referral') {
          const referralComparison = b.referralCount - a.referralCount;
          if (referralComparison !== 0) {
            return referralComparison;
          }
        }

        if (pointsCategory === 'earned') {
          const pnlComparison = b.lifetimePnL - a.lifetimePnL;
          if (pnlComparison !== 0) {
            return pnlComparison;
          }
        }

        return b.allPoints - a.allPoints;
      });
    }

    const totalCount = pointsCategory === 'total' ? totalCountForTotal! : combined.length;
    const paginatedResults = pointsCategory === 'total' ? combined : combined.slice(skip, skip + pageSize);

    const resultsWithRank = paginatedResults.map((entry, index) => ({
      ...entry,
      rank: skip + index + 1,
    }));

    return {
      users: resultsWithRank,
      totalCount,
      page,
      pageSize,
      totalPages: Math.ceil(totalCount / pageSize),
      pointsCategory,
    };
  }

  /**
   * Get user's rank on leaderboard (including actors)
   */
  static async getUserRank(userId: string): Promise<number | null> {
    const userResult = await db
      .select({
        reputationPoints: users.reputationPoints,
        isActor: users.isActor,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    const user = userResult[0];

    if (!user || user.isActor) {
      return null;
    }

    // Count users with more points
    const [higherUsersResult] = await db
      .select({ count: count() })
      .from(users)
      .where(
        and(
          gt(users.reputationPoints, user.reputationPoints),
          eq(users.isActor, false)
        )
      );

    // Count actors with more points using actorState table
    const [higherActorsResult] = await db
      .select({ count: count() })
      .from(actorState)
      .where(gt(actorState.reputationPoints, user.reputationPoints));

    const higherUsersCount = higherUsersResult?.count ?? 0;
    const higherActorsCount = higherActorsResult?.count ?? 0;

    return higherUsersCount + higherActorsCount + 1;
  }
}
