'use client'

import { EntitySearchAutocomplete } from '@/components/explore/EntitySearchAutocomplete'
import { PostCard } from '@/components/posts/PostCard'
import { Avatar } from '@/components/shared/Avatar'
import { PageContainer } from '@/components/shared/PageContainer'
import { FeedSkeleton, Skeleton } from '@/components/shared/Skeleton'
import { cn } from '@/lib/utils'
import type { FeedPost } from '@/shared/types'
import {
  Activity,
  AlertCircle,
  Bot, Building2,
  ExternalLink,
  Search,
  Shield,
  TrendingUp,
  UserCircle,
  Users,
  Wallet,
  X
} from 'lucide-react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useEffect, useState } from 'react'

interface RegistryEntity {
  type: 'user' | 'actor' | 'agent' | 'app'
  id: string
  name: string
  username?: string
  bio?: string
  description?: string
  imageUrl?: string
  walletAddress?: string
  onChainRegistered?: boolean
  nftTokenId?: number | null
  agent0TokenId?: number | null
  tokenId?: number
  metadataCID?: string
  mcpEndpoint?: string
  a2aEndpoint?: string
  balance?: string
  reputationPoints?: number
  tier?: string
  role?: string
  domain?: string[]
  hasPool?: boolean
  capabilities?: Record<string, unknown>
  reputation?: {
    trustScore: number
    accuracyScore: number
    totalBets: number
    winningBets: number
  }
  stats?: {
    positions?: number
    comments?: number
    reactions?: number
    followers?: number
    following?: number
    pools?: number
    trades?: number
  }
  createdAt?: string
  registrationTxHash?: string
  registrationTimestamp?: string
}

interface RegistryData {
  users: RegistryEntity[]
  actors: RegistryEntity[]
  agents: RegistryEntity[]
  apps: RegistryEntity[]
  totals: {
    users: number
    actors: number
    agents: number
    apps: number
    total: number
  }
}

function ExplorePageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [activeTab, setActiveTab] = useState<'feed' | 'registry'>('feed')
  const [searchQuery, setSearchQuery] = useState('')
  const [activeSearchQuery, setActiveSearchQuery] = useState('') // The actual query used for filtering
  
  // Feed state
  const [posts, setPosts] = useState<FeedPost[]>([])
  const [loadingPosts, setLoadingPosts] = useState(false)
  const [actorNames, setActorNames] = useState<Map<string, string>>(new Map())
  
  // Registry state
  const [registryData, setRegistryData] = useState<RegistryData | null>(null)
  const [loadingRegistry, setLoadingRegistry] = useState(false)
  const [registryError, setRegistryError] = useState<string | null>(null)
  const [onChainOnly, setOnChainOnly] = useState(false)
  const [registryTab, setRegistryTab] = useState<'all' | 'users' | 'actors' | 'agents' | 'apps'>('all')

  // Initialize from URL params
  useEffect(() => {
    const q = searchParams.get('q')
    const tab = searchParams.get('tab')
    if (q) {
      setSearchQuery(q)
      setActiveSearchQuery(q) // Set active query from URL
    } else {
      // Clear search queries when no query param
      setSearchQuery('')
      setActiveSearchQuery('')
    }
    if (tab === 'registry' || tab === 'feed') setActiveTab(tab)
  }, [searchParams])

  // Load actor names for feed
  useEffect(() => {
    const loadActorNames = async () => {
      const response = await fetch('/data/actors.json')
      const data = await response.json() as { actors?: Array<{ id: string; name: string }> }
      const nameMap = new Map<string, string>()
      data.actors?.forEach((actor) => {
        nameMap.set(actor.id, actor.name)
      })
      setActorNames(nameMap)
    }
    loadActorNames()
  }, [])

  // Fetch posts when active search query changes (for feed tab)
  useEffect(() => {
    if (activeTab !== 'feed' || !activeSearchQuery.trim()) {
      setPosts([])
      return
    }

    const fetchPosts = async () => {
      setLoadingPosts(true)
      try {
        const response = await fetch(`/api/posts?limit=50&offset=0`)
        if (response.ok) {
          const data = await response.json()
          setPosts(data.posts || [])
        }
      } catch (error) {
        console.error('Failed to fetch posts:', error)
      } finally {
        setLoadingPosts(false)
      }
    }

    fetchPosts()
  }, [activeSearchQuery, activeTab])

  // Fetch registry when active search query changes (for registry tab)
  // Also triggers on initial load when activeTab is 'registry'
  useEffect(() => {
    if (activeTab !== 'registry') return

    const fetchRegistry = async () => {
      setLoadingRegistry(true)
      setRegistryError(null)
      try {
        const params = new URLSearchParams()
        if (activeSearchQuery.trim()) params.set('search', activeSearchQuery)
        if (onChainOnly) params.set('onChainOnly', 'true')
        
        const response = await fetch(`/api/registry/all?${params}`)
        if (!response.ok) {
          throw new Error(`Request failed: ${response.status} ${response.statusText}`)
        }

        const result = await response.json()
        setRegistryData(result)
      } catch (error) {
        console.error('Failed to fetch registry:', error)
        setRegistryError('Failed to connect to the registry')
      } finally {
        setLoadingRegistry(false)
      }
    }

    // Fetch immediately if no search query, with debounce if there is
    if (activeSearchQuery.trim()) {
      const timer = setTimeout(fetchRegistry, 300)
      return () => clearTimeout(timer)
    } else {
      fetchRegistry()
      return undefined
    }
  }, [activeSearchQuery, activeTab, onChainOnly])

  // Filter posts based on active search query
  const filteredPosts = posts.filter((post) => {
    if (!activeSearchQuery.trim()) return true
    const query = activeSearchQuery.toLowerCase()
    const postContent = String(post.content)
    const authorField = ('authorId' in post ? String(post.authorId) : ('author' in post ? String(post.author) : ''))
    const postAuthorName = String(post.authorName)
    return (
      postContent.toLowerCase().includes(query) ||
      authorField.toLowerCase().includes(query) ||
      postAuthorName.toLowerCase().includes(query)
    )
  })

  const renderBadge = (_type: string, label: string, icon: React.ReactNode, color: string) => {
    return (
      <span className={cn(
        'inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold',
        color
      )}>
        {icon}
        {label}
      </span>
    )
  }

  const renderEntityCard = (entity: RegistryEntity) => {
    const getBadgeColor = () => {
      switch (entity.type) {
        case 'user': return 'bg-blue-500/10 text-blue-500 border border-blue-500/20'
        case 'actor': return 'bg-purple-500/10 text-purple-500 border border-purple-500/20'
        case 'agent': return 'bg-green-500/10 text-green-500 border border-green-500/20'
        case 'app': return 'bg-orange-500/10 text-orange-500 border border-orange-500/20'
        default: return 'bg-muted text-muted-foreground'
      }
    }

    const getProfileUrl = () => {
      if (entity.type === 'user' && entity.username) {
        return `/profile/${entity.username}`
      }
      return null
    }

    const profileUrl = getProfileUrl()

    const cardContent = (
      <>
        <div className="p-4 border-b border-border bg-muted/30">
          <div className="flex items-start gap-3">
            <Avatar
              src={entity.imageUrl}
              name={entity.name}
              size="lg"
              className="flex-shrink-0"
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-lg truncate text-foreground">
                    {entity.name}
                  </h3>
                  {entity.username && (
                    <p className="text-sm text-muted-foreground">
                      @{entity.username}
                    </p>
                  )}
                </div>
                <div className="flex-shrink-0">
                  {entity.type === 'user' && renderBadge('user', 'User', <UserCircle className="h-3 w-3" />, getBadgeColor())}
                  {entity.type === 'actor' && renderBadge('actor', 'Actor', <Users className="h-3 w-3" />, getBadgeColor())}
                  {entity.type === 'agent' && renderBadge('agent', 'Agent', <Bot className="h-3 w-3" />, getBadgeColor())}
                  {entity.type === 'app' && renderBadge('app', 'App', <Building2 className="h-3 w-3" />, getBadgeColor())}
                </div>
              </div>
              
              {(entity.bio || entity.description) && (
                <p className="text-sm text-muted-foreground mt-2 line-clamp-2">
                  {entity.bio || entity.description}
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="p-4 space-y-3">
          {entity.onChainRegistered && (
            <div className="flex items-center gap-2 text-sm bg-green-500/5 border border-green-500/20 rounded-lg p-2">
              <Shield className="h-4 w-4 text-green-500 flex-shrink-0" />
              <span className="text-green-500 font-medium flex-1">On-chain registered</span>
              {entity.nftTokenId && (
                <span className="text-xs font-mono bg-green-500/10 px-2 py-0.5 rounded">
                  #{entity.nftTokenId}
                </span>
              )}
            </div>
          )}

          {entity.agent0TokenId && (
            <div className="flex items-center gap-2 text-sm bg-blue-500/5 border border-blue-500/20 rounded-lg p-2">
              <Bot className="h-4 w-4 text-blue-500 flex-shrink-0" />
              <span className="text-blue-500 font-medium flex-1">Agent0 Token</span>
              <span className="text-xs font-mono bg-blue-500/10 px-2 py-0.5 rounded">
                #{entity.agent0TokenId}
              </span>
            </div>
          )}

          {entity.walletAddress && (
            <div className="flex items-center gap-2 text-sm">
              <Wallet className="h-4 w-4 text-blue-400 flex-shrink-0" />
              <code className="text-xs text-muted-foreground font-mono truncate flex-1">
                {entity.walletAddress.slice(0, 6)}...{entity.walletAddress.slice(-4)}
              </code>
              <button
                onClick={(e) => {
                  e.preventDefault()
                  navigator.clipboard.writeText(entity.walletAddress!)
                }}
                className="text-xs text-blue-500 hover:text-blue-400 transition-colors"
              >
                Copy
              </button>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            {entity.balance && (
              <div className="flex items-center gap-2 text-sm bg-emerald-500/5 border border-emerald-500/20 rounded-lg p-2">
                <TrendingUp className="h-4 w-4 text-emerald-500 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-muted-foreground">Balance</div>
                  <div className="font-semibold truncate text-foreground">
                    {parseFloat(entity.balance).toLocaleString()} BAB
                  </div>
                </div>
              </div>
            )}
            {entity.reputationPoints !== undefined && (
              <div className="flex items-center gap-2 text-sm bg-purple-500/5 border border-purple-500/20 rounded-lg p-2">
                <Activity className="h-4 w-4 text-purple-500 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-muted-foreground">Reputation</div>
                  <div className="font-semibold truncate text-foreground">
                    {entity.reputationPoints.toLocaleString()} pts
                  </div>
                </div>
              </div>
            )}
          </div>

          {entity.reputation && (
            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-border">
              <div className="text-sm">
                <div className="text-xs text-muted-foreground mb-1">Trust Score</div>
                <div className="font-semibold text-foreground">{entity.reputation.trustScore.toFixed(2)}</div>
              </div>
              <div className="text-sm">
                <div className="text-xs text-muted-foreground mb-1">Accuracy</div>
                <div className="font-semibold text-foreground">{entity.reputation.accuracyScore.toFixed(2)}%</div>
              </div>
            </div>
          )}

          {entity.stats && Object.keys(entity.stats).length > 0 && (
            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-border text-sm">
              {entity.stats.followers !== undefined && (
                <div>
                  <span className="text-muted-foreground">Followers:</span>{' '}
                  <span className="font-semibold text-foreground">{entity.stats.followers}</span>
                </div>
              )}
              {entity.stats.positions !== undefined && (
                <div>
                  <span className="text-muted-foreground">Positions:</span>{' '}
                  <span className="font-semibold text-foreground">{entity.stats.positions}</span>
                </div>
              )}
              {entity.stats.pools !== undefined && (
                <div>
                  <span className="text-muted-foreground">Pools:</span>{' '}
                  <span className="font-semibold text-foreground">{entity.stats.pools}</span>
                </div>
              )}
              {entity.stats.trades !== undefined && (
                <div>
                  <span className="text-muted-foreground">Trades:</span>{' '}
                  <span className="font-semibold text-foreground">{entity.stats.trades}</span>
                </div>
              )}
            </div>
          )}

          {entity.tier && (
            <div className="pt-2">
              <span className="inline-block px-3 py-1 bg-amber-500/10 text-amber-500 border border-amber-500/20 rounded-full text-xs font-bold">
                {entity.tier}
              </span>
            </div>
          )}

          {entity.domain && entity.domain.length > 0 && (
            <div className="flex flex-wrap gap-1 pt-2">
              {entity.domain.slice(0, 3).map((d: string) => (
                <span key={d} className="px-2 py-1 bg-muted text-muted-foreground rounded text-xs">
                  {d}
                </span>
              ))}
              {entity.domain.length > 3 && (
                <span className="px-2 py-1 bg-muted text-muted-foreground rounded text-xs">
                  +{entity.domain.length - 3} more
                </span>
              )}
            </div>
          )}

          {(entity.a2aEndpoint || entity.mcpEndpoint) && (
            <div className="space-y-1 pt-2 border-t border-border text-xs">
              {entity.a2aEndpoint && (
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground font-medium">A2A:</span>
                  <a 
                    href={entity.a2aEndpoint} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="text-blue-500 hover:text-blue-400 flex items-center gap-1 truncate transition-colors"
                  >
                    <span className="truncate">{entity.a2aEndpoint}</span>
                    <ExternalLink className="h-3 w-3 flex-shrink-0" />
                  </a>
                </div>
              )}
              {entity.mcpEndpoint && (
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground font-medium">MCP:</span>
                  <a 
                    href={entity.mcpEndpoint} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="text-blue-500 hover:text-blue-400 flex items-center gap-1 truncate transition-colors"
                  >
                    <span className="truncate">{entity.mcpEndpoint}</span>
                    <ExternalLink className="h-3 w-3 flex-shrink-0" />
                  </a>
                </div>
              )}
            </div>
          )}
        </div>
      </>
    )

    if (profileUrl) {
      return (
        <Link
          key={entity.id}
          href={profileUrl}
          className={cn(
            'block bg-card border border-border rounded-xl overflow-hidden transition-all duration-200',
            'hover:shadow-lg hover:border-[#0066FF]/50 cursor-pointer'
          )}
        >
          {cardContent}
        </Link>
      )
    }

    return (
      <div
        key={entity.id}
        className="block bg-card border border-border rounded-xl overflow-hidden transition-all duration-200"
      >
        {cardContent}
      </div>
    )
  }

  const allEntities = registryData ? [
    ...registryData.users,
    ...registryData.actors,
    ...registryData.agents,
    ...registryData.apps
  ] : []

  const getActiveEntities = () => {
    if (!registryData) return []
    switch (registryTab) {
      case 'users': return registryData.users
      case 'actors': return registryData.actors
      case 'agents': return registryData.agents
      case 'apps': return registryData.apps
      default: return allEntities
    }
  }

  const activeEntities = getActiveEntities()

  return (
    <PageContainer>
      <div className="max-w-7xl mx-auto p-4">
        {/* Header with Search */}
        <div className="flex items-start justify-between gap-4 mb-6">
          <div className="flex-1 min-w-0">
            <h1 className="text-4xl font-bold mb-2 text-foreground">Explore</h1>
            <p className="text-muted-foreground text-lg">
              Search for posts, users, agents, and more
            </p>
          </div>
          <div className="w-full max-w-md flex-shrink-0">
            <EntitySearchAutocomplete
              value={searchQuery}
              onChange={setSearchQuery}
              placeholder="Search..."
            />
          </div>
        </div>

        {/* Main tabs */}
        <div className="flex gap-2 mb-6 border-b border-border">
          <button
            onClick={() => {
              setActiveTab('feed')
              router.push(`/explore?q=${encodeURIComponent(searchQuery)}&tab=feed`, { scroll: false })
            }}
            className={cn(
              'px-6 py-3 font-semibold transition-all duration-200 border-b-2',
              activeTab === 'feed'
                ? 'border-[#0066FF] text-[#0066FF]'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            Feed
          </button>
          <button
            onClick={() => {
              setActiveTab('registry')
              router.push(`/explore?q=${encodeURIComponent(searchQuery)}&tab=registry`, { scroll: false })
            }}
            className={cn(
              'px-6 py-3 font-semibold transition-all duration-200 border-b-2',
              activeTab === 'registry'
                ? 'border-[#0066FF] text-[#0066FF]'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            Registry
          </button>
        </div>

        {/* Feed tab content */}
        {activeTab === 'feed' && (
          <div>
            {!activeSearchQuery.trim() ? (
              <div className="text-center py-20">
                <Search className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-foreground mb-2">Search for something</h3>
                <p className="text-muted-foreground">
                  Enter a search query to find posts
                </p>
              </div>
            ) : loadingPosts ? (
              <FeedSkeleton count={6} />
            ) : filteredPosts.length === 0 ? (
              <div className="text-center py-20">
                <Search className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-foreground mb-2">No posts found</h3>
                <p className="text-muted-foreground">
                  No posts match &quot;{activeSearchQuery}&quot;
                </p>
              </div>
            ) : (
              <div className="space-y-0">
                {filteredPosts.map((post) => {
                  const authorId = ('authorId' in post ? post.authorId : post.author) || ''
                  const authorName = actorNames.get(authorId) || ('authorName' in post ? post.authorName : '') || authorId

                  const postData = {
                    id: post.id,
                    content: post.content,
                    authorId,
                    authorName,
                    authorUsername: ('authorUsername' in post ? post.authorUsername : null) || null,
                    authorProfileImageUrl: ('authorProfileImageUrl' in post ? post.authorProfileImageUrl : null),
                    timestamp: post.timestamp,
                    likeCount: ('likeCount' in post ? (post.likeCount as number) : 0) || 0,
                    commentCount: ('commentCount' in post ? (post.commentCount as number) : 0) || 0,
                    shareCount: ('shareCount' in post ? (post.shareCount as number) : 0) || 0,
                    isLiked: ('isLiked' in post ? (post.isLiked as boolean) : false) || false,
                    isShared: ('isShared' in post ? (post.isShared as boolean) : false) || false,
                  }

                  return (
                    <PostCard
                      key={post.id}
                      post={postData}
                      onClick={() => router.push(`/post/${post.id}`)}
                    />
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* Registry tab content */}
        {activeTab === 'registry' && (
          <div>
            {/* Registry stats and filters */}
            {registryData && (
              <div className="mb-6">
                {/* Stats overview */}
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-4">
                  <div className="bg-card border border-border rounded-xl p-4">
                    <div className="text-sm text-muted-foreground mb-1">Total</div>
                    <div className="text-3xl font-bold text-foreground">{registryData.totals.total}</div>
                  </div>
                  <div className="bg-card border border-border rounded-xl p-4">
                    <div className="flex items-center gap-1 text-sm text-muted-foreground mb-1">
                      <UserCircle className="h-4 w-4" />
                      <span>Users</span>
                    </div>
                    <div className="text-3xl font-bold text-foreground">{registryData.totals.users}</div>
                  </div>
                  <div className="bg-card border border-border rounded-xl p-4">
                    <div className="flex items-center gap-1 text-sm text-muted-foreground mb-1">
                      <Users className="h-4 w-4" />
                      <span>Actors</span>
                    </div>
                    <div className="text-3xl font-bold text-foreground">{registryData.totals.actors}</div>
                  </div>
                  <div className="bg-card border border-border rounded-xl p-4">
                    <div className="flex items-center gap-1 text-sm text-muted-foreground mb-1">
                      <Bot className="h-4 w-4" />
                      <span>Agents</span>
                    </div>
                    <div className="text-3xl font-bold text-foreground">{registryData.totals.agents}</div>
                  </div>
                  <div className="bg-card border border-border rounded-xl p-4">
                    <div className="flex items-center gap-1 text-sm text-muted-foreground mb-1">
                      <Building2 className="h-4 w-4" />
                      <span>Apps</span>
                    </div>
                    <div className="text-3xl font-bold text-foreground">{registryData.totals.apps}</div>
                  </div>
                </div>

                {/* Registry tabs and On-chain filter */}
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => setRegistryTab('all')}
                    className={cn(
                      'px-4 py-2 rounded-lg font-semibold transition-all duration-200 whitespace-nowrap',
                      registryTab === 'all'
                        ? 'bg-[#0066FF] text-white'
                        : 'bg-muted text-muted-foreground hover:bg-muted/80'
                    )}
                  >
                    All ({registryData.totals.total})
                  </button>
                  <button
                    onClick={() => setRegistryTab('users')}
                    className={cn(
                      'flex items-center gap-2 px-4 py-2 rounded-lg font-semibold transition-all duration-200 whitespace-nowrap',
                      registryTab === 'users'
                        ? 'bg-[#0066FF] text-white'
                        : 'bg-muted text-muted-foreground hover:bg-muted/80'
                    )}
                  >
                    <UserCircle className="h-4 w-4" />
                    Users ({registryData.totals.users})
                  </button>
                  <button
                    onClick={() => setRegistryTab('actors')}
                    className={cn(
                      'flex items-center gap-2 px-4 py-2 rounded-lg font-semibold transition-all duration-200 whitespace-nowrap',
                      registryTab === 'actors'
                        ? 'bg-[#0066FF] text-white'
                        : 'bg-muted text-muted-foreground hover:bg-muted/80'
                    )}
                  >
                    <Users className="h-4 w-4" />
                    Actors ({registryData.totals.actors})
                  </button>
                  <button
                    onClick={() => setRegistryTab('agents')}
                    className={cn(
                      'flex items-center gap-2 px-4 py-2 rounded-lg font-semibold transition-all duration-200 whitespace-nowrap',
                      registryTab === 'agents'
                        ? 'bg-[#0066FF] text-white'
                        : 'bg-muted text-muted-foreground hover:bg-muted/80'
                    )}
                  >
                    <Bot className="h-4 w-4" />
                    Agents ({registryData.totals.agents})
                  </button>
                  <button
                    onClick={() => setRegistryTab('apps')}
                    className={cn(
                      'flex items-center gap-2 px-4 py-2 rounded-lg font-semibold transition-all duration-200 whitespace-nowrap',
                      registryTab === 'apps'
                        ? 'bg-[#0066FF] text-white'
                        : 'bg-muted text-muted-foreground hover:bg-muted/80'
                    )}
                  >
                    <Building2 className="h-4 w-4" />
                    Apps ({registryData.totals.apps})
                  </button>
                  
                  {/* On-chain Only filter */}
                  <div className="ml-auto">
                    <button
                      onClick={() => setOnChainOnly(!onChainOnly)}
                      className={cn(
                        'flex items-center gap-2 px-4 py-2 rounded-full font-semibold transition-all duration-200 whitespace-nowrap',
                        onChainOnly
                          ? 'bg-[#0066FF] text-white hover:bg-[#0052CC]'
                          : 'bg-muted text-muted-foreground hover:bg-muted/80 border border-border'
                      )}
                    >
                      <Shield className="h-4 w-4" />
                      On-chain Only
                      {onChainOnly && <X className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Loading state */}
            {loadingRegistry && (
              <div className="flex items-center justify-center py-20">
                <div className="text-center space-y-4 w-full max-w-2xl">
                  <Skeleton className="h-8 w-48 mx-auto" />
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    <Skeleton className="h-48 w-full" />
                    <Skeleton className="h-48 w-full" />
                    <Skeleton className="h-48 w-full" />
                  </div>
                </div>
              </div>
            )}

            {/* Error state */}
            {registryError && !loadingRegistry && (
              <div className="flex items-center justify-center py-20">
                <div className="text-center max-w-md">
                  <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold text-foreground mb-2">Failed to load registry</h3>
                  <p className="text-muted-foreground mb-4">{registryError}</p>
                </div>
              </div>
            )}

            {/* Entity grid */}
            {!loadingRegistry && !registryError && registryData && (
              <>
                {activeEntities.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {activeEntities.map(entity => renderEntityCard(entity))}
                  </div>
                ) : (
                  <div className="text-center py-20">
                    <Search className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                    <h3 className="text-lg font-semibold text-foreground mb-2">No entities found</h3>
                    <p className="text-muted-foreground">
                      Try adjusting your search or filters
                    </p>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </PageContainer>
  )
}

export default function ExplorePage() {
  return (
    <Suspense fallback={<FeedSkeleton />}>
      <ExplorePageContent />
    </Suspense>
  )
}

