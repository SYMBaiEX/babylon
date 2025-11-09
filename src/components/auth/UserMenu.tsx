'use client'

import { Avatar } from '@/components/shared/Avatar'
import { Dropdown, DropdownItem } from '@/components/shared/Dropdown'
import { useAuth } from '@/hooks/useAuth'
import { useAuthStore } from '@/stores/authStore'
import { Check, Copy, LogOut } from 'lucide-react'
import { useEffect, useState } from 'react'

export function UserMenu() {
  const { logout } = useAuth()
  const { user } = useAuthStore()
  const [pointsData, setPointsData] = useState<{ available: number; total: number } | null>(null)
  const [referralCode, setReferralCode] = useState<string | null>(null)
  const [copiedCode, setCopiedCode] = useState(false)

  useEffect(() => {
    const fetchData = async () => {
      if (!user?.id) {
        setPointsData(null)
        setReferralCode(null)
        return
      }

      const token = typeof window !== 'undefined' ? window.__privyAccessToken : null
      if (!token) {
        // No token available yet, skip fetching protected data
        return
      }

      const headers: HeadersInit = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }

      // Fetch points
      const balanceResponse = await fetch(`/api/users/${encodeURIComponent(user.id)}/balance`, { headers })
      if (balanceResponse.ok) {
        const data = await balanceResponse.json()
        setPointsData({
          available: Number(data.balance || 0),
          total: Number(data.totalDeposited || 0),
        })
      }

      // Fetch referral code
      const referralResponse = await fetch(`/api/users/${encodeURIComponent(user.id)}/referrals`, { headers })
      if (referralResponse.ok) {
        const data = await referralResponse.json()
        setReferralCode(data.user?.referralCode || null)
      }
    }

    fetchData()
    const interval = setInterval(fetchData, 30000)
    return () => clearInterval(interval)
  }, [user?.id])

  const handleCopyReferralCode = async () => {
    if (!referralCode) return
    // Create full referral URL
    const referralUrl = `${window.location.origin}?ref=${referralCode}`
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
    <div className="flex items-center gap-3 p-3 hover:bg-sidebar-accent cursor-pointer transition-colors">
      <Avatar id={user.id} name={displayName} size="sm" />
      <div className="flex-1 min-w-0">
        <p className="font-bold text-foreground truncate text-sm">
          {displayName}
        </p>
        <p className="text-xs text-muted-foreground truncate">
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
      
      {referralCode && (
        <DropdownItem onClick={handleCopyReferralCode}>
          <div className="flex items-center gap-3 py-2">
            {copiedCode ? (
              <>
                <Check className="w-5 h-5 text-green-500" />
                <span className="text-sm font-semibold text-green-500">Link Copied!</span>
              </>
            ) : (
              <>
                <Copy className="w-5 h-5" style={{ color: '#1c9cf0' }} />
                <div className="flex flex-col flex-1 min-w-0">
                  <span className="text-sm font-semibold text-foreground">Copy Referral Link</span>
                  <span className="text-xs text-muted-foreground font-mono truncate">
                    {typeof window !== 'undefined' && `${window.location.host}?ref=${referralCode}`}
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
