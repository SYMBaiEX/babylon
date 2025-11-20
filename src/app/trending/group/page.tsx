'use client'

import { logger } from '@/lib/logger'
import { useState, useEffect, useCallback } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { PageContainer } from '@/components/shared/PageContainer'
import { PostCard } from '@/components/posts/PostCard'
import { ArrowLeft } from 'lucide-react'

interface PostData {
  id: string
  content: string
  authorId: string
  authorName: string
  authorUsername?: string | null
  authorProfileImageUrl?: string | null
  timestamp: string
  likeCount?: number
  commentCount?: number
  shareCount?: number
  type?: string
  isShared?: boolean
}

interface TagInfo {
  id: string
  displayName: string
  category: string | null
}

export default function GroupedTrendingPage() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const tagIds = searchParams.get('tags')?.split(',') || []
  const [posts, setPosts] = useState<PostData[]>([])
  const [loading, setLoading] = useState(true)
  const [tags, setTags] = useState<TagInfo[]>([])

  const fetchPosts = useCallback(async () => {
    if (tagIds.length === 0) {
      setLoading(false)
      return
    }

    setLoading(true)

    const response = await fetch(
      `/api/trending/group?tags=${tagIds.join(',')}&limit=50`
    )
    
    if (!response.ok) {
      logger.warn('Failed to fetch grouped trending posts', { tagIds }, 'GroupedTrendingPage')
      setLoading(false)
      return
    }

    const data = await response.json()
    
    if (data.success) {
      setPosts(data.posts || [])
      setTags(data.tags || [])
    }
    
    setLoading(false)
  }, [tagIds])

  useEffect(() => {
    fetchPosts()
  }, [fetchPosts])

  const handleBack = () => {
    router.back()
  }

  return (
    <PageContainer>
      <div className="h-full flex flex-col">
        {/* Header */}
        <div className="border-b border-border bg-background sticky top-0 z-10">
          <div className="max-w-feed mx-auto px-6 py-4">
            <div className="flex items-center gap-4">
              <button
                onClick={handleBack}
                className="hover:bg-muted rounded-full p-2 transition-colors"
                aria-label="Go back"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div className="flex-1">
                <h1 className="text-xl font-bold">
                  {tags.length > 0 ? tags.map(t => t.displayName).join(' • ') : 'Grouped Trending'}
                </h1>
                {tags.length > 0 && tags[0]?.category && (
                  <p className="text-sm text-muted-foreground">
                    {tags[0].category}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Feed content - Scrollable */}
        <div className="flex-1 bg-background overflow-y-auto overflow-x-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-muted-foreground">Loading posts...</div>
            </div>
          ) : posts.length === 0 ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-center">
                <h2 className="text-xl font-semibold mb-2">No posts found</h2>
                <p className="text-muted-foreground">
                  No posts found for these trending topics yet.
                </p>
              </div>
            </div>
          ) : (
            <div className="max-w-feed mx-auto px-6 py-4 space-y-0">
              {posts.map((post) => (
                <PostCard
                  key={post.id}
                  post={post}
                />
              ))}
              
              {posts.length > 0 && (
                <div className="py-4 text-center text-xs text-muted-foreground">
                  You&apos;re all caught up.
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </PageContainer>
  )
}

