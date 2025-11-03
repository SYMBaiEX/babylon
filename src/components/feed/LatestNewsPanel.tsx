'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { Newspaper, TrendingUp, AlertCircle } from 'lucide-react'
import { logger } from '@/lib/logger'
import { useChannelSubscription } from '@/hooks/useChannelSubscription'
import { ArticleDetailModal } from './ArticleDetailModal'
import { useWidgetCacheStore } from '@/stores/widgetCacheStore'

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

export function LatestNewsPanel() {
  const [articles, setArticles] = useState<ArticleItem[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedArticle, setSelectedArticle] = useState<string | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const { getLatestNews, setLatestNews } = useWidgetCacheStore()

  // Use ref to store fetchArticles function to break dependency chain
  const fetchArticlesRef = useRef<(() => void) | null>(null)

  // Force close modal on HMR to prevent stuck state
  useEffect(() => {
    return () => {
      setIsModalOpen(false)
      setSelectedArticle(null)
    }
  }, [])

  const fetchArticles = useCallback(async (skipCache = false) => {
    // Check cache first (unless explicitly skipping)
    if (!skipCache) {
      const cached = getLatestNews()
      if (cached) {
        setArticles(cached as ArticleItem[])
        setLoading(false)
        return
      }
    }

    try {
      const response = await fetch('/api/feed/widgets/latest-news')
      const data = await response.json()
      if (data.success) {
        const articlesData = data.articles || []
        setArticles(articlesData)
        setLatestNews(articlesData) // Cache the data
      }
    } catch (error) {
      logger.error('Error fetching latest news:', error, 'LatestNewsPanel')
    } finally {
      setLoading(false)
    }
  }, [getLatestNews, setLatestNews])

  // Update ref when fetchArticles changes
  useEffect(() => {
    fetchArticlesRef.current = () => fetchArticles(true) // Skip cache on manual refresh
  }, [fetchArticles])

  useEffect(() => {
    fetchArticles()
  }, [fetchArticles])

  // Subscribe to articles channel for real-time updates
  const handleChannelUpdate = useCallback((data: Record<string, unknown>) => {
    if (data.type === 'new_article') {
      // Refresh articles when new article arrives
      logger.debug('New article received, refreshing...', { data }, 'LatestNewsPanel')
      // Use ref to avoid dependency on fetchArticles
      fetchArticlesRef.current?.()
    }
  }, []) // Empty dependency array prevents re-creation

  useChannelSubscription('articles', handleChannelUpdate)

  const getSentimentIcon = (sentiment?: string) => {
    switch (sentiment) {
      case 'positive':
        return <TrendingUp className="w-6 h-6 sm:w-7 sm:h-7 text-green-500" />
      case 'negative':
        return <AlertCircle className="w-6 h-6 sm:w-7 sm:h-7 text-red-500" />
      default:
        return <Newspaper className="w-6 h-6 sm:w-7 sm:h-7 text-[#1c9cf0]" />
    }
  }

  const getBiasIndicator = (biasScore?: number) => {
    if (!biasScore || Math.abs(biasScore) < 0.3) return null;
    
    const isPositive = biasScore > 0;
    const strength = Math.abs(biasScore);
    
    return (
      <span 
        className="text-xs font-semibold ml-1" 
        style={{ color: isPositive ? '#10b981' : '#ef4444' }}
        title={`Bias: ${isPositive ? 'Favorable' : 'Critical'} (${Math.abs(biasScore).toFixed(2)})`}
      >
        {isPositive ? '↗' : '↘'}
      </span>
    );
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
    setSelectedArticle(articleId)
    setIsModalOpen(true)
  }

  const handleCloseModal = () => {
    setIsModalOpen(false)
    setSelectedArticle(null)
  }

  return (
    <>
      <div className="bg-sidebar rounded-lg p-4 flex-1 flex flex-col">
        <h2 className="text-xl sm:text-2xl font-bold text-foreground mb-3 text-left">Latest News</h2>
        {loading ? (
          <div className="text-base text-muted-foreground pl-3 flex-1">Loading...</div>
        ) : articles.length === 0 ? (
          <div className="text-base text-muted-foreground pl-3 flex-1">No articles available yet.</div>
        ) : (
          <div className="space-y-2.5 pl-3 flex-1">
            {articles.map((article) => (
              <div
                key={article.id}
                onClick={() => handleArticleClick(article.id)}
                className="flex items-start gap-2.5 cursor-pointer hover:bg-muted/50 rounded-lg p-1.5 -ml-1.5 transition-colors duration-200"
              >
                <div className="mt-0.5 flex-shrink-0">
                  {getSentimentIcon(article.sentiment)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-lg sm:text-xl font-semibold text-foreground leading-relaxed">
                    {article.title}
                    {getBiasIndicator(article.biasScore)}
                  </p>
                  <p className="text-sm sm:text-base text-muted-foreground mt-0.5">
                    {article.authorOrgName}
                    {article.byline && ` · ${article.byline}`}
                  </p>
                  <p className="text-sm text-muted-foreground/80 mt-1">
                    {getTimeAgo(article.publishedAt)}
                    {article.category && (
                      <span className="ml-2 text-[#1c9cf0] font-semibold">
                        {article.category}
                      </span>
                    )}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <ArticleDetailModal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        articleId={selectedArticle}
      />
    </>
  )
}

