/**
 * Post data transformation utilities for the feed.
 *
 * `NarrativePost` (from the narrative feed API) has a slightly different shape
 * than the props expected by `PostCard` and `ArticleCard`. These helpers do the
 * mapping in one place so `NarrativeStoryList` and `MixedFeedList` stay in sync.
 */

import type { NarrativePost } from '@babylon/shared';

export function toPostCardData(post: NarrativePost) {
  return {
    id: post.id,
    type: post.type ?? undefined,
    content: post.content,
    articleTitle: post.articleTitle,
    category: post.category,
    authorId: post.authorId,
    authorName: post.authorName,
    authorUsername: post.authorUsername,
    authorProfileImageUrl: post.authorProfileImageUrl,
    timestamp: post.timestamp,
    likeCount: post.likeCount,
    commentCount: post.commentCount,
    shareCount: post.shareCount,
    isLiked: post.isLiked,
    isShared: post.isShared,
  };
}

export function toArticleCardData(post: NarrativePost) {
  return {
    id: post.id,
    type: post.type ?? undefined,
    content: post.content,
    fullContent: post.fullContent,
    articleTitle: post.articleTitle,
    category: post.category,
    imageUrl: post.imageUrl,
    authorId: post.authorId,
    authorName: post.authorName,
    authorUsername: post.authorUsername,
    authorProfileImageUrl: post.authorProfileImageUrl,
    timestamp: post.timestamp,
  };
}
