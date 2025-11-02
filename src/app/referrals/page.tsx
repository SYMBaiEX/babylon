'use client'

import { useEffect, useState } from 'react'
import { PageContainer } from '@/components/shared/PageContainer'
import { Separator } from '@/components/shared/Separator'
import { ShareButton } from '@/components/shared/ShareButton'
import { Avatar } from '@/components/shared/Avatar'
import { LoginButton } from '@/components/auth/LoginButton'
import { useAuth } from '@/hooks/useAuth'
import { useAuthStore } from '@/stores/authStore'
import { 
  Gift, 
  Copy, 
  Check, 
  Users, 
  TrendingUp, 
  UserPlus,
  ExternalLink,
  Heart
} from 'lucide-react'
import { logger } from '@/lib/logger'

interface ReferredUser {
  id: string
  username: string | null
  displayName: string | null
  profileImageUrl: string | null
  createdAt: Date
  reputationPoints: number
  isFollowing: boolean
  joinedAt: Date | null
}

interface ReferralStats {
  totalReferrals: number
  totalPointsEarned: number
  pointsPerReferral: number
  followingCount: number
}

interface ReferralData {
  user: {
    id: string
    username: string | null
    displayName: string | null
    profileImageUrl: string | null
    referralCode: string | null
    reputationPoints: number
  }
  stats: ReferralStats
  referredUsers: ReferredUser[]
  referralUrl: string | null
}

