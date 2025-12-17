/**
 * CHECK_POST_DETAIL Action
 *
 * Returns detailed information about a post including all comments with thread structure.
 * Shows IDs for each comment so agent can reference them for replies.
 */

import { and, comments, db, desc, eq, isNull, posts, users } from '@babylon/db';
import type {
  Action,
  ActionResult,
  HandlerCallback,
  IAgentRuntime,
  Memory,
  State,
} from '@elizaos/core';
import { logger } from '../../../../shared/logger';

interface CommentWithAuthor {
  id: string;
  content: string;
  authorId: string;
  parentCommentId: string | null;
  createdAt: Date;
  authorName: string;
}

interface CommentThread {
  id: string;
  author: string;
  content: string;
  depth: number;
  createdAt: Date;
  replies: CommentThread[];
}

/**
 * Build a tree structure from flat comments
 */
function buildCommentTree(
  flatComments: CommentWithAuthor[],
  agentUserId: string
): CommentThread[] {
  const commentMap = new Map<string, CommentThread>();
  const rootComments: CommentThread[] = [];

  // First pass: create all comment nodes
  for (const comment of flatComments) {
    const authorLabel =
      comment.authorId === agentUserId ? 'You' : comment.authorName;
    commentMap.set(comment.id, {
      id: comment.id,
      author: authorLabel,
      content: comment.content,
      depth: 0,
      createdAt: comment.createdAt,
      replies: [],
    });
  }

  // Second pass: build tree structure
  for (const comment of flatComments) {
    const node = commentMap.get(comment.id);
    if (!node) continue;

    if (comment.parentCommentId) {
      const parent = commentMap.get(comment.parentCommentId);
      if (parent) {
        node.depth = parent.depth + 1;
        parent.replies.push(node);
      } else {
        // Parent not found, treat as root
        rootComments.push(node);
      }
    } else {
      rootComments.push(node);
    }
  }

  // Sort by createdAt
  rootComments.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

  return rootComments;
}

/**
 * Format comment tree for display
 */
function formatCommentTree(
  threads: CommentThread[],
  maxDepth = 10
): {
  formatted: string;
  comments: Array<{
    id: string;
    author: string;
    content: string;
    depth: number;
  }>;
} {
  const allComments: Array<{
    id: string;
    author: string;
    content: string;
    depth: number;
  }> = [];
  const lines: string[] = [];

  function traverse(node: CommentThread, depth: number) {
    if (depth > maxDepth) return;

    const indent = '  '.repeat(depth);
    const truncatedContent =
      node.content.length > 150
        ? `${node.content.substring(0, 150)}...`
        : node.content;

    lines.push(
      `${indent}[ID: ${node.id}] @${node.author}: "${truncatedContent}"`
    );
    allComments.push({
      id: node.id,
      author: node.author,
      content: truncatedContent,
      depth,
    });

    // Sort replies by time
    const sortedReplies = [...node.replies].sort(
      (a, b) => a.createdAt.getTime() - b.createdAt.getTime()
    );

    for (const reply of sortedReplies) {
      traverse(reply, depth + 1);
    }
  }

  for (const thread of threads) {
    traverse(thread, 0);
  }

  return { formatted: lines.join('\n'), comments: allComments };
}

export const checkPostDetailAction: Action = {
  name: 'CHECK_POST_DETAIL',
  description:
    'Get detailed information about a post including all comments with thread structure.',

  parameters: {
    postId: {
      type: 'string',
      description: 'The ID of the post to retrieve',
      required: true,
    },
  },

  examples: [
    [
      {
        name: 'user',
        content: { text: 'Show me post 123456' },
      },
      {
        name: 'assistant',
        content: { text: 'Let me get the details of that post...' },
      },
    ],
    [
      {
        name: 'user',
        content: { text: 'What are people saying on that post?' },
      },
      {
        name: 'assistant',
        content: { text: "I'll check the comments on that post..." },
      },
    ],
  ],

  validate: async (
    _runtime: IAgentRuntime,
    _message: Memory,
    _state?: State
  ): Promise<boolean> => true,

  handler: async (
    runtime: IAgentRuntime,
    _message: Memory,
    state?: State,
    _options?: Record<string, unknown>,
    _callback?: HandlerCallback
  ): Promise<ActionResult> => {
    const agentUserId = runtime.agentId;
    const actionParams = state?.data?.actionParams as
      | { postId?: string }
      | undefined;
    const postId = actionParams?.postId;

    if (!postId) {
      return {
        success: false,
        text: 'Missing postId parameter. Please provide the post ID.',
        error: 'Missing postId',
      };
    }

    try {
      // Get post with author
      const [post] = await db
        .select({
          id: posts.id,
          content: posts.content,
          authorId: posts.authorId,
          createdAt: posts.createdAt,
          authorUsername: users.username,
          authorDisplayName: users.displayName,
        })
        .from(posts)
        .leftJoin(users, eq(posts.authorId, users.id))
        .where(eq(posts.id, postId))
        .limit(1);

      if (!post) {
        return {
          success: false,
          text: `Post not found with ID: ${postId}`,
          error: 'Post not found',
        };
      }

      // Get all comments on this post
      const postComments = await db
        .select({
          id: comments.id,
          content: comments.content,
          authorId: comments.authorId,
          parentCommentId: comments.parentCommentId,
          createdAt: comments.createdAt,
          authorUsername: users.username,
          authorDisplayName: users.displayName,
        })
        .from(comments)
        .leftJoin(users, eq(comments.authorId, users.id))
        .where(and(eq(comments.postId, postId), isNull(comments.deletedAt)))
        .orderBy(desc(comments.createdAt));

      // Transform to our format
      const commentsWithAuthor: CommentWithAuthor[] = postComments.map(
        (c: (typeof postComments)[number]) => ({
          id: c.id,
          content: c.content,
          authorId: c.authorId,
          parentCommentId: c.parentCommentId,
          createdAt: c.createdAt,
          authorName: c.authorDisplayName || c.authorUsername || 'User',
        })
      );

      // Build comment tree
      const commentTree = buildCommentTree(commentsWithAuthor, agentUserId);
      const { formatted: formattedComments, comments: commentsList } =
        formatCommentTree(commentTree);

      const postAuthorName =
        post.authorId === agentUserId
          ? 'You'
          : post.authorDisplayName || post.authorUsername || 'User';

      const responseText = `Post [ID: ${post.id}] by @${postAuthorName}:
"${post.content}"

${postComments.length > 0 ? `Comments (${postComments.length}):\n${formattedComments}` : 'No comments yet.'}`;

      logger.info(
        `[CHECK_POST_DETAIL] Retrieved post ${postId} with ${postComments.length} comments`,
        undefined,
        'CheckPostDetail'
      );

      return {
        success: true,
        text: `Retrieved post with ${postComments.length} comments. Use comment IDs with CREATE_COMMENT to reply.`,
        data: {
          post: {
            id: post.id,
            content: post.content,
            author: postAuthorName,
            authorId: post.authorId,
            createdAt: post.createdAt,
          },
          comments: commentsWithAuthor,
          formattedView: responseText,
        },
        values: {
          postId: post.id,
          postAuthor: postAuthorName,
          postContent: post.content.substring(0, 200),
          commentCount: postComments.length,
          comments: commentsList,
        },
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      logger.error('[CHECK_POST_DETAIL] Error:', errorMsg);

      return {
        success: false,
        text: `Failed to retrieve post: ${errorMsg}`,
        error: errorMsg,
      };
    }
  },
};
