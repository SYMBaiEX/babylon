'use client'

import { useEffect, useState } from 'react'
import { PageContainer } from '@/components/shared/PageContainer'
import { WidgetSidebar } from '@/components/shared/WidgetSidebar'
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
      {/* Desktop: Content + Widgets layout */}
      <div className="hidden xl:flex flex-1 overflow-hidden">
        {/* Main content */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

      {/* Loading State */}
      {loading && (
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="text-center">
            <div className="w-8 h-8 border-2 border-[#1c9cf0] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-muted-foreground">Loading leaderboard...</p>
          </div>
        </div>
      )}

      {/* Error State */}
      {error && !loading && (
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="text-center">
            <p className="text-lg font-semibold mb-2 text-foreground">Failed to load leaderboard</p>
            <p className="text-sm text-muted-foreground">{error}</p>
          </div>
        </div>
      )}

      {/* Leaderboard List */}
      {!loading && !error && leaderboardData && leaderboardData.leaderboard.length === 0 && (
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="text-center text-muted-foreground">
            <Trophy className="w-16 h-16 mx-auto mb-4 opacity-50" />
            <p className="text-lg font-semibold mb-2 text-foreground">Compete with AI Traders</p>
            <p className="text-sm mb-2">
              Earn {minPoints.toLocaleString()} reputation points to appear on the leaderboard!
            </p>
            <p className="text-xs">
              Complete your profile, link socials, share, and refer friends to earn up to 7,000 points
            </p>
          </div>
        </div>
      )}

      {!loading && !error && leaderboardData && leaderboardData.leaderboard.length > 0 && (
        <div className="flex-1 overflow-y-auto">
          <div className="w-full max-w-4xl mx-auto px-4 lg:px-6">
            <div className="flex items-center gap-2 mb-4 px-4 pt-4">
              <Users className="w-5 h-5 text-[#1c9cf0]" />
              <h2 className="text-lg font-semibold text-foreground">
                {leaderboardData.leaderboard.length} {leaderboardData.leaderboard.length === 1 ? 'Player' : 'Players'}
              </h2>
              <TrendingUp className="w-4 h-4 text-muted-foreground" />
            </div>
            <div className="space-y-0">
              {leaderboardData.leaderboard.map((player) => {
                const isCurrentUser = authenticated && user && player.id === user.id
                
                return (
                  <div
                    key={player.id}
                    className={`p-4 transition-colors ${
                      isCurrentUser
                        ? 'bg-[#1c9cf0]/20 border-l-4'
                        : 'hover:bg-muted/30'
                    }`}
                    style={{
                      borderLeftColor: isCurrentUser ? '#1c9cf0' : 'transparent',
                    }}
                  >
                    <div className="flex items-center gap-4">
                      {/* Rank */}
                      <div className="flex-shrink-0">
                        <RankNumber rank={player.rank} size="md" />
                      </div>

                      {/* Avatar */}
                      <div className="flex-shrink-0">
                        <Avatar
                          id={player.id}
                          name={player.displayName || player.username || 'User'}
                          type={player.isActor ? 'actor' : undefined}
                          size="md"
                          src={player.profileImageUrl || undefined}
                        />
                      </div>

                      {/* User Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-semibold text-foreground truncate">
                            {player.displayName || player.username || 'Anonymous'}
                          </h3>
                          {isCurrentUser && (
                            <span className="px-2 py-0.5 text-xs font-semibold bg-[#1c9cf0] text-white rounded">
                              YOU
                            </span>
                          )}
                        </div>
                        {player.username && (
                          <p className="text-sm text-muted-foreground truncate">
                            @{player.username}
                          </p>
                        )}
                      </div>

                      {/* Points and Badge */}
                      <div className="flex-shrink-0 text-right">
                        <div className="flex items-center gap-3">
                          <div>
                            <div className="text-lg font-bold text-foreground">
                              {player.reputationPoints.toLocaleString()}
                            </div>
                            <div className="text-xs text-muted-foreground">points</div>
                          </div>
                          <div className="flex-shrink-0">
                            <RankBadge rank={player.rank} size="md" showLabel={false} />
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Additional Info for Top 10 */}
                    {player.rank <= 10 && player.referralCount > 0 && (
                      <div className="mt-2 ml-16 text-xs text-muted-foreground">
                        {player.referralCount} referral{player.referralCount !== 1 ? 's' : ''}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Pagination */}
            {leaderboardData.pagination.totalPages > 1 && (
              <div className="sticky bottom-0 bg-background/95 backdrop-blur-sm p-4">
                <div className="flex items-center justify-between">
                  <button
                    onClick={handlePreviousPage}
                    disabled={currentPage === 1}
                    className="flex items-center gap-2 px-4 py-2 bg-sidebar-accent text-foreground rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-sidebar-accent/80 transition-colors"
                  >
                    <ChevronLeft className="w-4 h-4" />
                    Previous
                  </button>

                  <div className="text-sm text-muted-foreground">
                    Page {currentPage} of {leaderboardData.pagination.totalPages}
                  </div>

                  <button
                    onClick={handleNextPage}
                    disabled={currentPage === leaderboardData.pagination.totalPages}
                    className="flex items-center gap-2 px-4 py-2 bg-sidebar-accent text-foreground rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-sidebar-accent/80 transition-colors"
                  >
                    Next
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
        </div>

        {/* Widget Sidebar */}
        <WidgetSidebar />
      </div>

      {/* Mobile/Tablet: Full width content */}
      <div className="flex xl:hidden flex-col flex-1 overflow-hidden">

        {/* Loading State */}
        {loading && (
          <div className="flex-1 flex items-center justify-center p-8">
            <div className="text-center">
              <div className="w-8 h-8 border-2 border-[#1c9cf0] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
              <p className="text-muted-foreground">Loading leaderboard...</p>
            </div>
          </div>
        )}

        {/* Error State */}
        {error && !loading && (
          <div className="flex-1 flex items-center justify-center p-8">
            <div className="text-center">
              <p className="text-lg font-semibold mb-2 text-foreground">Failed to load leaderboard</p>
              <p className="text-sm text-muted-foreground">{error}</p>
            </div>
          </div>
        )}

        {/* Leaderboard List */}
        {!loading && !error && leaderboardData && leaderboardData.leaderboard.length === 0 && (
          <div className="flex-1 flex items-center justify-center p-8">
            <div className="text-center text-muted-foreground">
              <Trophy className="w-16 h-16 mx-auto mb-4 opacity-50" />
              <p className="text-lg font-semibold mb-2 text-foreground">Compete with AI Traders</p>
              <p className="text-sm mb-2">
                Earn {minPoints.toLocaleString()} reputation points to appear on the leaderboard!
              </p>
              <p className="text-xs">
                Complete your profile, link socials, share, and refer friends to earn up to 7,000 points
              </p>
            </div>
          </div>
        )}

        {!loading && !error && leaderboardData && leaderboardData.leaderboard.length > 0 && (
          <div className="flex-1 overflow-y-auto">
            <div className="w-full px-4 sm:px-6">
              {/* Header */}
              <div className="flex items-center gap-2 mb-4 pt-4 pb-2">
                <Users className="w-5 h-5 text-[#1c9cf0]" />
                <h2 className="text-lg font-semibold text-foreground">
                  {leaderboardData.leaderboard.length} {leaderboardData.leaderboard.length === 1 ? 'Player' : 'Players'}
                </h2>
                <TrendingUp className="w-4 h-4 text-muted-foreground" />
              </div>
              
              <div className="space-y-0">
                {leaderboardData.leaderboard.map((player) => {
                  const isCurrentUser = authenticated && user && player.id === user.id
                  
                  return (
                    <div
                      key={player.id}
                      className={`p-3 sm:p-4 transition-colors ${
                        isCurrentUser
                          ? 'bg-[#1c9cf0]/20 border-l-4'
                          : 'hover:bg-muted/30'
                      }`}
                      style={{
                        borderLeftColor: isCurrentUser ? '#1c9cf0' : 'transparent',
                      }}
                    >
                      <div className="flex items-center gap-2 sm:gap-4">
                        {/* Rank */}
                        <div className="flex-shrink-0">
                          <RankNumber rank={player.rank} size="md" />
                        </div>

                        {/* Avatar */}
                        <div className="flex-shrink-0">
                          <Avatar
                            id={player.id}
                            name={player.displayName || player.username || 'User'}
                            type={player.isActor ? 'actor' : undefined}
                            size="md"
                            src={player.profileImageUrl || undefined}
                          />
                        </div>

                        {/* User Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="text-sm sm:text-base font-semibold text-foreground truncate">
                              {player.displayName || player.username || 'Anonymous'}
                            </h3>
                            {isCurrentUser && (
                              <span className="text-xs px-2 py-0.5 rounded bg-[#1c9cf0]/20 text-[#1c9cf0] flex-shrink-0">
                                You
                              </span>
                            )}
                          </div>
                          {player.username && (
                            <p className="text-xs text-muted-foreground truncate mb-1">
                              @{player.username}
                            </p>
                          )}
                          <div className="flex items-center gap-2 sm:gap-3 text-xs sm:text-sm text-muted-foreground">
                            <span>{player.reputationPoints.toLocaleString()} pts</span>
                            {player.rank <= 3 && (
                              <RankBadge rank={player.rank} />
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Pagination */}
              {leaderboardData.pagination.totalPages > 1 && (
                <div className="sticky bottom-0 bg-background/95 backdrop-blur-sm p-4 mt-4 border-t border-border">
                  <div className="flex items-center justify-between gap-2">
                    <button
                      onClick={handlePreviousPage}
                      disabled={currentPage === 1}
                      className="flex items-center gap-1 sm:gap-2 px-3 sm:px-4 py-2 bg-sidebar-accent text-foreground rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-sidebar-accent/80 transition-colors text-sm"
                    >
                      <ChevronLeft className="w-4 h-4" />
                      <span className="hidden sm:inline">Previous</span>
                    </button>

                    <div className="text-xs sm:text-sm text-muted-foreground text-center">
                      Page {currentPage} of {leaderboardData.pagination.totalPages}
                    </div>

                    <button
                      onClick={handleNextPage}
                      disabled={currentPage === leaderboardData.pagination.totalPages}
                      className="flex items-center gap-1 sm:gap-2 px-3 sm:px-4 py-2 bg-sidebar-accent text-foreground rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-sidebar-accent/80 transition-colors text-sm"
                    >
                      <span className="hidden sm:inline">Next</span>
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </PageContainer>
  )
}

