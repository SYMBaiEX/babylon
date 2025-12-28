/**
 * Admin Feedback API
 *
 * Provides endpoints for admins to view and manage game feedback submissions.
 */

import { requireAdmin, successResponse, withErrorHandling } from '@babylon/api';
import { db, desc, eq, feedbacks, ilike, sql, users } from '@babylon/db';
import { and, gte, lte } from 'drizzle-orm';
import type { NextRequest } from 'next/server';

interface FeedbackMetadata {
  feedbackType?: string;
  stepsToReproduce?: string | null;
  screenshotUrl?: string | null;
  rating?: number | null;
  linearIssueId?: string | null;
  linearIssueIdentifier?: string | null;
  linearIssueUrl?: string | null;
}

/**
 * GET /api/admin/feedback
 *
 * Fetches game feedback submissions with optional filtering.
 */
export const GET = withErrorHandling(async (request: NextRequest) => {
  await requireAdmin(request);

  const { searchParams } = new URL(request.url);
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '50', 10), 200);
  const offset = parseInt(searchParams.get('offset') ?? '0', 10);
  const feedbackType = searchParams.get('type'); // bug, feature_request, performance
  const hasLinearIssue = searchParams.get('hasLinearIssue'); // true, false
  const search = searchParams.get('search'); // search in comment
  const fromDate = searchParams.get('fromDate');
  const toDate = searchParams.get('toDate');

  // Build conditions using SQL for JSON field access
  const conditions = [eq(feedbacks.interactionType, 'general_game_feedback')];

  if (feedbackType) {
    conditions.push(
      sql`${feedbacks.metadata}->>'feedbackType' = ${feedbackType}`
    );
  }

  if (hasLinearIssue === 'true') {
    conditions.push(sql`${feedbacks.metadata}->>'linearIssueId' IS NOT NULL`);
  } else if (hasLinearIssue === 'false') {
    conditions.push(sql`${feedbacks.metadata}->>'linearIssueId' IS NULL`);
  }

  if (search) {
    conditions.push(ilike(feedbacks.comment, `%${search}%`));
  }

  if (fromDate) {
    conditions.push(gte(feedbacks.createdAt, new Date(fromDate)));
  }

  if (toDate) {
    conditions.push(lte(feedbacks.createdAt, new Date(toDate)));
  }

  // Fetch feedback with user info via join
  const feedbackItems = await db
    .select({
      id: feedbacks.id,
      score: feedbacks.score,
      comment: feedbacks.comment,
      metadata: feedbacks.metadata,
      createdAt: feedbacks.createdAt,
      fromUserId: feedbacks.fromUserId,
      user: {
        id: users.id,
        username: users.username,
        displayName: users.displayName,
        profileImageUrl: users.profileImageUrl,
        email: users.email,
      },
    })
    .from(feedbacks)
    .leftJoin(users, eq(feedbacks.fromUserId, users.id))
    .where(and(...conditions))
    .orderBy(desc(feedbacks.createdAt))
    .limit(limit)
    .offset(offset);

  // Get total count for pagination
  const countResult = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(feedbacks)
    .where(eq(feedbacks.interactionType, 'general_game_feedback'));
  const totalCount = countResult[0]?.count ?? 0;

  // Get stats by feedback type
  const statsResult = await db
    .select({
      feedbackType: sql<string>`${feedbacks.metadata}->>'feedbackType'`,
      count: sql<number>`COUNT(*)::int`,
    })
    .from(feedbacks)
    .where(eq(feedbacks.interactionType, 'general_game_feedback'))
    .groupBy(sql`${feedbacks.metadata}->>'feedbackType'`);

  // Format response
  const formattedFeedback = feedbackItems.map((item) => {
    const metadata = (item.metadata ?? {}) as FeedbackMetadata;
    return {
      id: item.id,
      feedbackType: metadata.feedbackType ?? 'unknown',
      description: item.comment,
      score: item.score,
      rating: metadata.rating,
      stepsToReproduce: metadata.stepsToReproduce,
      screenshotUrl: metadata.screenshotUrl,
      linearIssue: metadata.linearIssueId
        ? {
            id: metadata.linearIssueId,
            identifier: metadata.linearIssueIdentifier,
            url: metadata.linearIssueUrl,
          }
        : null,
      createdAt: item.createdAt.toISOString(),
      user: item.user?.id
        ? {
            id: item.user.id,
            username: item.user.username,
            displayName: item.user.displayName,
            profileImageUrl: item.user.profileImageUrl,
            email: item.user.email,
          }
        : null,
    };
  });

  return successResponse({
    feedback: formattedFeedback,
    pagination: {
      total: totalCount,
      limit,
      offset,
      hasMore: offset + feedbackItems.length < totalCount,
    },
    stats: {
      total: totalCount,
      byType: Object.fromEntries(
        statsResult.map((s) => [s.feedbackType ?? 'unknown', s.count])
      ),
    },
  });
});
