'use client'

import { useState, useEffect } from 'react'
import { UserPlus, UserMinus, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/hooks/useAuth'
import { toast } from 'sonner'

interface FollowButtonProps {
  userId: string
  initialFollowing?: boolean
  size?: 'sm' | 'md' | 'lg'
  variant?: 'button' | 'icon'
  className?: string
  onFollowChange?: (isFollowing: boolean) => void
}

export function FollowButton({
  userId,
  initialFollowing = false,
  size = 'md',
  variant = 'button',
  className,
  onFollowChange,
}: FollowButtonProps) {
  const { authenticated, user } = useAuth()
  const [isFollowing, setIsFollowing] = useState(initialFollowing)
  const [isLoading, setIsLoading] = useState(false)
  const [isChecking, setIsChecking] = useState(true)

  // Check follow status on mount
  useEffect(() => {
    if (!authenticated || !user || user.id === userId) {
      setIsChecking(false)
      return
    }

    const checkFollowStatus = async () => {
      try {
        const token = typeof window !== 'undefined' ? (window as any).__privyAccessToken : null
        if (!token) {
          setIsChecking(false)
          return
        }

        const response = await fetch(`/api/users/${userId}/follow`, {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        })

        if (response.ok) {
          const data = await response.json()
          setIsFollowing(data.isFollowing || false)
        }
      } catch (error) {
        console.error('Error checking follow status:', error)
      } finally {
        setIsChecking(false)
      }
    }

    checkFollowStatus()
  }, [authenticated, user, userId])

  const handleFollow = async () => {
    if (!authenticated || !user) {
      toast.error('Please sign in to follow users')
      return
    }

    if (user.id === userId) {
      toast.error('Cannot follow yourself')
      return
    }

    setIsLoading(true)
    try {
      const token = typeof window !== 'undefined' ? (window as any).__privyAccessToken : null
      if (!token) {
        toast.error('Authentication required')
        setIsLoading(false)
        return
      }

      const method = isFollowing ? 'DELETE' : 'POST'
      const response = await fetch(`/api/users/${userId}/follow`, {
        method,
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      })

      if (response.ok) {
        const newFollowingState = !isFollowing
        setIsFollowing(newFollowingState)
        onFollowChange?.(newFollowingState)
        toast.success(newFollowingState ? 'Following' : 'Unfollowed')
      } else {
        const error = await response.json().catch(() => ({ error: 'Unknown error' }))
        toast.error(error.error || 'Failed to update follow status')
      }
    } catch (error) {
      console.error('Error updating follow status:', error)
      toast.error('An error occurred')
    } finally {
      setIsLoading(false)
    }
  }

  // Don't show button if checking or if user is viewing their own profile
  if (isChecking || (user && user.id === userId)) {
    return null
  }

  if (!authenticated) {
    return null
  }

  const sizeClasses = {
    sm: 'text-xs px-2 py-1',
    md: 'text-sm px-3 py-1.5',
    lg: 'text-base px-4 py-2',
  }

  const iconSizes = {
    sm: 'w-3 h-3',
    md: 'w-4 h-4',
    lg: 'w-5 h-5',
  }

  if (variant === 'icon') {
    return (
      <button
        onClick={handleFollow}
        disabled={isLoading}
        className={cn(
          'p-2 rounded transition-colors',
          isFollowing
            ? 'text-muted-foreground hover:text-foreground'
            : 'text-primary hover:text-primary/80',
          isLoading && 'opacity-50 cursor-not-allowed',
          className
        )}
        aria-label={isFollowing ? 'Unfollow' : 'Follow'}
      >
        {isLoading ? (
          <Loader2 className={cn('animate-spin', iconSizes[size])} />
        ) : isFollowing ? (
          <UserMinus className={iconSizes[size]} />
        ) : (
          <UserPlus className={iconSizes[size]} />
        )}
      </button>
    )
  }

  return (
    <button
      onClick={handleFollow}
      disabled={isLoading}
      className={cn(
        'flex items-center gap-2 font-semibold transition-all',
        'border border-border',
        isFollowing
          ? 'bg-background text-foreground hover:bg-muted'
          : 'bg-primary text-primary-foreground hover:bg-primary/90',
        sizeClasses[size],
        isLoading && 'opacity-50 cursor-not-allowed',
        className
      )}
    >
      {isLoading ? (
        <>
          <Loader2 className={cn('animate-spin', iconSizes[size])} />
          <span>...</span>
        </>
      ) : isFollowing ? (
        <>
          <UserMinus className={iconSizes[size]} />
          <span>Following</span>
        </>
      ) : (
        <>
          <UserPlus className={iconSizes[size]} />
          <span>Follow</span>
        </>
      )}
    </button>
  )
}

