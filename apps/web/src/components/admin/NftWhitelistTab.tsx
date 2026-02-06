'use client'

import { cn } from '@babylon/shared'
import {
  CheckCircle,
  Loader2,
  Plus,
  RefreshCw,
  Trash2,
  Users,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Skeleton } from '@/components/shared/Skeleton'

interface SnapshotEntry {
  id: string
  userId: string
  walletAddress: string | null
  rank: number
  points: number
  snapshotTakenAt: string
  hasMinted: boolean
  mintedTokenId: number | null
  mintedAt: string | null
  mintTxHash: string | null
  username: string | null
}

interface SnapshotStats {
  totalEligible: number
  totalMinted: number
  remaining: number
}

export function NftWhitelistTab() {
  const [snapshots, setSnapshots] = useState<SnapshotEntry[]>([])
  const [stats, setStats] = useState<SnapshotStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [addUserId, setAddUserId] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [isPending, startTransition] = useTransition()
  const [refreshing, setRefreshing] = useState(false)
  const [removingUserId, setRemovingUserId] = useState<string | null>(null)

  const filteredSnapshots = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    if (!query) return snapshots

    return snapshots.filter((entry) => {
      const username = (entry.username ?? '').toLowerCase()
      const userId = entry.userId.toLowerCase()
      const walletAddress = (entry.walletAddress ?? '').toLowerCase()
      return (
        username.includes(query) ||
        userId.includes(query) ||
        walletAddress.includes(query)
      )
    })
  }, [searchQuery, snapshots])

  const fetchSnapshots = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/nft-snapshot')
      if (!res.ok) throw new Error('Failed to fetch snapshots')
      const data = await res.json()
      setSnapshots(data.snapshots ?? [])
      setStats(data.stats ?? null)
    } catch (err) {
      toast.error('Failed to load NFT snapshot data')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchSnapshots()
  }, [fetchSnapshots])

  function handleAddUser() {
    if (!addUserId.trim()) return

    startTransition(async () => {
      try {
        const res = await fetch('/api/admin/nft-snapshot', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: addUserId.trim() }),
        })

        const data = await res.json()

        if (!res.ok) {
          toast.error(data.error ?? 'Failed to add user')
          return
        }

        toast.success('User added to snapshot')
        setAddUserId('')
        await fetchSnapshots()
      } catch {
        toast.error('Failed to add user')
      }
    })
  }

  async function handleRemoveUser(userId: string) {
    setRemovingUserId(userId)
    try {
      const res = await fetch('/api/admin/nft-snapshot', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      })

      const data = await res.json()

      if (!res.ok) {
        toast.error(data.error ?? 'Failed to remove user')
        return
      }

      toast.success('User removed from snapshot')
      await fetchSnapshots()
    } catch {
      toast.error('Failed to remove user')
    } finally {
      setRemovingUserId(null)
    }
  }

  async function handleRefreshSnapshot() {
    setRefreshing(true)
    try {
      const res = await fetch('/api/admin/nft-snapshot/refresh', {
        method: 'POST',
      })

      const data = await res.json()

      if (!res.ok) {
        toast.error(data.error ?? 'Failed to refresh snapshot')
        return
      }

      toast.success(
        `Snapshot refreshed: ${data.newlyEligible} new, ${data.updated} updated, ${data.removed} removed`
      )
      await fetchSnapshots()
    } catch {
      toast.error('Failed to refresh snapshot')
    } finally {
      setRefreshing(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Stats Row */}
      {stats && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <Users className="h-4 w-4" />
              Total Eligible
            </div>
            <p className="mt-1 font-bold text-2xl">{stats.totalEligible}</p>
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <CheckCircle className="h-4 w-4" />
              Minted
            </div>
            <p className="mt-1 font-bold text-2xl">{stats.totalMinted}</p>
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <Users className="h-4 w-4" />
              Remaining
            </div>
            <p className="mt-1 font-bold text-2xl">{stats.remaining}</p>
          </div>
        </div>
      )}

      {/* Actions Row */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          {/* Add User Form */}
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={addUserId}
              onChange={(e) => setAddUserId(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleAddUser() }}
              placeholder="User ID to add..."
              className="h-9 rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
            />
            <button
              onClick={handleAddUser}
              disabled={isPending || !addUserId.trim()}
              className={cn(
                'flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 font-medium text-primary-foreground text-sm transition-colors',
                'hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50'
              )}
            >
              {isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              Add
            </button>
          </div>

          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by user, ID, or wallet..."
            className="h-9 rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
          />
        </div>

        {/* Refresh Button */}
        <button
          onClick={handleRefreshSnapshot}
          disabled={refreshing}
          className={cn(
            'flex h-9 items-center gap-1.5 rounded-lg border border-border bg-card px-3 font-medium text-sm transition-colors',
            'hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50'
          )}
        >
          <RefreshCw
            className={cn('h-4 w-4', refreshing && 'animate-spin')}
          />
          Refresh from Leaderboard
        </button>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-border border-b bg-muted/50">
              <th className="px-4 py-3 font-medium text-muted-foreground">Rank</th>
              <th className="px-4 py-3 font-medium text-muted-foreground">User</th>
              <th className="px-4 py-3 font-medium text-muted-foreground">Wallet</th>
              <th className="px-4 py-3 font-medium text-muted-foreground">Points</th>
              <th className="px-4 py-3 font-medium text-muted-foreground">Status</th>
              <th className="px-4 py-3 font-medium text-muted-foreground">Token ID</th>
              <th className="px-4 py-3 font-medium text-muted-foreground">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredSnapshots.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  className="px-4 py-8 text-center text-muted-foreground"
                >
                  {snapshots.length === 0
                    ? (
                      <>
                        No snapshot entries. Click
                        {' '}
                        &quot;Refresh from Leaderboard&quot;
                        {' '}
                        to populate, or add users manually.
                      </>
                    )
                    : 'No entries match your search.'}
                </td>
              </tr>
            ) : (
              filteredSnapshots.map((entry) => (
                <tr
                  key={entry.id}
                  className="border-border border-b last:border-b-0 hover:bg-muted/30"
                >
                  <td className="px-4 py-3 font-medium">#{entry.rank}</td>
                  <td className="px-4 py-3">
                    <div>
                      <span className="font-medium">
                        {entry.username ?? 'Unknown'}
                      </span>
                      <span className="ml-1 text-muted-foreground text-xs">
                        {entry.userId.slice(0, 8)}...
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">
                    {entry.walletAddress
                      ? `${entry.walletAddress.slice(0, 6)}...${entry.walletAddress.slice(-4)}`
                      : '—'}
                  </td>
                  <td className="px-4 py-3">
                    {entry.points.toLocaleString()}
                  </td>
                  <td className="px-4 py-3">
                    {entry.hasMinted ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-green-500/10 px-2 py-0.5 font-medium text-green-500 text-xs">
                        <CheckCircle className="h-3 w-3" />
                        Minted
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full bg-yellow-500/10 px-2 py-0.5 font-medium text-xs text-yellow-500">
                        Eligible
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {entry.mintedTokenId != null ? `#${entry.mintedTokenId}` : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => handleRemoveUser(entry.userId)}
                      disabled={entry.hasMinted || removingUserId === entry.userId}
                      title={entry.hasMinted ? 'Cannot remove — already minted' : 'Remove from whitelist'}
                      className={cn(
                        'flex h-7 w-7 items-center justify-center rounded-lg transition-colors',
                        entry.hasMinted
                          ? 'cursor-not-allowed text-muted-foreground/30'
                          : 'text-red-500 hover:bg-red-500/10'
                      )}
                    >
                      {removingUserId === entry.userId ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
