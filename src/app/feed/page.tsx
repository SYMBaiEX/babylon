'use client'

import { useState, useMemo } from 'react'
import { useGameStore } from '@/stores/gameStore'
import Link from 'next/link'
import { FeedToggle } from '@/components/shared/FeedToggle'
import { Avatar } from '@/components/shared/Avatar'
import { PageContainer } from '@/components/shared/PageContainer'
import { SearchBar } from '@/components/shared/SearchBar'
import { cn } from '@/lib/utils'
import { useFontSize } from '@/contexts/FontSizeContext'

export default function FeedPage() {
  const [tab, setTab] = useState<'latest' | 'following'>('latest')
  const [searchQuery, setSearchQuery] = useState('')
  const { allGames, currentTimeMs, startTime } = useGameStore()
  const { fontSize } = useFontSize()

  // Get current date based on timeline
  const currentDate = startTime ? new Date(startTime + currentTimeMs) : null

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
    if (!searchQuery.trim()) return visibleFeedPosts

    const query = searchQuery.toLowerCase()
    return visibleFeedPosts.filter(item =>
      item.post.content.toLowerCase().includes(query) ||
      item.post.authorName.toLowerCase().includes(query)
    )
  }, [visibleFeedPosts, searchQuery])

  return (
    <PageContainer noPadding className="flex flex-col">
      {/* Header with tabs */}
      <FeedToggle activeTab={tab} onTabChange={setTab} />

      {/* Search Bar */}
      <div className="sticky top-0 z-10 bg-background border-b border-border px-4 py-3">
        <SearchBar
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder="Search posts..."
        />
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
                      {/* Author and timestamp */}
                      <div className="flex items-center gap-2 mb-1">
                        <Link
                          href={`/profile/${post.author}`}
                          className="font-bold text-foreground hover:underline"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {post.authorName}
                        </Link>
                        <span className="text-muted-foreground text-sm">·</span>
                        <time className="text-muted-foreground text-sm">
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
