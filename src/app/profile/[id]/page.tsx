/* eslint-disable @typescript-eslint/no-explicit-any */
'use client'

import { useState, useMemo, useEffect } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Calendar, Briefcase } from 'lucide-react'
import { Avatar } from '@/components/shared/Avatar'
import { PageContainer } from '@/components/shared/PageContainer'
import { SearchBar } from '@/components/shared/SearchBar'
import { FavoriteButton, InteractionBar } from '@/components/interactions'
import { cn } from '@/lib/utils'
import { useFontSize } from '@/contexts/FontSizeContext'
import { useErrorToasts } from '@/hooks/useErrorToasts'
import { useGameStore } from '@/stores/gameStore'
import { logger } from '@/lib/logger'
import type { FeedPost, Actor, Organization } from '@/shared/types'
import type { ProfileInfo } from '@/types/profiles'

export default function ActorProfilePage() {
  const params = useParams()
  const actorId = decodeURIComponent(params.id as string)
  const { fontSize } = useFontSize()
  const [searchQuery, setSearchQuery] = useState('')
  const [tab, setTab] = useState<'posts' | 'replies'>('posts')
  const { allGames } = useGameStore();

  // Enable error toast notifications
  useErrorToasts()

  // Load actor/user info
  const [actorInfo, setActorInfo] = useState<ProfileInfo | null>(null)
  const [loading, setLoading] = useState(true)
  
  useEffect(() => {
    const loadActorInfo = async () => {
      try {
        setLoading(true)
        
        // Check if this is a user ID (starts with "did:privy:" or similar)
        const isUserId = actorId.startsWith('did:privy:') || actorId.length > 42
        
        if (isUserId) {
          // Load user profile from API
          try {
            const token = typeof window !== 'undefined' ? window.__privyAccessToken : null
            const headers: HeadersInit = {
              'Content-Type': 'application/json',
            }
            if (token) {
              headers['Authorization'] = `Bearer ${token}`
            }
            
            const response = await fetch(`/api/users/${actorId}/profile`, { headers })
            if (response.ok) {
              const data = await response.json()
              if (data.user) {
                setActorInfo({
                  id: data.user.id,
                  name: data.user.displayName || data.user.username || 'User',
                  description: data.user.bio || '',
                  role: data.user.isActor ? 'Actor' : 'User',
                  type: data.user.isActor ? 'actor' : 'user' as const,
                  isUser: true,
                  username: data.user.username,
                  profileImageUrl: data.user.profileImageUrl,
                  stats: data.user.stats,
                })
                setLoading(false)
                return
              }
            }
          } catch (error) {
            logger.error('Failed to load user profile:', error, 'ActorProfilePage')
          }
        }
        
        // Try to load from actors.json (contains all actors)
        const response = await fetch('/data/actors.json')
        if (!response.ok) throw new Error('Failed to load actors')
        
        const actorsDb = await response.json() as { actors?: Actor[]; organizations?: Organization[] }
        
        // Find actor
        let actor = actorsDb.actors?.find((a) => a.id === actorId)
        if (!actor) {
          actor = actorsDb.actors?.find((a) => a.name === actorId)
        }
        if (actor) {
          // Find which game this actor belongs to
          let gameId: string | null = null
          for (const game of allGames) {
            const allActors = [
              ...(game.setup?.mainActors || []),
              ...(game.setup?.supportingActors || []),
              ...(game.setup?.extras || []),
            ]
            if (allActors.some(a => a.id === actorId)) {
              gameId = game.id
              break
            }
          }
          
          setActorInfo({
            id: actor.id,
            name: actor.name,
            description: actor.description,
            tier: actor.tier,
            domain: actor.domain,
            personality: actor.personality,
            affiliations: actor.affiliations,
            role: actor.role || actor.tier || 'Actor',
            type: 'actor' as const,
            game: gameId ? { id: gameId } : undefined,
          })
          setLoading(false)
          return
        }
        
        // Find organization
        let org = actorsDb.organizations?.find((o) => o.id === actorId)
        if (!org) {
          org = actorsDb.organizations?.find((o) => o.name === actorId)
        }
        if (org) {
          setActorInfo({
            id: org.id,
            name: org.name,
            description: org.description,
            type: 'organization' as const,
            role: 'Organization',
          })
          setLoading(false)
          return
        }
        
        // Not found
        setActorInfo(null)
        setLoading(false)
      } catch (error) {
        logger.error('Failed to load actor:', error, 'ActorProfilePage')
        setActorInfo(null)
        setLoading(false)
      }
    }
    
    loadActorInfo()
  }, [actorId, allGames])

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
              gameName: game.id,
              timestampMs: postDate.getTime()
            })
          }
        })
      })
    })

    // Sort by timestamp (newest first)
    return posts.sort((a, b) => b.timestampMs - a.timestampMs)
  }, [allGames, actorId])

  // Separate posts and replies
  const originalPosts = useMemo(() => {
    return actorPosts.filter(item => !item.post.replyTo)
  }, [actorPosts])

  const replyPosts = useMemo(() => {
    return actorPosts.filter(item => item.post.replyTo)
  }, [actorPosts])

  // Filter by tab
  const tabFilteredPosts = useMemo(() => {
    return tab === 'posts' ? originalPosts : replyPosts
  }, [tab, originalPosts, replyPosts])

  // Filter by search query
  const filteredPosts = useMemo(() => {
    if (!searchQuery.trim()) return tabFilteredPosts

    const query = searchQuery.toLowerCase()
    return tabFilteredPosts.filter(item =>
      item.post.content?.toLowerCase().includes(query)
    )
  }, [tabFilteredPosts, searchQuery])

  // Loading or actor not found
  if (loading) {
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
            <h1 className="text-xl font-bold">Loading...</h1>
          </div>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center gap-4">
          <p className="text-muted-foreground">Loading profile...</p>
        </div>
      </PageContainer>
    )
  }

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
            <p className="text-sm text-muted-foreground">{actorPosts.length} posts</p>
          </div>
        </div>
      </div>

      {/* Content area */}
      <div className="flex-1 overflow-y-auto">
        {/* Profile Header */}
        <div className="border-b border-border">
          <div className="max-w-[600px] mx-auto">
            {/* Cover Image */}
            <div className="relative h-32 sm:h-48 bg-gradient-to-br from-primary/20 to-primary/5">
              {actorInfo.isUser && actorInfo.type === 'user' && (actorInfo as any).coverImageUrl ? (
                <img
                  src={(actorInfo as any).coverImageUrl}
                  alt="Cover"
                  className="w-full h-full object-cover"
                />
              ) : null}
            </div>

            {/* Profile Info */}
            <div className="px-4 pb-4">
              {/* Profile Picture */}
              <div className="relative -mt-12 sm:-mt-16 mb-4">
                <Avatar
                  id={actorInfo.id}
                  name={(actorInfo.name ?? actorInfo.username ?? '') as string}
                  type={actorInfo.type === 'organization' ? 'business' : actorInfo.type === 'user' ? undefined : (actorInfo.type as 'actor' | undefined)}
                  size="lg"
                  className="w-24 h-24 sm:w-32 sm:h-32"
                />
              </div>

              {/* Profile Info */}
              <h2 className="text-2xl font-bold mb-1">{actorInfo.name ?? actorInfo.username ?? ''}</h2>
              {actorInfo.username && (
                <p className="text-muted-foreground mb-3">@{actorInfo.username}</p>
              )}

              {/* Description/Bio */}
              {actorInfo.description && (
                <p className="text-foreground mb-4 whitespace-pre-wrap">{actorInfo.description}</p>
              )}

              {/* Metadata */}
              <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground mb-4">
                {actorInfo.role && (
                  <div className="flex items-center gap-2">
                    <Briefcase className="w-4 h-4" />
                    <span>{actorInfo.role}</span>
                  </div>
                )}
                {actorInfo.game?.id && (
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4" />
                    <span>Active in {actorInfo.game.id}</span>
                  </div>
                )}
              </div>

              {/* Stats */}
              {actorInfo.stats && (
                <div className="flex gap-4 text-sm mb-4">
                  <div>
                    <span className="font-bold text-foreground">{actorInfo.stats.following || 0}</span>
                    <span className="text-muted-foreground ml-1">Following</span>
                  </div>
                  <div>
                    <span className="font-bold text-foreground">{actorInfo.stats.followers || 0}</span>
                    <span className="text-muted-foreground ml-1">Followers</span>
                  </div>
                </div>
              )}

              {/* Follow Button */}
              <FavoriteButton
                profileId={actorInfo.id}
                variant="button"
                size="md"
              />
            </div>
          </div>
        </div>

        {/* Tabs: Posts vs Replies */}
        <div className="border-b border-border sticky top-0 bg-background/95 backdrop-blur-sm z-10">
          <div className="max-w-[600px] mx-auto">
            <div className="flex items-center justify-around h-14">
              <button
                onClick={() => setTab('posts')}
                className={cn(
                  'flex-1 h-full font-semibold transition-all duration-300 relative',
                  tab === 'posts'
                    ? 'text-foreground'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/30'
                )}
              >
                Posts
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
                Replies
                {tab === 'replies' && (
                  <div className="absolute bottom-0 left-0 right-0 h-1 bg-primary rounded-t-full" />
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Search Bar */}
        <div className="border-b border-border bg-background">
          <div className="max-w-[600px] mx-auto px-4 py-3">
            <SearchBar
              value={searchQuery}
              onChange={setSearchQuery}
              placeholder={`Search ${tab}...`}
            />
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
                        type={actorInfo.type === 'organization' ? 'business' : actorInfo.type === 'user' ? undefined : (actorInfo.type as 'actor' | undefined)}
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
                        postId={item.post.id}
                        initialInteractions={{
                          postId: item.post.id,
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
