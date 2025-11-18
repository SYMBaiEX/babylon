'use client'

import { useEffect, useState } from 'react'
import {
  AlertCircle,
  Bot,
  Building2,
  ExternalLink,
  Search,
  Shield,
  TrendingUp,
  UserCircle,
  Users,
  Wallet,
  X,
  Star,
  Ban,
  Flag,
} from 'lucide-react'
import Link from 'next/link'
import { Avatar } from '@/components/shared/Avatar'
import { Skeleton } from '@/components/shared/Skeleton'
import { SearchBar } from '@/components/shared/SearchBar'
import { FeedbackForm } from '@/components/feedback/FeedbackForm'
import { cn } from '@/lib/utils'
import { z } from 'zod'
import { toast } from 'sonner'

/**
 * Registry entity schema for validation.
 */
const RegistryEntitySchema = z.object({
  type: z.enum(['user', 'actor', 'agent', 'app']),
  id: z.string(),
  name: z.string(),
  username: z.string().optional(),
  bio: z.string().optional(),
  description: z.string().optional(),
  imageUrl: z.string().optional(),
  walletAddress: z.string().optional(),
  isActor: z.boolean().optional(),
  onChainRegistered: z.boolean().optional(),
  nftTokenId: z.number().nullable().optional(),
  agent0TokenId: z.number().nullable().optional(),
  tokenId: z.number().optional(),
  metadataCID: z.string().optional(),
  mcpEndpoint: z.string().optional(),
  a2aEndpoint: z.string().optional(),
  balance: z.string().optional(),
  reputationPoints: z.number().optional(),
  reputationScore: z.number().optional(),
  averageFeedbackScore: z.number().optional(),
  totalFeedbackCount: z.number().optional(),
  isBanned: z.boolean().optional(),
  isScammer: z.boolean().optional(),
  isCSAM: z.boolean().optional(),
  tier: z.string().optional(),
  role: z.string().optional(),
  domain: z.array(z.string()).optional(),
  hasPool: z.boolean().optional(),
  capabilities: z.record(z.string(), z.unknown()).optional(),
  reputation: z.object({
    trustScore: z.number(),
    accuracyScore: z.number(),
    totalBets: z.number(),
    winningBets: z.number(),
  }).optional(),
  stats: z.object({
    positions: z.number().optional(),
    comments: z.number().optional(),
    reactions: z.number().optional(),
    followers: z.number().optional(),
    following: z.number().optional(),
    pools: z.number().optional(),
    trades: z.number().optional(),
  }).optional(),
  createdAt: z.string().optional(),
  registrationTxHash: z.string().optional(),
  registrationTimestamp: z.string().optional(),
});
type RegistryEntity = z.infer<typeof RegistryEntitySchema>;

/**
 * Registry data schema for validation.
 */
const RegistryDataSchema = z.object({
  users: z.array(RegistryEntitySchema),
  actors: z.array(RegistryEntitySchema),
  agents: z.array(RegistryEntitySchema),
  apps: z.array(RegistryEntitySchema),
  totals: z.object({
    users: z.number(),
    actors: z.number(),
    agents: z.number(),
    apps: z.number(),
    total: z.number(),
  }),
});
type RegistryData = z.infer<typeof RegistryDataSchema>;

/**
 * Registry tab component for viewing and managing registry entities.
 * 
 * Displays all entities in the registry (users, actors, agents, apps) with
 * filtering, search, and on-chain filtering. Shows entity details including
 * reputation, statistics, and on-chain registration status. Includes feedback
 * form integration.
 * 
 * Features:
 * - Entity list display (users, actors, agents, apps)
 * - Search functionality
 * - On-chain filter
 * - Entity details view
 * - Reputation display
 * - Statistics display
 * - Feedback form integration
 * - Loading states
 * - Error handling
 * 
 * @returns Registry tab element
 */
