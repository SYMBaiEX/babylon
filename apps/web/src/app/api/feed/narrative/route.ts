/**
 * Narrative Feed API
 *
 * @route GET /api/feed/narrative — story-grouped feed sorted by narrative score
 *
 * Story Scoring:
 *   storyScore = totalEngagement * 0.5 + recencyScore * 0.35 + activityBonus * 0.15
 *   totalEngagement = sum(likes*1 + comments*2 + shares*3)
 *   recencyScore    = Math.exp(-ln(2) * hoursOld / 12)   // true 12h half-life on newest post
 *   activityBonus   = Math.min(postCount / 10, 1)
 *
 * Posts from the last 48h are fetched, grouped by relatedQuestion (prediction market
 * question number), scored per story group, and returned sorted by score DESC.
 * Posts without a relatedQuestion are collected into a synthetic "__general__" story
 * that always sorts last.
 */
import {
  addPublicReadHeaders,
  getCache,
  getCacheOrFetch,
  publicRateLimit,
  setCache,
  successResponse,
  withErrorHandling,
} from '@babylon/api';
import {
  and,
  arcStates,
  db,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  lte,
  positions,
  posts,
  questions,
  reactions,
  shares,
  sql,
  users,
} from '@babylon/db';
import { StaticDataRegistry } from '@babylon/engine';
import type {
  ArcStateType,
  NarrativePost,
  NarrativeStory,
} from '@babylon/shared';
import { logger } from '@babylon/shared';
import type { NextRequest } from 'next/server';
import {
  calculateArcStateMultiplier,
  calculateResolutionBoost,
  calculateStoryScore,
} from './scoring';

// Query limits
const MAX_CANDIDATE_POSTS = 500;
const FORTY_EIGHT_HOURS_MS = 48 * 60 * 60 * 1000;

const GENERAL_STORY_KEY = '__general__';

interface NarrativeFeedResponse {
  success: true;
  stories: NarrativeStory[];
  generatedAt: string;
}

function toISOStringStrict(
  date: Date | string | null | undefined,
  fieldName: string,
  postId: string
): string {
  if (date === null || date === undefined) {
    logger.warn(
      `Null/undefined ${fieldName} for post ${postId}`,
      { postId },
      'NarrativeFeedAPI'
    );
    return new Date().toISOString();
  }
  if (date instanceof Date) {
    if (isNaN(date.getTime())) {
      logger.warn(
        `Invalid Date for ${fieldName} on post ${postId}`,
        { postId },
        'NarrativeFeedAPI'
      );
      return new Date().toISOString();
    }
    return date.toISOString();
  }
  const parsed = new Date(date);
  if (!isNaN(parsed.getTime())) return parsed.toISOString();
  logger.warn(
    `Unparseable ${fieldName} "${date}" for post ${postId}`,
    { postId },
    'NarrativeFeedAPI'
  );
  return new Date().toISOString();
}

interface CachedResult {
  stories: NarrativeStory[];
  postIds: string[];
}

// Per-user enrichment cache TTL (seconds). Short enough to stay fresh;
// long enough to dramatically reduce DB load at scale.
const USER_ENRICHMENT_TTL_S = 30;

interface UserEnrichmentCache {
  likedPostIds: string[];
  sharedPostIds: string[];
  positionQuestionIds: number[];
}

