'use client'

import { useEffect, useState } from 'react'
import { PageContainer } from '@/components/shared/PageContainer'
import { RankBadge, RankNumber } from '@/components/shared/RankBadge'
import { Avatar } from '@/components/shared/Avatar'
import { Trophy, ChevronLeft, ChevronRight, Users, TrendingUp } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { logger } from '@/lib/logger'

interface LeaderboardUser {
  id: string
  username: string | null
  displayName: string | null
  profileImageUrl: string | null
  reputationPoints: number
  referralCount: number
  createdAt: Date
  rank: number
  isActor?: boolean
  tier?: string | null
}

interface LeaderboardData {
  leaderboard: LeaderboardUser[]
  pagination: {
    page: number
    pageSize: number
    totalCount: number
    totalPages: number
  }
  minPoints: number
}

export default function LeaderboardPage() {
  const { authenticated, user } = useAuth()
  const [leaderboardData, setLeaderboardData] = useState<LeaderboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const pageSize = 100
  const minPoints = 10000

  // Fetch leaderboard data
  useEffect(() => {
    async function fetchLeaderboard() {
      try {
        setLoading(true)
        setError(null)

        const response = await fetch(
          `/api/leaderboard?page=${currentPage}&pageSize=${pageSize}&minPoints=${minPoints}`
        )

        if (!response.ok) {
          throw new Error('Failed to fetch leaderboard')
        }

        const data = await response.json()
        setLeaderboardData(data)
      } catch (err) {
        logger.error('Error fetching leaderboard:', err, 'LeaderboardPage')
        setError(err instanceof Error ? err.message : 'Failed to load leaderboard')
      } finally {
        setLoading(false)
      }
    }

    fetchLeaderboard()
  }, [currentPage])

  const handlePreviousPage = () => {
    if (currentPage > 1) {
      setCurrentPage(currentPage - 1)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }

  const handleNextPage = () => {
    if (leaderboardData && currentPage < leaderboardData.pagination.totalPages) {
      setCurrentPage(currentPage + 1)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }

  return (
    <PageContainer noPadding className="flex flex-col">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-gray-900/95 backdrop-blur-sm border-b border-gray-800">
        <div className="p-4">
          <div className="flex items-center gap-3">
            <Trophy className="w-6 h-6 text-yellow-500" />
            <div>
              <h1 className="text-xl font-bold text-white">Leaderboard</h1>
              <p className="text-sm text-gray-400">
                Top traders & players with 10,000+ reputation points
              </p>
            </div>
          </div>

          {/* Stats Bar */}
          {leaderboardData && (
            <div className="mt-4 flex gap-4 text-sm">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-gray-400" />
                <span className="text-gray-300">
                  {leaderboardData.pagination.totalCount} Competitors
                </span>
              </div>
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-gray-400" />
                <span className="text-gray-300">
                  Min {minPoints.toLocaleString()} pts
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Loading State */}
      {loading && (
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="text-center">
            <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-gray-400">Loading leaderboard...</p>
          </div>
        </div>
      )}

      {/* Error State */}
      {error && !loading && (
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="text-center text-red-400">
            <p className="text-lg font-semibold mb-2">Failed to load leaderboard</p>
            <p className="text-sm text-gray-400">{error}</p>
          </div>
        </div>
      )}

      {/* Leaderboard List */}
      {!loading && !error && leaderboardData && leaderboardData.leaderboard.length === 0 && (
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="text-center text-gray-400">
            <Trophy className="w-16 h-16 mx-auto mb-4 opacity-50" />
            <p className="text-lg font-semibold mb-2">Compete with AI Traders</p>
            <p className="text-sm mb-2">
              Earn {minPoints.toLocaleString()} reputation points to appear on the leaderboard!
            </p>
            <p className="text-xs text-gray-500">
              Complete your profile, link socials, share, and refer friends to earn up to 7,000 points
            </p>
          </div>
        </div>
      )}

      {!loading && !error && leaderboardData && leaderboardData.leaderboard.length > 0 && (
        <div className="flex-1 overflow-y-auto">
          <div className="divide-y divide-gray-800">
            {leaderboardData.leaderboard.map((player) => {
              const isCurrentUser = authenticated && user && player.id === user.id
              
              return (
                <div
                  key={player.id}
                  className={`p-4 transition-colors ${
                    isCurrentUser
                      ? 'bg-blue-900/20 border-l-4 border-blue-500'
                      : 'hover:bg-gray-800/50'
                  }`}
                >
                  <div className="flex items-center gap-4">
                    {/* Rank */}
                    <div className="flex-shrink-0">
                      <RankNumber rank={player.rank} size="md" />
                    </div>

                    {/* Avatar */}
                    <div className="flex-shrink-0">
                      <Avatar
                        src={player.profileImageUrl || undefined}
                        alt={player.displayName || player.username || 'User'}
                        size="md"
                      />
                    </div>

                    {/* User Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold text-white truncate">
                          {player.displayName || player.username || 'Anonymous'}
                        </h3>
                        {isCurrentUser && (
                          <span className="px-2 py-0.5 text-xs font-semibold bg-blue-500 text-white rounded">
                            YOU
                          </span>
                        )}
                      </div>
                      {player.username && (
                        <p className="text-sm text-gray-400 truncate">
                          @{player.username}
                        </p>
                      )}
                    </div>

                    {/* Points and Badge */}
                    <div className="flex-shrink-0 text-right">
                      <div className="flex items-center gap-3">
                        <div>
                          <div className="text-lg font-bold text-white">
                            {player.reputationPoints.toLocaleString()}
                          </div>
                          <div className="text-xs text-gray-400">points</div>
                        </div>
                        <div className="flex-shrink-0">
                          <RankBadge rank={player.rank} size="md" showLabel={false} />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Additional Info for Top 10 */}
                  {player.rank <= 10 && player.referralCount > 0 && (
                    <div className="mt-2 ml-16 text-xs text-gray-400">
                      {player.referralCount} referral{player.referralCount !== 1 ? 's' : ''}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* Pagination */}
          {leaderboardData.pagination.totalPages > 1 && (
            <div className="sticky bottom-0 bg-gray-900/95 backdrop-blur-sm border-t border-gray-800 p-4">
              <div className="flex items-center justify-between">
                <button
                  onClick={handlePreviousPage}
                  disabled={currentPage === 1}
                  className="flex items-center gap-2 px-4 py-2 bg-gray-800 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-700 transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                  Previous
                </button>

                <div className="text-sm text-gray-400">
                  Page {currentPage} of {leaderboardData.pagination.totalPages}
                </div>

                <button
                  onClick={handleNextPage}
                  disabled={currentPage === leaderboardData.pagination.totalPages}
                  className="flex items-center gap-2 px-4 py-2 bg-gray-800 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-700 transition-colors"
                >
                  Next
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </PageContainer>
  )
}

