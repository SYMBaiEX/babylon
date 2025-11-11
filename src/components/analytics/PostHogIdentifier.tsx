'use client'

/**
 * PostHog User Identifier
 * Identifies users to PostHog when they authenticate
 */

import { useEffect, useRef } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { posthog } from '@/lib/posthog/client'

export function PostHogIdentifier() {
  const { user, authenticated } = useAuth()
  const identifiedUserId = useRef<string | null>(null)

  useEffect(() => {
    if (!posthog || typeof window === 'undefined') return

    // Identify user when authenticated
    if (authenticated && user?.id && user.id !== identifiedUserId.current) {
      posthog.identify(user.id, {
        username: user.username,
        displayName: user.displayName,
        walletAddress: user.walletAddress,
        hasProfileImage: Boolean(user.profileImageUrl),
        hasBio: Boolean(user.bio),
        profileComplete: user.profileComplete,
        onChainRegistered: user.onChainRegistered,
        hasFarcaster: user.hasFarcaster,
        hasTwitter: user.hasTwitter,
        farcasterUsername: user.farcasterUsername,
        twitterUsername: user.twitterUsername,
        reputationPoints: user.reputationPoints,
        // Track when user was created
        createdAt: user.createdAt,
      })
      identifiedUserId.current = user.id
      
      // Set user properties
      posthog.people?.set({
        username: user.username,
        displayName: user.displayName,
        authenticated: true,
      })
    }

    // Reset on logout
    if (!authenticated && identifiedUserId.current) {
      posthog.reset()
      identifiedUserId.current = null
    }
  }, [authenticated, user])

  return null
}

