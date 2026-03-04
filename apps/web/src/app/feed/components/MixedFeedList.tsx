'use client';

import type { CommentPreviewData, FeedPost } from '@babylon/shared';
import { useRouter } from 'next/navigation';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { NewMarketEntry } from '@/app/api/feed/new-markets/route';
import type { NarrativeStory } from '@/app/feed/types/narrative';
import { ArticleCard } from '@/components/articles/ArticleCard';
import type { PostCardProps } from '@/components/posts/PostCard';
import { PostCard } from '@/components/posts/PostCard';
import { InviteFriendsBanner } from '@/components/shared/InviteFriendsBanner';
import { useAuthStore } from '@/stores/authStore';
import { NewMarketCard } from './NewMarketCard';

import { mergeChronologically } from '@/app/feed/utils/feedAlgorithms';

function marketToNarrativeStory(m: NewMarketEntry): NarrativeStory {
  return {
    storyKey: `market:${m.questionNumber}`,
    storyTitle: m.text,
    questionNumber: m.questionNumber,
    arcState: m.arcState,
    storyScore: 0,
    postCount: 0,
    posts: [],
    hasUserPosition: false,
    isNewMarket: true,
    resolutionDate: m.resolutionDate,
    // Pass live market data through for deep-linking and real probability bars
    marketId: m.marketId ?? null,
    yesShares: m.yesShares,
    noShares: m.noShares,
  };
}

// ─── Component ───────────────────────────────────────────────────────────────

interface MixedFeedListProps {
  posts: FeedPost[];
  newMarkets: NewMarketEntry[];
  actorNames: Map<string, string>;
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
  density?: 'default' | 'compact';
}

/**
 * Latest-tab feed renderer that chronologically merges regular posts with
 * new market discovery cards. A market opened 30 minutes ago appears between
 * 25-minute-old and 35-minute-old posts — not batched at the top.
 *
 * When newMarkets is empty this is functionally identical to PostList.
 */
export const MixedFeedList = memo(function MixedFeedList({
  posts,
  newMarkets,
  actorNames,
  hasMore,
  loadingMore,
  onLoadMore,
  density = 'default',
}: MixedFeedListProps) {
  const router = useRouter();
  const { user } = useAuthStore();
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const [bannerDismissed, setBannerDismissed] = useState(false);

  const calculateBannerInterval = useCallback(() => {
    if (!user) return Math.floor(Math.random() * 51) + 50;
    const referralCount = user.referralCount ?? 0;
    const dismissKey = `banner_dismiss_time_${user.id}`;
    const lastDismiss =
      typeof window !== 'undefined' ? localStorage.getItem(dismissKey) : null;
    if (lastDismiss) {
      const daysSinceDismiss =
        (Date.now() - Number.parseInt(lastDismiss)) / 86400000;
      if (daysSinceDismiss < 7) return 999999;
    }
    if (referralCount === 0) return Math.floor(Math.random() * 21) + 30;
    if (referralCount < 5) return Math.floor(Math.random() * 31) + 50;
    if (referralCount < 10) return Math.floor(Math.random() * 41) + 80;
    return Math.floor(Math.random() * 51) + 150;
  }, [user]);

  const bannerInterval = useRef(calculateBannerInterval());

  useEffect(() => {
    const target = loadMoreRef.current;
    if (!target) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry?.isIntersecting && hasMore && !loadingMore) onLoadMore();
      },
      { rootMargin: '200px' }
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [hasMore, loadingMore, onLoadMore]);

  const items = useMemo(
    () => mergeChronologically(posts, newMarkets),
    [posts, newMarkets]
  );

  // Track banner position relative to post items only
  let postIndex = 0;

  return (
    <div className="w-full space-y-0">
      {items.map((item) => {
        if (item.type === 'market') {
          return (
            <NewMarketCard
              key={`market-${item.market.questionNumber}`}
              story={marketToNarrativeStory(item.market)}
            />
          );
        }

        const post = item.post;
        const i = postIndex++;
        const authorId =
          ('authorId' in post ? post.authorId : post.author) || '';
        const authorName =
          actorNames.get(authorId) ||
          ('authorName' in post ? post.authorName : '') ||
          authorId;

        const showBannerAfterThisPost =
          !bannerDismissed && i === bannerInterval.current - 1;

        const postData = {
          id: post.id,
          type: ('type' in post ? post.type : undefined) || undefined,
          content: post.content,
          articleTitle:
            ('articleTitle' in post ? post.articleTitle : null) || null,
          byline: ('byline' in post ? post.byline : null) || null,
          biasScore: ('biasScore' in post ? post.biasScore : null) ?? null,
          category: ('category' in post ? post.category : null) || null,
          authorId,
          authorName,
          authorUsername:
            ('authorUsername' in post ? post.authorUsername : null) || null,
          authorProfileImageUrl:
            'authorProfileImageUrl' in post ? post.authorProfileImageUrl : null,
          timestamp: post.timestamp,
          likeCount:
            ('likeCount' in post ? (post.likeCount as number) : 0) || 0,
          commentCount:
            ('commentCount' in post ? (post.commentCount as number) : 0) || 0,
          shareCount:
            ('shareCount' in post ? (post.shareCount as number) : 0) || 0,
          isLiked:
            ('isLiked' in post ? (post.isLiked as boolean) : false) || false,
          isShared:
            ('isShared' in post ? (post.isShared as boolean) : false) || false,
          isRepost:
            ('isRepost' in post ? (post.isRepost as boolean) : false) || false,
          isQuote:
            ('isQuote' in post ? (post.isQuote as boolean) : false) || false,
          quoteComment:
            ('quoteComment' in post
              ? (post.quoteComment as string | null)
              : null) || null,
          originalPostId:
            ('originalPostId' in post
              ? (post.originalPostId as string | null)
              : null) || null,
          originalPost:
            ('originalPost' in post
              ? (post.originalPost as PostCardProps['post']['originalPost'])
              : null) || null,
          commentPreviews:
            'commentPreviews' in post
              ? (post.commentPreviews as CommentPreviewData[])
              : undefined,
        };

        return (
          <div key={`post-wrapper-${post.id}-${i}`}>
            {postData.type === 'article' ? (
              <ArticleCard post={postData} density={density} />
            ) : (
              <PostCard
                post={postData}
                density={density}
                showCommentInputBar={false}
                onCommentClick={() => {
                  const postId =
                    post.isRepost &&
                    !post.isQuote &&
                    post.originalPostId != null
                      ? post.originalPostId
                      : post.id;
                  router.push(`/post/${postId}`);
                }}
              />
            )}
            {showBannerAfterThisPost && (
              <InviteFriendsBanner
                onDismiss={() => {
                  setBannerDismissed(true);
                  bannerInterval.current = calculateBannerInterval();
                }}
              />
            )}
          </div>
        );
      })}

      <div ref={loadMoreRef} className="h-1 w-full" />

      {loadingMore && (
        <div className="py-4 text-center text-muted-foreground text-sm">
          Loading more posts...
        </div>
      )}

      {!loadingMore && !hasMore && posts.length > 0 && (
        <div className="py-4 text-center text-muted-foreground text-xs">
          You&apos;re all caught up.
        </div>
      )}
    </div>
  );
});
