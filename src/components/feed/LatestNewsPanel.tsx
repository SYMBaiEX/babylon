'use client'

import { logger } from '@/lib/logger'
import { AlertCircle, Newspaper, TrendingUp } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
// ArticleDetailModal removed - articles now use /post/[id] page
import { useWidgetRefresh } from '@/contexts/WidgetRefreshContext'
import { useWidgetCacheStore } from '@/stores/widgetCacheStore'
import { Skeleton } from '@/components/shared/Skeleton'

/**
 * Article item structure for latest news panel.
 */
interface ArticleItem {
  id: string
  title: string
  summary: string
  authorOrgName: string
  byline?: string
  sentiment?: string
  category?: string
  publishedAt: string
  relatedQuestion?: number
  slant?: string
  biasScore?: number
}

/**
 * Latest news panel component for displaying recent articles.
 * 
 * Displays a list of the latest articles from the feed. Uses widget cache
 * for performance and supports manual refresh via WidgetRefreshContext.
 * Fetches articles from posts API filtered by type=article.
 * 
 * Features:
 * - Article list with metadata
 * - Widget caching
 * - Manual refresh support
 * - Loading states
 * - Empty state handling
 * 
 * @returns Latest news panel element
 */
export function LatestNewsPanel() {
  const [articles, setArticles] = useState<ArticleItem[]>([])
  const [loading, setLoading] = useState(true)
  const { getLatestNews, setLatestNews } = useWidgetCacheStore()
  const { registerRefresh, unregisterRefresh } = useWidgetRefresh()

  // Use ref to store fetchArticles function to break dependency chain
  const fetchArticlesRef = useRef<(() => void) | null>(null)

  /**
   * Deduplicate articles about the same event
   * Uses improved heuristics: combines category, title similarity, and publish time proximity
   */
  const deduplicateArticles = (articles: ArticleItem[]): ArticleItem[] => {
    if (articles.length <= 1) return articles

    const uniqueArticles: ArticleItem[] = []
    const seenArticles: Array<{
      article: ArticleItem
      titleWords: Set<string>
      timestamp: number
    }> = []

    // Sort by published date (most recent first)
    const sorted = [...articles].sort((a, b) => 
      new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
    )

    for (const article of sorted) {
      // Extract significant words from title (3+ chars, excluding common words)
      const commonWords = new Set(['the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'her', 'was', 'one', 'our', 'out', 'day', 'has'])
      const titleWords = new Set(
        article.title
          .toLowerCase()
          .replace(/[^a-z0-9\s]/g, '')
          .split(' ')
          .filter(w => w.length > 3 && !commonWords.has(w))
      )

      const timestamp = new Date(article.publishedAt).getTime()
      
      // Check if this is a duplicate of an existing article
      let isDuplicate = false
      for (const seen of seenArticles) {
        // Rule 1: Same category + significant title overlap + published within 6 hours
        const timeDiff = Math.abs(timestamp - seen.timestamp)
        const isSameTimeWindow = timeDiff < 6 * 60 * 60 * 1000 // 6 hours

        if (isSameTimeWindow && article.category === seen.article.category) {
          // Calculate word overlap
          const intersection = new Set([...titleWords].filter(w => seen.titleWords.has(w)))
          const union = new Set([...titleWords, ...seen.titleWords])
          const jaccardSimilarity = intersection.size / union.size

          // If 40%+ similar titles in same category and time window, it's likely the same event
          if (jaccardSimilarity >= 0.4) {
            isDuplicate = true
            logger.debug('Duplicate article detected', {
              kept: seen.article.title,
              discarded: article.title,
              similarity: jaccardSimilarity,
              timeDiffMinutes: Math.round(timeDiff / 60000),
            }, 'LatestNewsPanel')
            break
          }
        }

        // Rule 2: Very high title similarity (70%+) regardless of category = same event
        const intersection = new Set([...titleWords].filter(w => seen.titleWords.has(w)))
        const union = new Set([...titleWords, ...seen.titleWords])
        const jaccardSimilarity = intersection.size / union.size

        if (jaccardSimilarity >= 0.7) {
          isDuplicate = true
          logger.debug('Duplicate article detected (high similarity)', {
            kept: seen.article.title,
            discarded: article.title,
            similarity: jaccardSimilarity,
          }, 'LatestNewsPanel')
          break
        }
      }

      if (!isDuplicate) {
        uniqueArticles.push(article)
        seenArticles.push({ article, titleWords, timestamp })
      }
    }

    logger.debug('Deduplicated articles', {
      before: articles.length,
      after: uniqueArticles.length,
      removed: articles.length - uniqueArticles.length,
    }, 'LatestNewsPanel')

    return uniqueArticles
  }

  const fetchArticles = useCallback(async (skipCache = false) => {
    // Check cache first (unless explicitly skipping)
    if (!skipCache) {
      const cached = getLatestNews()
      // Only use cache if it has data (don't cache empty arrays)
      if (cached && Array.isArray(cached) && cached.length > 0) {
        setArticles(cached as ArticleItem[])
        setLoading(false)
        return
      }
    }

    // Query posts API with type filter for articles - fetch more for deduplication
    const response = await fetch('/api/posts?type=article&limit=15')
    
    if (!response.ok) {
      logger.error('Failed to fetch articles:', { status: response.status }, 'LatestNewsPanel')
      setArticles([])
      setLoading(false)
      return
    }
    
    const data = await response.json()
    
    logger.info('Articles API response:', { 
      hasPosts: !!data.posts, 
      count: data.posts?.length || 0,
      firstPost: data.posts?.[0] 
    }, 'LatestNewsPanel')
    
    if (data.posts && Array.isArray(data.posts) && data.posts.length > 0) {
      // Transform posts to ArticleItem format
      const articlesData: ArticleItem[] = data.posts
        .filter((post: { type?: string }) => post.type === 'article') // Double-check type
        .map((post: {
          id: string;
          articleTitle?: string | null;
          authorId: string;
          authorName?: string;
          byline?: string | null;
          sentiment?: string | null;
          category?: string | null;
          timestamp: string;
          biasScore?: number | null;
          slant?: string | null;
          content: string;
        }) => ({
          id: post.id,
          title: post.articleTitle || 'Untitled Article',
          summary: post.content,
          authorOrgName: post.authorName || post.authorId,
          byline: post.byline || undefined,
          sentiment: post.sentiment || undefined,
          category: post.category || undefined,
          publishedAt: post.timestamp,
          slant: post.slant || undefined,
          biasScore: post.biasScore !== null ? post.biasScore : undefined,
        }))
      
      // Deduplicate articles about the same event
      const uniqueArticles = deduplicateArticles(articlesData).slice(0, 5)
      
      logger.info('Articles processed:', { count: uniqueArticles.length, articles: uniqueArticles }, 'LatestNewsPanel')
      setArticles(uniqueArticles)
      setLatestNews(uniqueArticles) // Cache the data
    } else {
      logger.warn('No articles in response', { 
        hasData: !!data,
        hasPosts: !!data.posts,
        isArray: Array.isArray(data.posts),
        length: data.posts?.length 
      }, 'LatestNewsPanel')
      setArticles([])
    }
    setLoading(false)
  }, [getLatestNews, setLatestNews])

  // Update ref when fetchArticles changes
  useEffect(() => {
    fetchArticlesRef.current = () => fetchArticles(true) // Skip cache on manual refresh
  }, [fetchArticles])

  useEffect(() => {
    fetchArticles()
  }, [fetchArticles])

  // Register refresh function
  useEffect(() => {
    const refresh = () => fetchArticles(true)
    registerRefresh('latest-news', refresh)
    return () => unregisterRefresh('latest-news')
  }, [registerRefresh, unregisterRefresh, fetchArticles])

  // Note: Real-time updates via SSE removed - using manual pull-to-refresh

  const getSentimentIcon = (sentiment?: string) => {
    switch (sentiment) {
      case 'positive':
        return <TrendingUp className="w-4 h-4 text-green-500" />
      case 'negative':
        return <AlertCircle className="w-4 h-4 text-red-500" />
      default:
        return <Newspaper className="w-4 h-4 text-[#0066FF]" />
    }
  }

  const getTimeAgo = (timestamp: string) => {
    const now = Date.now()
    const diff = now - new Date(timestamp).getTime()
    const hours = Math.floor(diff / (1000 * 60 * 60))
    const minutes = Math.floor(diff / (1000 * 60))

    if (hours > 0) {
      return `${hours}h ago`
    }
    if (minutes > 0) {
      return `${minutes}m ago`
    }
    return 'Just now'
  }

  const handleArticleClick = (articleId: string) => {
    // Navigate to post detail page (will redirect to /article/[id] if needed)
    window.location.href = `/post/${articleId}`
  }

  return (
    <>
      <div className="bg-sidebar rounded-2xl p-4 flex-1 flex flex-col">
        <h2 className="text-lg font-bold text-foreground mb-3 text-left">Latest News</h2>
        {loading ? (
          <div className="space-y-3 pl-3 flex-1">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : articles.length === 0 ? (
          <div className="text-sm text-muted-foreground pl-3 flex-1">No articles available yet.</div>
        ) : (
          <div className="space-y-2 pl-3 flex-1">
            {articles.map((article) => (
              <div
                key={article.id}
                onClick={() => handleArticleClick(article.id)}
                className="flex items-start gap-3 cursor-pointer hover:bg-muted/50 rounded-lg p-1.5 -ml-1.5 transition-colors duration-200"
              >
                <div className="mt-0.5 shrink-0">
                  {getSentimentIcon(article.sentiment)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground leading-snug">
                    {article.title}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {article.authorOrgName} · {getTimeAgo(article.publishedAt)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

    </>
  )
}

