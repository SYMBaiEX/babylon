'use client'

import { useState, useEffect } from 'react'
import { User as UserIcon, Copy, Check, LogOut, Coins, Award } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useAuthStore } from '@/stores/authStore'
import { Separator } from '@/components/shared/Separator'
import { cn } from '@/lib/utils'
import Link from 'next/link'
import { logger } from '@/lib/logger'

export function UserMenu() {
  const { logout } = useAuth()
  const { user, wallet } = useAuthStore()
  const [copied, setCopied] = useState(false)
  const [points, setPoints] = useState(0)
  const [reputation, setReputation] = useState(0)
  const [loading, setLoading] = useState(false)

  // Fetch user points and reputation
  useEffect(() => {
    if (!user?.id) return

    const fetchUserStats = async () => {
      try {
        setLoading(true)
        
        // Get auth token from window (set by useAuth hook)
        const token = typeof window !== 'undefined' ? window.__privyAccessToken : null
        
        const headers: HeadersInit = {
          'Content-Type': 'application/json',
        }
        
        if (token) {
          headers['Authorization'] = `Bearer ${token}`
        }
        
        const response = await fetch(`/api/users/${user.id}/balance`, {
          headers,
        })
        
        if (response.ok) {
          const data = await response.json()
          setPoints(data.balance || 0)
        } else if (response.status === 403) {
          // Silently handle 403 - user may not have access yet
          logger.warn('Access denied to balance endpoint', undefined, 'UserMenu')
        }

        // Fetch reputation (if user has NFT)
        if (user.nftTokenId) {
          const reputationHeaders: HeadersInit = {
            'Content-Type': 'application/json',
          }
          
          if (token) {
            reputationHeaders['Authorization'] = `Bearer ${token}`
          }
          
          const reputationResponse = await fetch(`/api/users/${user.id}/reputation`, {
            headers: reputationHeaders,
          })
          
          if (reputationResponse.ok) {
            const reputationData = await reputationResponse.json()
            setReputation(reputationData.currentReputation || 100)
          }
        }
      } catch (error) {
        logger.error('Error fetching user stats:', error, 'UserMenu')
      } finally {
        setLoading(false)
      }
    }

    fetchUserStats()

    // Refresh every 30 seconds
    const interval = setInterval(fetchUserStats, 30000)
    return () => clearInterval(interval)
  }, [user])

  const handleCopyAddress = async () => {
    if (wallet?.address) {
      await navigator.clipboard.writeText(wallet.address)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const formatAddress = (address: string) => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`
  }

  const formatPoints = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount)
  }

  return (
    <>
      <style dangerouslySetInnerHTML={{
        __html: `
          .neumorphic-user-menu {
            box-shadow: inset 5px 5px 5px rgba(0, 0, 0, 0.1), inset -5px -5px 5px rgba(255, 255, 255, 0.05);
          }

          .neumorphic-user-button {
            box-shadow: inset 3px 3px 3px rgba(0, 0, 0, 0.1), inset -3px -3px 3px rgba(255, 255, 255, 0.05);
            transition: all 0.3s ease;
          }

          .neumorphic-user-button:hover {
            box-shadow: none;
          }
        `
      }} />
      <div className={cn(
        'bg-sidebar-accent/30 rounded-xl p-4 space-y-4',
        'neumorphic-user-menu'
      )}>
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-sidebar-accent/50 flex items-center justify-center neumorphic-user-button">
            <UserIcon className="w-6 h-6 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">
              Account
            </p>
            <p className="font-semibold text-foreground truncate">
              {user?.displayName || 'Anonymous'}
            </p>
          </div>
        </div>

        {/* Points Section */}
        <div className="py-2">
          <Separator />
        </div>
        <Link
          href="/profile"
          className={cn(
            'flex items-center gap-3 p-3 rounded-lg',
            'bg-sidebar-accent/30 neumorphic-user-button',
            'transition-all duration-300 hover:bg-sidebar-accent/50'
          )}
        >
          <Coins className="w-5 h-5 text-primary" />
          <div className="flex-1 min-w-0">
            <label className="text-xs text-muted-foreground uppercase tracking-wide block">
              Points
            </label>
            <p className="text-lg font-bold text-foreground">
              {loading ? '...' : formatPoints(points)}
            </p>
          </div>
        </Link>

        {/* Reputation Section */}
        {user?.nftTokenId && (
          <Link
            href="/reputation"
            className={cn(
              'flex items-center gap-3 p-3 rounded-lg',
              'bg-sidebar-accent/30 neumorphic-user-button',
              'transition-all duration-300 hover:bg-sidebar-accent/50'
            )}
          >
            <Award className="w-5 h-5 text-primary" />
            <div className="flex-1 min-w-0">
              <label className="text-xs text-muted-foreground uppercase tracking-wide block">
                Reputation
              </label>
              <p className="text-lg font-bold text-foreground">
                {loading ? '...' : reputation}
              </p>
            </div>
          </Link>
        )}

        {/* Email Section */}
        {user?.email && (
          <>
            <div className="py-2">
              <Separator />
            </div>
            <div>
              <label className="text-xs text-muted-foreground uppercase tracking-wide block mb-1">
                Email
              </label>
              <p className="text-sm text-foreground truncate">
                {user.email}
              </p>
            </div>
          </>
        )}

        {/* Wallet Address Section */}
        {wallet?.address && (
          <>
            <div className="py-2">
              <Separator />
            </div>
            <div>
              <label className="text-xs text-muted-foreground uppercase tracking-wide block mb-2">
                Wallet Address
              </label>
              <button
                onClick={handleCopyAddress}
                className={cn(
                  'flex items-center gap-2 text-sm font-mono px-3 py-2 rounded-lg',
                  'bg-sidebar-accent/30 neumorphic-user-button',
                  'transition-all duration-300 text-primary'
                )}
              >
                <span>{formatAddress(wallet.address)}</span>
                {copied ? (
                  <Check className="w-4 h-4" />
                ) : (
                  <Copy className="w-4 h-4" />
                )}
              </button>
            </div>
          </>
        )}

        {/* Logout Button */}
        <>
          <div className="py-2">
            <Separator />
          </div>
          <div>
            <button
              onClick={logout}
              className={cn(
                'w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg',
                'bg-sidebar-accent/30 neumorphic-user-button text-destructive',
                'transition-all duration-300'
              )}
            >
              <LogOut className="w-4 h-4" />
              <span className="text-sm font-medium">Logout</span>
            </button>
          </div>
        </>
      </div>
    </>
  )
}
