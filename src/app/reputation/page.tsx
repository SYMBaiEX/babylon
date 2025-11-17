'use client'

import { useEffect, useState } from 'react'
import { Award, Medal, Target, Trophy } from 'lucide-react'

import { PageContainer } from '@/components/shared/PageContainer'
import { useAuth } from '@/hooks/useAuth'

interface ReputationStats {
  currentReputation: number
  totalWins: number
  totalLosses: number
  winRate: number
  averageGameScore: number
  averageFeedbackScore: number
  totalFeedbackReceived: number
  trustLevel: string
}

const emptyStats: ReputationStats = {
  currentReputation: 0,
  totalWins: 0,
  totalLosses: 0,
  winRate: 0,
  averageGameScore: 0,
  averageFeedbackScore: 0,
  totalFeedbackReceived: 0,
  trustLevel: 'UNRATED',
}

export default function ReputationPage() {
  const { user, authenticated } = useAuth()
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState<ReputationStats>(emptyStats)

  useEffect(() => {
    if (!authenticated || !user) {
      setLoading(false)
      return
    }

    const fetchReputation = async () => {
      setLoading(true)
      try {
        const response = await fetch(`/api/reputation/${encodeURIComponent(user.id)}`)
        if (!response.ok) {
          setStats(emptyStats)
          return
        }

        const data = await response.json()
        const gamesPlayed = data.performance?.gamesPlayed ?? 0
        const gamesWon = data.performance?.gamesWon ?? 0
        const wins = Math.max(0, gamesWon)
        const losses = Math.max(0, gamesPlayed - gamesWon)

        setStats({
          currentReputation: Math.round(data.reputationPoints ?? 0),
          totalWins: wins,
          totalLosses: losses,
          winRate: (data.performance?.winRate ?? 0) * 100,
          averageGameScore: data.performance?.averageGameScore ?? 0,
          averageFeedbackScore: data.averageFeedbackScore ?? 0,
          totalFeedbackReceived: data.totalFeedbackReceived ?? 0,
          trustLevel: data.trustLevel ?? 'UNRATED',
        })
      } catch (error) {
        console.error('Failed to fetch reputation:', error)
        setStats(emptyStats)
      } finally {
        setLoading(false)
      }
    }

    void fetchReputation()

    const interval = setInterval(fetchReputation, 30000)
    return () => clearInterval(interval)
  }, [authenticated, user])

  const hasNft = Boolean(user?.nftTokenId || user?.onChainRegistered)

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

  if (!loading && !hasNft) {
    return (
      <PageContainer>
        <div className="max-w-4xl mx-auto text-center py-12">
          <Award className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
          <h1 className="text-2xl font-bold mb-2">Missing Reputation NFT</h1>
          <p className="text-muted-foreground mb-6">
            Complete on-chain onboarding to activate your public scores
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
        <div className="text-center py-6">
          <h1 className="text-3xl font-bold mb-2">Reputation Dashboard</h1>
          <p className="text-muted-foreground">
            Composite score = PnL (40%) + feedback (40%) + activity (20%)
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-card border border-border rounded-lg p-6">
            <div className="flex items-center gap-3 mb-2">
              <Award className="w-5 h-5 text-primary" />
              <span className="text-sm text-muted-foreground uppercase tracking-wide">Score</span>
            </div>
            <p className="text-3xl font-bold text-foreground">{stats.currentReputation}</p>
            <p className="text-xs text-muted-foreground mt-1">Trust: {stats.trustLevel}</p>
          </div>

          <div className="bg-card border border-border rounded-lg p-6">
            <div className="flex items-center gap-3 mb-2">
              <Trophy className="w-5 h-5 text-green-600" />
              <span className="text-sm text-muted-foreground uppercase tracking-wide">Wins</span>
            </div>
            <p className="text-3xl font-bold text-green-600">{stats.totalWins}</p>
            <p className="text-xs text-muted-foreground mt-1">
              Avg game score: {stats.averageGameScore.toFixed(1)}
            </p>
          </div>

          <div className="bg-card border border-border rounded-lg p-6">
            <div className="flex items-center gap-3 mb-2">
              <Target className="w-5 h-5 text-red-600" />
              <span className="text-sm text-muted-foreground uppercase tracking-wide">Losses</span>
            </div>
            <p className="text-3xl font-bold text-red-600">{stats.totalLosses}</p>
            <p className="text-xs text-muted-foreground mt-1">
              Avg feedback: {stats.averageFeedbackScore.toFixed(1)} ({stats.totalFeedbackReceived}{' '}
              ratings)
            </p>
          </div>

          <div className="bg-card border border-border rounded-lg p-6">
            <div className="flex items-center gap-3 mb-2">
              <Medal className="w-5 h-5 text-primary" />
              <span className="text-sm text-muted-foreground uppercase tracking-wide">Win Rate</span>
            </div>
            <p className="text-3xl font-bold text-foreground">{stats.winRate.toFixed(1)}%</p>
            <p className="text-xs text-muted-foreground mt-1">
              {stats.totalWins}W / {stats.totalLosses}L
            </p>
          </div>
        </div>

        <div className="bg-card border border-border rounded-lg p-6">
          <h2 className="text-lg font-semibold mb-4">Your Reputation NFT</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-muted-foreground block mb-1">Token ID</label>
              <p className="font-mono text-foreground">#{user?.nftTokenId ?? 'N/A'}</p>
            </div>
            <div>
              <label className="text-sm text-muted-foreground block mb-1">Contract Address</label>
              <p className="font-mono text-sm text-foreground truncate">
                {process.env.NEXT_PUBLIC_IDENTITY_REGISTRY_BASE_SEPOLIA}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-card border border-border rounded-lg p-6">
          <h2 className="text-lg font-semibold mb-4">Recent Activity</h2>
          <p className="text-center text-muted-foreground py-8">
            Detailed recaps are coming soon. Keep playing to power your metrics.
          </p>
        </div>

        <div className="bg-card border border-border rounded-lg p-6">
          <h2 className="text-lg font-semibold mb-4">How the Score Is Calculated</h2>
          <div className="space-y-3 text-sm text-muted-foreground">
            <p>
              📈 <strong className="text-foreground">Performance (40%):</strong> normalized PnL &
              win rate.
            </p>
            <p>
              🗳️ <strong className="text-foreground">Feedback (40%):</strong> game / user / agent
              ratings.
            </p>
            <p>
              ♻️ <strong className="text-foreground">Activity (20%):</strong> linear bonus on games
              played (capped at 50).
            </p>
            <p>
              ⛓️ <strong className="text-foreground">On-chain:</strong> synced via ERC-8004 (trust &
              accuracy).
            </p>
          </div>
        </div>
      </div>
    </PageContainer>
  )
}
