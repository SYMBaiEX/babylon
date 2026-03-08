import { getCacheOrFetch } from '@babylon/api';
import {
  and,
  arcStates,
  db,
  desc,
  eq,
  feedEvents,
  follows,
  gte,
  inArray,
  isNotNull,
  isNull,
  lt,
  lte,
  markets,
  not,
  positions,
  posts,
  questions,
  reactions,
  shares,
  sql,
  userActorFollows,
  users,
} from '@babylon/db';
import { StaticDataRegistry, dailyTopicService, deriveTopicFromText } from '@babylon/engine';
import type {
  ArcStateType,
  FeedEventAction,
  NarrativePost,
  NarrativeStory,
} from '@babylon/shared';
import {
  calculateArcStateMultiplier,
  calculateResolutionBoost,
  calculateStoryScore,
} from '@/app/api/feed/narrative/scoring';
import {
  calculateConversationDepthScore,
  calculateForYouScore,
  calculateFreshnessScore,
  calculateVelocityScore,
  diversifyForYouStories,
} from './scoring';

const MAX_CANDIDATE_POSTS = 500;
const MAX_STANDALONE_POSTS = 24;
const MAX_NEW_MARKET_CANDIDATES = 6;
const FEED_POST_WINDOW_MS = 24 * 60 * 60 * 1000;
const NEW_MARKET_WINDOW_MS = 24 * 60 * 60 * 1000;
const FEED_EVENT_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;
const BASE_CACHE_TTL_S = 60;
const GENERAL_STORY_KEY = '__general__';

interface BaseForYouResult {
  stories: NarrativeStory[];
  postIds: string[];
  generatedAt: string;
}

interface QuestionMeta {
  title: string;
  status: string;
  arcState: ArcStateType | null;
  resolutionDate: Date;
  topicKey: string | null;
  topicLabel: string | null;
}

interface FollowRow {
  id: string;
}

interface FeedEventRow {
  actionType: FeedEventAction;
  itemId: string;
  clusterId: string | null;
  marketId: string | null;
  topicKey: string | null;
  authorId: string | null;
  dwellMs: number | null;
  createdAt: Date;
}

interface EventAggregates {
  authorAffinity: Map<string, number>;
  clusterAffinity: Map<string, number>;
  topicAffinity: Map<string, number>;
  marketAffinity: Map<string, number>;
  authorExposure: Map<string, number>;
  clusterExposure: Map<string, number>;
  authorSatisfaction: Map<string, number>;
  clusterSatisfaction: Map<string, number>;
  authorHide: Map<string, number>;
  clusterHide: Map<string, number>;
}

