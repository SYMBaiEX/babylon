'use client'

import { useState, useMemo, useEffect } from 'react'
import Link from 'next/link'
import { FeedToggle } from '@/components/shared/FeedToggle'
import { Avatar } from '@/components/shared/Avatar'
import { PageContainer } from '@/components/shared/PageContainer'
import { SearchBar } from '@/components/shared/SearchBar'
import { cn } from '@/lib/utils'
import { useFontSize } from '@/contexts/FontSizeContext'
import type { FeedPost } from '@/shared/types'

interface RealtimeHistoryTick {
  timestamp: string
  posts: FeedPost[]
  events: any[]
  priceUpdates: any[]
}

export default function FeedPage() {
  const [tab, setTab] = useState<'latest' | 'following'>('latest')
  const [searchQuery, setSearchQuery] = useState('')
  const [realtimePosts, setRealtimePosts] = useState<FeedPost[]>([])
  const [loading, setLoading] = useState(true)
  const [lastUpdate, setLastUpdate] = useState(new Date())
  const { fontSize } = useFontSize()

  // Load realtime posts from daemon history
  useEffect(() => {
    const loadRealtimePosts = async () => {
      try {
        const response = await fetch('/games/realtime/history.json')
        if (response.ok) {
          const data = await response.json()
          
          // Extract all posts from all ticks
          const allPosts: FeedPost[] = []
          if (data.ticks && Array.isArray(data.ticks)) {
            data.ticks.forEach((tick: RealtimeHistoryTick) => {
              if (tick.posts && Array.isArray(tick.posts)) {
                allPosts.push(...tick.posts)
              }
            })
          }
          
          // Sort by timestamp (newest first)
          allPosts.sort((a, b) => 
            new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
          )
          
          setRealtimePosts(allPosts)
          setLoading(false)
        } else {
          // No realtime history yet, try loading from static files as fallback
          await loadStaticGamePosts()
        }
      } catch (error) {
        console.error('Failed to load realtime posts:', error)
        // Fallback to static game files
        await loadStaticGamePosts()
      }
    }

    const loadStaticGamePosts = async () => {
      const allPosts: FeedPost[] = []
      
      // Try genesis
      try {
        const genesis = await fetch('/genesis.json')
        if (genesis.ok) {
          const data = await genesis.json()
          data.timeline?.forEach((day: any) => {
            if (day.feedPosts) {
              allPosts.push(...day.feedPosts)
            }
          })
        }
      } catch (e) {
        // Ignore
      }

      // Try latest
      try {
        const latest = await fetch('/games/latest.json')
        if (latest.ok) {
          const data = await latest.json()
          data.timeline?.forEach((day: any) => {
            if (day.feedPosts) {
              allPosts.push(...day.feedPosts)
            }
          })
        }
      } catch (e) {
        // Ignore
      }

      allPosts.sort((a, b) => 
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      )
      
      setRealtimePosts(allPosts)
      setLoading(false)
    }

    loadRealtimePosts()

    // Poll for new posts every 30 seconds
    const pollInterval = setInterval(() => {
      loadRealtimePosts()
      setLastUpdate(new Date())
    }, 30000)

    return () => clearInterval(pollInterval)
  }, [])

  // Filter posts by current actual time (not future posts)
  const visiblePosts = useMemo(() => {
    const now = new Date().getTime()
    return realtimePosts.filter(post => {
      const postTime = new Date(post.timestamp).getTime()
      return postTime <= now
    })
  }, [realtimePosts])

  // Filter by search query
  const filteredPosts = useMemo(() => {
    if (!searchQuery.trim()) return visiblePosts

    const query = searchQuery.toLowerCase()
    return visiblePosts.filter(post =>
      post.content.toLowerCase().includes(query) ||
      post.authorName.toLowerCase().includes(query)
    )
  }, [visiblePosts, searchQuery])

  if (loading) {
    return (
      <PageContainer noPadding className="flex flex-col">
        <FeedToggle activeTab={tab} onTabChange={setTab} />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center text-muted-foreground">
            <div className="text-lg mb-2">Loading feed...</div>
            <div className="text-sm">Fetching realtime posts</div>
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
      <div className="sticky top-0 z-10 bg-background border-b border-border px-4 py-3">
        <SearchBar
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder="Search posts..."
        />
        {/* Live indicator */}
        <div className="flex items-center justify-between mt-2">
          <div className="text-xs text-muted-foreground">
            {visiblePosts.length} posts • Last updated: {lastUpdate.toLocaleTimeString()}
          </div>
          <div className="flex items-center gap-1 text-xs">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
            <span className="text-green-600 dark:text-green-400 font-medium">LIVE</span>
          </div>
        </div>
      </div>

      {/* Content area */}
      <div className="flex-1 overflow-y-auto bg-background">
        {visiblePosts.length === 0 ? (
          // No posts yet
          <div className="max-w-2xl mx-auto p-8 text-center">
            <div className="text-muted-foreground py-12">
              <h2 className="text-2xl font-bold mb-2 text-foreground">No Posts Yet</h2>
              <p className="mb-6">
                Start the realtime daemon to see posts appear
              </p>
              <div className="bg-muted p-4 rounded-lg text-left text-sm font-mono">
                <div className="text-foreground mb-2">$ bun run daemon</div>
                <div className="text-muted-foreground">
                  This will start generating 10-20 posts per minute
                </div>
              </div>
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
            {filteredPosts.map((post, i) => {
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
                        type="actor"
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
                        <time className="text-muted-foreground text-sm" title={postDate.toLocaleString()}>
                          {timeAgo}
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
