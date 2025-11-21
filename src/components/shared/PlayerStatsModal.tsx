'use client'

import { useEffect, useState } from 'react'
import { X, User, Trophy, Calendar, Wallet, TrendingUp, MessageSquare, Heart, Users, FileText } from 'lucide-react'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { logger } from '@/lib/logger'
import Image from 'next/image'

interface UserProfile {
  id: string
  username: string | null
  displayName: string | null
  bio: string | null
  profileImageUrl: string | null
  coverImageUrl: string | null
  walletAddress: string | null
  virtualBalance: number
  lifetimePnL: number
  reputationPoints: number
  referralCount: number
  invitePoints: number
  createdAt: string
  stats: {
    positions: number
    comments: number
    reactions: number
    followers: number
    following: number
    posts: number
  }
}

interface PlayerStatsModalProps {
  isOpen: boolean
  onClose: () => void
  userId: string | null
}

export function PlayerStatsModal({ isOpen, onClose, userId }: PlayerStatsModalProps) {
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!isOpen || !userId) {
      setProfile(null)
      setError(null)
      return
    }

    const fetchProfile = async () => {
      setLoading(true)
      setError(null)
      
      try {
        const response = await fetch(`/api/users/${userId}/profile`)
        
        if (!response.ok) {
          throw new Error('Failed to fetch profile')
        }

        const data = await response.json()
        
        if (!data.user) {
          throw new Error('User not found')
        }

        setProfile(data.user)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load profile')
        logger.error('Failed to fetch user profile', { userId, error: err }, 'PlayerStatsModal')
      } finally {
        setLoading(false)
      }
    }

    fetchProfile()
  }, [isOpen, userId])

  if (!isOpen) return null

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto p-0 w-full mx-auto">
        <div className="p-4 sm:p-5">
          {/* Header with close button */}
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg sm:text-xl font-bold">Player Stats</h2>
            <button
              onClick={onClose}
              className="p-1.5 hover:bg-background/50 rounded-lg transition-colors touch-manipulation min-h-[36px] min-w-[36px] flex items-center justify-center"
              aria-label="Close modal"
            >
              <X className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>
          </div>

          {loading && (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-6 w-6 sm:h-8 sm:w-8 border-b-2 border-primary"></div>
            </div>
          )}

          {error && (
            <div className="flex flex-col items-center justify-center py-8 text-center px-4">
              <p className="text-red-500 mb-3 text-sm">{error}</p>
              <button
                onClick={onClose}
                className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors touch-manipulation min-h-[44px] text-sm font-semibold"
              >
                Close
              </button>
            </div>
          )}

          {profile && !loading && !error && (
            <div className="space-y-4 sm:space-y-5">
              {/* Profile Header */}
              <div className="relative">
                {/* Cover Image */}
                {profile.coverImageUrl && (
                  <div className="relative h-20 sm:h-28 w-full rounded-lg overflow-hidden mb-3">
                    <Image
                      src={profile.coverImageUrl}
                      alt="Cover"
                      fill
                      className="object-cover rounded-lg"
                    />
                  </div>
                )}
                
                {/* Profile Info */}
                <div className="flex items-start gap-3">
                  {/* Profile Image */}
                  <div className="relative w-14 h-14 sm:w-16 sm:h-16 rounded-full overflow-hidden border-2 border-background shrink-0">
                    {profile.profileImageUrl ? (
                      <Image
                        src={profile.profileImageUrl}
                        alt={profile.displayName || profile.username || 'User'}
                        fill
                        className="object-cover"
                      />
                    ) : (
                      <div className="w-full h-full bg-primary/20 flex items-center justify-center">
                        <User className="w-7 h-7 sm:w-8 sm:h-8 text-primary" />
                      </div>
                    )}
                  </div>

                  {/* Name and Username */}
                  <div className="flex-1 min-w-0">
                    <h3 className="text-base sm:text-lg font-bold truncate">
                      {profile.displayName || profile.username || 'Anonymous'}
                    </h3>
                    {profile.username && (
                      <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">@{profile.username}</p>
                    )}
                    {profile.bio && (
                      <p className="text-xs mt-1.5 whitespace-pre-wrap break-words line-clamp-2">{profile.bio}</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Stats Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 sm:gap-3">
                {/* Reputation Points */}
                <div className="bg-background/50 border border-border rounded-lg p-2.5 sm:p-3">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <Trophy className="w-3.5 h-3.5 text-yellow-500 shrink-0" />
                    <span className="text-xs text-muted-foreground truncate">Reputation</span>
                  </div>
                  <p className="text-lg sm:text-xl font-bold break-words">{profile.reputationPoints.toLocaleString()}</p>
                </div>

                {/* Virtual Balance */}
                <div className="bg-background/50 border border-border rounded-lg p-2.5 sm:p-3">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <Wallet className="w-3.5 h-3.5 text-primary shrink-0" />
                    <span className="text-xs text-muted-foreground truncate">Balance</span>
                  </div>
                  <p className="text-lg sm:text-xl font-bold break-words">${profile.virtualBalance.toLocaleString()}</p>
                </div>

                {/* Lifetime PnL */}
                <div className="bg-background/50 border border-border rounded-lg p-2.5 sm:p-3">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <TrendingUp className={`w-3.5 h-3.5 shrink-0 ${profile.lifetimePnL >= 0 ? 'text-green-500' : 'text-red-500'}`} />
                    <span className="text-xs text-muted-foreground truncate">Lifetime PnL</span>
                  </div>
                  <p className={`text-lg sm:text-xl font-bold break-words ${profile.lifetimePnL >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                    ${profile.lifetimePnL >= 0 ? '+' : ''}{profile.lifetimePnL.toLocaleString()}
                  </p>
                </div>

                {/* Referral Count */}
                <div className="bg-background/50 border border-border rounded-lg p-2.5 sm:p-3">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <Users className="w-3.5 h-3.5 text-primary shrink-0" />
                    <span className="text-xs text-muted-foreground truncate">Referrals</span>
                  </div>
                  <p className="text-lg sm:text-xl font-bold">{profile.referralCount}</p>
                </div>

                {/* Invite Points */}
                <div className="bg-background/50 border border-border rounded-lg p-2.5 sm:p-3">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <Trophy className="w-3.5 h-3.5 text-primary shrink-0" />
                    <span className="text-xs text-muted-foreground truncate">Invite Points</span>
                  </div>
                  <p className="text-lg sm:text-xl font-bold break-words">{profile.invitePoints.toLocaleString()}</p>
                </div>

                {/* Positions */}
                <div className="bg-background/50 border border-border rounded-lg p-2.5 sm:p-3">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <TrendingUp className="w-3.5 h-3.5 text-primary shrink-0" />
                    <span className="text-xs text-muted-foreground truncate">Positions</span>
                  </div>
                  <p className="text-lg sm:text-xl font-bold">{profile.stats.positions}</p>
                </div>
              </div>

              {/* Activity Stats */}
              <div className="border-t border-border pt-4">
                <h4 className="text-sm sm:text-base font-semibold mb-3">Activity</h4>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3">
                  <div className="text-center p-2">
                    <div className="flex items-center justify-center gap-1 mb-1">
                      <FileText className="w-3.5 h-3.5 text-muted-foreground" />
                    </div>
                    <p className="text-lg sm:text-xl font-bold">{profile.stats.posts}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Posts</p>
                  </div>
                  <div className="text-center p-2">
                    <div className="flex items-center justify-center gap-1 mb-1">
                      <MessageSquare className="w-3.5 h-3.5 text-muted-foreground" />
                    </div>
                    <p className="text-lg sm:text-xl font-bold">{profile.stats.comments}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Comments</p>
                  </div>
                  <div className="text-center p-2">
                    <div className="flex items-center justify-center gap-1 mb-1">
                      <Heart className="w-3.5 h-3.5 text-muted-foreground" />
                    </div>
                    <p className="text-lg sm:text-xl font-bold">{profile.stats.reactions}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Reactions</p>
                  </div>
                  <div className="text-center p-2">
                    <div className="flex items-center justify-center gap-1 mb-1">
                      <Users className="w-3.5 h-3.5 text-muted-foreground" />
                    </div>
                    <p className="text-lg sm:text-xl font-bold">{profile.stats.followers}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Followers</p>
                  </div>
                </div>
              </div>

              {/* Additional Info */}
              <div className="border-t border-border pt-4 space-y-1.5">
                <div className="flex items-start gap-2 text-xs text-muted-foreground">
                  <Calendar className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span className="break-words">
                    Joined {new Date(profile.createdAt).toLocaleDateString('en-US', { 
                      month: 'long', 
                      year: 'numeric',
                      day: 'numeric'
                    })}
                  </span>
                </div>
                {profile.walletAddress && (
                  <div className="flex items-start gap-2 text-xs text-muted-foreground">
                    <Wallet className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    <span className="font-mono break-all">{profile.walletAddress}</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