function toISOStringStrict(
  date: Date | string | null | undefined,
  fallback = new Date()
): string {
  if (!date) return fallback.toISOString();
  if (date instanceof Date) {
    return Number.isNaN(date.getTime()) ? fallback.toISOString() : date.toISOString();
  }
  const parsed = new Date(date);
  return Number.isNaN(parsed.getTime()) ? fallback.toISOString() : parsed.toISOString();
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function incrementScore(
  map: Map<string, number>,
  key: string | null | undefined,
  value: number
) {
  if (!key) return;
  map.set(key, (map.get(key) ?? 0) + value);
}

function getActionWeight(actionType: FeedEventAction): number {
  switch (actionType) {
    case 'impression':
      return 0.05;
    case 'visible_2s':
      return 0.18;
    case 'open_post':
      return 0.75;
    case 'open_article':
      return 0.85;
    case 'open_market':
      return 0.95;
    case 'like':
      return 1.15;
    case 'share':
      return 1.35;
    case 'comment':
      return 1.55;
    case 'follow':
      return 1.75;
    case 'trade_after_view':
      return 2.3;
    case 'hide':
      return -2.0;
  }
}

function aggregateFeedEvents(events: FeedEventRow[]): EventAggregates {
  const aggregates: EventAggregates = {
    authorAffinity: new Map(),
    clusterAffinity: new Map(),
    topicAffinity: new Map(),
    marketAffinity: new Map(),
    authorExposure: new Map(),
    clusterExposure: new Map(),
    authorSatisfaction: new Map(),
    clusterSatisfaction: new Map(),
    authorHide: new Map(),
    clusterHide: new Map(),
  };

  const now = Date.now();

  for (const event of events) {
    const ageDays = Math.max(
      (now - event.createdAt.getTime()) / (1000 * 60 * 60 * 24),
      0
    );
    const decay = Math.exp((-Math.LN2 * ageDays) / 7);
    const weight = getActionWeight(event.actionType) * decay;
    const dwellBoost =
      event.dwellMs && event.dwellMs >= 2000 ? Math.min(event.dwellMs / 5000, 1) * 0.25 : 0;

    incrementScore(aggregates.authorAffinity, event.authorId, Math.max(weight, 0));
    incrementScore(aggregates.clusterAffinity, event.clusterId, Math.max(weight, 0));
    incrementScore(aggregates.topicAffinity, event.topicKey, Math.max(weight, 0));
    incrementScore(aggregates.marketAffinity, event.marketId, Math.max(weight, 0));

    if (event.actionType === 'impression' || event.actionType === 'visible_2s') {
      incrementScore(aggregates.authorExposure, event.authorId, decay);
      incrementScore(
        aggregates.clusterExposure,
        event.clusterId,
        event.actionType === 'visible_2s' ? decay * 1.2 : decay
      );
    }

    if (
      event.actionType === 'open_post' ||
      event.actionType === 'open_article' ||
      event.actionType === 'open_market' ||
      event.actionType === 'like' ||
      event.actionType === 'share' ||
      event.actionType === 'comment' ||
      event.actionType === 'follow' ||
      event.actionType === 'trade_after_view'
    ) {
      incrementScore(aggregates.authorSatisfaction, event.authorId, decay + dwellBoost);
      incrementScore(
        aggregates.clusterSatisfaction,
        event.clusterId,
        decay + dwellBoost
      );
    }

    if (event.actionType === 'hide') {
      incrementScore(aggregates.authorHide, event.authorId, decay);
      incrementScore(aggregates.clusterHide, event.clusterId, decay);
    }
  }

  return aggregates;
}

function getAffinityScore(map: Map<string, number>, key: string | null | undefined) {
  if (!key) return 0;
  return clamp(map.get(key) ?? 0, 0, 2.5);
}

function getFatiguePenalty(
  exposureMap: Map<string, number>,
  satisfactionMap: Map<string, number>,
  hideMap: Map<string, number>,
  key: string | null | undefined
) {
  if (!key) return 0;
  const exposure = exposureMap.get(key) ?? 0;
  const satisfaction = satisfactionMap.get(key) ?? 0;
  const hide = hideMap.get(key) ?? 0;
  return clamp(exposure * 0.24 - satisfaction * 0.16 + hide * 0.7, 0, 2.5);
}

function buildTopicMetadata(
  story: NarrativeStory
): { topicKey: string | null; topicLabel: string | null } {
  if (story.topicKey || story.topicLabel) {
    return {
      topicKey: story.topicKey ?? null,
      topicLabel: story.topicLabel ?? null,
    };
  }

  const topicSeed =
    story.storyTitle ||
    story.posts[0]?.articleTitle ||
    story.posts[0]?.content ||
    '';
  if (!topicSeed) {
    return { topicKey: null, topicLabel: null };
  }

  const derived = deriveTopicFromText(topicSeed);
  return {
    topicKey: derived.topicKey,
    topicLabel: derived.topicLabel,
  };
}

function calculatePostLeadScore(
  post: NarrativePost,
  followedAuthorIds: Set<string>,
  authorAffinity: number,
  clusterAffinity: number
) {
  const engagementTotal =
    post.likeCount + post.commentCount * 2 + post.shareCount * 3;
  const freshness = calculateFreshnessScore(new Date(post.timestamp));
  const followedBoost = followedAuthorIds.has(post.authorId) ? 0.4 : 0;

  return (
    Math.log1p(engagementTotal) * 0.55 +
    freshness * 0.25 +
    followedBoost +
    authorAffinity * 0.45 +
    clusterAffinity * 0.2
  );
}

function pickLeadPosts(
  story: NarrativeStory,
  followedAuthorIds: Set<string>,
  aggregates: EventAggregates
) {
  if (story.posts.length <= 1) return story.posts;

  const clusterId = story.clusterId ?? story.storyKey;

  return [...story.posts]
    .sort((a, b) => {
      const aScore = calculatePostLeadScore(
        a,
        followedAuthorIds,
        getAffinityScore(aggregates.authorAffinity, a.authorId),
        getAffinityScore(aggregates.clusterAffinity, clusterId)
      );
      const bScore = calculatePostLeadScore(
        b,
        followedAuthorIds,
        getAffinityScore(aggregates.authorAffinity, b.authorId),
        getAffinityScore(aggregates.clusterAffinity, clusterId)
      );
      return bScore - aScore;
    })
    .slice(0, 1);
}

async function loadBaseCandidates(): Promise<BaseForYouResult> {
  const now = new Date();
  const cutoff = new Date(now.getTime() - FEED_POST_WINDOW_MS);
  const newMarketCutoff = new Date(now.getTime() - NEW_MARKET_WINDOW_MS);

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
      originalPostId: posts.originalPostId,
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
    return { stories: [], postIds: [], generatedAt: now.toISOString() };
  }

  const postIds = recentPosts.map((post) => post.id);
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
  for (const row of Array.isArray(engagementRows)
    ? (engagementRows as Record<string, unknown>[])
    : []) {
    const postId = String(row['post_id'] ?? '');
    if (!postId) continue;
    reactionMap.set(postId, Number(row['like_count'] ?? 0));
    commentMap.set(postId, Number(row['comment_count'] ?? 0));
    shareMap.set(postId, Number(row['share_count'] ?? 0));
  }

  const authorIds = [...new Set(recentPosts.map((post) => post.authorId))];
  const authorUsers =
    authorIds.length > 0
      ? await db
          .select({
            id: users.id,
            username: users.username,
            displayName: users.displayName,
            profileImageUrl: users.profileImageUrl,
          })
          .from(users)
          .where(inArray(users.id, authorIds))
      : [];
  const userMap = new Map(authorUsers.map((user) => [user.id, user]));

  const repostOriginalIds = [
    ...new Set(
      recentPosts
        .filter((post) => post.originalPostId)
        .map((post) => post.originalPostId as string)
    ),
  ];

  const originalPostMap = new Map<
    string,
    {
      id: string;
      content: string;
      authorId: string;
      timestamp: Date;
      profileImageUrl: string | null;
      username: string | null;
      displayName: string | null;
    }
  >();

  if (repostOriginalIds.length > 0) {
    const originalRows = await db
      .select({
        id: posts.id,
        content: posts.content,
        authorId: posts.authorId,
        timestamp: posts.timestamp,
      })
      .from(posts)
      .where(inArray(posts.id, repostOriginalIds));

    const originalAuthorIds = [...new Set(originalRows.map((row) => row.authorId))];
    const originalAuthorUsers =
      originalAuthorIds.length > 0
        ? await db
            .select({
              id: users.id,
              username: users.username,
              displayName: users.displayName,
              profileImageUrl: users.profileImageUrl,
            })
            .from(users)
            .where(inArray(users.id, originalAuthorIds))
        : [];
    const originalUserMap = new Map(
      originalAuthorUsers.map((user) => [user.id, user])
    );

    for (const row of originalRows) {
      const author = originalUserMap.get(row.authorId);
      originalPostMap.set(row.id, {
        id: row.id,
        content: row.content,
        authorId: row.authorId,
        timestamp: row.timestamp,
        profileImageUrl: author?.profileImageUrl ?? null,
        username: author?.username ?? null,
        displayName: author?.displayName ?? null,
      });
    }
  }

  const questionNumbers = [
    ...new Set(
      recentPosts
        .map((post) => post.relatedQuestion)
        .filter((questionNumber): questionNumber is number => questionNumber !== null)
    ),
  ];

  const questionMetaMap = new Map<number, QuestionMeta>();
  if (questionNumbers.length > 0) {
    const rows = await db
      .select({
        questionNumber: questions.questionNumber,
        text: questions.text,
        status: questions.status,
        arcState: arcStates.currentState,
        resolutionDate: questions.resolutionDate,
        topicKey: questions.topicKey,
        topicLabel: questions.topicLabel,
      })
      .from(questions)
      .leftJoin(arcStates, eq(arcStates.questionId, questions.id))
      .where(inArray(questions.questionNumber, questionNumbers));

    for (const row of rows) {
      questionMetaMap.set(row.questionNumber, {
        title: row.text,
        status: row.status ?? 'active',
        arcState: (row.arcState as ArcStateType | null) ?? null,
        resolutionDate: row.resolutionDate,
        topicKey: row.topicKey ?? null,
        topicLabel: row.topicLabel ?? null,
      });
    }
  }

  const storyPostMap = new Map<string, NarrativePost[]>();

  for (const post of recentPosts) {
    const likeCount = reactionMap.get(post.id) ?? 0;
    const commentCount = commentMap.get(post.id) ?? 0;
    const shareCount = shareMap.get(post.id) ?? 0;
    const timestamp = toISOStringStrict(post.timestamp, now);

    const authorUser = userMap.get(post.authorId);
    const actorRecord = StaticDataRegistry.getActor(post.authorId);
    const orgRecord = actorRecord
      ? null
      : StaticDataRegistry.getOrganization(post.authorId);

    if (
      orgRecord &&
      post.content.trimStart().toUpperCase().startsWith('NEW MARKET:')
    ) {
      continue;
    }

    const authorType: 'actor' | 'news' | 'user' = actorRecord
      ? 'actor'
      : orgRecord
        ? 'news'
        : 'user';

    const authorName = actorRecord?.name ??
      orgRecord?.name ??
      authorUser?.displayName ??
      authorUser?.username ??
      post.authorId;
    const authorUsername =
      actorRecord?.username ??
      orgRecord?.id ??
      authorUser?.username ??
      null;
    const authorProfileImageUrl =
      actorRecord?.profileImageUrl ??
      orgRecord?.imageUrl ??
      authorUser?.profileImageUrl ??
      null;

    const isRepost = post.type === 'repost';
    const isQuote = isRepost && post.content !== '';
    const originalPostData = post.originalPostId
      ? (originalPostMap.get(post.originalPostId) ?? null)
      : null;

    let originalPost: NarrativePost['originalPost'] = null;
    if (originalPostData) {
      const origActor = StaticDataRegistry.getActor(originalPostData.authorId);
      const origOrg = origActor
        ? null
        : StaticDataRegistry.getOrganization(originalPostData.authorId);
      originalPost = {
        id: originalPostData.id,
        content: originalPostData.content,
        authorId: originalPostData.authorId,
        authorName:
          origActor?.name ??
          origOrg?.name ??
          originalPostData.displayName ??
          originalPostData.username ??
          originalPostData.authorId,
        authorUsername:
          origActor?.username ??
          origOrg?.id ??
          originalPostData.username ??
          null,
        authorProfileImageUrl:
          origActor?.profileImageUrl ??
          origOrg?.imageUrl ??
          originalPostData.profileImageUrl ??
          null,
        timestamp: toISOStringStrict(originalPostData.timestamp, now),
      };
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
      authorType,
      isRepost,
      isQuote,
      quoteComment: isQuote ? post.content : null,
      originalPostId: post.originalPostId ?? null,
      originalPost,
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

  const stories: NarrativeStory[] = [];

  for (const [storyKey, storyPosts] of storyPostMap) {
    storyPosts.sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );

    const newestTimestamp = new Date(storyPosts[0]!.timestamp);
    const totalLikes = storyPosts.reduce((sum, post) => sum + post.likeCount, 0);
    const totalComments = storyPosts.reduce(
      (sum, post) => sum + post.commentCount,
      0
    );
    const totalShares = storyPosts.reduce((sum, post) => sum + post.shareCount, 0);
    const questionNumber =
      storyKey === GENERAL_STORY_KEY ? null : Number.parseInt(storyKey, 10);
    const meta =
      questionNumber !== null ? questionMetaMap.get(questionNumber) : null;

    if (meta?.status === 'resolved') continue;
    if (meta?.resolutionDate && meta.resolutionDate <= now) continue;

    const baseScore = calculateStoryScore(
      totalLikes,
      totalComments,
      totalShares,
      storyPosts.length,
      newestTimestamp
    );
    const resolutionBoost = meta?.resolutionDate
      ? calculateResolutionBoost(meta.resolutionDate)
      : 1;
    const storyScoreValue =
      baseScore * calculateArcStateMultiplier(meta?.arcState ?? null) * resolutionBoost;

    const storyTitle =
      meta?.title ??
      (questionNumber !== null ? `Story #${questionNumber}` : 'General');

    stories.push({
      storyKey,
      storyTitle,
      questionNumber,
      arcState: meta?.arcState ?? null,
      storyScore: Math.round(storyScoreValue * 10000) / 10000,
      postCount: storyPosts.length,
      posts: storyPosts,
      hasUserPosition: false,
      topicKey: meta?.topicKey ?? null,
      topicLabel: meta?.topicLabel ?? null,
    });
  }

  const generalPosts = storyPostMap.get(GENERAL_STORY_KEY) ?? [];
  const standalonePostCards = generalPosts
    .map((post) => ({
      post,
      score: calculateStoryScore(
        post.likeCount,
        post.commentCount,
        post.shareCount,
        1,
        new Date(post.timestamp)
      ),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_STANDALONE_POSTS);

  for (const { post, score } of standalonePostCards) {
    const title =
      post.articleTitle ??
      (post.content.length > 80
        ? `${post.content.slice(0, 80).replace(/\s+\S*$/, '')}…`
        : post.content);

    stories.push({
      storyKey: `post:${post.id}`,
      storyTitle: title,
      questionNumber: null,
      arcState: null,
      storyScore: Math.round(score * 10000) / 10000,
      postCount: 1,
      posts: [post],
      hasUserPosition: false,
      itemType: post.type === 'article' ? 'article' : 'post',
    });
  }

  const storyQuestionNumbers = stories
    .filter((story) => story.questionNumber !== null)
    .map((story) => story.questionNumber as number);

  if (storyQuestionNumbers.length > 0) {
    const marketRows = await db
      .select({
        questionNumber: questions.questionNumber,
        marketId: markets.id,
        yesShares: markets.yesShares,
        noShares: markets.noShares,
      })
      .from(questions)
      .innerJoin(
        markets,
        sql`lower(trim(${markets.question})) = lower(trim(${questions.text}))`
      )
      .where(inArray(questions.questionNumber, storyQuestionNumbers));

    const questionToMarket = new Map(
      marketRows.map((row) => [
        row.questionNumber,
        {
          marketId: row.marketId,
          yesShares: Number(row.yesShares ?? 0),
          noShares: Number(row.noShares ?? 0),
        },
      ])
    );

    for (const story of stories) {
      if (story.questionNumber === null) continue;
      const market = questionToMarket.get(story.questionNumber);
      if (!market) continue;
      story.marketId = market.marketId;
      story.rootMarketId = market.marketId;
      story.yesShares = market.yesShares;
      story.noShares = market.noShares;
      story.clusterId = story.clusterId ?? market.marketId;
    }
  }

  const existingQuestionNumbers = new Set(
    stories
      .map((story) => story.questionNumber)
      .filter((questionNumber): questionNumber is number => questionNumber !== null)
  );

  const newMarketQuestions = await db
    .select({
      questionNumber: questions.questionNumber,
      text: questions.text,
      resolutionDate: questions.resolutionDate,
      createdAt: questions.createdAt,
      arcState: arcStates.currentState,
      marketId: markets.id,
      yesShares: markets.yesShares,
      noShares: markets.noShares,
      topicKey: questions.topicKey,
      topicLabel: questions.topicLabel,
    })
    .from(questions)
    .leftJoin(arcStates, eq(arcStates.questionId, questions.id))
    .leftJoin(
      markets,
      sql`lower(trim(${markets.question})) = lower(trim(${questions.text}))`
    )
    .where(
      and(
        eq(questions.status, 'active'),
        gte(questions.createdAt, newMarketCutoff),
        lt(
          questions.resolutionDate,
          new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
        ),
        not(
          inArray(
            questions.questionNumber,
            existingQuestionNumbers.size > 0 ? [...existingQuestionNumbers] : [-1]
          )
        )
      )
    )
    .orderBy(desc(questions.createdAt))
    .limit(MAX_NEW_MARKET_CANDIDATES);

  for (const question of newMarketQuestions) {
    const hoursSinceOpen =
      (now.getTime() - question.createdAt.getTime()) / (1000 * 60 * 60);
    const recencyScore = Math.exp((-Math.LN2 * hoursSinceOpen) / 6);
    const arcMultiplier = calculateArcStateMultiplier(
      (question.arcState as ArcStateType | null) ?? null
    );

    stories.push({
      storyKey: `market:${question.questionNumber}`,
      storyTitle: question.text,
      questionNumber: question.questionNumber,
      arcState: (question.arcState as ArcStateType | null) ?? null,
      storyScore: Math.round(recencyScore * arcMultiplier * 10000) / 10000,
      postCount: 0,
      posts: [],
      hasUserPosition: false,
      isNewMarket: true,
      resolutionDate: question.resolutionDate.toISOString(),
      marketId: question.marketId ?? null,
      rootMarketId: question.marketId ?? null,
      yesShares: Number(question.yesShares ?? 0),
      noShares: Number(question.noShares ?? 0),
      anchorPostId:
        recentPosts.find((post) => post.relatedQuestion === question.questionNumber)?.id ??
        null,
      topicKey: question.topicKey ?? null,
      topicLabel: question.topicLabel ?? null,
      itemType: 'market',
      clusterId: question.marketId ?? `market:${question.questionNumber}`,
    });
  }

  stories.sort((a, b) => b.storyScore - a.storyScore);

  return {
    stories,
    postIds,
    generatedAt: now.toISOString(),
  };
}

async function loadFeedEventAggregates(userId: string): Promise<EventAggregates> {
  const eventCutoff = new Date(Date.now() - FEED_EVENT_WINDOW_MS);
  const rows = await db
    .select({
      actionType: feedEvents.actionType,
      itemId: feedEvents.itemId,
      clusterId: feedEvents.clusterId,
      marketId: feedEvents.marketId,
      topicKey: feedEvents.topicKey,
      authorId: feedEvents.authorId,
      dwellMs: feedEvents.dwellMs,
      createdAt: feedEvents.createdAt,
    })
    .from(feedEvents)
    .where(
      and(
        eq(feedEvents.userId, userId),
        eq(feedEvents.surface, 'for_you'),
        gte(feedEvents.createdAt, eventCutoff)
      )
    )
    .orderBy(desc(feedEvents.createdAt))
    .limit(500);

  return aggregateFeedEvents(
    rows.map((row) => ({
      actionType: row.actionType as FeedEventAction,
      itemId: row.itemId,
      clusterId: row.clusterId,
      marketId: row.marketId,
      topicKey: row.topicKey,
      authorId: row.authorId,
      dwellMs: row.dwellMs,
      createdAt: row.createdAt,
    }))
  );
}

export async function buildForYouFeed(userId?: string | null) {
  const currentTopic = await dailyTopicService.getCurrentTopic();

  const baseResult = await getCacheOrFetch<BaseForYouResult>(
    'feed:for-you:v2:base',
    () => loadBaseCandidates(),
    { namespace: 'feed', ttl: BASE_CACHE_TTL_S }
  );

  const [followedUsers, followedActors, userLikes, userShares, userPositions, eventAggregates]:
    [
      FollowRow[],
      FollowRow[],
      Array<{ postId: string | null }>,
      Array<{ postId: string }>,
      Array<{ questionId: number | null }>,
      EventAggregates
    ] = userId
    ? await Promise.all([
        db
          .select({ id: follows.followingId })
          .from(follows)
          .where(eq(follows.followerId, userId)),
        db
          .select({ id: userActorFollows.actorId })
          .from(userActorFollows)
          .where(eq(userActorFollows.userId, userId)),
        baseResult.postIds.length > 0
          ? db
              .select({ postId: reactions.postId })
              .from(reactions)
              .where(
                and(
                  inArray(reactions.postId, baseResult.postIds),
                  eq(reactions.userId, userId),
                  eq(reactions.type, 'like')
                )
              )
          : Promise.resolve([]),
        baseResult.postIds.length > 0
          ? db
              .select({ postId: shares.postId })
              .from(shares)
              .where(
                and(
                  inArray(shares.postId, baseResult.postIds),
                  eq(shares.userId, userId)
                )
              )
          : Promise.resolve([]),
        (() => {
          const questionNumbers = baseResult.stories
            .map((story) => story.questionNumber)
            .filter((questionNumber): questionNumber is number => questionNumber !== null);

          if (questionNumbers.length === 0) {
            return Promise.resolve([]);
          }

          return db
            .select({ questionId: positions.questionId })
            .from(positions)
            .where(
              and(
                eq(positions.userId, userId),
                eq(positions.status, 'active'),
                isNotNull(positions.questionId),
                inArray(positions.questionId, questionNumbers)
              )
            );
        })(),
        loadFeedEventAggregates(userId),
      ])
    : [[], [], [], [], [], aggregateFeedEvents([])];

  const followedAuthorIds = new Set<string>([
    ...followedUsers.map((follow) => follow.id),
    ...followedActors.map((follow) => follow.id),
  ]);
  const likedSet = new Set(
    userLikes
      .map((row) => row.postId)
      .filter((postId): postId is string => Boolean(postId))
  );
  const sharedSet = new Set(userShares.map((row) => row.postId));
  const positionSet = new Set(
    userPositions
      .map((row) => row.questionId)
      .filter((questionId): questionId is number => questionId !== null)
  );

  const rescoredStories = baseResult.stories.map((story) => {
    const clusterId = story.clusterId ?? story.marketId ?? story.storyKey;
    const topic = buildTopicMetadata(story);
    const leadPosts = pickLeadPosts(story, followedAuthorIds, eventAggregates).map(
      (post) => ({
        ...post,
        isLiked: likedSet.has(post.id),
        isShared: sharedSet.has(post.id),
      })
    );
    const enrichedPosts = story.posts.map((post) => ({
      ...post,
      isLiked: likedSet.has(post.id),
      isShared: sharedSet.has(post.id),
    }));
    const leadPost = leadPosts[0] ?? null;
    const primaryAuthorId = leadPost?.authorId ?? story.primaryAuthorId ?? null;
    const newest =
      leadPost?.timestamp ?? story.resolutionDate ?? baseResult.generatedAt;
    const newestDate = new Date(newest);
    const engagementTotal = enrichedPosts.reduce(
      (sum, post) =>
        sum + post.likeCount + post.commentCount * 2 + post.shareCount * 3,
      0
    );
    const uniqueAuthors = new Set(enrichedPosts.map((post) => post.authorId)).size;
    const totalComments = enrichedPosts.reduce(
      (sum, post) => sum + post.commentCount,
      0
    );
    const hasUserPosition =
      story.questionNumber !== null && positionSet.has(story.questionNumber);
    const authorAffinityScore =
      getAffinityScore(eventAggregates.authorAffinity, primaryAuthorId) +
      (primaryAuthorId && followedAuthorIds.has(primaryAuthorId) ? 0.8 : 0);
    const clusterAffinityScore = getAffinityScore(
      eventAggregates.clusterAffinity,
      clusterId
    );
    const topicAffinityScore = getAffinityScore(
      eventAggregates.topicAffinity,
      topic.topicKey
    );
    const marketAffinityScore = getAffinityScore(
      eventAggregates.marketAffinity,
      story.marketId ?? null
    );
    const isCarryover = Boolean(
      currentTopic &&
        topic.topicKey &&
        topic.topicKey !== currentTopic.topicKey
    );
    const topicMatchScore =
      currentTopic && topic.topicKey === currentTopic.topicKey
        ? 1.9 + topicAffinityScore * 0.25
        : hasUserPosition || marketAffinityScore > 0.2
          ? 0.45 + topicAffinityScore * 0.1
          : topicAffinityScore * 0.15;
    const socialAffinityScore =
      authorAffinityScore +
      clusterAffinityScore * 0.65 +
      (leadPosts.some((post) => post.isLiked || post.isShared) ? 0.35 : 0);
    const marketRelevanceScore =
      (hasUserPosition ? 1.7 : 0) +
      marketAffinityScore * 0.6 +
      (story.isNewMarket ? 0.75 : 0.15) +
      (story.marketId ? 0.2 : 0);
    const engagementVelocityScore = calculateVelocityScore(
      engagementTotal,
      newestDate
    );
    const conversationDepthScore = calculateConversationDepthScore(
      totalComments,
      uniqueAuthors
    );
    const narrativeUrgencyScore =
      calculateArcStateMultiplier(story.arcState) -
      1 +
      (story.resolutionDate
        ? calculateResolutionBoost(new Date(story.resolutionDate)) - 1
        : 0) +
      (story.isNewMarket ? 0.2 : 0) +
      (hasUserPosition ? 0.15 : 0);
    const freshnessScore = calculateFreshnessScore(newestDate);
    const retentionScore = clamp(
      getAffinityScore(eventAggregates.authorSatisfaction, primaryAuthorId) * 0.4 +
        getAffinityScore(eventAggregates.clusterSatisfaction, clusterId) * 0.6,
      0,
      2
    );
    const fatiguePenalty = clamp(
      getFatiguePenalty(
        eventAggregates.authorExposure,
        eventAggregates.authorSatisfaction,
        eventAggregates.authorHide,
        primaryAuthorId
      ) * 0.6 +
        getFatiguePenalty(
          eventAggregates.clusterExposure,
          eventAggregates.clusterSatisfaction,
          eventAggregates.clusterHide,
          clusterId
        ) *
          0.9,
      0,
      2.5
    );
    const noveltyScore = story.isNewMarket
      ? 0.45
      : story.itemType === 'article' || leadPost?.type === 'article'
        ? 0.25
        : 0.1;
    const explorationBonus =
      !hasUserPosition &&
      !followedAuthorIds.has(primaryAuthorId ?? '') &&
      !isCarryover &&
      freshnessScore > 0.6
        ? 0.35
        : 0;
    const finalRankScore = calculateForYouScore({
      baseScore: story.storyScore,
      topicMatchScore,
      socialAffinityScore,
      marketRelevanceScore,
      engagementVelocityScore,
      conversationDepthScore,
      narrativeUrgencyScore,
      freshnessScore,
      noveltyScore,
      retentionScore,
      fatiguePenalty,
      explorationBonus,
    });

    return {
      ...story,
      storyScore: finalRankScore,
      finalRankScore,
      posts: story.isNewMarket ? [] : leadPosts,
      postCount: story.postCount,
      hasUserPosition,
      clusterId,
      rootMarketId: story.rootMarketId ?? story.marketId ?? null,
      primaryAuthorId,
      topicKey: topic.topicKey,
      topicLabel: topic.topicLabel,
      isCarryover,
      itemType: story.isNewMarket
        ? ('market' as const)
        : leadPost?.type === 'article'
          ? ('article' as const)
          : ('post' as const),
      anchorPostId:
        story.anchorPostId ??
        enrichedPosts.find((post) => post.authorType !== 'user')?.id ??
        null,
    } satisfies NarrativeStory;
  });

  const rankedStories = diversifyForYouStories(
    rescoredStories.sort(
      (a, b) =>
        (b.finalRankScore ?? b.storyScore) -
        (a.finalRankScore ?? a.storyScore)
    )
  );

  return {
    stories: rankedStories,
    generatedAt: baseResult.generatedAt,
  };
}