export default function ReferralsPage() {
  const { ready, authenticated } = useAuth()
  const { user } = useAuthStore()
  const [referralData, setReferralData] = useState<ReferralData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [copiedCode, setCopiedCode] = useState(false)
  const [copiedUrl, setCopiedUrl] = useState(false)

  useEffect(() => {
    if (user?.id) {
      fetchReferralData()
    } else if (ready) {
      setLoading(false)
    }
  }, [user, ready])

  const fetchReferralData = async () => {
    if (!user?.id) return

    try {
      setLoading(true)
      setError(null)

      const token = typeof window !== 'undefined' ? window.__privyAccessToken : null
      if (!token) {
        setError('Authentication required')
        return
      }

      const response = await fetch(`/api/users/${user.id}/referrals`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      })

      if (!response.ok) {
        throw new Error('Failed to fetch referral data')
      }

      const data = await response.json()
      setReferralData(data)
    } catch (err) {
      logger.error('Error fetching referral data:', err, 'ReferralsPage')
      setError(err instanceof Error ? err.message : 'Failed to load referrals')
    } finally {
      setLoading(false)
    }
  }

  const handleCopyCode = async () => {
    if (!referralData?.user.referralCode) return
    try {
      await navigator.clipboard.writeText(referralData.user.referralCode)
      setCopiedCode(true)
      setTimeout(() => setCopiedCode(false), 2000)
    } catch (error) {
      logger.error('Error copying code:', error, 'ReferralsPage')
    }
  }

  const handleCopyUrl = async () => {
    if (!referralData?.referralUrl) return
    try {
      await navigator.clipboard.writeText(referralData.referralUrl)
      setCopiedUrl(true)
      setTimeout(() => setCopiedUrl(false), 2000)
    } catch (error) {
      logger.error('Error copying URL:', error, 'ReferralsPage')
    }
  }

  return (
    <PageContainer noPadding className="flex flex-col">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-gray-900/95 backdrop-blur-sm border-b border-gray-800">
        <div className="p-4">
          <div className="flex items-center gap-3">
            <Gift className="w-6 h-6 text-purple-500" />
            <div>
              <h1 className="text-xl font-bold text-white">Referrals</h1>
              <p className="text-sm text-gray-400">
                Invite friends and earn +250 points per signup
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Auth Required Banner */}
      {ready && !authenticated && (
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="text-center max-w-md">
            <Gift className="w-16 h-16 mx-auto mb-4 text-gray-600" />
            <h2 className="text-xl font-bold text-white mb-2">Connect Your Wallet</h2>
            <p className="text-gray-400 mb-6">
              Sign in to get your unique referral code and start inviting friends
            </p>
            <LoginButton />
          </div>
        </div>
      )}

      {/* Loading State */}
      {authenticated && loading && (
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="text-center">
            <div className="w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-gray-400">Loading referral data...</p>
          </div>
        </div>
      )}

      {/* Error State */}
      {authenticated && error && !loading && (
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="text-center text-red-400">
            <p className="text-lg font-semibold mb-2">Failed to load referrals</p>
            <p className="text-sm text-gray-400">{error}</p>
          </div>
        </div>
      )}

      {/* Referral Content */}
      {authenticated && !loading && !error && referralData && (
        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Total Referrals */}
            <div className="rounded-xl bg-gradient-to-br from-purple-500/10 to-pink-500/10 border border-purple-500/20 p-4">
              <div className="flex items-center gap-2 mb-2">
                <Users className="w-5 h-5 text-purple-400" />
                <h3 className="text-sm font-medium text-gray-300">Total Referrals</h3>
              </div>
              <div className="text-3xl font-bold text-white">
                {referralData.stats.totalReferrals}
              </div>
              <p className="text-xs text-gray-400 mt-1">
                {referralData.stats.followingCount} following you
              </p>
            </div>

            {/* Points Earned */}
            <div className="rounded-xl bg-gradient-to-br from-yellow-500/10 to-orange-500/10 border border-yellow-500/20 p-4">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="w-5 h-5 text-yellow-400" />
                <h3 className="text-sm font-medium text-gray-300">Points Earned</h3>
              </div>
              <div className="text-3xl font-bold text-yellow-500">
                {referralData.stats.totalPointsEarned.toLocaleString()}
              </div>
              <p className="text-xs text-gray-400 mt-1">
                +250 per referral
              </p>
            </div>

            {/* Following Back */}
            <div className="rounded-xl bg-gradient-to-br from-blue-500/10 to-cyan-500/10 border border-blue-500/20 p-4">
              <div className="flex items-center gap-2 mb-2">
                <Heart className="w-5 h-5 text-blue-400" />
                <h3 className="text-sm font-medium text-gray-300">Following You</h3>
              </div>
              <div className="text-3xl font-bold text-blue-400">
                {referralData.stats.followingCount}
              </div>
              <p className="text-xs text-gray-400 mt-1">
                Auto-followed on signup
              </p>
            </div>
          </div>

          {/* Referral Code Card */}
          <div className="rounded-xl bg-gradient-to-br from-purple-500/5 to-pink-500/5 border border-purple-500/20 p-6">
            <div className="flex items-center gap-2 mb-4">
              <Gift className="w-6 h-6 text-purple-500" />
              <h2 className="text-lg font-bold text-white">Your Referral Code</h2>
            </div>

            <div className="space-y-4">
              {/* Code Display */}
              <div>
                <label className="block text-xs text-gray-400 uppercase tracking-wide mb-2">
                  Referral Code
                </label>
                <div className="flex gap-2">
                  <div className="flex-1 bg-gray-800 rounded-lg px-4 py-3 font-mono text-lg text-white border border-gray-700">
                    {referralData.user.referralCode || 'Generating...'}
                  </div>
                  <button
                    onClick={handleCopyCode}
                    className="px-4 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors flex items-center gap-2"
                  >
                    {copiedCode ? (
                      <>
                        <Check className="w-5 h-5 text-green-500" />
                        <span className="hidden sm:inline">Copied!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-5 h-5" />
                        <span className="hidden sm:inline">Copy</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* URL Display */}
              <div>
                <label className="block text-xs text-gray-400 uppercase tracking-wide mb-2">
                  Referral Link
                </label>
                <div className="flex gap-2">
                  <div className="flex-1 bg-gray-800 rounded-lg px-4 py-3 text-sm text-gray-300 border border-gray-700 truncate">
                    {referralData.referralUrl || 'Generating...'}
                  </div>
                  <button
                    onClick={handleCopyUrl}
                    className="px-4 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors flex items-center gap-2"
                  >
                    {copiedUrl ? (
                      <>
                        <Check className="w-5 h-5 text-green-500" />
                        <span className="hidden sm:inline">Copied!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-5 h-5" />
                        <span className="hidden sm:inline">Copy</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Share Buttons */}
              <div className="flex gap-2 pt-2">
                <ShareButton
                  contentType="referral"
                  url={referralData.referralUrl || ''}
                  text="Join me on Babylon! 🎮"
                  className="flex-1"
                />
              </div>

              {/* Reward Info */}
              <div className="bg-purple-500/10 rounded-lg p-4 border border-purple-500/20">
                <h3 className="font-semibold text-white mb-2 flex items-center gap-2">
                  <UserPlus className="w-4 h-4 text-purple-400" />
                  Referral Rewards
                </h3>
                <ul className="space-y-2 text-sm text-gray-300">
                  <li className="flex items-center gap-2">
                    <span className="w-2 h-2 bg-purple-500 rounded-full"></span>
                    <span><strong className="text-yellow-500">+250 points</strong> for each friend who signs up</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="w-2 h-2 bg-purple-500 rounded-full"></span>
                    <span><strong className="text-blue-500">Auto-follow</strong> - they'll automatically follow you</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="w-2 h-2 bg-purple-500 rounded-full"></span>
                    <span><strong className="text-green-500">Unlimited</strong> - invite as many friends as you want!</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>

          <Separator />

          {/* Referred Users List */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <Users className="w-5 h-5 text-purple-500" />
                Your Referrals ({referralData.stats.totalReferrals})
              </h2>
              {referralData.stats.totalReferrals > 0 && (
                <a
                  href="/leaderboard"
                  className="text-sm text-purple-500 hover:text-purple-400 flex items-center gap-1"
                >
                  View Leaderboard
                  <ExternalLink className="w-4 h-4" />
                </a>
              )}
            </div>

            {referralData.referredUsers.length === 0 ? (
              <div className="text-center py-12 bg-gray-800/30 rounded-xl border border-gray-700">
                <Users className="w-16 h-16 mx-auto mb-4 text-gray-600" />
                <h3 className="text-lg font-semibold text-white mb-2">No referrals yet</h3>
                <p className="text-sm text-gray-400 mb-4">
                  Share your referral link to start earning points!
                </p>
                <p className="text-xs text-gray-500">
                  Each friend who signs up earns you <strong className="text-yellow-500">+250 points</strong>
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {referralData.referredUsers.map((referredUser) => (
                  <div
                    key={referredUser.id}
                    className="flex items-center gap-4 p-4 bg-gray-800/50 rounded-lg border border-gray-700 hover:bg-gray-800/70 transition-colors"
                  >
                    {/* Avatar */}
                    <Avatar
                      src={referredUser.profileImageUrl || undefined}
                      alt={referredUser.displayName || referredUser.username || 'User'}
                      size="md"
                    />

                    {/* User Info */}
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-white truncate">
                        {referredUser.displayName || referredUser.username || 'Anonymous'}
                      </h3>
                      {referredUser.username && (
                        <p className="text-sm text-gray-400 truncate">
                          @{referredUser.username}
                        </p>
                      )}
                      <p className="text-xs text-gray-500 mt-1">
                        Joined {new Date(referredUser.joinedAt || referredUser.createdAt).toLocaleDateString()}
                      </p>
                    </div>

                    {/* Stats */}
                    <div className="flex-shrink-0 text-right">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-semibold text-yellow-500">
                          +250
                        </span>
                      </div>
                      <div className="flex items-center gap-1 text-xs">
                        {referredUser.isFollowing ? (
                          <>
                            <Heart className="w-3 h-3 text-blue-500 fill-blue-500" />
                            <span className="text-blue-400">Following</span>
                          </>
                        ) : (
                          <span className="text-gray-500">Not following</span>
                        )}
                      </div>
                    </div>

                    {/* View Profile Link */}
                    <a
                      href={`/profile/${referredUser.id}`}
                      className="flex-shrink-0 p-2 text-gray-400 hover:text-white transition-colors"
                      aria-label="View profile"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Tips Section */}
          {referralData.stats.totalReferrals < 5 && (
            <div className="rounded-xl bg-blue-500/10 border border-blue-500/20 p-4">
              <h3 className="font-semibold text-white mb-2 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-blue-400" />
                Tips to Get More Referrals
              </h3>
              <ul className="space-y-2 text-sm text-gray-300">
                <li className="flex items-start gap-2">
                  <span className="text-blue-400 mt-0.5">•</span>
                  <span>Share your referral link on Twitter/X for maximum reach</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-400 mt-0.5">•</span>
                  <span>Tell friends about the 21 AI traders they can compete against</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-400 mt-0.5">•</span>
                  <span>Share interesting markets or trades you've made</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-400 mt-0.5">•</span>
                  <span>Your referrals automatically follow you - build your network!</span>
                </li>
              </ul>
            </div>
          )}
        </div>
      )}
    </PageContainer>
  )
}

