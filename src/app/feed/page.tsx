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
import { WidgetSidebar } from '@/components/shared/WidgetSidebar'
import { CreatePostModal } from '@/components/posts/CreatePostModal'
import { Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useErrorToasts } from '@/hooks/useErrorToasts'
import { useAuth } from '@/hooks/useAuth'
import type { FeedPost } from '@/shared/types'
import { logger } from '@/lib/logger'
import { useChannelSubscription } from '@/hooks/useChannelSubscription'

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
  const [showCreateModal, setShowCreateModal] = useState(false)
  
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
          const data = await response.json() as { actors?: Array<{ id: string; name: string }> }
          const nameMap = new Map<string, string>()
          data.actors?.forEach((actor) => {
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
        // When refreshing (not appending), prepend new posts to existing ones
        // This ensures new posts appear at the top while preserving scroll position
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
          return bTime - aTime // Newest first
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

  // Initial load and reset when switching to latest tab
  useEffect(() => {
    if (tab === 'latest') {
      setOffset(0)
      setHasMore(true)
      fetchLatestPosts(0, false)
    }
  }, [tab, fetchLatestPosts])

  // Subscribe to feed channel for real-time updates
  const handleFeedUpdate = useCallback((data: Record<string, unknown>) => {
    if (data.type === 'new_post' && data.post) {
      const newPost = data.post as FeedPost
      logger.debug('New post received via WebSocket, inserting into feed...', { postId: newPost.id }, 'FeedPage')

      // Directly insert the new post into the state for instant update
      setPosts(prev => {
        // Check if post already exists to avoid duplicates
        const exists = prev.some(p => p.id === newPost.id)
        if (exists) return prev

        // Add new post at the beginning (newest first)
        const updated = [newPost, ...prev]

        // Sort by timestamp to ensure chronological order
        return updated.sort((a, b) => {
          const aTime = new Date(a.timestamp ?? 0).getTime()
          const bTime = new Date(b.timestamp ?? 0).getTime()
          return bTime - aTime // Newest first
        })
      })

      // If we're on the following tab and this is from someone we follow,
      // also add to followingPosts
      if (tab === 'following' && user) {
        setFollowingPosts(prev => {
          const exists = prev.some(p => p.id === newPost.id)
          if (exists) return prev

          const updated = [newPost, ...prev]
          return updated.sort((a, b) => {
            const aTime = new Date(a.timestamp ?? 0).getTime()
            const bTime = new Date(b.timestamp ?? 0).getTime()
            return bTime - aTime
          })
        })
      }

      // Update offset to reflect new total
      setOffset(prev => prev + 1)
    }
  }, [tab, user])

  useChannelSubscription(tab === 'latest' ? 'feed' : null, handleFeedUpdate)

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
      .map(({ timestampMs: _timestampMs, ...rest }) => {
        // Explicitly exclude timestampMs from the result
        return rest
      })
  }, [allGames, startTime, currentDate, currentTimeMs])

  // Choose data source: always use API posts for latest tab (GameEngine persists to database)
  // For following tab, use followingPosts
  // Only use timelinePosts if we have no API posts (fallback for viewer mode)
  const basePosts = (tab === 'following') 
    ? followingPosts 
    : (posts.length > 0 ? posts : (startTime && allGames.length > 0 ? timelinePosts : posts))

  // Filter by search query (applies to whichever source is active)
  // Note: basePosts can be FeedPost (from game store) or API post shape (from /api/posts)
  const filteredPosts = useMemo(() => {
    if (!searchQuery.trim()) return basePosts
    const query = searchQuery.toLowerCase()
    return basePosts.filter((post) => {
      if (!post || typeof post !== 'object') return false
      // Handle both FeedPost and API post shapes
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
      {/* Mobile: Header with tabs, Hoot button, and search below */}
      <div className="sticky top-0 z-10 bg-background shadow-sm flex-shrink-0 md:hidden">
        {/* Top row: Tabs and Hoot button */}
        <div className="flex items-center justify-between gap-2 px-3 sm:px-4 py-2">
          {/* Tabs on left */}
          <div className="flex-shrink-0">
            <FeedToggle activeTab={tab} onTabChange={setTab} />
          </div>
          
          {/* Hoot button on right */}
          {authenticated && (
            <button
              onClick={() => setShowCreateModal(true)}
              className={cn(
                'flex items-center gap-1.5 flex-shrink-0',
                'bg-[#1c9cf0] hover:bg-[#1a8cd8]',
                'text-white font-semibold text-sm',
                'px-3 py-1.5 rounded',
                'transition-all duration-200'
              )}
            >
              <Plus className="w-4 h-4" />
              <span>Hoot</span>
            </button>
          )}
        </div>
        
        {/* Search bar below */}
        <div className="px-3 sm:px-4 pb-2">
          <SearchBar
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder="Search Babylon..."
            className="w-full"
            compact
          />
        </div>
      </div>

      {/* Desktop: Multi-column layout */}
      <div className="hidden lg:flex flex-1 overflow-hidden">
        {/* Left: Feed area - aligned with sidebar, full width */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Desktop: Top bar with tabs, search, and post button */}
          <div className="sticky top-0 z-10 bg-background shadow-sm flex-shrink-0">
            <div className="px-6 py-4">
              {/* Top row: Tabs and Post button */}
              <div className="flex items-center justify-between mb-3">
                <FeedToggle activeTab={tab} onTabChange={setTab} />
                {authenticated && (
                  <button
                    onClick={() => setShowCreateModal(true)}
                    className={cn(
                      'flex items-center gap-2',
                      'bg-[#1c9cf0] hover:bg-[#1a8cd8]',
                      'text-white font-semibold',
                      'px-4 py-2',
                      'transition-all duration-200',
                      'shadow-md hover:shadow-lg'
                    )}
                  >
                    <Plus className="w-5 h-5" />
                    <span>Hoot</span>
                  </button>
                )}
              </div>
              {/* Search bar - full width */}
              <div className="w-full">
                <SearchBar
                  value={searchQuery}
                  onChange={setSearchQuery}
                  placeholder="Search Babylon..."
                />
              </div>
            </div>
          </div>

          {/* Feed content - split into 2 columns: posts and comments */}
          <div className="flex-1 flex overflow-hidden bg-background">
            {/* Left column: Feed posts */}
            <div className="flex-1 overflow-y-auto overflow-x-hidden min-w-0">
              {(loading || (tab === 'following' && loadingFollowing)) ? (
                <div className="w-full p-4 sm:p-8 text-center">
                  <div className="text-muted-foreground py-12">
                    <p>Loading posts...</p>
                  </div>
                </div>
              ) : filteredPosts.length === 0 && !searchQuery && tab === 'latest' ? (
                // No posts yet
                <div className="w-full p-4 sm:p-8 text-center">
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
                <div className="w-full p-4 sm:p-8 text-center">
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
                <div className="w-full p-4 sm:p-8 text-center">
                <div className="text-muted-foreground py-8 sm:py-12">
                  <h2 className="text-lg sm:text-xl font-semibold mb-2 text-foreground">⏱️ No Posts Yet</h2>
                  <p className="mb-4 text-sm sm:text-base">
                    Game is running in the background via realtime-daemon. Content will appear here as it's generated.
                  </p>
                </div>
                </div>
              ) : filteredPosts.length === 0 && searchQuery ? (
                // No search results
                <div className="w-full p-4 sm:p-8 text-center">
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
                // Show posts - fluid width that scales with screen size
                <div className={cn(
                  "w-full pl-6 space-y-0",
                  "pr-8 max-w-[65%] ml-4 mr-auto"
                )}>
                  {filteredPosts.map((post, i: number) => {
                    // Handle both FeedPost (from game store) and API post shapes
                    // API posts have authorId, FeedPost has author (both are author IDs)
                    const authorId = ('authorId' in post ? post.authorId : post.author) || ''
                    // Get actual actor name from loaded data, fallback to authorName or ID
                    const authorName = actorNames.get(authorId) || ('authorName' in post ? post.authorName : '') || authorId

                    // Show banner at the random interval (if not dismissed)
                    const showBannerAfterThisPost = !bannerDismissed && i === bannerInterval.current - 1

                    const postData = {
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
                    }

                    return (
                      <div key={`post-wrapper-${post.id}-${i}`}>
                        <PostCard
                          post={postData}
                          onClick={() => {
                            // Navigate to post detail page
                            router.push(`/post/${post.id}`)
                          }}
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

          </div>
        </div>

          {/* Right: Widget panels - only on desktop (xl+) */}
          <WidgetSidebar />
      </div>

      {/* Mobile/Tablet: Feed area (full width) */}
      <div className="flex lg:hidden flex-1 overflow-y-auto overflow-x-hidden bg-background w-full">
        {(loading || (tab === 'following' && loadingFollowing)) ? (
          <div className="w-full p-4 sm:p-8 text-center">
            <div className="text-muted-foreground py-12">
              <p>Loading posts...</p>
            </div>
          </div>
        ) : filteredPosts.length === 0 && !searchQuery && tab === 'latest' ? (
          // No posts yet
          <div className="w-full p-4 sm:p-8 text-center">
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
          <div className="w-full p-4 sm:p-8 text-center">
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
          <div className="w-full p-4 sm:p-8 text-center">
          <div className="text-muted-foreground py-8 sm:py-12">
            <h2 className="text-lg sm:text-xl font-semibold mb-2 text-foreground">⏱️ No Posts Yet</h2>
            <p className="mb-4 text-sm sm:text-base">
              Game is running in the background via realtime-daemon. Content will appear here as it's generated.
            </p>
          </div>
          </div>
        ) : filteredPosts.length === 0 && searchQuery ? (
          // No search results
          <div className="w-full p-4 sm:p-8 text-center">
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
          // Show posts - full width, left-aligned
          <div className="w-full px-4">
            {filteredPosts.map((post, i: number) => {
              // Handle both FeedPost (from game store) and API post shapes
              // API posts have authorId, FeedPost has author (both are author IDs)
              const authorId = ('authorId' in post ? post.authorId : post.author) || ''
              // Get actual actor name from loaded data, fallback to authorName or ID
              const authorName = actorNames.get(authorId) || ('authorName' in post ? post.authorName : '') || authorId

              // Show banner at the random interval (if not dismissed)
              const showBannerAfterThisPost = !bannerDismissed && i === bannerInterval.current - 1

              const postData = {
                id: post.id,
                content: post.content,
                authorId,
                authorName,
                authorUsername: ('authorUsername' in post ? post.authorUsername : null) || null,
                timestamp: post.timestamp,
                likeCount: ('likeCount' in post ? (post.likeCount as number) : 0) || 0,
                commentCount: ('commentCount' in post ? (post.commentCount as number) : 0) || 0,
                shareCount: ('shareCount' in post ? (post.shareCount as number) : 0) || 0,
                isLiked: ('isLiked' in post ? (post.isLiked as boolean) : false) || false,
                isShared: ('isShared' in post ? (post.isShared as boolean) : false) || false,
              }

              return (
                <div key={`post-wrapper-${post.id}-${i}`}>
                  <PostCard
                    post={postData}
                    onClick={() => {
                      // Navigate to post detail page (like Twitter)
                      router.push(`/post/${post.id}`)
                    }}
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

      {/* Create Post Modal */}
      <CreatePostModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onPostCreated={() => {
          // Don't reload - WebSocket will handle real-time update
          // Just close the modal, the new post will appear automatically
          setShowCreateModal(false)

          // If not on feed page, navigate to it
          if (window.location.pathname !== '/feed') {
            router.push('/feed')
          }
        }}
      />
    </PageContainer>
  )
}
