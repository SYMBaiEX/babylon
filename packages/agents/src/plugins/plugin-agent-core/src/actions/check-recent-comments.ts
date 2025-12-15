/**
 * Check Recent Comments Action
 *
 * Returns the agent's recent comments on posts with full thread context.
 */

import { comments, db, desc, eq, inArray, posts, users } from '@babylon/db';
import type {
  Action,
  ActionResult,
  HandlerCallback,
  IAgentRuntime,
  Memory,
  State,
} from '@elizaos/core';
import { logger } from '../../../../shared/logger';

/**
 * Format relative time (e.g., "2h ago", "15m ago")
 */
function getTimeAgo(date: Date): string {
  const now = Date.now();
  const diffMs = now - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${diffDays}d ago`;
}

interface ThreadMessage {
  authorName: string;
  content: string;
  isYou: boolean;
}

interface CommentWithThread {
  id: string;
  content: string;
  timeAgo: string;
  post: {
    id: string;
    content: string;
    authorName: string;
  };
  thread: ThreadMessage[];
  isReply: boolean;
}

/**
 * Build thread by walking UP from a comment to its ancestors
 */
async function buildThread(
  commentId: string,
  agentId: string,
  maxDepth = 5
): Promise<ThreadMessage[]> {
  const thread: ThreadMessage[] = [];
  let currentId: string | null = commentId;
  let depth = 0;

  while (currentId && depth < maxDepth) {
    const [comment] = await db
      .select({
        id: comments.id,
        content: comments.content,
        authorId: comments.authorId,
        parentCommentId: comments.parentCommentId,
        authorName: users.displayName,
        authorUsername: users.username,
      })
      .from(comments)
      .leftJoin(users, eq(comments.authorId, users.id))
      .where(eq(comments.id, currentId))
      .limit(1);

    if (!comment) break;

    thread.unshift({
      authorName:
        comment.authorId === agentId
          ? 'You'
          : comment.authorName || comment.authorUsername || 'User',
      content: comment.content,
      isYou: comment.authorId === agentId,
    });

    currentId = comment.parentCommentId;
    depth++;
  }

  return thread;
}

/**
 * CHECK_RECENT_COMMENTS Action
 *
 * Returns the agent's recent comments with full thread context.
 */
export const checkRecentCommentsAction: Action = {
  name: 'CHECK_RECENT_COMMENTS',
  description:
    "Check the agent's recent comments on posts with full thread context",

  parameters: {
    limit: {
      type: 'number',
      description: 'Number of comments to retrieve (default: 5, max: 10)',
      required: false,
    },
  },

  examples: [
    [
      {
        name: 'User',
        content: { text: 'What have you commented on recently?' },
      },
      {
        name: 'Agent',
        content: {
          text: 'Let me check my recent comments...',
          actions: ['CHECK_RECENT_COMMENTS'],
        },
      },
    ],
    [
      {
        name: 'User',
        content: { text: 'Show me your recent comments' },
      },
      {
        name: 'Agent',
        content: {
          text: 'Checking my recent comments...',
          actions: ['CHECK_RECENT_COMMENTS'],
        },
      },
    ],
  ],

  validate: async (
    _runtime: IAgentRuntime,
    _message: Memory,
    _state?: State
  ): Promise<boolean> => {
    return true;
  },

  handler: async (
    runtime: IAgentRuntime,
    _message: Memory,
    state?: State,
    _options?: Record<string, unknown>,
    _callback?: HandlerCallback
  ): Promise<ActionResult> => {
    const agentId = runtime.agentId;

    // Get limit from params (default 5, max 10 to avoid too long response)
    const actionParams = state?.data?.actionParams as
      | { limit?: number }
      | undefined;
    const limit = Math.min(Math.max(actionParams?.limit ?? 5, 1), 10);

    try {
      // Get recent comments
      const recentComments = await db
        .select({
          id: comments.id,
          content: comments.content,
          createdAt: comments.createdAt,
          postId: comments.postId,
          parentCommentId: comments.parentCommentId,
        })
        .from(comments)
        .where(eq(comments.authorId, agentId))
        .orderBy(desc(comments.createdAt))
        .limit(limit);

      if (recentComments.length === 0) {
        return {
          success: true,
          text: "You haven't commented on anything yet.",
          data: { comments: [], count: 0 },
          values: { comments: [], count: 0, hasComments: false },
        };
      }

      // Get all unique post IDs
      const postIds = [...new Set(recentComments.map((c) => c.postId))];

      // Fetch posts with author info
      const postsData = await db
        .select({
          id: posts.id,
          content: posts.content,
          authorId: posts.authorId,
          authorName: users.displayName,
          authorUsername: users.username,
        })
        .from(posts)
        .leftJoin(users, eq(posts.authorId, users.id))
        .where(inArray(posts.id, postIds));

      const postMap = new Map(postsData.map((p) => [p.id, p]));

      // Build full comment data with threads
      const formattedComments: CommentWithThread[] = [];

      for (const comment of recentComments) {
        const post = postMap.get(comment.postId);
        const isReply = !!comment.parentCommentId;

        // Build thread context if it's a reply
        const thread = isReply
          ? await buildThread(comment.id, agentId)
          : [
              {
                authorName: 'You',
                content: comment.content,
                isYou: true,
              },
            ];

        formattedComments.push({
          id: comment.id,
          content: comment.content,
          timeAgo: getTimeAgo(comment.createdAt),
          post: {
            id: comment.postId,
            content: post?.content || '[Post unavailable]',
            authorName:
              post?.authorId === agentId
                ? 'You'
                : post?.authorName || post?.authorUsername || 'User',
          },
          thread,
          isReply,
        });
      }

      // Format for display
      const sections = formattedComments.map((c, i) => {
        const postAuthor =
          c.post.authorName === 'You' ? 'your post' : `@${c.post.authorName}`;
        const header = `${i + 1}. On ${postAuthor} (${c.timeAgo}):`;

        // Show post content
        const postLine = `   POST: "${c.post.content}"`;

        // Show thread if it's a reply with context
        let threadLines = '';
        if (c.isReply && c.thread.length > 1) {
          threadLines =
            '\n   THREAD:\n' +
            c.thread
              .map(
                (msg, idx) =>
                  `   ${idx === c.thread.length - 1 ? '→' : '  '} @${msg.authorName}: "${msg.content}"`
              )
              .join('\n');
        } else {
          threadLines = `\n   YOUR COMMENT: "${c.content}"`;
        }

        return `${header}\n${postLine}${threadLines}`;
      });

      const responseText = `Your recent comments:\n\n${sections.join('\n\n')}`;

      logger.info(
        `[CHECK_RECENT_COMMENTS] Retrieved ${recentComments.length} comments with threads`,
        undefined,
        'CheckRecentComments'
      );

      return {
        success: true,
        text: responseText,
        data: { comments: formattedComments, count: recentComments.length },
        values: {
          comments: formattedComments,
          count: recentComments.length,
          hasComments: true,
        },
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      logger.error('[CHECK_RECENT_COMMENTS] Error:', errorMsg);

      return {
        success: false,
        text: `Failed to retrieve comments: ${errorMsg}`,
        data: { error: errorMsg },
        values: { error: errorMsg },
      };
    }
  },
};
