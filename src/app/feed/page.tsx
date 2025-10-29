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
  const [followingPosts, setFollowingPosts] = useState<Array<{
    post: {
      author: string
      authorName: string
      content: string
      timestamp: string
      type: string
      sentiment: number
      clueStrength: number
      replyTo?: string
    }
    gameId: string
    gameName: string
    timestampMs: number
  }>>([])
  const [loadingFollowing, setLoadingFollowing] = useState(false)
  const { allGames, currentTimeMs, startTime } = useGameStore()
  const { fontSize } = useFontSize()

  // Enable error toast notifications
  useErrorToasts()

  // Get current date based on timeline
  const currentDate = startTime ? new Date(startTime + currentTimeMs) : null

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

  // Helper function to determine if author is a business
  const isBusinessAuthor = (authorId: string) => {
    for (const game of allGames) {
      const org = game.setup?.organizations?.find(o => o.id === authorId)
      if (org) return true
    }
    return false
  }

  // Get visible feed posts filtered by current time
  const visibleFeedPosts = useMemo(() => {
    if (allGames.length === 0 || !startTime || !currentDate) return []

    const posts: Array<{
      post: {
        author: string
        authorName: string
        content: string
        timestamp: string
        type: string
        sentiment: number
        clueStrength: number
        replyTo?: string
      }
      gameId: string
      gameName: string
      timestampMs: number
    }> = []

    allGames.forEach((g) => {
      const gameName = g.id.includes('genesis')
        ? 'October'
        : new Date(g.generatedAt).toLocaleDateString('en-US', { month: 'long' })

      g.timeline?.forEach((day) => {
        day.feedPosts?.forEach((post) => {
          const postTime = new Date(post.timestamp).getTime()
          posts.push({
            post,
            gameId: g.id,
            gameName,
            timestampMs: postTime
          })
        })
      })
    })

    const currentTimeAbsolute = startTime + currentTimeMs
    return posts
      .filter((p) => p.timestampMs <= currentTimeAbsolute)
      .sort((a, b) => b.timestampMs - a.timestampMs)
  }, [allGames, startTime, currentDate, currentTimeMs])

  // Filter posts by search query
  const filteredPosts = useMemo(() => {
    // Use followingPosts when following tab is active, otherwise use visibleFeedPosts
    const sourcePosts = tab === 'following' ? followingPosts : visibleFeedPosts

    if (!searchQuery.trim()) return sourcePosts

    const query = searchQuery.toLowerCase()
    return sourcePosts.filter(item =>
      item.post.content.toLowerCase().includes(query) ||
      item.post.authorName.toLowerCase().includes(query)
    )
  }, [tab, followingPosts, visibleFeedPosts, searchQuery])

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
        {allGames.length === 0 ? (
          // No game loaded
          <div className="max-w-2xl mx-auto p-8 text-center">
            <div className="text-muted-foreground py-12">
              <h2 className="text-2xl font-bold mb-2 text-foreground">No Game Loaded</h2>
              <p className="mb-6">
                Load a game from the Game page to see posts here
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
                {currentDate
                  ? `Timeline: ${currentDate.toLocaleDateString()}`
                  : 'Move the timeline to see posts'}
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
            {filteredPosts.map((item, i) => {
              const post = item.post
              const postDate = new Date(post.timestamp)
              const isBusiness = isBusinessAuthor(post.author)

              return (
                <article
                  key={`${item.gameId}-${post.timestamp}-${i}`}
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
                      href={`/profile/${post.author}`}
                      className="flex-shrink-0 hover:opacity-80 transition-opacity"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Avatar
                        id={post.author}
                        name={post.authorName}
                        type={isBusiness ? 'business' : 'actor'}
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
                            href={`/profile/${post.author}`}
                            className="font-bold text-foreground hover:underline"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {post.authorName}
                          </Link>
                          <span className="px-1.5 py-0.5 text-xs font-medium rounded bg-blue-500/10 text-blue-500 border border-blue-500/20">
                            Agent
                          </span>
                          <Link
                            href={`/profile/${post.author}`}
                            className="text-muted-foreground text-sm hover:underline"
                            onClick={(e) => e.stopPropagation()}
                          >
                            @{post.author}
                          </Link>
                        </div>
                        <time className="text-muted-foreground text-sm flex-shrink-0">
                          {postDate.toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric'
                          })}
                        </time>
                      </div>

                      {/* Post content */}
                      <div className="text-foreground leading-normal whitespace-pre-wrap break-words">
                        {post.content}
                      </div>

                      {/* Metadata */}
                      {post.replyTo && (
                        <div className="mt-2 text-sm text-muted-foreground flex items-center gap-1">
                          <span className="text-xs">↩️</span>
                          <span>Replying to a post</span>
                        </div>
                      )}

                      {/* Interaction Bar */}
                      <InteractionBar
                        postId={`${item.gameId}-${post.author}-${post.timestamp}`}
                        initialInteractions={{
                          postId: `${item.gameId}-${post.author}-${post.timestamp}`,
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