export function RegistryTab() {
  const [data, setData] = useState<RegistryData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [onChainOnly, setOnChainOnly] = useState(false)
  const [activeTab, setActiveTab] = useState<'all' | 'users' | 'actors' | 'agents' | 'apps'>('all')
  const [selectedEntity, setSelectedEntity] = useState<RegistryEntity | null>(null)
  const [showFeedbackModal, setShowFeedbackModal] = useState(false)
  const [showBanModal, setShowBanModal] = useState(false)
  const [banReason, setBanReason] = useState('')
  const [isScammer, setIsScammer] = useState(false)
  const [isCSAM, setIsCSAM] = useState(false)
  const [isBanning, setIsBanning] = useState(false)

  useEffect(() => {
    fetchRegistry()
  }, [onChainOnly])

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchRegistry()
    }, 300)
    return () => clearTimeout(timer)
  }, [search])

  const fetchRegistry = async () => {
    setLoading(true)
    setError(null)
    const params = new URLSearchParams()
    if (search) params.set('search', search)
    if (onChainOnly) params.set('onChainOnly', 'true')

    const response = await fetch(`/api/registry/all?${params}`)
    const result = await response.json()

    if (result.success && result.data) {
      const validation = RegistryDataSchema.safeParse(result.data);
      if (validation.success) {
        setData(validation.data);
      } else {
        setError('Invalid data structure for registry');
      }
    } else {
      setError(result.error?.message || 'Failed to fetch registry data')
    }
    setLoading(false)
  }

  const renderBadge = (_type: string, label: string, icon: React.ReactNode, color: string) => {
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold',
          color
        )}
      >
        {icon}
        {label}
      </span>
    )
  }

  const renderEntityCard = (entity: RegistryEntity) => {
    const getBadgeColor = () => {
      switch (entity.type) {
        case 'user':
          return 'bg-blue-500/10 text-blue-500 border border-blue-500/20'
        case 'actor':
          return 'bg-purple-500/10 text-purple-500 border border-purple-500/20'
        case 'agent':
          return 'bg-green-500/10 text-green-500 border border-green-500/20'
        case 'app':
          return 'bg-orange-500/10 text-orange-500 border border-orange-500/20'
        default:
          return 'bg-muted text-muted-foreground'
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
        <div className="px-4 py-3 border-b border-border bg-muted/30">
          <div className="flex items-start gap-3">
            <Avatar src={entity.imageUrl} name={entity.name} size="lg" className="shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-lg truncate text-foreground">{entity.name}</h3>
                  {entity.username && (
                    <p className="text-sm text-muted-foreground">@{entity.username}</p>
                  )}
                </div>
                <div className="shrink-0">
                  {entity.type === 'user' &&
                    renderBadge('user', 'User', <UserCircle className="h-3 w-3" />, getBadgeColor())}
                  {entity.type === 'actor' &&
                    renderBadge('actor', 'Actor', <Users className="h-3 w-3" />, getBadgeColor())}
                  {entity.type === 'agent' &&
                    renderBadge('agent', 'Agent', <Bot className="h-3 w-3" />, getBadgeColor())}
                  {entity.type === 'app' &&
                    renderBadge('app', 'App', <Building2 className="h-3 w-3" />, getBadgeColor())}
                </div>
              </div>

              {(entity.bio || entity.description) && (
                <p className="text-sm text-muted-foreground mt-2 line-clamp-2">
                  {entity.bio || entity.description}
                </p>
              )}

              {/* Moderation Flags */}
              <div className="flex flex-wrap gap-1 mt-2">
                {entity.isBanned && (
                  <span className="px-2 py-0.5 text-xs rounded bg-red-500/20 text-red-500 flex items-center gap-1">
                    <Ban className="w-3 h-3" />
                    Banned
                  </span>
                )}
                {entity.isScammer && (
                  <span className="px-2 py-0.5 text-xs rounded bg-orange-500/20 text-orange-500 flex items-center gap-1">
                    <Flag className="w-3 h-3" />
                    Scammer
                  </span>
                )}
                {entity.isCSAM && (
                  <span className="px-2 py-0.5 text-xs rounded bg-red-600/20 text-red-600 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" />
                    CSAM
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="px-4 py-3 space-y-3">
          {entity.onChainRegistered && (
            <div className="flex items-center gap-2 text-sm bg-green-500/5 border border-green-500/20 rounded-xl px-3 py-2">
              <Shield className="h-4 w-4 text-green-500 shrink-0" />
              <span className="text-green-500 font-medium flex-1">On-chain registered</span>
              {entity.nftTokenId && (
                <span className="text-xs font-mono bg-green-500/10 px-2 py-0.5 rounded-lg">
                  #{entity.nftTokenId}
                </span>
              )}
            </div>
          )}

          {entity.agent0TokenId && (
            <div className="flex items-center gap-2 text-sm bg-blue-500/5 border border-blue-500/20 rounded-xl px-3 py-2">
              <Bot className="h-4 w-4 text-blue-500 shrink-0" />
              <span className="text-blue-500 font-medium flex-1">Agent0 Token</span>
              <span className="text-xs font-mono bg-blue-500/10 px-2 py-0.5 rounded-lg">
                #{entity.agent0TokenId}
              </span>
            </div>
          )}

          {entity.walletAddress && (
            <div className="flex items-center gap-2 text-sm">
              <Wallet className="h-4 w-4 text-blue-400 shrink-0" />
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
              <div className="flex items-center gap-2 text-sm bg-emerald-500/5 border border-emerald-500/20 rounded-xl px-3 py-2">
                <TrendingUp className="h-4 w-4 text-emerald-500 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-muted-foreground">Balance</div>
                  <div className="font-semibold truncate text-foreground">
                    {parseFloat(entity.balance).toLocaleString()} BAB
                  </div>
                </div>
              </div>
            )}
            {(entity.reputationScore !== undefined || entity.reputationPoints !== undefined) && (
              <div className={cn(
                "flex items-center gap-2 text-sm rounded-xl px-3 py-2 border",
                entity.reputationScore !== undefined && entity.reputationScore >= 80 ? 'bg-green-500/5 border-green-500/20' :
                entity.reputationScore !== undefined && entity.reputationScore >= 60 ? 'bg-yellow-500/5 border-yellow-500/20' :
                entity.reputationScore !== undefined && entity.reputationScore >= 40 ? 'bg-orange-500/5 border-orange-500/20' :
                entity.reputationScore !== undefined && entity.reputationScore < 40 ? 'bg-red-500/5 border-red-500/20' :
                'bg-purple-500/5 border-purple-500/20'
              )}>
                <Star className={cn(
                  "h-4 w-4 shrink-0",
                  entity.reputationScore !== undefined && entity.reputationScore >= 80 ? 'text-green-500' :
                  entity.reputationScore !== undefined && entity.reputationScore >= 60 ? 'text-yellow-500' :
                  entity.reputationScore !== undefined && entity.reputationScore >= 40 ? 'text-orange-500' :
                  entity.reputationScore !== undefined && entity.reputationScore < 40 ? 'text-red-500' :
                  'text-purple-500'
                )} />
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-muted-foreground">Reputation</div>
                  <div className={cn(
                    "font-semibold truncate",
                    entity.reputationScore !== undefined && entity.reputationScore >= 80 ? 'text-green-500' :
                    entity.reputationScore !== undefined && entity.reputationScore >= 60 ? 'text-yellow-500' :
                    entity.reputationScore !== undefined && entity.reputationScore >= 40 ? 'text-orange-500' :
                    entity.reputationScore !== undefined && entity.reputationScore < 40 ? 'text-red-500' :
                    'text-foreground'
                  )}>
                    {entity.reputationScore !== undefined 
                      ? `${Math.round(entity.reputationScore)}/100`
                      : `${entity.reputationPoints?.toLocaleString() || 0} pts`}
                  </div>
                  {entity.totalFeedbackCount !== undefined && entity.totalFeedbackCount > 0 && (
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {entity.totalFeedbackCount} reviews
                    </div>
                  )}
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
                <span key={d} className="px-2 py-1 bg-muted text-muted-foreground rounded-lg text-xs">
                  {d}
                </span>
              ))}
              {entity.domain.length > 3 && (
                <span className="px-2 py-1 bg-muted text-muted-foreground rounded-lg text-xs">
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
                    <ExternalLink className="h-3 w-3 shrink-0" />
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
                    <ExternalLink className="h-3 w-3 shrink-0" />
                  </a>
                </div>
              )}
            </div>
          )}

          {/* Admin Actions */}
          {entity.type === 'user' && !entity.isActor && (
            <div className="pt-3 border-t border-border flex gap-2">
              {entity.agent0TokenId && (
                <button
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    setSelectedEntity(entity)
                    setShowFeedbackModal(true)
                  }}
                  className="flex-1 px-3 py-2 text-sm font-medium rounded-lg bg-blue-500/20 text-blue-500 hover:bg-blue-500/30 transition-colors flex items-center justify-center gap-1"
                  title="Give feedback"
                >
                  <Star className="w-4 h-4" />
                  Feedback
                </button>
              )}
              <button
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  setSelectedEntity(entity)
                  setShowBanModal(true)
                }}
                className={cn(
                  "flex-1 px-3 py-2 text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-1",
                  entity.isBanned
                    ? "bg-green-500/20 text-green-500 hover:bg-green-500/30"
                    : "bg-red-500/20 text-red-500 hover:bg-red-500/30"
                )}
                title={entity.isBanned ? "Unban user" : "Ban user"}
              >
                <Ban className="w-4 h-4" />
                {entity.isBanned ? 'Unban' : 'Ban'}
              </button>
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
            'block bg-card border border-border rounded-2xl overflow-hidden transition-all duration-200',
            'hover:shadow-lg hover:border-primary/50 cursor-pointer'
          )}
        >
          {cardContent}
        </Link>
      )
    }

    return (
      <div
        key={entity.id}
        className="block bg-card border border-border rounded-2xl overflow-hidden transition-all duration-200 hover:shadow-lg hover:border-primary/50"
      >
        {cardContent}
      </div>
    )
  }

  const handleBanUser = async (entity: RegistryEntity, action: 'ban' | 'unban') => {
    if (action === 'ban' && !banReason.trim()) {
      toast.error('Please provide a reason for banning')
      return
    }

    setIsBanning(true)
    try {
      const token = typeof window !== 'undefined' ? window.__privyAccessToken : null
      const response = await fetch(`/api/admin/users/${entity.id}/ban`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          action,
          reason: action === 'ban' ? banReason : undefined,
          isScammer: action === 'ban' ? isScammer : false,
          isCSAM: action === 'ban' ? isCSAM : false,
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.message || 'Failed to update user')
      }

      toast.success(action === 'ban' ? 'User banned successfully' : 'User unbanned successfully')
      setShowBanModal(false)
      setBanReason('')
      setIsScammer(false)
      setIsCSAM(false)
      setSelectedEntity(null)
      fetchRegistry()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update user')
    } finally {
      setIsBanning(false)
    }
  }

  const allEntities = data
    ? [...data.users, ...data.actors, ...data.agents, ...data.apps]
    : []

  const getActiveEntities = () => {
    if (!data) return []
    switch (activeTab) {
      case 'users':
        return data.users
      case 'actors':
        return data.actors
      case 'agents':
        return data.agents
      case 'apps':
        return data.apps
      default:
        return allEntities
    }
  }

  const activeEntities = getActiveEntities()

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold mb-2 text-foreground">ERC8004 Registry</h2>
        <p className="text-muted-foreground">
          Browse all registered entities in the Babylon ecosystem
        </p>
      </div>

      <div className="flex flex-col sm:flex-row gap-4">
        <div className="flex-1">
          <SearchBar
            value={search}
            onChange={setSearch}
            placeholder="Search by name, username, or description..."
          />
        </div>
        <button
          onClick={() => setOnChainOnly(!onChainOnly)}
          className={cn(
            'flex items-center gap-2 px-4 py-2 rounded-full font-semibold transition-all duration-200 whitespace-nowrap',
            onChainOnly
              ? 'bg-primary text-primary-foreground hover:bg-primary/90'
              : 'bg-muted text-muted-foreground hover:bg-muted/80 border border-border'
          )}
        >
          <Shield className="h-4 w-4" />
          On-chain Only
          {onChainOnly && <X className="h-4 w-4" />}
        </button>
      </div>

      {data && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div className="bg-card border border-border rounded-2xl px-4 py-3">
            <div className="text-sm text-muted-foreground mb-1">Total</div>
            <div className="text-3xl font-bold text-foreground">{data.totals.total}</div>
          </div>
          <div className="bg-card border border-border rounded-2xl px-4 py-3">
            <div className="flex items-center gap-1 text-sm text-muted-foreground mb-1">
              <UserCircle className="h-4 w-4" />
              <span>Users</span>
            </div>
            <div className="text-3xl font-bold text-foreground">{data.totals.users}</div>
          </div>
          <div className="bg-card border border-border rounded-2xl px-4 py-3">
            <div className="flex items-center gap-1 text-sm text-muted-foreground mb-1">
              <Users className="h-4 w-4" />
              <span>Actors</span>
            </div>
            <div className="text-3xl font-bold text-foreground">{data.totals.actors}</div>
          </div>
          <div className="bg-card border border-border rounded-2xl px-4 py-3">
            <div className="flex items-center gap-1 text-sm text-muted-foreground mb-1">
              <Bot className="h-4 w-4" />
              <span>Agents</span>
            </div>
            <div className="text-3xl font-bold text-foreground">{data.totals.agents}</div>
          </div>
          <div className="bg-card border border-border rounded-2xl px-4 py-3">
            <div className="flex items-center gap-1 text-sm text-muted-foreground mb-1">
              <Building2 className="h-4 w-4" />
              <span>Apps</span>
            </div>
            <div className="text-3xl font-bold text-foreground">{data.totals.apps}</div>
          </div>
        </div>
      )}

      {loading && (
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

      {error && !loading && (
        <div className="flex items-center justify-center py-20">
          <div className="text-center max-w-md">
            <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-foreground mb-2">Failed to load registry</h3>
            <p className="text-muted-foreground mb-4">{error}</p>
            <button
              onClick={fetchRegistry}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
            >
              Try Again
            </button>
          </div>
        </div>
      )}

      {!loading && !error && data && (
        <>
          <div className="flex gap-2 mb-2 overflow-x-auto pb-2">
            <button
              onClick={() => setActiveTab('all')}
              className={cn(
                'px-4 py-3 rounded-lg font-semibold transition-all duration-200 whitespace-nowrap',
                activeTab === 'all'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              )}
            >
              All ({data.totals.total})
            </button>
            <button
              onClick={() => setActiveTab('users')}
              className={cn(
                'flex items-center gap-2 px-4 py-3 rounded-lg font-semibold transition-all duration-200 whitespace-nowrap',
                activeTab === 'users'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              )}
            >
              <UserCircle className="h-4 w-4" />
              Users ({data.totals.users})
            </button>
            <button
              onClick={() => setActiveTab('actors')}
              className={cn(
                'flex items-center gap-2 px-4 py-3 rounded-lg font-semibold transition-all duration-200 whitespace-nowrap',
                activeTab === 'actors'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              )}
            >
              <Users className="h-4 w-4" />
              Actors ({data.totals.actors})
            </button>
            <button
              onClick={() => setActiveTab('agents')}
              className={cn(
                'flex items-center gap-2 px-4 py-3 rounded-lg font-semibold transition-all duration-200 whitespace-nowrap',
                activeTab === 'agents'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              )}
            >
              <Bot className="h-4 w-4" />
              Agents ({data.totals.agents})
            </button>
            <button
              onClick={() => setActiveTab('apps')}
              className={cn(
                'flex items-center gap-2 px-4 py-3 rounded-lg font-semibold transition-all duration-200 whitespace-nowrap',
                activeTab === 'apps'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              )}
            >
              <Building2 className="h-4 w-4" />
              Apps ({data.totals.apps})
            </button>
          </div>

          {activeEntities.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {activeEntities.map((entity) => renderEntityCard(entity))}
            </div>
          ) : (
            <div className="text-center py-20">
              <Search className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-foreground mb-2">No entities found</h3>
              <p className="text-muted-foreground">Try adjusting your search or filters</p>
            </div>
          )}
        </>
      )}

      {/* Feedback Modal */}
      {showFeedbackModal && selectedEntity && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-card border border-border rounded-2xl p-6 max-w-md w-full">
            <h2 className="text-xl font-bold mb-4">Give Feedback</h2>
            <p className="text-muted-foreground mb-4">
              Rate <strong>{selectedEntity.name}</strong>
            </p>
            
            <FeedbackForm
              toUserId={selectedEntity.id}
              toUserName={selectedEntity.name}
              category="general"
              onSuccess={() => {
                setShowFeedbackModal(false)
                setSelectedEntity(null)
                fetchRegistry()
              }}
              onCancel={() => {
                setShowFeedbackModal(false)
                setSelectedEntity(null)
              }}
            />
          </div>
        </div>
      )}

      {/* Ban Modal */}
      {showBanModal && selectedEntity && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-card border border-border rounded-2xl p-6 max-w-md w-full">
            <h2 className="text-xl font-bold mb-4">
              {selectedEntity.isBanned ? 'Unban User' : 'Ban User'}
            </h2>
            <p className="text-muted-foreground mb-4">
              {selectedEntity.isBanned 
                ? `Are you sure you want to unban ${selectedEntity.name}?`
                : `Are you sure you want to ban ${selectedEntity.name}?`}
            </p>
            
            {!selectedEntity.isBanned && (
              <>
                <div className="mb-4">
                  <label className="block text-sm font-medium mb-2">
                    Reason for ban <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    value={banReason}
                    onChange={(e) => setBanReason(e.target.value)}
                    placeholder="Explain why this user is being banned..."
                    className="w-full px-3 py-2 bg-background border border-border rounded-lg focus:outline-none focus:border-border resize-none"
                    rows={3}
                  />
                </div>

                <div className="mb-4 space-y-3">
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      id="isScammer"
                      checked={isScammer}
                      onChange={(e) => setIsScammer(e.target.checked)}
                      className="mt-1 w-4 h-4 rounded border-border text-red-500 focus:ring-red-500"
                    />
                    <label htmlFor="isScammer" className="text-sm font-medium cursor-pointer">
                      Mark as Scammer
                      <p className="text-xs text-muted-foreground mt-1">
                        This user is engaging in fraudulent or deceptive behavior
                      </p>
                    </label>
                  </div>

                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      id="isCSAM"
                      checked={isCSAM}
                      onChange={(e) => setIsCSAM(e.target.checked)}
                      className="mt-1 w-4 h-4 rounded border-border text-red-500 focus:ring-red-500"
                    />
                    <label htmlFor="isCSAM" className="text-sm font-medium cursor-pointer">
                      Mark as CSAM (Child Sexual Abuse Material)
                      <p className="text-xs text-muted-foreground mt-1">
                        This user is sharing or promoting child sexual abuse material
                      </p>
                    </label>
                  </div>
                </div>
              </>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowBanModal(false)
                  setBanReason('')
                  setIsScammer(false)
                  setIsCSAM(false)
                  setSelectedEntity(null)
                }}
                className="flex-1 px-4 py-2 bg-muted text-foreground rounded-lg hover:bg-muted/80 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleBanUser(selectedEntity, selectedEntity.isBanned ? 'unban' : 'ban')}
                disabled={isBanning || (!selectedEntity.isBanned && !banReason.trim())}
                className={cn(
                  "flex-1 px-4 py-2 rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-50",
                  selectedEntity.isBanned
                    ? "bg-green-500 text-white hover:bg-green-600"
                    : "bg-red-500 text-white hover:bg-red-600"
                )}
              >
                <Ban className="w-4 h-4" />
                {isBanning ? 'Processing...' : selectedEntity.isBanned ? 'Unban User' : 'Ban User'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
