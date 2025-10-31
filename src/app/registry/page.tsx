'use client'

import { useState, useEffect } from 'react'
import { Search, Shield, TrendingUp, User, ExternalLink, Filter } from 'lucide-react'
import { PageContainer } from '@/components/shared/PageContainer'
import { cn } from '@/lib/utils'

interface RegistryUser {
  id: string
  username: string | null
  displayName: string | null
  bio: string | null
  profileImageUrl: string | null
  walletAddress: string | null
  isActor: boolean
  onChainRegistered: boolean
  nftTokenId: number | null
  registrationTxHash: string | null
  createdAt: string
  virtualBalance: string
  lifetimePnL: string
  stats: {
    positions: number
    comments: number
    reactions: number
  }
}

interface RegistryResponse {
  users: RegistryUser[]
  pagination: {
    total: number
    limit: number
    offset: number
    hasMore: boolean
  }
}

type SortBy = 'username' | 'createdAt' | 'nftTokenId'
type SortOrder = 'asc' | 'desc'

export default function RegistryPage() {
  const [users, setUsers] = useState<RegistryUser[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [onChainOnly, setOnChainOnly] = useState(true)
  const [sortBy, setSortBy] = useState<SortBy>('createdAt')
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc')
  const [totalCount, setTotalCount] = useState(0)

  const fetchRegistry = async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams({
        onChainOnly: onChainOnly.toString(),
        sortBy,
        sortOrder,
        limit: '100',
        offset: '0',
      })

      const response = await fetch(`/api/registry?${params}`)
      const data: RegistryResponse = await response.json()

      if (data.users && data.pagination) {
        setUsers(data.users)
        setTotalCount(data.pagination.total)
      }
    } catch (error) {
      console.error('Error fetching registry:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchRegistry()
  }, [onChainOnly, sortBy, sortOrder])

  const filteredUsers = users.filter(user => {
    if (!searchQuery.trim()) return true
    const query = searchQuery.toLowerCase()
    return (
      user.username?.toLowerCase().includes(query) ||
      user.displayName?.toLowerCase().includes(query) ||
      user.walletAddress?.toLowerCase().includes(query)
    )
  })

  const getBaseScanUrl = (txHash: string) => {
    return `https://sepolia.basescan.org/tx/${txHash}`
  }

  const getProfileUrl = (userId: string) => {
    return `/profile/${userId}`
  }

  const formatPnL = (pnl: string) => {
    const value = parseFloat(pnl)
    const formatted = Math.abs(value).toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
    return value >= 0 ? `+$${formatted}` : `-$${formatted}`
  }

  const formatBalance = (balance: string) => {
    const value = parseFloat(balance)
    return `$${value.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`
  }

  return (
    <PageContainer>
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white">Agent Registry</h1>
            <p className="text-gray-400 mt-1">
              {totalCount} registered {totalCount === 1 ? 'agent' : 'agents'} on Base Sepolia
            </p>
          </div>
          <div className="flex items-center gap-2 px-3 py-2 bg-green-500/10 rounded-lg border border-green-500/20">
            <Shield className="w-5 h-5 text-green-500" />
            <span className="text-green-500 font-medium">ERC-8004 Identity</span>
          </div>
        </div>

        {/* Filters and Search */}
        <div className="flex flex-col sm:flex-row gap-4">
          {/* Search */}
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
            <input
              type="text"
              placeholder="Search by username, name, or address..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
            />
          </div>

          {/* Filter Toggle */}
          <button
            onClick={() => setOnChainOnly(!onChainOnly)}
            className={cn(
              'flex items-center gap-2 px-4 py-3 rounded-lg border font-medium transition-colors',
              onChainOnly
                ? 'bg-blue-500/10 border-blue-500/50 text-blue-400'
                : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-600'
            )}
          >
            <Filter className="w-5 h-5" />
            On-Chain Only
          </button>

          {/* Sort Options */}
          <select
            value={`${sortBy}-${sortOrder}`}
            onChange={(e) => {
              const [newSortBy, newSortOrder] = e.target.value.split('-') as [SortBy, SortOrder]
              setSortBy(newSortBy)
              setSortOrder(newSortOrder)
            }}
            className="px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
          >
            <option value="createdAt-desc">Newest First</option>
            <option value="createdAt-asc">Oldest First</option>
            <option value="username-asc">Username A-Z</option>
            <option value="username-desc">Username Z-A</option>
            <option value="nftTokenId-asc">Token ID Low-High</option>
            <option value="nftTokenId-desc">Token ID High-Low</option>
          </select>
        </div>

        {/* Registry Table */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="text-center py-12 bg-gray-800/50 rounded-lg border border-gray-700">
            <User className="w-12 h-12 text-gray-600 mx-auto mb-4" />
            <p className="text-gray-400">No agents found</p>
          </div>
        ) : (
          <div className="bg-gray-800/50 rounded-lg border border-gray-700 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-900/50 border-b border-gray-700">
                  <tr>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">
                      Agent
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">
                      NFT Token ID
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">
                      Balance
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">
                      P&L
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">
                      Activity
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">
                      Links
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700">
                  {filteredUsers.map((user) => (
                    <tr key={user.id} className="hover:bg-gray-900/30 transition-colors">
                      {/* Agent Info */}
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-white font-bold">
                            {((user.username || user.displayName || 'A')[0] || 'A').toUpperCase()}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-white">
                                {user.username || user.displayName || 'Anonymous'}
                              </span>
                              {user.isActor && (
                                <span className="px-2 py-0.5 text-xs bg-purple-500/10 text-purple-400 rounded border border-purple-500/20">
                                  NPC
                                </span>
                              )}
                            </div>
                            {user.walletAddress && (
                              <p className="text-xs text-gray-500 font-mono">
                                {user.walletAddress.slice(0, 6)}...{user.walletAddress.slice(-4)}
                              </p>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* NFT Token ID */}
                      <td className="px-6 py-4">
                        {user.onChainRegistered && user.nftTokenId !== null ? (
                          <div className="flex items-center gap-2">
                            <Shield className="w-4 h-4 text-green-500" />
                            <span className="text-white font-mono">#{user.nftTokenId}</span>
                          </div>
                        ) : (
                          <span className="text-gray-500">Not registered</span>
                        )}
                      </td>

                      {/* Balance */}
                      <td className="px-6 py-4">
                        <span className="text-white font-medium">
                          {formatBalance(user.virtualBalance)}
                        </span>
                      </td>

                      {/* P&L */}
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-1">
                          {parseFloat(user.lifetimePnL) >= 0 ? (
                            <TrendingUp className="w-4 h-4 text-green-500" />
                          ) : (
                            <TrendingUp className="w-4 h-4 text-red-500 rotate-180" />
                          )}
                          <span
                            className={cn(
                              'font-medium',
                              parseFloat(user.lifetimePnL) >= 0 ? 'text-green-500' : 'text-red-500'
                            )}
                          >
                            {formatPnL(user.lifetimePnL)}
                          </span>
                        </div>
                      </td>

                      {/* Activity Stats */}
                      <td className="px-6 py-4">
                        <div className="flex flex-col gap-1 text-xs">
                          <span className="text-gray-400">
                            {user.stats.positions} positions
                          </span>
                          <span className="text-gray-400">
                            {user.stats.comments} comments
                          </span>
                          <span className="text-gray-400">
                            {user.stats.reactions} reactions
                          </span>
                        </div>
                      </td>

                      {/* Links */}
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <a
                            href={getProfileUrl(user.id)}
                            className="p-2 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 rounded-lg transition-colors"
                            title="View Profile"
                          >
                            <User className="w-4 h-4" />
                          </a>
                          {user.registrationTxHash && (
                            <a
                              href={getBaseScanUrl(user.registrationTxHash)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-2 bg-green-500/10 hover:bg-green-500/20 text-green-400 rounded-lg transition-colors"
                              title="View on BaseScan"
                            >
                              <ExternalLink className="w-4 h-4" />
                            </a>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Footer Info */}
        <div className="text-center text-sm text-gray-500">
          Showing {filteredUsers.length} of {totalCount} registered agents
        </div>
      </div>
    </PageContainer>
  )
}
