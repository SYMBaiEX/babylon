/* eslint-disable @typescript-eslint/no-explicit-any */
'use client'

import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import { useGameStore } from '@/stores/gameStore'
import { useAuthStore } from '@/stores/authStore'
import { useRouter } from 'next/navigation'
import { FeedToggle } from '@/components/shared/FeedToggle'
import { PageContainer } from '@/components/shared/PageContainer'
import { SearchBar } from '@/components/shared/SearchBar'
import { PostCard } from '@/components/posts/PostCard'
import { InviteFriendsBanner } from '@/components/shared/InviteFriendsBanner'
import { cn } from '@/lib/utils'
import { useErrorToasts } from '@/hooks/useErrorToasts'
import { useAuth } from '@/hooks/useAuth'
import type { FeedPost } from '@/shared/types'
import { logger } from '@/lib/logger'

const PAGE_SIZE = 20

export default function FeedPage() {
  const router = useRouter()
  const { authenticated } = useAuth()
  const { user } = useAuthStore()
  const [tab, setTab] = useState<'latest' | 'following'>('latest')
  const [searchQuery, setSearchQuery] = useState('')
  const [posts, setPosts] = useState<FeedPost[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [offset, setOffset] = useState(0)
  const [followingPosts, setFollowingPosts] = useState<FeedPost[]>([])
  const [loadingFollowing, setLoadingFollowing] = useState(false)
  const loadMoreRef = useRef<HTMLDivElement | null>(null)
  const [actorNames, setActorNames] = useState<Map<string, string>>(new Map())
  const [bannerDismissed, setBannerDismissed] = useState(false)
  
  // Smart banner frequency based on user referrals
  const calculateBannerInterval = () => {
    if (!user) return Math.floor(Math.random() * 51) + 50
    
    const referralCount = user.referralCount ?? 0
    
    // Check if recently dismissed (within 7 days)
    const dismissKey = `banner_dismiss_time_${user.id}`
    const lastDismiss = typeof window !== 'undefined' ? localStorage.getItem(dismissKey) : null
    if (lastDismiss) {
      const daysSinceDismiss = (Date.now() - parseInt(lastDismiss)) / 86400000
      if (daysSinceDismiss < 7) {
        return 999999 // Don't show for 7 days after dismiss
      }
    }
    
    // Frequency based on referrals
    if (referralCount === 0) {
      // No referrals: show more frequently (30-50 posts)
      return Math.floor(Math.random() * 21) + 30
    } else if (referralCount < 5) {
      // Few referrals: normal frequency (50-80 posts)
      return Math.floor(Math.random() * 31) + 50
    } else if (referralCount < 10) {
      // Some referrals: less frequent (80-120 posts)
      return Math.floor(Math.random() * 41) + 80
    } else {
      // Many referrals: rarely (150-200 posts)
      return Math.floor(Math.random() * 51) + 150
    }
  }
  
  const bannerInterval = useRef(calculateBannerInterval())

  // Game timeline state (viewer-style)
  const { allGames, startTime, currentTimeMs } = useGameStore()
  const currentDate = startTime ? new Date(startTime + currentTimeMs) : null

  // Enable error toast notifications
  useErrorToasts()

  // Load actor names for display
  useEffect(() => {
    const loadActorNames = async () => {
      try {
        const response = await fetch('/data/actors.json')
        if (response.ok) {
          const data = await response.json()
          const nameMap = new Map()
          data.actors?.forEach((actor: any) => {
            nameMap.set(actor.id, actor.name)
          })
          setActorNames(nameMap)
        }
      } catch (error) {
        logger.error('Failed to load actor names:', error, 'FeedPage')
      }
    }
    loadActorNames()
  }, [])

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
        const unique = new Map<string, FeedPost>()
        combined.forEach(post => {
          if (post?.id) {
            unique.set(post.id, post)
          }
        })

        const deduped = Array.from(unique.values()).sort((a, b) => {
          const aTime = new Date(a.timestamp ?? 0).getTime()
          const bTime = new Date(b.timestamp ?? 0).getTime()
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
      logger.error('Failed to load posts:', error, 'FeedPage')
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
        const token = typeof window !== 'undefined' ? window.__privyAccessToken : null

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
          logger.error('Failed to fetch following posts:', response.statusText, 'FeedPage')
          setFollowingPosts([])
        }
      } catch (error) {
        logger.error('Failed to fetch following:', error, 'FeedPage')
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
      .map(({ timestampMs: _, ...rest }) => rest)
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
    return basePosts.filter((post): post is FeedPost => {
      if (!post || typeof post !== 'object') return false
      // Handle both FeedPost and timeline post shapes
      const postContent = 'content' in post ? String(post.content || '') : ''
      const authorField = 'author' in post ? String(post.author || '') : ('authorId' in post ? String((post as { authorId?: string }).authorId || '') : '')
      const postAuthorName = 'authorName' in post ? String(post.authorName || '') : ''
      return (
        postContent.toLowerCase().includes(query) ||
        authorField.toLowerCase().includes(query) ||
        postAuthorName.toLowerCase().includes(query)
      )
    })
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
    <PageContainer noPadding className="flex flex-col h-full w-full overflow-hidden">
      {/* Mobile: Header with tabs and search in one row */}
      <div className="sticky top-0 z-10 bg-background shadow-sm flex-shrink-0 md:hidden">
        <div className="flex items-center gap-2 h-12 px-3 sm:px-4">
          {/* Tabs on left */}
          <div className="flex-shrink-0">
            <FeedToggle activeTab={tab} onTabChange={setTab} />
          </div>
          
          {/* Search bar on right */}
          <div className="flex-1 min-w-0">
            <SearchBar
              value={searchQuery}
              onChange={setSearchQuery}
              placeholder="Search"
              className="w-full"
              compact
            />
          </div>
        </div>
      </div>

      {/* Desktop: Search bar */}
      <div className="hidden md:flex items-center sticky top-0 z-10 bg-background py-3 px-6 shadow-sm flex-shrink-0">
        <div className="flex-1 max-w-[600px]">
          <SearchBar
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder="Search"
          />
        </div>
      </div>

      {/* Content area */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden bg-background w-full">
        {(loading || (tab === 'following' && loadingFollowing)) ? (
          <div className="max-w-2xl mx-auto p-4 sm:p-8 text-center">
            <div className="text-muted-foreground py-12">
              <p>Loading posts...</p>
            </div>
          </div>
        ) : filteredPosts.length === 0 && !searchQuery && tab === 'latest' ? (
          // No posts yet
          <div className="max-w-2xl mx-auto p-4 sm:p-8 text-center">
            <div className="text-muted-foreground py-8 sm:py-12">
              <h2 className="text-xl sm:text-2xl font-bold mb-2 text-foreground">No Posts Yet</h2>
              <p className="mb-4 text-sm sm:text-base">
                Engine is generating posts...
              </p>
              <div className="text-xs sm:text-sm text-muted-foreground space-y-2">
                <p>Check terminal for tick logs.</p>
                <p>Posts appear within 60 seconds.</p>
              </div>
            </div>
          </div>
        ) : filteredPosts.length === 0 && !searchQuery && tab === 'following' ? (
          // Following tab with no followed profiles
          <div className="max-w-2xl mx-auto p-4 sm:p-8 text-center">
            <div className="text-muted-foreground py-8 sm:py-12">
              <h2 className="text-lg sm:text-xl font-semibold mb-2 text-foreground">👥 Not Following Anyone Yet</h2>
              <p className="mb-4 text-sm sm:text-base">
                {loadingFollowing
                  ? 'Loading following...'
                  : 'Follow profiles to see their posts here. Visit a profile and click the Follow button.'}
              </p>
            </div>
          </div>
        ) : filteredPosts.length === 0 && !searchQuery ? (
          // Game loaded but no visible posts yet
          <div className="max-w-2xl mx-auto p-4 sm:p-8 text-center">
          <div className="text-muted-foreground py-8 sm:py-12">
            <h2 className="text-lg sm:text-xl font-semibold mb-2 text-foreground">⏱️ No Posts Yet</h2>
            <p className="mb-4 text-sm sm:text-base">
              Game is running in the background via realtime-daemon. Content will appear here as it's generated.
            </p>
          </div>
          </div>
        ) : filteredPosts.length === 0 && searchQuery ? (
          // No search results
          <div className="max-w-2xl mx-auto p-4 sm:p-8 text-center">
            <div className="text-muted-foreground py-8 sm:py-12">
              <h2 className="text-lg sm:text-xl font-semibold mb-2 text-foreground">No Results</h2>
              <p className="mb-4 text-sm sm:text-base break-words">
                No posts found matching &quot;{searchQuery}&quot;
              </p>
              <button
                onClick={() => setSearchQuery('')}
                className={cn(
                  'inline-block px-4 sm:px-6 py-2 sm:py-3 font-semibold rounded text-sm sm:text-base cursor-pointer',
                  'bg-[#1da1f2] text-white',
                  'hover:bg-[#1a8cd8]',
                  'transition-all duration-300'
                )}
              >
                Clear Search
              </button>
            </div>
          </div>
        ) : (
          // Show posts - Twitter-like layout
          <div className="w-full max-w-[600px] mx-auto">
            {filteredPosts.map((post: any, i: number) => {
              // Fix author mapping: use authorId if author is null
              const authorId = post.author || post.authorId
              // Get actual actor name from loaded data, fallback to authorName or ID
              const authorName = actorNames.get(authorId) || post.authorName || authorId

              // Show banner at the random interval (if not dismissed)
              const showBannerAfterThisPost = !bannerDismissed && i === bannerInterval.current - 1

              return (
                <div key={`post-wrapper-${post.id}-${i}`}>
                  <PostCard
                    post={{
                      id: post.id,
                      content: post.content,
                      authorId,
                      authorName,
                      timestamp: post.timestamp,
                      likeCount: 0,
                      commentCount: 0,
                      shareCount: 0,
                      isLiked: false,
                      isShared: false,
                    }}
                    onClick={() => router.push(`/post/${post.id}`)}
                  />
                  {showBannerAfterThisPost && (
                    <InviteFriendsBanner 
                      onDismiss={() => {
                        setBannerDismissed(true)
                        // Recalculate interval for next load
                        bannerInterval.current = calculateBannerInterval()
                      }}
                    />
                  )}
                </div>
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
