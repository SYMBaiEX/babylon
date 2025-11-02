'use client'

import { useEffect, useState, useCallback } from 'react'
import { Info, User, Settings } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { logger } from '@/lib/logger'
import { Avatar } from './Avatar'
import { Dropdown, DropdownItem } from './Dropdown'
import { useRouter } from 'next/navigation'

interface UserPointsData {
  available: number
  total: number
  displayName?: string
  username?: string
  profileImageUrl?: string
}

export function UserPointsDisplay() {
  const { user, authenticated } = useAuth()
  const [pointsData, setPointsData] = useState<UserPointsData | null>(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  const fetchUserPoints = useCallback(async () => {
    if (!authenticated || !user?.id) {
      setLoading(false)
      return
    }

    try {
      setLoading(true)
      const response = await fetch(`/api/users/${user.id}/balance`)
      if (response.ok) {
        const data = await response.json()
        // Match WalletBalance approach - directly access data fields
        setPointsData({
          available: Number(data.balance || 0),
          total: Number(data.totalDeposited || 0),
          displayName: user.displayName || user.username || 'User',
          username: user.username,
          profileImageUrl: user.profileImageUrl,
        })
      }
    } catch (error) {
      logger.error('Error fetching user points:', error, 'UserPointsDisplay')
    } finally {
      setLoading(false)
    }
  }, [authenticated, user?.id, user?.displayName, user?.username, user?.profileImageUrl])

  // Initial fetch and periodic refresh (matching WalletBalance pattern)
  useEffect(() => {
    if (!authenticated || !user?.id) {
      setLoading(false)
      return
    }

    fetchUserPoints()

    // Refresh every 30 seconds
    const interval = setInterval(fetchUserPoints, 30000)
    return () => clearInterval(interval)
  }, [authenticated, user?.id, fetchUserPoints])

  if (!authenticated || !user || loading) {
    return null
  }

  const formatPoints = (points: number): string => {
    return points.toLocaleString('en-US', {
      maximumFractionDigits: 0,
    })
  }

  return (
    <div className="space-y-3">
      {/* Points Display Box */}
      <div className="bg-[#1c9cf0] p-4 rounded-lg">
        <div className="flex items-center justify-between mb-2">
          <span className="text-white text-sm font-medium">Available / Total</span>
          <Info className="w-4 h-4 text-white/80" />
        </div>
        <div className="text-white text-2xl font-bold mb-1">
          {pointsData ? (
            <>
              {formatPoints(pointsData.available)} / {formatPoints(pointsData.total)}
            </>
          ) : (
            '0 / 0'
          )}
        </div>
        <div className="text-white/90 text-sm">pts</div>
      </div>

      {/* User Info with Dropdown */}
      <Dropdown
        placement="top-right"
        trigger={
          <div className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted transition-colors cursor-pointer">
            <Avatar
              id={user.id}
              name={pointsData?.displayName || user.displayName || user.username || 'User'}
              type="user"
              size="md"
              imageUrl={pointsData?.profileImageUrl || user.profileImageUrl}
            />
            <div className="flex-1 min-w-0">
              <div className="text-foreground font-semibold text-sm truncate">
                {pointsData?.displayName || user.displayName || user.username || 'User'}
              </div>
              {user.username && (
                <div className="text-muted-foreground text-xs truncate">
                  @{user.username}
                </div>
              )}
            </div>
          </div>
        }
      >
        <DropdownItem
          onClick={() => router.push(`/profile/${user.id}`)}
          className="flex items-center gap-2"
        >
          <User className="w-4 h-4" />
          <span>Profile</span>
        </DropdownItem>
        <DropdownItem
          onClick={() => router.push('/settings')}
          className="flex items-center gap-2"
        >
          <Settings className="w-4 h-4" />
          <span>Settings</span>
        </DropdownItem>
      </Dropdown>
    </div>
  )
}

