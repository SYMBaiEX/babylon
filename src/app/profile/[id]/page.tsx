'use client'

import { useState, useMemo, useEffect } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Calendar, Briefcase, Users } from 'lucide-react'
import { Avatar } from '@/components/shared/Avatar'
import { PageContainer } from '@/components/shared/PageContainer'
import { SearchBar } from '@/components/shared/SearchBar'
import { FavoriteButton, InteractionBar } from '@/components/interactions'
import { cn } from '@/lib/utils'
import { useFontSize } from '@/contexts/FontSizeContext'
import { useErrorToasts } from '@/hooks/useErrorToasts'
import { useGameStore } from '@/stores/gameStore'
import type { FeedPost } from '@/shared/types'

export default function ActorProfilePage() {
  const params = useParams()
  const actorId = params.id as string
  const { fontSize } = useFontSize()
  const [searchQuery, setSearchQuery] = useState('')
  const [tab, setTab] = useState<'posts' | 'replies'>('posts')
  const { allGames } = useGameStore()

  // Enable error toast notifications
  useErrorToasts()

  // Find actor info
  const actorInfo = useMemo(() => {
    for (const game of allGames) {
      // Check all actor arrays
      const allActors = [
        ...(game.setup?.mainActors || []),
        ...(game.setup?.supportingActors || []),
        ...(game.setup?.extras || [])
      ]

      const actor = allActors.find(a => a.id === actorId)
      if (actor) {
        return {
          id: actor.id,
          name: actor.name,
          type: 'actor' as const,
          role: actor.role || 'actor',
          game: game
        }
      }
    }
    return null
  }, [allGames, actorId])

  // Get posts for this actor from all games
  const actorPosts = useMemo(() => {
    const posts: Array<{
      post: FeedPost
      gameId: string
      gameName: string
      timestampMs: number
    }> = []

    allGames.forEach(game => {
      game.timeline?.forEach(day => {
        day.feedPosts?.forEach(post => {
          if (post.author === actorId) {
            const postDate = new Date(post.timestamp)
            posts.push({
              post,
              gameId: game.id,
              gameName: game.setup?.title || game.id,
              timestampMs: postDate.getTime()
            })
          }
        })
      })
    })

    // Sort by timestamp (newest first)
    return posts.sort((a, b) => b.timestampMs - a.timestampMs)
  }, [allGames, actorId])

  // Filter posts up to current time
  const visiblePosts = useMemo(() => {
    const now = new Date().getTime()
    return actorPosts.filter(item => item.timestampMs <= now)
  }, [actorPosts])

  // Separate posts and replies (from visible posts only)
  const originalPosts = useMemo(() => {
    return visiblePosts.filter(item => !item.post.replyTo)
  }, [visiblePosts])

  const replyPosts = useMemo(() => {
    return visiblePosts.filter(item => item.post.replyTo)
  }, [visiblePosts])

  // Filter by tab
  const tabFilteredPosts = useMemo(() => {
    return tab === 'posts' ? originalPosts : replyPosts
  }, [tab, originalPosts, replyPosts])

  // Filter by search query
  const filteredPosts = useMemo(() => {
    if (!searchQuery.trim()) return tabFilteredPosts

    const query = searchQuery.toLowerCase()
    return tabFilteredPosts.filter(item =>
      item.post.content.toLowerCase().includes(query)
    )
  }, [tabFilteredPosts, searchQuery])

  // Actor not found
  if (!actorInfo) {
    return (
      <PageContainer noPadding className="flex flex-col">
        <div className="sticky top-0 z-10 bg-background border-b border-border">
          <div className="px-4 py-3 flex items-center gap-4">
            <Link
              href="/feed"
              className="hover:bg-muted/50 rounded-full p-2 transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <h1 className="text-xl font-bold">Profile Not Found</h1>
          </div>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center gap-4">
          <p className="text-muted-foreground">Actor "{actorId}" not found</p>
          <Link
            href="/feed"
            className="px-6 py-3 rounded-lg font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition-all"
          >
            Back to Feed
          </Link>
        </div>
      </PageContainer>
    )
  }

  return (
    <PageContainer noPadding className="flex flex-col">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm border-b border-border">
        <div className="px-4 py-3 flex items-center gap-4">
          <Link
            href="/feed"
            className="hover:bg-muted/50 rounded-full p-2 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="flex-1">
            <h1 className="text-xl font-bold">{actorInfo.name}</h1>
            <p className="text-sm text-muted-foreground">{visiblePosts.length} posts</p>
          </div>
        </div>

        {/* Tabs: Posts vs Replies */}
        <div className="flex items-center justify-around h-14 border-b border-border">
          <button
            onClick={() => setTab('posts')}
            className={cn(
              'flex-1 h-full font-semibold transition-all duration-300 relative',
              tab === 'posts'
                ? 'text-foreground'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/30'
            )}
          >
            Posts ({originalPosts.length})
            {tab === 'posts' && (
              <div className="absolute bottom-0 left-0 right-0 h-1 bg-primary rounded-t-full" />
            )}
          </button>
          <button
            onClick={() => setTab('replies')}
            className={cn(
              'flex-1 h-full font-semibold transition-all duration-300 relative',
              tab === 'replies'
                ? 'text-foreground'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/30'
            )}
          >
            Replies ({replyPosts.length})
            {tab === 'replies' && (
              <div className="absolute bottom-0 left-0 right-0 h-1 bg-primary rounded-t-full" />
            )}
          </button>
        </div>

        {/* Search Bar */}
        <div className="px-4 py-3">
          <SearchBar
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder={`Search ${tab}...`}
          />
        </div>
      </div>

      {/* Content area */}
      <div className="flex-1 overflow-y-auto">
        {/* Profile Header */}
        <div className="border-b border-border">
          <div className="max-w-[600px] mx-auto px-4 py-6">
            <div className="flex items-start gap-4 mb-4">
              <Avatar
                id={actorInfo.id}
                name={actorInfo.name}
                type={actorInfo.type}
                size="lg"
                className="w-20 h-20"
              />
              <div className="flex-1">
                <h2 className="text-2xl font-bold">{actorInfo.name}</h2>
                <p className="text-muted-foreground">{actorInfo.role}</p>
                <div className="flex items-center gap-2 mt-2 text-sm text-muted-foreground">
                  <Calendar className="w-4 h-4" />
                  <span>Active in {actorInfo.game.id}</span>
                </div>
                <div className="mt-3">
                  <FavoriteButton
                    profileId={actorInfo.id}
                    variant="button"
                    size="md"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Posts */}
        <div className="max-w-[600px] mx-auto">
          {filteredPosts.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-muted-foreground">
                {searchQuery ? 'No posts found matching your search' : 'No posts yet'}
              </p>
            </div>
          ) : (
            filteredPosts.map((item, i) => {
              const postDate = new Date(item.post.timestamp)
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
                  key={`${item.post.id}-${i}`}
                  className={cn(
                    'px-4 py-3 border-b border-border',
                    'hover:bg-muted/30',
                    'transition-all duration-200'
                  )}
                  style={{
                    fontSize: `${fontSize}rem`,
                  }}
                >
                  <div className="flex gap-3">
                    {/* Avatar */}
                    <div className="flex-shrink-0">
                      <Avatar
                        id={item.post.author}
                        name={item.post.authorName}
                        type={actorInfo.type}
                        size="lg"
                        scaleFactor={fontSize}
                      />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      {/* Author and timestamp */}
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-bold text-foreground">
                          {item.post.authorName}
                        </span>
                        <span className="text-muted-foreground text-sm">·</span>
                        <time className="text-muted-foreground text-sm" title={postDate.toLocaleString()}>
                          {timeAgo}
                        </time>
                      </div>

                      {/* Post content */}
                      <div className="text-foreground leading-normal whitespace-pre-wrap break-words">
                        {item.post.content}
                      </div>

                      {/* Metadata */}
                      {item.post.replyTo && (
                        <div className="mt-2 text-sm text-muted-foreground flex items-center gap-1">
                          <span className="text-xs">↩️</span>
                          <span>Replying to a post</span>
                        </div>
                      )}

                      {/* Interactions */}
                      <InteractionBar
                        postId={`${item.gameId}-${item.post.author}-${item.post.timestamp}`}
                        initialInteractions={{
                          postId: `${item.gameId}-${item.post.author}-${item.post.timestamp}`,
                          likeCount: 0,
                          commentCount: 0,
                          shareCount: 0,
                          isLiked: false,
                          isShared: false,
                        }}
                        className="mt-3"
                      />
                    </div>
                  </div>
                </article>
              )
            })
          )}
        </div>
      </div>
    </PageContainer>
  )
}
