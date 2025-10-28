'use client'

import { useState, useMemo } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Calendar } from 'lucide-react'
import { useGameStore } from '@/stores/gameStore'
import { Avatar } from '@/components/shared/Avatar'
import { PageContainer } from '@/components/shared/PageContainer'
import { SearchBar } from '@/components/shared/SearchBar'
import { cn } from '@/lib/utils'
import { useFontSize } from '@/contexts/FontSizeContext'

export default function ActorProfilePage() {
  const params = useParams()
  const actorId = params.id as string
  const { allGames, currentTimeMs, startTime } = useGameStore()
  const { fontSize} = useFontSize()
  const [searchQuery, setSearchQuery] = useState('')

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

      // Check organizations
      const org = game.setup?.organizations?.find(o => o.id === actorId)
      if (org) {
        return {
          id: org.id,
          name: org.name,
          type: 'business' as const,
          role: org.type || 'organization',
          game: game
        }
      }
    }
    return null
  }, [allGames, actorId])

  // Get all posts by this actor
  const actorPosts = useMemo(() => {
    if (allGames.length === 0 || !startTime || !actorId) return []

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
          // Filter by author
          if (post.author === actorId) {
            const postTime = new Date(post.timestamp).getTime()
            posts.push({
              post,
              gameId: g.id,
              gameName,
              timestampMs: postTime
            })
          }
        })
      })
    })

    const currentTimeAbsolute = startTime + currentTimeMs
    return posts
      .filter((p) => p.timestampMs <= currentTimeAbsolute)
      .sort((a, b) => b.timestampMs - a.timestampMs)
  }, [allGames, startTime, currentTimeMs, actorId])

  // Filter posts by search query
  const filteredPosts = useMemo(() => {
    if (!searchQuery.trim()) return actorPosts

    const query = searchQuery.toLowerCase()
    return actorPosts.filter(item =>
      item.post.content.toLowerCase().includes(query) ||
      item.post.authorName.toLowerCase().includes(query)
    )
  }, [actorPosts, searchQuery])

  // Loading state - no games loaded yet
  if (allGames.length === 0) {
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
            <h1 className="text-xl font-bold">Profile</h1>
          </div>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center gap-4">
          <p className="text-muted-foreground">No game loaded</p>
          <Link
            href="/game"
            className="px-6 py-3 rounded-lg font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition-all"
          >
            Load a Game
          </Link>
        </div>
      </PageContainer>
    )
  }

  // Actor not found in loaded games
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
          <p className="text-muted-foreground">Actor "{actorId}" not found in loaded games</p>
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
            <p className="text-sm text-muted-foreground">{actorPosts.length} posts</p>
          </div>
        </div>

        {/* Search Bar */}
        <div className="px-4 pb-3">
          <SearchBar
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder="Search posts..."
          />
        </div>
      </div>

      {/* Content area */}
      <div className="flex-1 overflow-y-auto">
        {/* Profile Header */}
        <div className="border-b border-border">
          <div className="max-w-[600px] mx-auto px-4 py-6">
            <div className="flex items-start gap-4">
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
              const post = item.post
              const postDate = new Date(post.timestamp)

              return (
                <article
                  key={`${item.gameId}-${post.timestamp}-${i}`}
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
                        id={post.author}
                        name={post.authorName}
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
                          {post.authorName}
                        </span>
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
            })
          )}
        </div>
      </div>
    </PageContainer>
  )
}
