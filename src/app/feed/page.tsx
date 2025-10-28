'use client'

import { useState, useMemo } from 'react'
import { useGameStore } from '@/stores/gameStore'
import Link from 'next/link'
import { FeedToggle } from '@/components/shared/FeedToggle'
import { Avatar } from '@/components/shared/Avatar'
import { cn } from '@/lib/utils'

export default function FeedPage() {
  const [tab, setTab] = useState<'latest' | 'following'>('latest')
  const { allGames, currentTimeMs, startTime } = useGameStore()

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

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Header with tabs */}
      <FeedToggle activeTab={tab} onTabChange={setTab} />

      {/* Content area */}
      <div className="flex-1 overflow-y-auto">
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
        ) : visibleFeedPosts.length === 0 ? (
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
        ) : (
          // Show posts
          <div className="max-w-2xl mx-auto">
            {visibleFeedPosts.map((item, i) => {
              const post = item.post
              const postDate = new Date(post.timestamp)
              const isBusiness = isBusinessAuthor(post.author)

              return (
                <div
                  key={`${item.gameId}-${post.timestamp}-${i}`}
                  className={cn(
                    'p-4 border-b border-border',
                    'hover:bg-muted/50',
                    'transition-colors duration-200'
                  )}
                >
                  <div className="flex gap-3">
                    {/* Avatar */}
                    <div className="flex-shrink-0">
                      <Avatar
                        id={post.author}
                        name={post.authorName}
                        type={isBusiness ? 'business' : 'actor'}
                        size="lg"
                      />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      {/* Author and timestamp */}
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-bold text-sm text-foreground">
                          {post.authorName}
                        </span>
                        <span className="text-muted-foreground text-sm">·</span>
                        <span className="text-muted-foreground text-sm">
                          {postDate.toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric'
                          })}{' '}
                          at{' '}
                          {postDate.toLocaleTimeString('en-US', {
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </span>
                      </div>

                      {/* Post content */}
                      <div className="text-sm leading-relaxed whitespace-pre-wrap break-words text-foreground">
                        {post.content}
                      </div>

                      {/* Metadata */}
                      {post.replyTo && (
                        <div className="mt-2 text-xs text-muted-foreground">
                          ↩️ Reply
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