export const GET = withErrorHandling(async (request: NextRequest) => {
  const {
    error: rateLimitErr,
    user,
    rateLimitInfo,
  } = await publicRateLimit(request, 'read');
  if (rateLimitErr) return rateLimitErr;

  const cacheKey = 'feed:narrative:v1';

  const result = await getCacheOrFetch<CachedResult>(
    cacheKey,
    async () => {
      const now = new Date();
      const cutoff = new Date(now.getTime() - FORTY_EIGHT_HOURS_MS);

      const recentPosts = await db
        .select({
          id: posts.id,
          content: posts.content,
          authorId: posts.authorId,
          timestamp: posts.timestamp,
          type: posts.type,
          articleTitle: posts.articleTitle,
          fullContent: posts.fullContent,
          category: posts.category,
          imageUrl: posts.imageUrl,
          relatedQuestion: posts.relatedQuestion,
        })
        .from(posts)
        .where(
          and(
            isNull(posts.deletedAt),
            gte(posts.timestamp, cutoff),
            lte(posts.timestamp, now),
            isNull(posts.commentOnPostId),
            isNull(posts.parentCommentId)
          )
        )
        .orderBy(desc(posts.timestamp))
        .limit(MAX_CANDIDATE_POSTS);

      if (recentPosts.length === 0) {
        return { stories: [], postIds: [] };
      }

      const postIds = recentPosts.map((p) => p.id);

      // Single CTE query for all engagement counts — mirrors fetchPostMetadataConsolidated
      // pattern in apps/web/src/app/api/posts/route.ts to avoid N separate round-trips.
      const postIdsArray = sql`ARRAY[${sql.join(
        postIds.map((id) => sql`${id}`),
        sql`, `
      )}]::text[]`;

      const engagementRows = await db.execute(sql`
        WITH
        target_posts AS (
          SELECT unnest(${postIdsArray}) AS post_id
        ),
        reaction_counts AS (
          SELECT r."postId" AS post_id, COUNT(*) AS count
          FROM "Reaction" r
          INNER JOIN target_posts tp ON r."postId" = tp.post_id
          WHERE r.type = 'like'
          GROUP BY r."postId"
        ),
        comment_counts AS (
          SELECT c."postId" AS post_id, COUNT(*) AS count
          FROM "Comment" c
          INNER JOIN target_posts tp ON c."postId" = tp.post_id
          WHERE c."deletedAt" IS NULL
          GROUP BY c."postId"
        ),
        share_counts AS (
          SELECT s."postId" AS post_id, COUNT(*) AS count
          FROM "Share" s
          INNER JOIN target_posts tp ON s."postId" = tp.post_id
          GROUP BY s."postId"
        )
        SELECT
          tp.post_id,
          COALESCE(rc.count, 0) AS like_count,
          COALESCE(cc.count, 0) AS comment_count,
          COALESCE(sc.count, 0) AS share_count
        FROM target_posts tp
        LEFT JOIN reaction_counts rc ON tp.post_id = rc.post_id
        LEFT JOIN comment_counts cc ON tp.post_id = cc.post_id
        LEFT JOIN share_counts sc ON tp.post_id = sc.post_id
      `);

      const reactionMap = new Map<string, number>();
      const commentMap = new Map<string, number>();
      const shareMap = new Map<string, number>();

      const engagementResultRows = Array.isArray(engagementRows)
        ? (engagementRows as Record<string, unknown>[])
        : [];
      for (const row of engagementResultRows) {
        const postId = String(row['post_id'] ?? '');
        if (!postId) continue;
        reactionMap.set(postId, Number(row['like_count'] ?? 0));
        commentMap.set(postId, Number(row['comment_count'] ?? 0));
        shareMap.set(postId, Number(row['share_count'] ?? 0));
      }

      const authorIds = [...new Set(recentPosts.map((p) => p.authorId))];
      const authorUsers = await db
        .select({
          id: users.id,
          username: users.username,
          displayName: users.displayName,
          profileImageUrl: users.profileImageUrl,
        })
        .from(users)
        .where(inArray(users.id, authorIds));
      const userMap = new Map(authorUsers.map((u) => [u.id, u]));

      // Resolve question metadata (title, status, arcState) via posts.relatedQuestion → questions.questionNumber
      // LEFT JOIN arcStates to get narrative state in one round-trip.
      const questionNumbers = [
        ...new Set(
          recentPosts
            .map((p) => p.relatedQuestion)
            .filter((q): q is number => q !== null && q !== undefined)
        ),
      ];
      interface QuestionMeta {
        title: string;
        status: string;
        arcState: ArcStateType | null;
        resolutionDate: Date;
      }
      const questionMetaMap = new Map<number, QuestionMeta>();
      if (questionNumbers.length > 0) {
        const rows = await db
          .select({
            questionNumber: questions.questionNumber,
            text: questions.text,
            status: questions.status,
            arcState: arcStates.currentState,
            resolutionDate: questions.resolutionDate,
          })
          .from(questions)
          .leftJoin(arcStates, eq(arcStates.questionId, questions.id))
          .where(inArray(questions.questionNumber, questionNumbers));
        rows.forEach((q) =>
          questionMetaMap.set(q.questionNumber, {
            title: q.text,
            status: q.status ?? 'active',
            arcState: (q.arcState as ArcStateType | null) ?? null,
            resolutionDate: q.resolutionDate,
          })
        );
      }

      // Group posts by storyKey
      const storyPostMap = new Map<string, NarrativePost[]>();

      for (const post of recentPosts) {
        const likeCount = reactionMap.get(post.id) ?? 0;
        const commentCount = commentMap.get(post.id) ?? 0;
        const shareCount = shareMap.get(post.id) ?? 0;
        const timestamp = toISOStringStrict(
          post.timestamp,
          'timestamp',
          post.id
        );

        const authorUser = userMap.get(post.authorId);
        const actorRecord = StaticDataRegistry.getActor(post.authorId);
        let authorName = post.authorId;
        let authorUsername: string | null = null;
        let authorProfileImageUrl: string | null = null;

        if (actorRecord) {
          authorName = actorRecord.name;
          authorUsername = actorRecord.username ?? actorRecord.id;
          authorProfileImageUrl = actorRecord.profileImageUrl ?? null;
        } else if (authorUser) {
          authorName =
            authorUser.displayName ?? authorUser.username ?? post.authorId;
          authorUsername = authorUser.username;
          authorProfileImageUrl = authorUser.profileImageUrl;
        }

        const narrativePost: NarrativePost = {
          id: post.id,
          content: post.content,
          fullContent: post.fullContent ?? null,
          articleTitle: post.articleTitle ?? null,
          category: post.category ?? null,
          imageUrl: post.imageUrl ?? null,
          type: post.type,
          timestamp,
          authorId: post.authorId,
          authorName,
          authorUsername,
          authorProfileImageUrl,
          likeCount,
          commentCount,
          shareCount,
          isLiked: false,
          isShared: false,
          relatedQuestion: post.relatedQuestion ?? null,
        };

        const storyKey =
          post.relatedQuestion != null
            ? String(post.relatedQuestion)
            : GENERAL_STORY_KEY;

        const bucket = storyPostMap.get(storyKey);
        if (bucket) {
          bucket.push(narrativePost);
        } else {
          storyPostMap.set(storyKey, [narrativePost]);
        }
      }

      // Score and sort stories
      const stories: NarrativeStory[] = [];

      for (const [storyKey, storyPosts] of storyPostMap) {
        // Sort posts newest first within each story
        storyPosts.sort(
          (a, b) =>
            new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
        );

        const newestTimestamp = new Date(storyPosts[0]!.timestamp);
        const totalLikes = storyPosts.reduce((acc, p) => acc + p.likeCount, 0);
        const totalComments = storyPosts.reduce(
          (acc, p) => acc + p.commentCount,
          0
        );
        const totalShares = storyPosts.reduce(
          (acc, p) => acc + p.shareCount,
          0
        );
        const questionNumber =
          storyKey === GENERAL_STORY_KEY ? null : parseInt(storyKey, 10);
        const meta =
          questionNumber !== null ? questionMetaMap.get(questionNumber) : null;
        const storyTitle =
          meta?.title ??
          (questionNumber !== null ? `Story #${questionNumber}` : 'General');
        const arcState = meta?.arcState ?? null;

        // Skip fully resolved questions — no remaining tension
        if (meta?.status === 'resolved') continue;

        const baseScore = calculateStoryScore(
          totalLikes,
          totalComments,
          totalShares,
          storyPosts.length,
          newestTimestamp
        );
        const resolutionBoost = meta?.resolutionDate
          ? calculateResolutionBoost(meta.resolutionDate)
          : 1.0;
        const storyScoreValue =
          baseScore * calculateArcStateMultiplier(arcState) * resolutionBoost;

        stories.push({
          storyKey,
          storyTitle,
          questionNumber,
          arcState,
          storyScore: Math.round(storyScoreValue * 10000) / 10000,
          postCount: storyPosts.length,
          posts: storyPosts,
          hasUserPosition: false,
        });
      }

      // Sort by score DESC, general story always last
      stories.sort((a, b) => {
        if (a.storyKey === GENERAL_STORY_KEY) return 1;
        if (b.storyKey === GENERAL_STORY_KEY) return -1;
        return b.storyScore - a.storyScore;
      });

      return { stories, postIds };
    },
    // 120s TTL — cache invalidation on new post creation (posts/route.ts) keeps
    // this fresh in practice; TTL is a safety net, not the freshness mechanism.
    { namespace: 'feed', ttl: 120 }
  );

  // Per-user enrichment — isLiked, isShared, hasUserPosition.
  // Results are cached per-user for USER_ENRICHMENT_TTL_S seconds to avoid
  // 3 DB round-trips × N concurrent authenticated users on every request.
  let finalStories: NarrativeStory[] = result.stories;

  if (user?.userId) {
    const userId = user.userId;
    const questionNumbersInResult = result.stories
      .map((s) => s.questionNumber)
      .filter((n): n is number => n !== null);

    const enrichCacheKey = `narrative:enrichment:${userId}`;
    const cachedEnrichment = await getCache<UserEnrichmentCache>(
      enrichCacheKey,
      { namespace: 'feed' }
    );

    let enrichment: UserEnrichmentCache;

    if (cachedEnrichment) {
      enrichment = cachedEnrichment;
    } else {
      // Cache miss — fetch from DB in parallel and populate cache
      const [userLikes, userShares, userPositions] = await Promise.all([
        result.postIds.length > 0
          ? db
              .select({ postId: reactions.postId })
              .from(reactions)
              .where(
                and(
                  inArray(reactions.postId, result.postIds),
                  eq(reactions.userId, userId),
                  eq(reactions.type, 'like')
                )
              )
          : Promise.resolve([]),
        result.postIds.length > 0
          ? db
              .select({ postId: shares.postId })
              .from(shares)
              .where(
                and(
                  inArray(shares.postId, result.postIds),
                  eq(shares.userId, userId)
                )
              )
          : Promise.resolve([]),
        questionNumbersInResult.length > 0
          ? db
              .select({ questionId: positions.questionId })
              .from(positions)
              .where(
                and(
                  eq(positions.userId, userId),
                  eq(positions.status, 'active'),
                  isNotNull(positions.questionId),
                  inArray(positions.questionId, questionNumbersInResult)
                )
              )
          : Promise.resolve([]),
      ]);

      enrichment = {
        likedPostIds: userLikes
          .map((l) => l.postId)
          .filter((id): id is string => id !== null),
        sharedPostIds: userShares
          .map((s) => s.postId)
          .filter((id): id is string => id !== null),
        positionQuestionIds: userPositions
          .map((p) => p.questionId)
          .filter((id): id is number => id !== null),
      };

      // Fire-and-forget cache write — don't block the response
      void setCache(enrichCacheKey, enrichment, {
        namespace: 'feed',
        ttl: USER_ENRICHMENT_TTL_S,
      });
    }

    const likedSet = new Set(enrichment.likedPostIds);
    const sharedSet = new Set(enrichment.sharedPostIds);
    const positionSet = new Set(enrichment.positionQuestionIds);

    finalStories = result.stories.map((story) => ({
      ...story,
      hasUserPosition:
        story.questionNumber !== null && positionSet.has(story.questionNumber),
      posts: story.posts.map((post) => ({
        ...post,
        isLiked: likedSet.has(post.id),
        isShared: sharedSet.has(post.id),
      })),
    }));

    // Re-sort: stories with user positions first (within non-general tier),
    // then by score descending, general story always last.
    finalStories.sort((a, b) => {
      const aIsGeneral = a.questionNumber === null;
      const bIsGeneral = b.questionNumber === null;
      if (aIsGeneral !== bIsGeneral) return aIsGeneral ? 1 : -1;
      if (a.hasUserPosition !== b.hasUserPosition)
        return a.hasUserPosition ? -1 : 1;
      return b.storyScore - a.storyScore;
    });
  }

  const response = successResponse({
    success: true,
    stories: finalStories,
    generatedAt: new Date().toISOString(),
  } satisfies NarrativeFeedResponse);

  if (rateLimitInfo) addPublicReadHeaders(response, rateLimitInfo);
  return response;
});
