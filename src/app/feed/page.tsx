'use client'

import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import { useGameStore } from '@/stores/gameStore'
import Link from 'next/link'
import { FeedToggle } from '@/components/shared/FeedToggle'
import { Avatar } from '@/components/shared/Avatar'
import { PageContainer } from '@/components/shared/PageContainer'
import { SearchBar } from '@/components/shared/SearchBar'
import { InteractionBar } from '@/components/interactions'
import { CreatePostModal } from '@/components/posts/CreatePostModal'
import { cn } from '@/lib/utils'
import { useFontSize } from '@/contexts/FontSizeContext'
import { useErrorToasts } from '@/hooks/useErrorToasts'
import { useAuth } from '@/hooks/useAuth'
import { Plus, ShieldCheck } from 'lucide-react'

const PAGE_SIZE = 20

export default function FeedPage() {
  const [tab, setTab] = useState<'latest' | 'following'>('latest')
  const [searchQuery, setSearchQuery] = useState('')
  const [posts, setPosts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [offset, setOffset] = useState(0)
  const [followingPosts, setFollowingPosts] = useState<any[]>([])
  const [loadingFollowing, setLoadingFollowing] = useState(false)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const { fontSize } = useFontSize()
  const loadMoreRef = useRef<HTMLDivElement | null>(null)

  // Game timeline state (viewer-style)
  const { allGames, startTime, currentTimeMs } = useGameStore()
  const currentDate = startTime ? new Date(startTime + currentTimeMs) : null

  // Enable error toast notifications
  useErrorToasts()

  const fetchLatestPosts = useCallback(async (requestOffset: number, append = false) => {
    if (tab !== 'latest') return

    if (append) setLoadingMore(true)
    else setLoading(true)

    try {
      const response = await fetch(`/api/posts?limit=${PAGE_SIZE}&offset=${requestOffset}`)
      if (!response.ok) {
        if (append) setHasMore(false)
        return
      }

      const data = await response.json()
      const newPosts = Array.isArray(data.posts) ? data.posts : []
      const total = typeof data.total === 'number' ? data.total : undefined

      let uniqueAdded = 0

      setPosts(prev => {
        const prevSize = prev.length
        const combined = append ? [...prev, ...newPosts] : [...newPosts, ...prev]
        const unique = new Map<string, any>()
        combined.forEach(post => {
          if (post?.id) {
            unique.set(post.id, post)
          }
        })

        const deduped = Array.from(unique.values()).sort((a, b) => {
          const aTime = new Date(a.timestamp ?? a.createdAt ?? 0).getTime()
          const bTime = new Date(b.timestamp ?? b.createdAt ?? 0).getTime()
          return bTime - aTime
        })

        uniqueAdded = deduped.length - prevSize
        setOffset(deduped.length)
        return deduped
      })

      if (append && uniqueAdded === 0) {
        setHasMore(false)
        return
      }

      const moreAvailable =
        newPosts.length === PAGE_SIZE &&
        (total === undefined || requestOffset + newPosts.length < total)

      if (!append && newPosts.length === 0 && requestOffset === 0) {
        setHasMore(false)
      } else {
        setHasMore(moreAvailable)
      }
    } catch (error) {
      console.error('Failed to load posts:', error)
      if (append) setHasMore(false)
    } finally {
      if (append) setLoadingMore(false)
      else setLoading(false)
    }
  }, [tab])

  // Initial load for latest tab
  useEffect(() => {
    fetchLatestPosts(0, false)
  }, [fetchLatestPosts])

  // Infinite scroll observer for latest tab
  useEffect(() => {
    if (tab !== 'latest') return

    const target = loadMoreRef.current
    if (!target) return

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0]
        if (
          entry?.isIntersecting &&
          hasMore &&
          !loading &&
          !loadingMore &&
          !searchQuery.trim()
        ) {
          void fetchLatestPosts(offset, true)
        }
      },
      { rootMargin: '200px' }
    )

    observer.observe(target)
    return () => {
      observer.disconnect()
    }
  }, [tab, hasMore, loading, loadingMore, searchQuery, offset, fetchLatestPosts])

  const { authenticated, user } = useAuth()

  // Fetch following posts when following tab is active
  useEffect(() => {
    const fetchFollowingPosts = async () => {
      if (tab !== 'following') return
      if (!authenticated || !user) {
        setFollowingPosts([])
        setLoadingFollowing(false)
        return
      }

      setLoadingFollowing(true)
      try {
        const token = typeof window !== 'undefined' ? (window as any).__privyAccessToken : null

        const headers: HeadersInit = {
          'Content-Type': 'application/json',
        }

        if (token) {
          headers['Authorization'] = `Bearer ${token}`
        }

        // Fetch posts from followed users/actors
        const response = await fetch(
          `/api/posts?following=true&userId=${user.id}&limit=${PAGE_SIZE}&offset=0`,
          { headers }
        )

        if (response.ok) {
          const data = await response.json()
          const posts = Array.isArray(data.posts) ? data.posts : []
          setFollowingPosts(posts)
        } else {
          console.error('Failed to fetch following posts:', response.statusText)
          setFollowingPosts([])
        }
      } catch (error) {
        console.error('Failed to fetch following:', error)
        setFollowingPosts([])
      } finally {
        setLoadingFollowing(false)
      }
    }

    fetchFollowingPosts()
  }, [tab, authenticated, user])

  // Compute timeline-visible posts from game (mirrors viewer FeedView)
  const timelinePosts = useMemo(() => {
    if (!startTime || !currentDate || allGames.length === 0) return [] as Array<{
      id: string
      content: string
      authorId: string
      authorName: string
      timestamp: string
    }>

    const items: Array<{ id: string; content: string; authorId: string; authorName: string; timestamp: string; timestampMs: number }>= []

    allGames.forEach((g) => {
      g.timeline?.forEach((day) => {
        day.feedPosts?.forEach((post) => {
          const ts = new Date(post.timestamp).getTime()
          items.push({
            id: `game-${g.id}-${post.timestamp}`,
            content: post.content,
            authorId: post.author,
            authorName: post.authorName,
            timestamp: post.timestamp,
            timestampMs: ts,
          })
        })
      })
    })

    const currentAbs = startTime + currentTimeMs
    return items
      .filter((p) => p.timestampMs <= currentAbs)
      .sort((a, b) => b.timestampMs - a.timestampMs)
      .map(({ timestampMs, ...rest }) => rest)
  }, [allGames, startTime, currentDate, currentTimeMs])

  // Choose data source: timeline (if available) else API posts
  // For following tab, always use followingPosts (not timeline)
  const basePosts = (tab === 'following') 
    ? followingPosts 
    : ((startTime && allGames.length > 0) ? timelinePosts : posts)

  // Filter by search query (applies to whichever source is active)
  const filteredPosts = useMemo(() => {
    if (!searchQuery.trim()) return basePosts
    const query = searchQuery.toLowerCase()
    return basePosts.filter((post: any) =>
      (post.content || '').toLowerCase().includes(query) ||
      (post.authorId || '').toLowerCase().includes(query)
    )
  }, [basePosts, searchQuery])

  if (loading) {
    return (
      <PageContainer noPadding className="flex flex-col">
        <FeedToggle activeTab={tab} onTabChange={setTab} />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center text-muted-foreground">
            <div className="text-lg mb-2">Loading posts...</div>
          </div>
        </div>
      </PageContainer>
    )
  }

  return (
    <PageContainer noPadding className="flex flex-col">
      {/* Header with tabs and + Hoot button */}
      <div className="sticky top-0 z-10 bg-background border-b border-border">
        <div className="flex items-center justify-between h-12 px-4">
          {/* Tabs on left */}
          <FeedToggle activeTab={tab} onTabChange={setTab} />
          
          {/* + Hoot button on right */}
          <button
            onClick={() => setShowCreateModal(true)}
            className={cn(
              'md:hidden px-4 py-1.5 font-semibold',
              'bg-primary text-primary-foreground',
              'hover:bg-primary/90',
              'transition-all duration-200',
              'flex items-center gap-1.5'
            )}
          >
            <Plus className="w-4 h-4" />
            <span>Hoot</span>
          </button>
        </div>
      </div>

      {/* Search Bar */}
      <div className="sticky top-12 z-10 bg-background py-2 border-b border-border md:hidden">
        <div className="px-4">
          <SearchBar
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder="Search Babylon..."
          />
        </div>
      </div>

      {/* Desktop: Search and + Hoot button */}
      <div className="hidden md:flex items-center justify-between sticky top-12 z-10 bg-background py-3 px-6 border-b border-border">
        <div className="flex-1 max-w-[600px]">
          <SearchBar
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder="Search Babylon..."
          />
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className={cn(
            'ml-4 px-6 py-2 font-semibold',
            'bg-primary text-primary-foreground',
            'hover:bg-primary/90',
            'transition-all duration-200',
            'flex items-center gap-2'
          )}
        >
          <Plus className="w-5 h-5" />
          <span>Hoot</span>
        </button>
      </div>

      {/* Create Post Modal */}
      <CreatePostModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onPostCreated={() => {
          // Refresh posts after creating
          fetchLatestPosts(0, false)
        }}
      />

      {/* Content area */}
      <div className="flex-1 overflow-y-auto bg-background">
        {(loading || (tab === 'following' && loadingFollowing)) ? (
          <div className="max-w-2xl mx-auto p-8 text-center">
            <div className="text-muted-foreground py-12">
              <p>Loading posts...</p>
            </div>
          </div>
        ) : filteredPosts.length === 0 && !searchQuery && tab === 'latest' ? (
          // No posts yet
          <div className="max-w-2xl mx-auto p-8 text-center">
            <div className="text-muted-foreground py-12">
              <h2 className="text-2xl font-bold mb-2 text-foreground">No Posts Yet</h2>
              <p className="mb-4">
                Engine is generating posts...
              </p>
              <div className="text-sm text-muted-foreground space-y-2">
                <p>Check terminal for tick logs.</p>
                <p>Posts appear within 60 seconds.</p>
              </div>
            </div>
          </div>
        ) : filteredPosts.length === 0 && !searchQuery && tab === 'following' ? (
          // Following tab with no followed profiles
          <div className="max-w-2xl mx-auto p-8 text-center">
            <div className="text-muted-foreground py-12">
              <h2 className="text-xl font-semibold mb-2 text-foreground">👥 Not Following Anyone Yet</h2>
              <p className="mb-4">
                {loadingFollowing
                  ? 'Loading following...'
                  : 'Follow profiles to see their posts here. Visit a profile and click the Follow button.'}
              </p>
            </div>
          </div>
        ) : filteredPosts.length === 0 && !searchQuery ? (
          // Game loaded but no visible posts yet
          <div className="max-w-2xl mx-auto p-8 text-center">
          <div className="text-muted-foreground py-12">
            <h2 className="text-xl font-semibold mb-2 text-foreground">⏱️ No Posts Yet</h2>
            <p className="mb-4">
              Game is running in the background via realtime-daemon. Content will appear here as it's generated.
            </p>
          </div>
          </div>
        ) : filteredPosts.length === 0 && searchQuery ? (
          // No search results
          <div className="max-w-2xl mx-auto p-8 text-center">
            <div className="text-muted-foreground py-12">
              <h2 className="text-xl font-semibold mb-2 text-foreground">No Results</h2>
              <p className="mb-4">
                No posts found matching "{searchQuery}"
              </p>
              <button
                onClick={() => setSearchQuery('')}
                className={cn(
                  'inline-block px-6 py-3 font-semibold border border-border',
                  'bg-primary text-primary-foreground',
                  'hover:bg-primary/90',
                  'transition-all duration-300'
                )}
              >
                Clear Search
              </button>
            </div>
          </div>
        ) : (
          // Show posts - Twitter-like layout
          <div className="max-w-[600px] mx-auto">
            {filteredPosts.map((post: any, i: number) => {
              const postDate = new Date(post.timestamp ?? post.createdAt ?? Date.now())
              const now = new Date()
              const diffMs = now.getTime() - postDate.getTime()
              const diffMinutes = Math.floor(diffMs / 60000)
              const diffHours = Math.floor(diffMs / 3600000)
              const diffDays = Math.floor(diffMs / 86400000)

              let timeAgo: string
              if (diffMinutes < 1) timeAgo = 'Just now'
              else if (diffMinutes < 60) timeAgo = `${diffMinutes}m ago`
              else if (diffHours < 24) timeAgo = `${diffHours}h ago`
              else if (diffDays < 7) timeAgo = `${diffDays}d ago`
              else timeAgo = postDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

              return (
                <article
                  key={`${post.id}-${i}`}
                  className={cn(
                    'px-4 py-3 border-b border-border',
                    'hover:bg-muted/30 cursor-pointer',
                    'transition-all duration-200'
                  )}
                  style={{
                    fontSize: `${fontSize}rem`,
                  }}
                >
                  <div className="flex gap-3">
                    {/* Avatar - Clickable */}
                    <Link
                      href={`/profile/${post.authorId}`}
                      className="flex-shrink-0 hover:opacity-80 transition-opacity"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Avatar
                        id={post.authorId}
                        name={post.authorId}
                        type="actor"
                        size="lg"
                        scaleFactor={fontSize}
                      />
                    </Link>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      {/* Header: Author with handle on left, timestamp on right */}
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <Link
                            href={`/profile/${post.authorId}`}
                            className="font-bold text-foreground hover:underline"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {post.authorId}
                          </Link>
                          <ShieldCheck className="w-4 h-4 text-blue-500 flex-shrink-0" fill="currentColor" />
                          <Link
                            href={`/profile/${post.authorId}`}
                            className="text-muted-foreground text-sm hover:underline"
                            onClick={(e) => e.stopPropagation()}
                          >
                            @{post.author}
                          </Link>
                        </div>
                        <time className="text-muted-foreground text-sm flex-shrink-0" title={postDate.toLocaleString()}>
                          {timeAgo}
                        </time>
                      </div>

                      {/* Post content */}
                      <div className="text-foreground leading-normal whitespace-pre-wrap break-words">
                        {post.content}
                      </div>

                      {/* Interaction Bar */}
                      <InteractionBar
                        postId={post.id}
                        initialInteractions={{
                          postId: post.id,
                          likeCount: 0,
                          commentCount: 0,
                          shareCount: 0,
                          isLiked: false,
                          isShared: false,
                        }}
                      />
                    </div>
                  </div>
                </article>
              )
            })}
            {tab === 'latest' && (
              <>
                <div ref={loadMoreRef} className="h-1 w-full" />
                {loadingMore && (
                  <div className="py-4 text-center text-sm text-muted-foreground">
                    Loading more posts...
                  </div>
                )}
                {!loadingMore && !hasMore && posts.length > 0 && (
                  <div className="py-4 text-center text-xs text-muted-foreground">
                    You&apos;re all caught up.
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </PageContainer>
  )
}
