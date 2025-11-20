'use client'

import { Avatar } from '@/components/shared/Avatar'
import { Dropdown, DropdownItem } from '@/components/shared/Dropdown'
import { useAuth } from '@/hooks/useAuth'
import { useAuthStore } from '@/stores/authStore'
import { getReferralUrl, getDisplayReferralUrl } from '@/lib/referral/referral-utils'
import { Check, Copy, LogOut } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

/**
 * Global fetch tracking to prevent duplicate calls across all UserMenu instances.
 */
let userMenuFetchInFlight = false
let userMenuIntervalId: ReturnType<typeof setInterval> | null = null

/**
 * User menu component displaying user profile and account actions.
 * 
 * Shows user avatar, name, username, points balance, referral code, and logout
 * option in a dropdown menu. Automatically fetches and refreshes user data every
 * 30 seconds. Prevents duplicate API calls across multiple instances.
 * 
 * Features:
 * - User profile display with avatar
 * - Points balance (total and available)
 * - Referral code copy functionality
 * - Logout action
 * 
 * @returns User menu dropdown element or null if no user
 */
export function UserMenu() {
  const { logout } = useAuth()
  const { user } = useAuthStore()
  const [pointsData, setPointsData] = useState<{ available: number; total: number } | null>(null)
  const [copiedCode, setCopiedCode] = useState(false)
  const lastFetchedUserIdRef = useRef<string | null>(null)

  useEffect(() => {
    // Don't refetch if user ID hasn't changed
    if (lastFetchedUserIdRef.current === user?.id && user?.id) {
      return
    }

    let isMounted = true
    let currentFetchController: AbortController | null = null

    const fetchData = async () => {
      if (!user?.id || !isMounted) {
        if (!isMounted) return
        setPointsData(null)
        lastFetchedUserIdRef.current = null
        return
      }

      // Prevent duplicate fetches globally
      if (userMenuFetchInFlight) return
      userMenuFetchInFlight = true

      const token = typeof window !== 'undefined' ? window.__privyAccessToken : null
      if (!token) {
        userMenuFetchInFlight = false
        return
      }

      const headers: HeadersInit = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }

      // Create a new controller for this specific fetch call
      currentFetchController = new AbortController()
      const fetchController = currentFetchController

      try {
        // Fetch points
        const balanceResponse = await fetch(`/api/users/${encodeURIComponent(user.id)}/balance`, { 
          headers,
          signal: fetchController.signal
        })
        
        if (!isMounted || fetchController.signal.aborted) {
          userMenuFetchInFlight = false
          return
        }

        if (balanceResponse.ok) {
          const data = await balanceResponse.json()
          if (isMounted && !fetchController.signal.aborted) {
            setPointsData({
              available: Number(data.balance || 0),
              total: Number(data.totalDeposited || 0),
            })
          }
        }

        if (isMounted && !fetchController.signal.aborted) {
          lastFetchedUserIdRef.current = user.id
        }
      } catch (error) {
        // Ignore abort errors
        if (error instanceof Error && error.name === 'AbortError') {
          return
        }
        // Silently handle network errors - component will show previous state or null
        if (isMounted) {
          console.warn('Failed to fetch user menu data:', error)
        }
      } finally {
        if (isMounted) {
          userMenuFetchInFlight = false
        }
        currentFetchController = null
      }
    }

    // Clear any existing interval
    if (userMenuIntervalId) {
      clearInterval(userMenuIntervalId)
      userMenuIntervalId = null
    }

    // Fetch immediately
    fetchData()
    
    // Set up interval for refresh
    userMenuIntervalId = setInterval(() => {
      if (isMounted) {
        fetchData()
      }
    }, 30000)

    return () => {
      isMounted = false
      if (currentFetchController) {
        currentFetchController.abort()
      }
      if (userMenuIntervalId) {
        clearInterval(userMenuIntervalId)
        userMenuIntervalId = null
      }
    }
  }, [user?.id])

  const handleCopyReferralCode = async () => {
    if (!user?.username) return
    const referralUrl = getReferralUrl(user.username)
    await navigator.clipboard.writeText(referralUrl)
    setCopiedCode(true)
    setTimeout(() => setCopiedCode(false), 2000)
  }

  if (!user) {
    return null
  }

  const displayName = user.displayName || user.email?.split('@')[0] || 'Anonymous'
  const username = user.username || `user${user.id.slice(0, 8)}`

  const trigger = (
    <div data-testid="user-menu" className="flex items-center gap-3 px-3 py-2.5 rounded-full hover:bg-sidebar-accent cursor-pointer transition-colors">
      <Avatar
        id={user.id}
        name={displayName}
        type="user"
        size="sm"
        src={user.profileImageUrl || undefined}
        imageUrl={user.profileImageUrl || undefined}
      />
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sidebar-foreground truncate text-[15px] leading-5">
          {displayName}
        </p>
        <p className="text-[13px] leading-4 text-muted-foreground truncate">
          @{username}
        </p>
      </div>
    </div>
  )

  return (
    <Dropdown trigger={trigger} placement="top-right" width="default">
      {/* Points Display */}
      {pointsData && (
        <div className="px-5 py-4 border-b border-sidebar-accent">
          <div className="flex justify-between items-center">
            <span className="text-sm font-semibold text-muted-foreground">Total Points</span>
            <span className="text-xl font-bold text-foreground">
              {pointsData.total.toLocaleString()}
            </span>
          </div>
          <div className="flex justify-between items-center mt-2">
            <span className="text-xs text-muted-foreground">Available</span>
            <span className="text-sm font-semibold text-foreground">
              {pointsData.available.toLocaleString()}
            </span>
          </div>
        </div>
      )}
      
      {user?.username && (
        <DropdownItem onClick={handleCopyReferralCode}>
          <div className="flex items-center gap-3 py-2">
            {copiedCode ? (
              <>
                <Check className="w-5 h-5 text-green-500" />
                <span className="text-sm font-semibold text-green-500">Link Copied!</span>
              </>
            ) : (
              <>
                <Copy className="w-5 h-5" style={{ color: '#0066FF' }} />
                <div className="flex flex-col flex-1 min-w-0">
                  <span className="text-sm font-semibold text-foreground">Copy Referral Link</span>
                  <span className="text-xs text-muted-foreground font-mono truncate">
                    {getDisplayReferralUrl(user.username)}
                  </span>
                </div>
              </>
            )}
          </div>
        </DropdownItem>
      )}
      
      <DropdownItem onClick={logout}>
        <div className="flex items-center gap-3 py-2 text-destructive hover:text-destructive/90">
          <LogOut className="w-5 h-5" />
          <span className="font-semibold">Logout</span>
        </div>
      </DropdownItem>
    </Dropdown>
  )
}
