/**
 * User Verify Share API
 *
 * @route POST /api/users/[userId]/verify-share - Verify share action
 * @access Authenticated
 *
 * @description
 * Verifies that a share action was actually completed (user posted on platform).
 * Awards points if verification succeeds. Supports Twitter and Farcaster.
 *
 * @openapi
 * /api/users/{userId}/verify-share:
 *   post:
 *     tags:
 *       - Users
 *     summary: Verify share action
 *     description: Verifies share was posted and awards points (authenticated user only)
 *     security:
 *       - PrivyAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - shareId
 *               - platform
 *             properties:
 *               shareId:
 *                 type: string
 *               platform:
 *                 type: string
 *                 enum: [twitter, farcaster]
 *               postUrl:
 *                 type: string
 *                 format: uri
 *                 description: URL to actual post for verification
 *     responses:
 *       200:
 *         description: Share verified successfully
 *       400:
 *         description: Invalid input
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Not authorized for this user
 *
 * @example
 * ```typescript
 * await fetch(`/api/users/${userId}/verify-share`, {
 *   method: 'POST',
 *   headers: { 'Authorization': `Bearer ${token}` },
 *   body: JSON.stringify({
 *     shareId: 'share-id',
 *     platform: 'twitter',
 *     postUrl: 'https://twitter.com/...'
 *   })
 * });
 * ```
 */

import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { db, eq, shareActions, users } from '@babylon/db';
import { authenticate, successResponse } from '@babylon/api';
import { POINTS } from '@babylon/shared';
import { AuthorizationError, BusinessLogicError } from '@babylon/api';
import { withErrorHandling } from '@babylon/api';
import { logger } from '@babylon/shared';
import { PointsService } from '@babylon/api';
import { requireUserByIdentifier } from '@babylon/api';
import { SnowflakeIdSchema, UserIdParamSchema } from '@babylon/shared';

const VerifyShareRequestSchema = z.object({
  shareId: SnowflakeIdSchema,
  platform: z.enum(['twitter', 'farcaster']),
  postUrl: z.string().url().optional(), // URL to the actual post for verification
});

/**
 * POST /api/users/[userId]/verify-share
 * Verify that a share action was completed (user actually posted)
 */
