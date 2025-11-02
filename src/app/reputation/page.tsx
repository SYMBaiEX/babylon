'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { PageContainer } from '@/components/shared/PageContainer'
import { Award, TrendingUp, TrendingDown, Trophy, Target, Medal } from 'lucide-react'
import { cn } from '@/lib/utils'
import { logger } from '@/lib/logger'

interface ReputationStats {
  currentReputation: number
  totalWins: number
  totalLosses: number
  winRate: number
  hasNft?: boolean
  recentActivity: Array<{
    marketId: string
    marketTitle: string
    outcome: 'win' | 'loss'
    reputationChange: number
    timestamp: Date
  }>
}

export default function ReputationPage() {
  const { user, authenticated } = useAuth()
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState<ReputationStats | null>(null)

  useEffect(() => {
    if (!authenticated || !user) {
      setLoading(false)
      return
    }

    const fetchReputation = async () => {
      try {
        setLoading(true)
        const response = await fetch(`/api/users/${user.id}/reputation`)

        if (response.ok) {
          const data = await response.json()

          if (data.hasNft) {
            setStats({
              currentReputation: data.currentReputation || 100,
              totalWins: data.totalWins || 0,
              totalLosses: data.totalLosses || 0,
              winRate: data.winRate || 0,
              recentActivity: data.recentActivity || []
            })
          } else {
            // User doesn't have NFT yet
            setStats({
              currentReputation: 100,
              totalWins: 0,
              totalLosses: 0,
              winRate: 0,
              recentActivity: []
            })
          }
        }
      } catch (error) {
        logger.error('Error fetching reputation:', error, 'ReputationPage')
      } finally {
        setLoading(false)
      }
    }

    fetchReputation()

    // Refresh every 30 seconds
    const interval = setInterval(fetchReputation, 30000)
    return () => clearInterval(interval)
  }, [authenticated, user])

  if (!authenticated) {
    return (
      <PageContainer>
        <div className="max-w-4xl mx-auto text-center py-12">
          <Award className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
          <h1 className="text-2xl font-bold mb-2">Reputation Dashboard</h1>
          <p className="text-muted-foreground mb-6">
            Connect your wallet to view your on-chain reputation
          </p>
        </div>
      </PageContainer>
    )
  }

  // Check if stats indicate no NFT after loading
  if (!loading && stats && !stats.hasNft) {
    return (
      <PageContainer>
        <div className="max-w-4xl mx-auto text-center py-12">
          <Award className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
          <h1 className="text-2xl font-bold mb-2">No Reputation NFT</h1>
          <p className="text-muted-foreground mb-6">
            You need to complete onboarding to receive your reputation NFT
          </p>
        </div>
      </PageContainer>
    )
  }

  if (loading) {
    return (
      <PageContainer>
        <div className="max-w-4xl mx-auto text-center py-12">
          <p className="text-muted-foreground">Loading reputation...</p>
        </div>
      </PageContainer>
    )
  }

  return (
    <PageContainer>
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="text-center py-6">
          <h1 className="text-3xl font-bold mb-2">Reputation Dashboard</h1>
          <p className="text-muted-foreground">
            Your on-chain trading reputation
          </p>
        </div>

        {/* Main Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Current Reputation */}
          <div className="bg-card border border-border rounded-lg p-6">
            <div className="flex items-center gap-3 mb-2">
              <Award className="w-5 h-5 text-primary" />
              <span className="text-sm text-muted-foreground uppercase tracking-wide">
                Reputation
              </span>
            </div>
            <p className="text-3xl font-bold text-foreground">
              {stats?.currentReputation || 100}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Starting: 100
            </p>
          </div>

          {/* Total Wins */}
          <div className="bg-card border border-border rounded-lg p-6">
            <div className="flex items-center gap-3 mb-2">
              <Trophy className="w-5 h-5 text-green-600" />
              <span className="text-sm text-muted-foreground uppercase tracking-wide">
                Wins
              </span>
            </div>
            <p className="text-3xl font-bold text-green-600">
              {stats?.totalWins || 0}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              +10 reputation each
            </p>
          </div>

          {/* Total Losses */}
          <div className="bg-card border border-border rounded-lg p-6">
            <div className="flex items-center gap-3 mb-2">
              <Target className="w-5 h-5 text-red-600" />
              <span className="text-sm text-muted-foreground uppercase tracking-wide">
                Losses
              </span>
            </div>
            <p className="text-3xl font-bold text-red-600">
              {stats?.totalLosses || 0}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              -5 reputation each
            </p>
          </div>

          {/* Win Rate */}
          <div className="bg-card border border-border rounded-lg p-6">
            <div className="flex items-center gap-3 mb-2">
              <Medal className="w-5 h-5 text-primary" />
              <span className="text-sm text-muted-foreground uppercase tracking-wide">
                Win Rate
              </span>
            </div>
            <p className="text-3xl font-bold text-foreground">
              {stats?.winRate.toFixed(1) || 0}%
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {stats?.totalWins || 0}W / {stats?.totalLosses || 0}L
            </p>
          </div>
        </div>

        {/* NFT Info */}
        <div className="bg-card border border-border rounded-lg p-6">
          <h2 className="text-lg font-semibold mb-4">Your Reputation NFT</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-muted-foreground block mb-1">
                Token ID
              </label>
              <p className="font-mono text-foreground">
                #{user?.id || 'N/A'}
              </p>
            </div>
            <div>
              <label className="text-sm text-muted-foreground block mb-1">
                Contract Address
              </label>
              <p className="font-mono text-sm text-foreground truncate">
                {process.env.NEXT_PUBLIC_IDENTITY_REGISTRY_BASE_SEPOLIA}
              </p>
            </div>
          </div>
        </div>

        {/* Recent Activity */}
        <div className="bg-card border border-border rounded-lg p-6">
          <h2 className="text-lg font-semibold mb-4">Recent Activity</h2>
          {stats?.recentActivity && stats.recentActivity.length > 0 ? (
            <div className="space-y-3">
              {stats.recentActivity.map((activity, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between p-3 bg-muted/30 rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    {activity.outcome === 'win' ? (
                      <TrendingUp className="w-5 h-5 text-green-600" />
                    ) : (
                      <TrendingDown className="w-5 h-5 text-red-600" />
                    )}
                    <div>
                      <p className="font-medium text-foreground">
                        {activity.marketTitle}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {new Date(activity.timestamp).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <div className={cn(
                    "font-bold",
                    activity.outcome === 'win' ? 'text-green-600' : 'text-red-600'
                  )}>
                    {activity.reputationChange > 0 ? '+' : ''}{activity.reputationChange}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-center text-muted-foreground py-8">
              No market resolutions yet. Start trading to build your reputation!
            </p>
          )}
        </div>

        {/* How It Works */}
        <div className="bg-card border border-border rounded-lg p-6">
          <h2 className="text-lg font-semibold mb-4">How Reputation Works</h2>
          <div className="space-y-3 text-sm text-muted-foreground">
            <p>
              🏆 <strong className="text-foreground">Win a market:</strong> +10 reputation (on-chain)
            </p>
            <p>
              📉 <strong className="text-foreground">Lose a market:</strong> -5 reputation (on-chain)
            </p>
            <p>
              🎯 <strong className="text-foreground">Starting reputation:</strong> 100 points
            </p>
            <p>
              ⛓️ <strong className="text-foreground">Blockchain verified:</strong> All reputation changes are recorded on Base Sepolia
            </p>
          </div>
        </div>
      </div>
    </PageContainer>
  )
}
