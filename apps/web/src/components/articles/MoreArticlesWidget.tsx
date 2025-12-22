'use client';

import { Newspaper } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Skeleton } from '@/components/shared/Skeleton';

interface ArticlePreview {
  id: string;
  articleTitle: string | null;
  content: string;
  imageUrl: string | null;
  authorName: string;
  timestamp: string;
}

interface MoreArticlesWidgetProps {
  /** Current article ID to exclude from the list */
  currentArticleId: string;
  /** Maximum number of articles to show */
  limit?: number;
  /** Optional className for styling */
  className?: string;
}

/**
 * Widget displaying additional articles for readers to explore.
 * Fetches recent articles excluding the current one being viewed.
 */
export function MoreArticlesWidget({
  currentArticleId,
  limit = 5,
  className,
}: MoreArticlesWidgetProps) {
  const [articles, setArticles] = useState<ArticlePreview[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchArticles = async () => {
      setIsLoading(true);

      const response = await fetch(`/api/posts?type=article&limit=${limit + 1}`);

      if (!response.ok) {
        setIsLoading(false);
        return;
      }

      const result = await response.json();
      const posts = result.data || result.posts || [];

      // Filter out the current article and limit results
      const filteredArticles = posts
        .filter((post: ArticlePreview) => post.id !== currentArticleId)
        .slice(0, limit);

      setArticles(filteredArticles);
      setIsLoading(false);
    };

    fetchArticles();
  }, [currentArticleId, limit]);

  // Format relative time
  const formatTimeAgo = (timestamp: string): string => {
    const now = new Date();
    const date = new Date(timestamp);
    const diffMs = now.getTime() - date.getTime();
    const diffMinutes = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMinutes < 1) return 'Just now';
    if (diffMinutes < 60) return `${diffMinutes}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;

    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
  };

  if (isLoading) {
    return (
      <div className={className}>
        <div className="mb-4 flex items-center gap-2">
          <Newspaper className="h-5 w-5 text-[#0066FF]" />
          <h3 className="font-semibold text-foreground">More Articles</h3>
        </div>
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex gap-3">
              <Skeleton className="h-16 w-20 shrink-0 rounded-md" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-3 w-2/3" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (articles.length === 0) {
    return null;
  }

  return (
    <div className={className}>
      <div className="mb-4 flex items-center gap-2">
        <Newspaper className="h-5 w-5 text-[#0066FF]" />
        <h3 className="font-semibold text-foreground">More Articles</h3>
      </div>

      <div className="space-y-4">
        {articles.map((article) => (
          <Link
            key={article.id}
            href={`/article/${article.id}`}
            className="group flex gap-3 rounded-lg p-2 transition-colors hover:bg-muted/50"
          >
            {/* Thumbnail */}
            {article.imageUrl ? (
              <div className="relative h-16 w-20 shrink-0 overflow-hidden rounded-md">
                <Image
                  src={article.imageUrl}
                  alt={article.articleTitle || 'Article thumbnail'}
                  fill
                  className="object-cover transition-transform group-hover:scale-105"
                  sizes="80px"
                />
              </div>
            ) : (
              <div className="flex h-16 w-20 shrink-0 items-center justify-center rounded-md bg-muted">
                <Newspaper className="h-6 w-6 text-muted-foreground" />
              </div>
            )}

            {/* Article info */}
            <div className="flex min-w-0 flex-1 flex-col justify-center">
              <h4 className="line-clamp-2 font-medium text-foreground text-sm leading-tight transition-colors group-hover:text-[#0066FF]">
                {article.articleTitle || 'Untitled Article'}
              </h4>
              <div className="mt-1 flex items-center gap-2 text-muted-foreground text-xs">
                <span className="truncate">{article.authorName}</span>
                <span>·</span>
                <span className="shrink-0">{formatTimeAgo(article.timestamp)}</span>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
