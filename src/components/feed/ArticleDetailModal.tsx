'use client'

import { useEffect, useState } from 'react'
import { X, Newspaper, TrendingUp, AlertCircle, ExternalLink } from 'lucide-react'
import { logger } from '@/lib/logger'

interface Article {
  id: string
  title: string
  summary: string
  content: string
  authorOrgId: string
  authorOrgName: string
  byline?: string
  bylineActorId?: string
  biasScore?: number
  sentiment?: string
  slant?: string
  imageUrl?: string
  relatedEventId?: string
  relatedQuestion?: number
  relatedActorIds: string[]
  relatedOrgIds: string[]
  category?: string
  tags: string[]
  viewCount: number
  shareCount: number
  publishedAt: string
  createdAt: string
  updatedAt: string
}

interface ArticleDetailModalProps {
  isOpen: boolean
  onClose: () => void
  articleId: string | null
}

export function ArticleDetailModal({ isOpen, onClose, articleId }: ArticleDetailModalProps) {
  const [article, setArticle] = useState<Article | null>(null)
  const [loading, setLoading] = useState(false)

  // Fetch article when modal opens
  useEffect(() => {
    if (!isOpen || !articleId) {
      setArticle(null)
      return
    }

    const fetchArticle = async () => {
      setLoading(true)
      try {
        const response = await fetch(`/api/articles/${articleId}`)
        const data = await response.json()
        if (data.success) {
          setArticle(data.article)
        } else {
          logger.error('Failed to fetch article:', data.error, 'ArticleDetailModal')
        }
      } catch (error) {
        logger.error('Error fetching article:', error, 'ArticleDetailModal')
      } finally {
        setLoading(false)
      }
    }

    fetchArticle()
  }, [isOpen, articleId])

  // Handle escape key and body scroll lock
  useEffect(() => {
    if (!isOpen) {
      // Ensure body overflow is reset when modal is closed
      document.body.style.overflow = ''
      return
    }

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }

    document.addEventListener('keydown', handleEscape)
    // Prevent body scroll when modal is open
    document.body.style.overflow = 'hidden'

    return () => {
      document.removeEventListener('keydown', handleEscape)
      document.body.style.overflow = ''
    }
  }, [isOpen, onClose])

  // Cleanup on unmount (for HMR)
  useEffect(() => {
    return () => {
      document.body.style.overflow = ''
    }
  }, [])

  if (!isOpen) return null

  const getSentimentIcon = (sentiment?: string) => {
    switch (sentiment) {
      case 'positive':
        return <TrendingUp className="w-8 h-8 text-green-500" />
      case 'negative':
        return <AlertCircle className="w-8 h-8 text-red-500" />
      default:
        return <Newspaper className="w-8 h-8 text-[#1c9cf0]" />
    }
  }

  const formatDate = (timestamp: string) => {
    const date = new Date(timestamp)
    return date.toLocaleString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    })
  }

  const getBiasDescription = (biasScore?: number) => {
    if (!biasScore) return 'Neutral reporting';
    
    const absScore = Math.abs(biasScore);
    if (absScore < 0.3) return 'Mostly neutral';
    if (absScore < 0.6) return biasScore > 0 ? 'Somewhat favorable' : 'Somewhat critical';
    return biasScore > 0 ? 'Highly favorable' : 'Highly critical';
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-4xl">
        <div className="bg-[#1e1e1e] border border-white/10 rounded-lg shadow-2xl p-6 m-4 animate-in fade-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
          {loading ? (
            <div className="text-center py-8">
              <p className="text-white">Loading article...</p>
            </div>
          ) : !article ? (
            <div className="text-center py-8">
              <p className="text-white">Article not found</p>
            </div>
          ) : (
            <>
              {/* Header */}
              <div className="flex items-start justify-between mb-6">
                <div className="flex items-start gap-4 flex-1">
                  <div className="mt-1 flex-shrink-0">
                    {getSentimentIcon(article.sentiment)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h1 className="text-2xl sm:text-3xl font-bold text-white mb-3 leading-tight">
                      {article.title}
                    </h1>
                    <div className="flex flex-wrap items-center gap-2 text-sm text-gray-400 mb-2">
                      <span className="font-semibold text-[#1c9cf0]">{article.authorOrgName}</span>
                      {article.byline && (
                        <>
                          <span>·</span>
                          <span>By {article.byline}</span>
                        </>
                      )}
                      <span>·</span>
                      <span>{formatDate(article.publishedAt)}</span>
                    </div>
                    {article.category && (
                      <div className="flex items-center gap-2 mb-2">
                        <span className="px-2 py-1 bg-[#1c9cf0]/20 text-[#1c9cf0] text-xs font-semibold rounded">
                          {article.category.toUpperCase()}
                        </span>
                        {article.biasScore && Math.abs(article.biasScore) >= 0.3 && (
                          <span className="px-2 py-1 bg-yellow-500/20 text-yellow-500 text-xs font-semibold rounded">
                            BIASED: {getBiasDescription(article.biasScore)}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  className="text-gray-400 hover:text-white transition-colors p-2 -mt-2 -mr-2"
                >
                  <X size={24} />
                </button>
              </div>

              {/* Summary */}
              <div className="mb-6 p-4 bg-[#2d2d2d] rounded-lg border border-white/5">
                <p className="text-base sm:text-lg text-gray-300 leading-relaxed italic">
                  {article.summary}
                </p>
              </div>

              {/* Content */}
              <div className="prose prose-invert max-w-none mb-6">
                {article.content.split('\n\n').map((paragraph, i) => (
                  <p key={i} className="text-base sm:text-lg text-white leading-relaxed mb-4">
                    {paragraph}
                  </p>
                ))}
              </div>

              {/* Metadata */}
              <div className="space-y-3 pt-4 border-t border-white/10">
                {article.slant && (
                  <div className="p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
                    <p className="text-sm text-yellow-500">
                      <span className="font-semibold">Editorial Slant:</span> {article.slant}
                    </p>
                  </div>
                )}

                {article.tags.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {article.tags.map((tag, i) => (
                      <span
                        key={i}
                        className="px-2 py-1 bg-[#2d2d2d] text-gray-300 text-xs rounded"
                      >
                        #{tag}
                      </span>
                    ))}
                  </div>
                )}

                {article.relatedQuestion && (
                  <div>
                    <a
                      href={`/markets/${article.relatedQuestion}`}
                      className="text-sm text-[#1c9cf0] hover:text-[#1a8cd8] flex items-center gap-1"
                    >
                      <ExternalLink size={14} />
                      <span>Related to Prediction Market Question #{article.relatedQuestion}</span>
                    </a>
                  </div>
                )}

                <div className="flex items-center gap-4 text-xs text-gray-500">
                  <span>{article.viewCount} views</span>
                  <span>·</span>
                  <span>{article.shareCount} shares</span>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  )
}

