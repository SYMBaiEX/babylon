'use client'

import { useState, useMemo, useEffect } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Calendar, Briefcase, Users } from 'lucide-react'
import { Avatar } from '@/components/shared/Avatar'
import { PageContainer } from '@/components/shared/PageContainer'
import { SearchBar } from '@/components/shared/SearchBar'
import { cn } from '@/lib/utils'
import { useFontSize } from '@/contexts/FontSizeContext'
import type { Actor, Organization, FeedPost, ActorsDatabase } from '@/shared/types'

interface ActorInfo {
  id: string
  name: string
  description?: string
  domain?: string[]
  personality?: string
  tier?: string
  affiliations?: string[]
  type: 'actor' | 'organization'
  orgType?: 'company' | 'media' | 'government'
  initialPrice?: number
}

export default function ActorProfilePage() {
  const params = useParams()
  const actorId = params.id as string
  const { fontSize } = useFontSize()
  const [searchQuery, setSearchQuery] = useState('')
  const [actorInfo, setActorInfo] = useState<ActorInfo | null>(null)
  const [posts, setPosts] = useState<FeedPost[]>([])
  const [loading, setLoading] = useState(true)

  // Load actor info from actors.json
  useEffect(() => {
    const loadActorInfo = async () => {
      try {
        // Load actors database
        const response = await fetch('/data/actors.json')
        if (!response.ok) {
          throw new Error('Failed to load actors')
        }
        
        const actorsDb: ActorsDatabase = await response.json()
        
        // Find actor
        const actor = actorsDb.actors.find(a => a.id === actorId)
        if (actor) {
          setActorInfo({
            id: actor.id,
            name: actor.name,
            description: actor.description,
            domain: actor.domain,
            personality: actor.personality,
            tier: actor.tier,
            affiliations: actor.affiliations,
            type: 'actor',
          })
          return
        }

        // Find organization
        const org = actorsDb.organizations.find(o => o.id === actorId)
        if (org) {
          setActorInfo({
            id: org.id,
            name: org.name,
            description: org.description,
            type: 'organization',
            orgType: org.type,
            initialPrice: org.initialPrice,
          })
          return
        }

        // Not found
        setActorInfo(null)
      } catch (error) {
        console.error('Failed to load actor info:', error)
        setActorInfo(null)
      }
    }

    loadActorInfo()
  }, [actorId])

  // Load posts from realtime history
  useEffect(() => {
    const loadPosts = async () => {
      try {
        // Try realtime history first
        const realtimeResponse = await fetch('/games/realtime/history.json')
        if (realtimeResponse.ok) {
          const data = await realtimeResponse.json()
          
          // Extract posts by this actor from all ticks
          const actorPosts: FeedPost[] = []
          if (data.ticks && Array.isArray(data.ticks)) {
            data.ticks.forEach((tick: any) => {
              if (tick.posts && Array.isArray(tick.posts)) {
                tick.posts.forEach((post: FeedPost) => {
                  if (post.author === actorId) {
                    actorPosts.push(post)
                  }
                })
              }
            })
          }
          
          // Sort by timestamp (newest first)
          actorPosts.sort((a, b) => 
            new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
          )
          
          setPosts(actorPosts)
          setLoading(false)
          return
        }
      } catch (error) {
        console.error('Failed to load realtime posts:', error)
      }

      // Fallback to static game files
      try {
        const actorPosts: FeedPost[] = []
        
        // Load genesis
        const genesisResponse = await fetch('/genesis.json')
        if (genesisResponse.ok) {
          const genesis = await genesisResponse.json()
          genesis.timeline?.forEach((day: any) => {
            day.feedPosts?.forEach((post: FeedPost) => {
              if (post.author === actorId) {
                actorPosts.push(post)
              }
            })
          })
        }

        // Load latest
        const latestResponse = await fetch('/games/latest.json')
        if (latestResponse.ok) {
          const latest = await latestResponse.json()
          latest.timeline?.forEach((day: any) => {
            day.feedPosts?.forEach((post: FeedPost) => {
              if (post.author === actorId) {
                actorPosts.push(post)
              }
            })
          })
        }

        actorPosts.sort((a, b) => 
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
        )
        
        setPosts(actorPosts)
        setLoading(false)
      } catch (error) {
        console.error('Failed to load posts:', error)
        setPosts([])
        setLoading(false)
      }
    }

    if (actorInfo) {
      loadPosts()
    }
  }, [actorId, actorInfo])

  // Filter posts up to current time
  const visiblePosts = useMemo(() => {
    const now = new Date().getTime()
    return posts.filter(post => {
      const postTime = new Date(post.timestamp).getTime()
      return postTime <= now
    })
  }, [posts])

  // Filter by search query
  const filteredPosts = useMemo(() => {
    if (!searchQuery.trim()) return visiblePosts

    const query = searchQuery.toLowerCase()
    return visiblePosts.filter(post =>
      post.content.toLowerCase().includes(query)
    )
  }, [visiblePosts, searchQuery])

  if (loading) {
    return (
      <PageContainer noPadding className="flex flex-col">
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center text-muted-foreground">
            <div className="text-lg mb-2">Loading profile...</div>
          </div>
        </div>
      </PageContainer>
    )
  }

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
            <div className="flex items-start gap-4 mb-4">
              <Avatar
                id={actorInfo.id}
                name={actorInfo.name}
                type={actorInfo.type}
                size="lg"
                className="w-20 h-20"
              />
              <div className="flex-1">
                <h2 className="text-2xl font-bold mb-1">{actorInfo.name}</h2>
                {actorInfo.type === 'actor' && actorInfo.tier && (
                  <div className="inline-block px-2 py-1 rounded-full text-xs font-bold bg-primary/20 text-primary mb-2">
                    {actorInfo.tier.replace('_TIER', '')}
                  </div>
                )}
                {actorInfo.type === 'organization' && actorInfo.orgType && (
                  <div className="flex items-center gap-2 mb-2">
                    <Briefcase className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground capitalize">{actorInfo.orgType}</span>
                    {actorInfo.initialPrice && (
                      <>
                        <span className="text-muted-foreground">·</span>
                        <span className="text-sm font-mono text-foreground">
                          ${actorInfo.initialPrice.toFixed(2)}
                        </span>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Description */}
            {actorInfo.description && (
              <p className="text-sm text-foreground mb-3 leading-relaxed">
                {actorInfo.description}
              </p>
            )}

            {/* Metadata */}
            <div className="flex flex-wrap gap-4 text-sm">
              {actorInfo.domain && actorInfo.domain.length > 0 && (
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-muted-foreground" />
                  <span className="text-muted-foreground">
                    {actorInfo.domain.join(', ')}
                  </span>
                </div>
              )}
              {actorInfo.personality && (
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-muted-foreground" />
                  <span className="text-muted-foreground capitalize">
                    {actorInfo.personality}
                  </span>
                </div>
              )}
            </div>

            {/* Affiliations */}
            {actorInfo.affiliations && actorInfo.affiliations.length > 0 && (
              <div className="mt-4">
                <div className="text-xs font-bold text-muted-foreground mb-2">AFFILIATIONS</div>
                <div className="flex flex-wrap gap-2">
                  {actorInfo.affiliations.map(affiliation => (
                    <Link
                      key={affiliation}
                      href={`/profile/${affiliation}`}
                      className="px-3 py-1 rounded-full bg-muted hover:bg-muted/80 text-xs font-medium text-foreground transition-colors"
                    >
                      {affiliation}
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Posts */}
        <div className="max-w-[600px] mx-auto">
          {filteredPosts.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-muted-foreground">
                {searchQuery ? 'No posts found matching your search' : 'No posts yet'}
              </p>
              {!searchQuery && posts.length === 0 && (
                <p className="text-sm text-muted-foreground mt-2">
                  Start the daemon to see posts: <span className="font-mono">bun run daemon</span>
                </p>
              )}
            </div>
          ) : (
            filteredPosts.map((post, i) => {
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
            })
          )}
        </div>
      </div>
    </PageContainer>
  )
}
