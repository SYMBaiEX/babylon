'use client'

import { useState, useMemo, useEffect } from 'react'
import { useGameStore } from '@/stores/gameStore'
import Link from 'next/link'
import { FeedToggle } from '@/components/shared/FeedToggle'
import { Avatar } from '@/components/shared/Avatar'
import { PageContainer } from '@/components/shared/PageContainer'
import { SearchBar } from '@/components/shared/SearchBar'
import { InteractionBar } from '@/components/interactions'
import { cn } from '@/lib/utils'
import { useFontSize } from '@/contexts/FontSizeContext'
import { useErrorToasts } from '@/hooks/useErrorToasts'

export default function FeedPage() {
  const [tab, setTab] = useState<'latest' | 'following'>('latest')
  const [searchQuery, setSearchQuery] = useState('')
  const [posts, setPosts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [followingPosts, setFollowingPosts] = useState<any[]>([])
  const [loadingFollowing, setLoadingFollowing] = useState(false)
  const { fontSize } = useFontSize()

  // Game timeline state (viewer-style)
  const { allGames, startTime, currentTimeMs } = useGameStore()
  const currentDate = startTime ? new Date(startTime + currentTimeMs) : null

  // Enable error toast notifications
  useErrorToasts()

  // Load posts from database API
  useEffect(() => {
    const loadPosts = async () => {
      try {
        const response = await fetch('/api/posts?limit=500')
        if (response.ok) {
          const data = await response.json()
          setPosts(data.posts || [])
        }
      } catch (error) {
        console.error('Failed to load posts:', error)
      } finally {
        setLoading(false)
      }
    }

    loadPosts()

    // Refresh every 30 seconds
    const interval = setInterval(loadPosts, 30000)
    return () => clearInterval(interval)
  }, [])

  // Fetch following posts when following tab is active
  useEffect(() => {
    const fetchFollowingPosts = async () => {
      if (tab !== 'following') return

      setLoadingFollowing(true)
      try {
        // TODO: Get auth token from Privy
        const token = null // Placeholder - will be implemented with Privy integration

        const headers: HeadersInit = {
          'Content-Type': 'application/json',
        }

        if (token) {
          headers['Authorization'] = `Bearer ${token}`
        }

        const response = await fetch('/api/posts/feed/favorites?limit=50&offset=0', {
          headers,
        })

        if (response.ok) {
          const data = await response.json()
          // Transform API response to match feed post structure
          setFollowingPosts(data.data.posts || [])
        }
      } catch (error) {
        console.error('Failed to fetch following:', error)
      } finally {
        setLoadingFollowing(false)
      }
    }

    fetchFollowingPosts()
  }, [tab])

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
  const basePosts = (startTime && allGames.length > 0) ? timelinePosts : (tab === 'following' ? followingPosts : posts)

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
      {/* Header with tabs */}
      <FeedToggle activeTab={tab} onTabChange={setTab} />

      {/* Search Bar */}
      <div className="sticky top-0 z-10 bg-background py-3">
        <div className="max-w-[600px] mx-auto px-4">
          <SearchBar
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder="Search posts..."
          />
        </div>
      </div>

      {/* Content area */}
      <div className="flex-1 overflow-y-auto bg-background">
        {loading ? (
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
                Game is generating content in the background...
              </p>
              <Link
                href="/game"
                className={cn(
                  'inline-block px-6 py-3 rounded-lg font-semibold',
                  'bg-primary text-primary-foreground',
                  'hover:bg-primary/90',
                  'transition-all duration-300'
                )}
              >
                Go to Game Controls
              </Link>
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
                  'inline-block px-6 py-3 rounded-lg font-semibold',
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
              console.log('post', JSON.stringify(post, null, 2))
              const postDate = new Date(post.timestamp)
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
                    'px-4 py-3 border-b',
                    'hover:bg-muted/30 cursor-pointer',
                    'transition-all duration-200'
                  )}
                  style={{
                    fontSize: `${fontSize}rem`,
                    borderColor: 'rgba(28, 156, 240, 0.2)',
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
                          <span className="px-1.5 py-0.5 text-xs font-medium rounded bg-blue-500/10 text-blue-500 border border-blue-500/20">
                            Agent
                          </span>
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
          </div>
        )}
      </div>
    </PageContainer>
  )
}
