'use client'

import { useEffect, useState } from 'react'
import { Info } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { cn } from '@/lib/utils'
import { logger } from '@/lib/logger'

interface PointsTrackerProps {
  className?: string
  showIcon?: boolean
}

export function PointsTracker({ className, showIcon = true }: PointsTrackerProps) {
  const { authenticated, user } = useAuth()
  const [points, setPoints] = useState(0)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!authenticated || !user) {
      setPoints(0)
      return
    }

    const fetchPoints = async () => {
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
          setPoints(Math.floor(data.balance || 0))
        } else if (response.status === 403) {
          // Silently handle 403 - user may not have access yet
          logger.warn('Access denied to balance endpoint', undefined, 'PointsTracker')
        }
      } catch (error) {
        logger.error('Error fetching points:', error, 'PointsTracker')
      } finally {
        setLoading(false)
      }
    }

    fetchPoints()

    // Refresh every 30 seconds
    const interval = setInterval(fetchPoints, 30000)
    return () => clearInterval(interval)
  }, [authenticated, user])

  if (!authenticated) {
    return null
  }

  const formatPoints = (amount: number) => {
    return new Intl.NumberFormat('en-US').format(amount)
  }

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <span className="font-semibold text-foreground">
        {loading ? '...' : formatPoints(points)} pts
      </span>
      {showIcon && (
        <Info className="w-4 h-4 text-muted-foreground" />
      )}
    </div>
  )
}

