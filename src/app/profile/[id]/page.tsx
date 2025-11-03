'use client'

import { InteractionBar } from '@/components/interactions'
import { ProfileWidget } from '@/components/profile/ProfileWidget'
import { Avatar } from '@/components/shared/Avatar'
import { PageContainer } from '@/components/shared/PageContainer'
import { TaggedText } from '@/components/shared/TaggedText'
import { useFontSize } from '@/contexts/FontSizeContext'
import { useAuth } from '@/hooks/useAuth'
import { useErrorToasts } from '@/hooks/useErrorToasts'
import { logger } from '@/lib/logger'
import { extractUsername, getProfileUrl, isUsername } from '@/lib/profile-utils'
import { cn } from '@/lib/utils'
import { POST_TYPES } from '@/shared/constants'
import type { Actor, FeedPost, Organization } from '@/shared/types'
import { useGameStore } from '@/stores/gameStore'
import type { ProfileInfo } from '@/types/profiles'
import { ArrowLeft, Briefcase, Calendar, Mail, Search, ShieldCheck } from 'lucide-react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useEffect, useLayoutEffect, useMemo, useState } from 'react'

export default function ActorProfilePage() {
  const params = useParams()
  const router = useRouter()
  const identifier = decodeURIComponent(params.id as string)
  const isUsernameParam = isUsername(identifier)
  const actorId = isUsernameParam ? extractUsername(identifier) : identifier
  const { fontSize } = useFontSize()
  const { user, authenticated } = useAuth()
  const [searchQuery, setSearchQuery] = useState('')
  const [tab, setTab] = useState<'posts' | 'replies'>('posts')
  const [isMobile, setIsMobile] = useState(false)
  const { allGames } = useGameStore();
  
  // Check if viewing own profile - compare with both actorId and identifier (for ID-based URLs)
  const isOwnProfile = authenticated && user && (
    user.id === actorId || 
    user.id === decodeURIComponent(identifier) ||
    user.username === actorId ||
    (user.username && user.username.startsWith('@') && user.username.slice(1) === actorId) ||
    (user.username && !user.username.startsWith('@') && user.username === actorId)
  )
  
  // Use useLayoutEffect to redirect BEFORE paint to prevent flash of old username
  // This runs synchronously before the browser paints, preventing any visual flash
  useLayoutEffect(() => {
    if (authenticated && user?.username && !isUsernameParam) {
      const decodedIdentifier = decodeURIComponent(identifier)
      const viewingOwnId = user.id === actorId || 
                          user.id === decodedIdentifier ||
                          user.id === identifier
      
      if (viewingOwnId && user.username) {
        // Additional null check to prevent redirecting to /profile/undefined
        const cleanUsername = user.username.startsWith('@') ? user.username.slice(1) : user.username
        // Only redirect if cleanUsername is valid and the current URL doesn't already match
        if (cleanUsername && identifier !== cleanUsername && decodedIdentifier !== cleanUsername && actorId !== cleanUsername) {
          // Use router.replace for client-side navigation (preserves React state)
          router.replace(`/profile/${cleanUsername}`)
        }
      }
    }
  }, [authenticated, user?.id, user?.username, actorId, identifier, isUsernameParam, router])

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 640);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Enable error toast notifications
  useErrorToasts()

  // Load actor/user info
  const [actorInfo, setActorInfo] = useState<ProfileInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [apiPosts, setApiPosts] = useState<Array<{
    id: string
    content: string
    author: string
    authorId: string
    timestamp: string
    authorName?: string
    authorUsername?: string | null
  }>>([])
  const [loadingPosts, setLoadingPosts] = useState(false)
  
  useEffect(() => {
    const loadActorInfo = async () => {
      try {
        setLoading(true)
        
        // If it's a username (starts with @) or looks like a username, try to find user by username
        if (isUsernameParam || (!actorId.startsWith('did:privy:') && actorId.length <= 42 && !actorId.includes('-'))) {
          // Try to load user profile by username first
          try {
            const token = typeof window !== 'undefined' ? window.__privyAccessToken : null
            const headers: HeadersInit = {
              'Content-Type': 'application/json',
            }
            if (token) {
              headers['Authorization'] = `Bearer ${token}`
            }
            
            // Try username lookup API
            const usernameLookupResponse = await fetch(`/api/users/by-username/${encodeURIComponent(actorId)}`, { headers })
            if (usernameLookupResponse.ok) {
              const usernameData = await usernameLookupResponse.json()
              if (usernameData.user) {
                const user = usernameData.user
                setActorInfo({
                  id: user.id,
                  name: user.displayName || user.username || 'User',
                  description: user.bio || '',
                  role: user.isActor ? 'Actor' : 'User',
                  type: user.isActor ? 'actor' : 'user' as const,
                  isUser: true,
                  username: user.username,
                  profileImageUrl: user.profileImageUrl,
                  coverImageUrl: user.coverImageUrl,
                  stats: user.stats,
                })
                
                // Redirect to username-based URL if we're on ID-based URL (but not if it's the current user's own profile - handled by useEffect)
                if (!isUsernameParam && user.username && !isOwnProfile) {
                  const cleanUsername = user.username.startsWith('@') ? user.username.slice(1) : user.username
                  router.replace(`/profile/${cleanUsername}`)
                  return // Don't render, just redirect
                }
                
                setLoading(false)
                return
              }
            }
          } catch (error) {
            logger.error('Failed to load user profile by username:', error, 'ActorProfilePage')
          }
        }
        
        // Check if this is a user ID (starts with "did:privy:" or contains privy, or is the current user's ID)
        const isUserId = actorId.startsWith('did:privy:') || 
                        actorId.includes('privy') || 
                        actorId.length > 42 ||
                        (authenticated && user && (user.id === actorId || user.id === decodeURIComponent(identifier)))
        
        if (isUserId) {
          // Load user profile from API by ID
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
                const user = data.user
                setActorInfo({
                  id: user.id,
                  name: user.displayName || user.username || 'User',
                  description: user.bio || '',
                  role: user.isActor ? 'Actor' : 'User',
                  type: user.isActor ? 'actor' : 'user' as const,
                  isUser: true,
                  username: user.username,
                  profileImageUrl: user.profileImageUrl,
                  coverImageUrl: user.coverImageUrl,
                  stats: user.stats,
                })
                
                // Redirect to username-based URL if username exists
                if (user.username && !isUsernameParam) {
                  const cleanUsername = user.username.startsWith('@') ? user.username.slice(1) : user.username
                  // Always redirect to username URL if we have one and we're on an ID-based URL
                  router.replace(`/profile/${cleanUsername}`)
                  return // Don't render, just redirect
                }
                
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

  useEffect(() => {
    const loadPosts = async () => {
      if (!actorId) return
      
      setLoadingPosts(true)
      try {
        // If we have actorInfo with ID, use that; otherwise use actorId (could be username)
        const searchId = actorInfo?.id || actorId
        // Fetch posts from API by authorId
        const response = await fetch(`/api/posts?actorId=${encodeURIComponent(searchId)}&limit=100`)
        if (response.ok) {
          const data = await response.json()
          if (data.posts && Array.isArray(data.posts)) {
            setApiPosts(data.posts)
          }
        }
      } catch (error) {
        logger.error('Failed to load posts from API:', error, 'ActorProfilePage')
      } finally {
        setLoadingPosts(false)
      }
    }

    // Load posts when actorInfo is available (has the correct ID)
    if (actorInfo?.id) {
      loadPosts()
    }
  }, [actorId, actorInfo?.id])

  // Get posts for this actor from all games
  const gameStorePosts = useMemo(() => {
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

  // Combine API posts and game store posts, removing duplicates
  const actorPosts = useMemo(() => {
    const combined: Array<{
      post: FeedPost
      gameId: string
      gameName: string
      timestampMs: number
    }> = []

    // Add API posts first
    apiPosts.forEach(apiPost => {
      combined.push({
        post: {
          id: apiPost.id,
          day: 0,
          content: apiPost.content,
          author: apiPost.authorId,
          authorName: apiPost.authorName || actorInfo?.name || apiPost.authorId,
          authorUsername: actorInfo?.username || null,
          timestamp: apiPost.timestamp,
          type: POST_TYPES.POST, // User-generated posts
          sentiment: 0, // Neutral sentiment for user posts
          clueStrength: 0, // User posts don't have clue strength
          pointsToward: null, // User posts don't hint at yes/no
        },
        gameId: '',
        gameName: '',
        timestampMs: new Date(apiPost.timestamp).getTime()
      })
    })

    // Add game store posts that aren't already in API posts
    const apiPostIds = new Set(apiPosts.map(p => p.id))
    gameStorePosts.forEach(gamePost => {
      if (!apiPostIds.has(gamePost.post.id)) {
        combined.push(gamePost)
      }
    })

    // Sort by timestamp (newest first)
    return combined.sort((a, b) => b.timestampMs - a.timestampMs)
  }, [apiPosts, gameStorePosts, actorInfo])

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
    // If we're redirecting, don't show loading state
    if (isOwnProfile && user?.username && !isUsernameParam) {
      return null
    }
    
    return (
      <PageContainer noPadding className="flex flex-col">
        <div className="sticky top-0 z-10 bg-background">
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
        <div className="sticky top-0 z-10 bg-background">
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
      {/* Desktop: Content + Widget layout */}
      <div className="hidden xl:flex flex-1 overflow-hidden">
        {/* Main content */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {/* Header */}
          <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm">
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
          {/* Cover Image */}
          <div className="relative h-[200px] bg-muted">
            {actorInfo.isUser && actorInfo.type === 'user' && 'coverImageUrl' in actorInfo && actorInfo.coverImageUrl ? (
              <img
                src={actorInfo.coverImageUrl as string}
                alt="Cover"
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-primary/20 to-primary/5" />
            )}
          </div>

          {/* Profile Info Container */}
          <div className="px-4 pb-4">
            {/* Top Row: Avatar + Action Buttons */}
            <div className="flex justify-between items-start mb-4">
              {/* Profile Picture - Overlapping cover */}
              <div className="relative -mt-16 sm:-mt-20">
                <div className="w-32 h-32 sm:w-36 sm:h-36 rounded-full border-4 border-background bg-background overflow-hidden">
                  <Avatar
                    id={actorInfo.id}
                    name={(actorInfo.name ?? actorInfo.username ?? '') as string}
                    type={actorInfo.type === 'organization' ? 'business' : actorInfo.type === 'user' ? undefined : (actorInfo.type as 'actor' | undefined)}
                    size="lg"
                    className="w-full h-full"
                  />
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2 pt-3">
                {authenticated && user && user.id !== actorInfo.id && (
                  <>
                    <button className="p-2 rounded-full border border-border hover:bg-muted/50 transition-colors">
                      <Mail className="w-5 h-5" />
                    </button>
                    <button className="px-4 py-2 rounded-full font-bold bg-foreground text-background hover:bg-foreground/90 transition-colors">
                      Follow
                    </button>
                  </>
                )}
                {isOwnProfile && (
                  <Link
                    href="/settings"
                    className="px-4 py-2 rounded-full font-bold border border-border hover:bg-muted/50 transition-colors"
                  >
                    Edit profile
                  </Link>
                )}
              </div>
            </div>

            {/* Name and Handle */}
            <div className="mb-3">
              <div className="flex items-center gap-1 mb-0.5">
                <h2 className="text-xl font-bold">{actorInfo.name ?? actorInfo.username ?? ''}</h2>
                {actorInfo.type === 'actor' && (
                  <ShieldCheck className="w-5 h-5 text-blue-500 flex-shrink-0" fill="currentColor" />
                )}
              </div>
              {actorInfo.username && (
                <p className="text-muted-foreground text-[15px]">@{actorInfo.username}</p>
              )}
            </div>

            {/* Description/Bio */}
            {actorInfo.description && (
              <p className="text-foreground text-[15px] mb-3 whitespace-pre-wrap">{actorInfo.description}</p>
            )}

            {/* Metadata */}
            {(actorInfo.role || actorInfo.game?.id) && (
              <div className="flex flex-wrap items-center gap-3 text-[15px] text-muted-foreground mb-3">
                {actorInfo.role && (
                  <div className="flex items-center gap-1">
                    <Briefcase className="w-4 h-4" />
                    <span>{actorInfo.role}</span>
                  </div>
                )}
                {actorInfo.game?.id && (
                  <div className="flex items-center gap-1">
                    <Calendar className="w-4 h-4" />
                    <span>Active in {actorInfo.game.id}</span>
                  </div>
                )}
              </div>
            )}

            {/* Stats */}
            <div className="flex gap-4 text-[15px]">
              <Link href="#" className="hover:underline">
                <span className="font-bold text-foreground">{actorInfo.stats?.following || 0}</span>
                <span className="text-muted-foreground ml-1">Following</span>
              </Link>
              <Link href="#" className="hover:underline">
                <span className="font-bold text-foreground">{actorInfo.stats?.followers || 0}</span>
                <span className="text-muted-foreground ml-1">Followers</span>
              </Link>
            </div>
          </div>
        </div>

        {/* Tabs: Posts vs Replies */}
        <div className="sticky top-0 bg-background/95 backdrop-blur-sm z-10 border-b border-border">
          <div className="flex items-center justify-between h-14 px-4">
            {/* Tab Buttons */}
            <div className="flex items-center flex-1">
              <button
                onClick={() => setTab('posts')}
                className={cn(
                  'px-4 h-full font-semibold transition-all duration-300 relative hover:bg-muted/30',
                  tab === 'posts'
                    ? 'text-foreground'
                    : 'text-muted-foreground'
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
                  'px-4 h-full font-semibold transition-all duration-300 relative hover:bg-muted/30',
                  tab === 'replies'
                    ? 'text-foreground'
                    : 'text-muted-foreground'
                )}
              >
                Replies
                {tab === 'replies' && (
                  <div className="absolute bottom-0 left-0 right-0 h-1 bg-primary rounded-t-full" />
                )}
              </button>
            </div>

            {/* Search Bar - Top Right */}
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={`Search ${tab}...`}
                className="w-full pl-10 pr-4 py-2 rounded-full bg-muted border-0 text-sm focus:ring-2 focus:ring-primary focus:outline-none"
              />
            </div>
          </div>
        </div>

        {/* Posts */}
        <div className="px-4">
          {loadingPosts ? (
            <div className="py-12 text-center">
              <p className="text-muted-foreground">Loading posts...</p>
            </div>
          ) : filteredPosts.length === 0 ? (
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
                    'px-4 py-3',
                    'hover:bg-muted/30',
                    'transition-all duration-200'
                  )}
                  style={{
                    fontSize: `${fontSize}rem`,
                  }}
                >
                  <div className="flex gap-3">
                    {/* Avatar - Round */}
                    <div className="flex-shrink-0">
                      <Avatar
                        id={item.post.author}
                        name={item.post.authorName}
                        type={actorInfo.type === 'organization' ? 'business' : actorInfo.type === 'user' ? undefined : (actorInfo.type as 'actor' | undefined)}
                        size="md"
                        scaleFactor={fontSize * (isMobile ? 0.9 : 1)}
                      />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      {/* Author, handle on left, timestamp on right */}
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <Link
                            href={getProfileUrl(item.post.author, item.post.authorUsername || actorInfo?.username)}
                            className="font-semibold text-foreground hover:underline truncate"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {item.post.authorName}
                          </Link>
                          <ShieldCheck className="w-5 h-5 text-blue-500 flex-shrink-0" fill="currentColor" />
                          <Link
                            href={getProfileUrl(item.post.author, item.post.authorUsername || actorInfo?.username)}
                            className="text-muted-foreground hover:underline truncate"
                            onClick={(e) => e.stopPropagation()}
                          >
                            @{item.post.authorUsername || actorInfo?.username || item.post.author}
                          </Link>
                        </div>
                        {/* Timestamp - Right aligned */}
                        <time className="text-muted-foreground text-sm flex-shrink-0 ml-auto" title={postDate.toLocaleString()}>
                          {timeAgo}
                        </time>
                      </div>

                      {/* Post content - Below name/handle row */}
                      <div className="text-foreground leading-normal whitespace-pre-wrap break-words">
                        <TaggedText
                          text={item.post.content}
                          onTagClick={(tag) => {
                            router.push(`/feed?search=${encodeURIComponent(tag)}`)
                          }}
                        />
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
        </div>

        {/* Widget Sidebar - Show for all user profiles */}
        {actorInfo && actorInfo.isUser && (
          <div className="hidden xl:flex flex-col w-96 flex-shrink-0 overflow-y-auto bg-sidebar p-4">
            <ProfileWidget userId={actorInfo.id} />
          </div>
        )}
      </div>

      {/* Mobile/Tablet: Full width content */}
      <div className="flex xl:hidden flex-col flex-1 overflow-hidden">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm">
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
            {/* Cover Image */}
            <div className="relative h-[200px] bg-muted">
              {actorInfo.isUser && actorInfo.type === 'user' && 'coverImageUrl' in actorInfo && actorInfo.coverImageUrl ? (
                <img
                  src={actorInfo.coverImageUrl as string}
                  alt="Cover"
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-primary/20 to-primary/5" />
              )}
            </div>

            {/* Profile Info Container */}
            <div className="px-4 pb-4">
              {/* Top Row: Avatar + Action Buttons */}
              <div className="flex justify-between items-start mb-4">
                {/* Profile Picture - Overlapping cover */}
                <div className="relative -mt-16 sm:-mt-20">
                  <div className="w-32 h-32 sm:w-36 sm:h-36 rounded-full border-4 border-background bg-background overflow-hidden">
                    <Avatar
                      id={actorInfo.id}
                      name={(actorInfo.name ?? actorInfo.username ?? '') as string}
                      type={actorInfo.type === 'organization' ? 'business' : actorInfo.type === 'user' ? undefined : (actorInfo.type as 'actor' | undefined)}
                      size="lg"
                      className="w-full h-full"
                    />
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex items-center gap-2 pt-3">
                  {authenticated && user && user.id !== actorInfo.id && (
                    <>
                      <button className="p-2 rounded-full border border-border hover:bg-muted/50 transition-colors">
                        <Mail className="w-5 h-5" />
                      </button>
                      <button className="px-4 py-2 rounded-full font-bold bg-foreground text-background hover:bg-foreground/90 transition-colors">
                        Follow
                      </button>
                    </>
                  )}
                  {isOwnProfile && (
                    <Link
                      href="/settings"
                      className="px-4 py-2 rounded-full font-bold border border-border hover:bg-muted/50 transition-colors"
                    >
                      Edit profile
                    </Link>
                  )}
                </div>
              </div>

              {/* Name and Handle */}
              <div className="mb-3">
                <div className="flex items-center gap-1 mb-0.5">
                  <h2 className="text-xl font-bold">{actorInfo.name ?? actorInfo.username ?? ''}</h2>
                  {actorInfo.type === 'actor' && (
                    <ShieldCheck className="w-5 h-5 text-blue-500 flex-shrink-0" fill="currentColor" />
                  )}
                </div>
                {actorInfo.username && (
                  <p className="text-muted-foreground text-[15px]">@{actorInfo.username}</p>
                )}
              </div>

              {/* Description/Bio */}
              {actorInfo.description && (
                <p className="text-foreground text-[15px] mb-3 whitespace-pre-wrap">{actorInfo.description}</p>
              )}

              {/* Metadata */}
              {(actorInfo.role || actorInfo.game?.id) && (
                <div className="flex flex-wrap items-center gap-3 text-[15px] text-muted-foreground mb-3">
                  {actorInfo.role && (
                    <div className="flex items-center gap-1">
                      <Briefcase className="w-4 h-4" />
                      <span>{actorInfo.role}</span>
                    </div>
                  )}
                  {actorInfo.game?.id && (
                    <div className="flex items-center gap-1">
                      <Calendar className="w-4 h-4" />
                      <span>Active in {actorInfo.game.id}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Stats */}
              <div className="flex gap-4 text-[15px]">
                <Link href="#" className="hover:underline">
                  <span className="font-bold text-foreground">{actorInfo.stats?.following || 0}</span>
                  <span className="text-muted-foreground ml-1">Following</span>
                </Link>
                <Link href="#" className="hover:underline">
                  <span className="font-bold text-foreground">{actorInfo.stats?.followers || 0}</span>
                  <span className="text-muted-foreground ml-1">Followers</span>
                </Link>
              </div>
            </div>
          </div>

          {/* Tabs: Posts vs Replies */}
          <div className="sticky top-0 bg-background/95 backdrop-blur-sm z-10 border-b border-border">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between px-4">
              {/* Tab Buttons */}
              <div className="flex items-center flex-1">
                <button
                  onClick={() => setTab('posts')}
                  className={cn(
                    'px-4 h-14 font-semibold transition-all duration-300 relative hover:bg-muted/30',
                    tab === 'posts'
                      ? 'text-foreground'
                      : 'text-muted-foreground'
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
                    'px-4 h-14 font-semibold transition-all duration-300 relative hover:bg-muted/30',
                    tab === 'replies'
                      ? 'text-foreground'
                      : 'text-muted-foreground'
                  )}
                >
                  Replies
                  {tab === 'replies' && (
                    <div className="absolute bottom-0 left-0 right-0 h-1 bg-primary rounded-t-full" />
                  )}
                </button>
              </div>

              {/* Search Bar - Top Right (hidden on small screens) */}
              <div className="relative w-full sm:w-64 py-2 sm:py-0">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={`Search ${tab}...`}
                  className="w-full pl-10 pr-4 py-2 rounded-full bg-muted border-0 text-sm focus:ring-2 focus:ring-primary focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* Posts */}
          <div className="px-4">
            {loadingPosts ? (
              <div className="py-12 text-center">
                <p className="text-muted-foreground">Loading posts...</p>
              </div>
            ) : filteredPosts.length === 0 ? (
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
                      'px-4 py-3',
                      'hover:bg-muted/30',
                      'transition-all duration-200'
                    )}
                    style={{
                      fontSize: `${fontSize}rem`,
                    }}
                  >
                    <div className="flex gap-3">
                      {/* Avatar - Round */}
                      <div className="flex-shrink-0">
                        <Avatar
                          id={item.post.author}
                          name={item.post.authorName}
                          type={actorInfo.type === 'organization' ? 'business' : actorInfo.type === 'user' ? undefined : (actorInfo.type as 'actor' | undefined)}
                          size="md"
                          scaleFactor={fontSize * (isMobile ? 0.9 : 1)}
                        />
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        {/* Author, handle on left, timestamp on right */}
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            <Link
                              href={getProfileUrl(item.post.author, item.post.authorUsername || actorInfo?.username)}
                              className="font-semibold text-foreground hover:underline truncate"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {item.post.authorName}
                            </Link>
                            <ShieldCheck className="w-5 h-5 text-blue-500 flex-shrink-0" fill="currentColor" />
                            <Link
                              href={getProfileUrl(item.post.author, item.post.authorUsername || actorInfo?.username)}
                              className="text-muted-foreground hover:underline truncate"
                              onClick={(e) => e.stopPropagation()}
                            >
                              @{item.post.authorUsername || actorInfo?.username || item.post.author}
                            </Link>
                          </div>
                          {/* Timestamp - Right aligned */}
                          <time className="text-muted-foreground text-sm flex-shrink-0 ml-auto" title={postDate.toLocaleString()}>
                            {timeAgo}
                          </time>
                        </div>

                        {/* Post content - Below name/handle row */}
                        <div className="text-foreground leading-normal whitespace-pre-wrap break-words">
                          <TaggedText
                            text={item.post.content}
                            onTagClick={(tag) => {
                              router.push(`/feed?search=${encodeURIComponent(tag)}`)
                            }}
                          />
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
      </div>
    </PageContainer>
  )
}