export const POST = withErrorHandling(
  async (
    request: NextRequest,
    context: { params: Promise<{ userId: string }> }
  ) => {
    // Authenticate user
    const authUser = await authenticate(request);
    const { userId } = UserIdParamSchema.parse(await context.params);

    // Check if the authenticated user has a database record
    if (!authUser.dbUserId) {
      throw new AuthorizationError(
        'User profile not found. Please complete onboarding first.',
        'share-verification',
        'create'
      );
    }

    const targetUser = await requireUserByIdentifier(userId, { id: true });
    const canonicalUserId = targetUser.id;

    // Verify user is verifying their own share
    if (authUser.dbUserId !== canonicalUserId) {
      throw new AuthorizationError(
        'You can only verify your own shares',
        'share-verification',
        'create'
      );
    }

    // Parse and validate request body
    const body = await request.json();
    const { shareId, platform, postUrl } = VerifyShareRequestSchema.parse(body);

    // Get the share action
    const [shareAction] = await db
      .select()
      .from(shareActions)
      .where(eq(shareActions.id, shareId))
      .limit(1);

    if (!shareAction) {
      throw new BusinessLogicError('Share action not found', 'SHARE_NOT_FOUND');
    }

    if (shareAction.userId !== canonicalUserId) {
      throw new AuthorizationError(
        'You can only verify your own shares',
        'share-verification',
        'verify'
      );
    }

    if (shareAction.verified) {
      // Calculate points based on platform (same logic as PointsService.awardShareAction)
      const pointsAmount =
        platform === 'twitter' ? POINTS.SHARE_TO_TWITTER : POINTS.SHARE_ACTION;

      return successResponse({
        message: 'Share already verified',
        verified: true,
        shareAction,
        points: {
          awarded: shareAction.pointsAwarded ? pointsAmount : 0,
          alreadyAwarded: shareAction.pointsAwarded,
        },
      });
    }

    // Require post URL for verification
    if (!postUrl) {
      throw new BusinessLogicError(
        'Post URL is required for verification',
        'MISSING_POST_URL'
      );
    }

    // Verify the post based on platform
    let verified = false;
    let verificationDetails: Record<string, string | boolean> = {};
    let verificationError: string | null = null;

    if (platform === 'twitter') {
      // Twitter verification - STRICT MODE
      // Extract tweet ID and username from URL (e.g., https://twitter.com/user/status/1234567890 or https://x.com/user/status/1234567890)
      const tweetMatch = postUrl.match(
        /(?:twitter\.com|x\.com)\/([^/]+)\/status\/(\d+)/
      );

      if (!tweetMatch || !tweetMatch[1] || !tweetMatch[2]) {
        verificationError =
          'Invalid X URL format. Expected: https://x.com/username/status/123456789';
        logger.warn(
          `Invalid Twitter URL format: ${shareId}`,
          { shareId, postUrl, userId: canonicalUserId },
          'POST /api/users/[userId]/verify-share'
        );
      } else {
        const tweetUsername = tweetMatch[1]; // Username from URL
        const tweetId = tweetMatch[2]; // Tweet ID

        // Check if Twitter API is configured
        if (!process.env.TWITTER_BEARER_TOKEN) {
          verificationError =
            'Twitter verification is not configured. Please contact support.';
          logger.error(
            'TWITTER_BEARER_TOKEN not configured',
            { shareId, tweetId },
            'POST /api/users/[userId]/verify-share'
          );
        } else {
          // Verify tweet exists using Twitter API v2
          try {
            const [user] = await db
              .select({
                twitterUsername: users.twitterUsername,
              })
              .from(users)
              .where(eq(users.id, canonicalUserId))
              .limit(1);

            // VALIDATION 1: Check if user has linked Twitter account
            if (!user?.twitterUsername) {
              verificationError =
                'Please link your Twitter/X account first to verify posts.';
              logger.warn(
                `User has no linked Twitter account: ${shareId}`,
                { shareId, userId: canonicalUserId },
                'POST /api/users/[userId]/verify-share'
              );
            } else {
              const twitterResponse = await fetch(
                `https://api.twitter.com/2/tweets/${tweetId}?tweet.fields=author_id,created_at,text,entities`,
                {
                  headers: {
                    Authorization: `Bearer ${process.env.TWITTER_BEARER_TOKEN}`,
                  },
                }
              );

              if (twitterResponse.ok) {
                const tweetData = await twitterResponse.json();

                if (tweetData.data) {
                  // VALIDATION 2: Verify tweet author matches user's Twitter account
                  const userTwitterUsername = user.twitterUsername
                    .toLowerCase()
                    .replace('@', '');
                  const urlTwitterUsername = tweetUsername.toLowerCase();

                  if (userTwitterUsername !== urlTwitterUsername) {
                    verificationError = `This tweet is from @${tweetUsername}, but your linked account is @${user.twitterUsername}. You can only verify your own posts.`;
                    logger.warn(
                      `Tweet author mismatch: ${shareId}`,
                      {
                        shareId,
                        expectedUsername: userTwitterUsername,
                        actualUsername: urlTwitterUsername,
                      },
                      'POST /api/users/[userId]/verify-share'
                    );
                  } else {
                    // VALIDATION 3: Verify tweet contains the shared URL
                    // Twitter converts URLs to t.co links, so we need to check expanded URLs from entities
                    const tweetText = (tweetData.data.text || '').toLowerCase();
                    const sharedUrl = shareAction.url?.toLowerCase() || '';

                    // Extract expanded URLs from tweet entities (Twitter automatically shortens URLs to t.co)
                    const urlEntities = tweetData.data.entities?.urls as
                      | Array<{ expanded_url?: string }>
                      | undefined;
                    const expandedUrls = (urlEntities || [])
                      .map(
                        (urlEntity) =>
                          urlEntity.expanded_url?.toLowerCase() || ''
                      )
                      .filter((url) => url);

                    // Check if the tweet contains the shared URL (in text or expanded URLs)
                    const containsUrlInText =
                      sharedUrl && tweetText.includes(sharedUrl);
                    const containsUrlInEntities =
                      sharedUrl &&
                      expandedUrls.some(
                        (expandedUrl) =>
                          expandedUrl.includes(sharedUrl) ||
                          sharedUrl.includes(expandedUrl)
                      );

                    const containsUrl =
                      containsUrlInText || containsUrlInEntities;

                    if (!containsUrl && sharedUrl) {
                      verificationError = `This tweet does not contain the shared link (${sharedUrl}). Please paste the tweet where you actually shared the link.`;
                      logger.warn(
                        `Tweet does not contain shared URL: ${shareId}`,
                        {
                          shareId,
                          tweetText: tweetText.substring(0, 100),
                          expectedUrl: sharedUrl,
                          expandedUrls,
                        },
                        'POST /api/users/[userId]/verify-share'
                      );
                    } else {
                      // All validations passed!
                      verified = true;
                      verificationDetails = {
                        tweetId,
                        tweetUrl: postUrl,
                        tweetUsername,
                        verificationMethod:
                          'twitter_api_v2_with_url_verification',
                        verified: true,
                        tweetText: tweetData.data.text || '',
                        tweetAuthorId: tweetData.data.author_id || '',
                        verifiedAt: new Date().toISOString(),
                        urlMatch: containsUrl,
                        urlMatchMethod: containsUrlInEntities
                          ? 'expanded_urls'
                          : 'text',
                        expandedUrls: expandedUrls.join(', '),
                        authorMatch: true,
                      };

                      logger.info(
                        `Twitter share verified via API: ${shareId}`,
                        {
                          shareId,
                          tweetId,
                          tweetUsername,
                          userId: canonicalUserId,
                          urlMatchMethod: containsUrlInEntities
                            ? 'expanded_urls'
                            : 'text',
                        },
                        'POST /api/users/[userId]/verify-share'
                      );
                    }
                  }
                } else {
                  verificationError = 'Tweet not found or has been deleted';
                  logger.warn(
                    `Tweet not found in API response: ${shareId}`,
                    { shareId, tweetId },
                    'POST /api/users/[userId]/verify-share'
                  );
                }
              } else if (twitterResponse.status === 404) {
                verificationError =
                  'Tweet not found. Please check the URL and try again.';
                logger.warn(
                  `Tweet not found (404): ${shareId}`,
                  { shareId, tweetId },
                  'POST /api/users/[userId]/verify-share'
                );
              } else {
                verificationError = `Twitter API error (${twitterResponse.status}). Please try again later.`;
                logger.error(
                  `Twitter API error: ${shareId}`,
                  { shareId, tweetId, status: twitterResponse.status },
                  'POST /api/users/[userId]/verify-share'
                );
              }
            }
          } catch (error) {
            verificationError =
              'Failed to verify with Twitter API. Please try again later.';
            logger.error(
              `Twitter API verification exception: ${shareId}`,
              { shareId, tweetId, error },
              'POST /api/users/[userId]/verify-share'
            );
          }
        }
      }
    } else if (platform === 'farcaster') {
      // Farcaster verification - STRICT MODE via Neynar API
      // Use URL-based lookup which is more reliable than hash extraction

      // Check if Neynar API key is configured
      if (!process.env.NEYNAR_API_KEY) {
        verificationError =
          'Farcaster verification is not configured. Please contact support.';
        logger.error(
          'NEYNAR_API_KEY not configured',
          { shareId, postUrl },
          'POST /api/users/[userId]/verify-share'
        );
      } else {
        try {
          // Use Neynar API to verify cast by URL (more reliable than hash extraction)
          logger.info(
            `Attempting to verify Farcaster cast: ${shareId}`,
            { shareId, postUrl },
            'POST /api/users/[userId]/verify-share'
          );

          const neynarResponse = await fetch(
            `https://api.neynar.com/v2/farcaster/cast?identifier=${encodeURIComponent(postUrl)}&type=url`,
            {
              headers: {
                accept: 'application/json',
                api_key: process.env.NEYNAR_API_KEY,
              },
              signal: AbortSignal.timeout(10000), // 10 second timeout
            }
          );

          if (neynarResponse.ok) {
            const neynarData = await neynarResponse.json();

            logger.info(
              `Neynar API response received: ${shareId}`,
              { shareId, hasCast: !!neynarData.cast },
              'POST /api/users/[userId]/verify-share'
            );

            if (neynarData.cast) {
              // VALIDATION 1: Check if user has linked Farcaster account
              const [user] = await db
                .select({
                  farcasterUsername: users.farcasterUsername,
                  farcasterFid: users.farcasterFid,
                })
                .from(users)
                .where(eq(users.id, canonicalUserId))
                .limit(1);

              if (!user?.farcasterUsername && !user?.farcasterFid) {
                verificationError =
                  'Please link your Farcaster account first to verify casts.';
                logger.warn(
                  `User has no linked Farcaster account: ${shareId}`,
                  { shareId, userId: canonicalUserId },
                  'POST /api/users/[userId]/verify-share'
                );
              } else {
                // VALIDATION 2: Verify cast author matches user's Farcaster account
                const castAuthorUsername =
                  neynarData.cast.author?.username?.toLowerCase();
                const castAuthorFid = neynarData.cast.author?.fid?.toString();
                const userFarcasterUsername =
                  user.farcasterUsername?.toLowerCase();
                const userFarcasterFid = user.farcasterFid?.toString();

                const isAuthorMatch =
                  (userFarcasterUsername &&
                    castAuthorUsername === userFarcasterUsername) ||
                  (userFarcasterFid && castAuthorFid === userFarcasterFid);

                if (!isAuthorMatch) {
                  verificationError = `This cast was not posted by your Farcaster account (@${userFarcasterUsername || userFarcasterFid}). Please paste a cast from your own account.`;
                  logger.warn(
                    `Cast author mismatch: ${shareId}`,
                    {
                      shareId,
                      castAuthor: castAuthorUsername,
                      castAuthorFid,
                      expectedUsername: userFarcasterUsername,
                      expectedFid: userFarcasterFid,
                    },
                    'POST /api/users/[userId]/verify-share'
                  );
                } else {
                  // VALIDATION 3: Verify cast contains the shared URL
                  const castText = (neynarData.cast.text || '').toLowerCase();
                  const sharedUrl = shareAction.url?.toLowerCase() || '';

                  // Check if the cast contains the exact shared URL
                  const containsUrl = sharedUrl && castText.includes(sharedUrl);

                  if (!containsUrl && sharedUrl) {
                    verificationError = `This cast does not contain the shared link (${sharedUrl}). Please paste the cast where you actually shared the link.`;
                    logger.warn(
                      `Cast does not contain shared URL: ${shareId}`,
                      {
                        shareId,
                        castText: castText.substring(0, 100),
                        expectedUrl: sharedUrl,
                      },
                      'POST /api/users/[userId]/verify-share'
                    );
                  } else {
                    // All validations passed!
                    verified = true;
                    verificationDetails = {
                      castHash: neynarData.cast.hash,
                      castUrl: postUrl,
                      verificationMethod: 'neynar_api_url',
                      verified: true,
                      castText: neynarData.cast.text || '',
                      castAuthorUsername: castAuthorUsername || '',
                      castAuthorFid: castAuthorFid || '',
                      verifiedAt: new Date().toISOString(),
                      authorMatch: true,
                      urlMatch: containsUrl,
                    };

                    logger.info(
                      `Farcaster share verified via Neynar API: ${shareId}`,
                      {
                        shareId,
                        castHash: neynarData.cast.hash,
                        userId: canonicalUserId,
                      },
                      'POST /api/users/[userId]/verify-share'
                    );
                  }
                }
              }
            } else {
              verificationError = 'Cast not found or has been deleted';
              logger.warn(
                `Cast not found in Neynar response: ${shareId}`,
                { shareId, postUrl },
                'POST /api/users/[userId]/verify-share'
              );
            }
          } else if (neynarResponse.status === 404) {
            verificationError =
              'Cast not found. Please check the URL and try again.';
            logger.warn(
              `Cast not found (404) via Neynar: ${shareId}`,
              { shareId, postUrl },
              'POST /api/users/[userId]/verify-share'
            );
          } else {
            const errorText = await neynarResponse.text().catch(() => '');
            verificationError = `Neynar API error (${neynarResponse.status}). Please try again later.`;
            logger.error(
              `Neynar API error: ${shareId}`,
              {
                shareId,
                postUrl,
                status: neynarResponse.status,
                error: errorText,
              },
              'POST /api/users/[userId]/verify-share'
            );
          }
        } catch (error) {
          // NO FALLBACK - strict verification only
          verificationError =
            'Failed to verify with Neynar API. Please try again later.';
          logger.error(
            `Neynar API verification exception: ${shareId}`,
            {
              shareId,
              postUrl,
              error: error instanceof Error ? error.message : String(error),
            },
            'POST /api/users/[userId]/verify-share'
          );
        }
      }
    }

    // Award points only if verification succeeded
    let pointsAwarded = 0;
    let newPointsTotal = 0;

    if (verified) {
      // Award points through PointsService
      const pointsResult = await PointsService.awardShareAction(
        canonicalUserId,
        platform,
        shareAction.contentType,
        shareAction.contentId || undefined
      );

      if (pointsResult.success) {
        pointsAwarded = pointsResult.pointsAwarded;
        newPointsTotal = pointsResult.newTotal;

        logger.info(
          `Awarded ${pointsAwarded} points for verified share`,
          { shareId, userId: canonicalUserId, platform, pointsAwarded },
          'POST /api/users/[userId]/verify-share'
        );
      }
    }

    // Update share action with verification status and points
    const [updatedShareAction] = await db
      .update(shareActions)
      .set({
        verified,
        verifiedAt: verified ? new Date() : null,
        verificationDetails: verified
          ? JSON.stringify(verificationDetails)
          : null,
        pointsAwarded: verified && pointsAwarded > 0,
      })
      .where(eq(shareActions.id, shareId))
      .returning();

    return successResponse({
      verified,
      shareAction: updatedShareAction,
      points: {
        awarded: pointsAwarded,
        newTotal: newPointsTotal,
      },
      message: verified
        ? `Share verified successfully! You earned ${pointsAwarded} points.`
        : verificationError ||
          'Could not verify share. Please provide a valid post URL.',
    });
  }
);
