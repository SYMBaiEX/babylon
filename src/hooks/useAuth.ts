'use client'

import { usePrivy, useWallets, type ConnectedWallet, type User as PrivyUser } from '@privy-io/react-auth'
import { useEffect, useMemo, useRef } from 'react'
import { useAuthStore, type User } from '@/stores/authStore'
import { apiFetch } from '@/lib/api/fetch'
import { logger } from '@/lib/logger'

interface UseAuthReturn {
  ready: boolean
  authenticated: boolean
  loadingProfile: boolean
  user: User | null
  wallet: ConnectedWallet | undefined
  needsOnboarding: boolean
  needsOnchain: boolean
  login: () => void
  logout: () => Promise<void>
  refresh: () => Promise<void>
}

const linkedSocialUsers = new Set<string>()
let lastSyncedWalletAddress: string | null = null

export function useAuth(): UseAuthReturn {
  const { ready, authenticated, user: privyUser, login, logout, getAccessToken } = usePrivy()
  const { wallets } = useWallets()
  const fetchInFlightRef = useRef<Promise<void> | null>(null)
  const tokenRetryTimeoutRef = useRef<number | null>(null)
  const {
    user,
    isLoadingProfile,
    needsOnboarding,
    needsOnchain,
    setUser,
    setWallet,
    setNeedsOnboarding,
    setNeedsOnchain,
    setLoadedUserId,
    setIsLoadingProfile,
    clearAuth,
  } = useAuthStore()

  const wallet = useMemo(() => wallets[0], [wallets])

  const persistAccessToken = async (): Promise<string | null> => {
    if (!authenticated) {
      if (typeof window !== 'undefined') {
        window.__privyAccessToken = null
      }
      return null
    }

    try {
      const token = await getAccessToken()
      if (typeof window !== 'undefined') {
        window.__privyAccessToken = token
      }
      return token ?? null
    } catch (error) {
      logger.warn('Failed to obtain Privy access token', { error }, 'useAuth')
      return null
    }
  }

  const fetchCurrentUser = async () => {
    if (!authenticated || !privyUser) return
    if (fetchInFlightRef.current) {
      await fetchInFlightRef.current
      return
    }

    const run = async () => {
      setIsLoadingProfile(true)
      setLoadedUserId(privyUser.id)

      try {
        const token = await persistAccessToken()
        if (!token) {
        logger.warn(
          'Privy access token unavailable; delaying /api/users/me fetch',
          { userId: privyUser.id },
          'useAuth'
        )
        setIsLoadingProfile(false)
        if (typeof window !== 'undefined') {
          if (tokenRetryTimeoutRef.current) {
            window.clearTimeout(tokenRetryTimeoutRef.current)
          }
          tokenRetryTimeoutRef.current = window.setTimeout(() => {
            void fetchCurrentUser()
          }, 200)
        }
        return
      }

        const response = await apiFetch('/api/users/me')
        const data = await response.json().catch(() => ({}))

        if (!response.ok) {
          const message = data?.error || `Failed to load authenticated user (status ${response.status})`
          throw new Error(message)
        }

        const me = data as {
          authenticated: boolean
          needsOnboarding: boolean
          needsOnchain: boolean
          user: (User & { createdAt?: string; updatedAt?: string }) | null
        }

        setNeedsOnboarding(me.needsOnboarding)
        setNeedsOnchain(me.needsOnchain)

        const fallbackProfileImageUrl = user?.profileImageUrl
        const fallbackCoverImageUrl = user?.coverImageUrl

        if (me.user) {
          const hydratedUser: User = {
            id: me.user.id,
            walletAddress: me.user.walletAddress ?? wallet?.address,
            displayName: me.user.displayName || privyUser.email?.address || wallet?.address || 'Anonymous',
            email: privyUser.email?.address,
            username: me.user.username ?? undefined,
            bio: me.user.bio ?? undefined,
            profileImageUrl: me.user.profileImageUrl ?? fallbackProfileImageUrl ?? undefined,
            coverImageUrl: me.user.coverImageUrl ?? fallbackCoverImageUrl ?? undefined,
            profileComplete: me.user.profileComplete ?? false,
            reputationPoints: me.user.reputationPoints ?? undefined,
            referralCount: undefined,
            referralCode: me.user.referralCode ?? undefined,
            hasFarcaster: me.user.hasFarcaster ?? undefined,
            hasTwitter: me.user.hasTwitter ?? undefined,
            farcasterUsername: me.user.farcasterUsername ?? undefined,
            twitterUsername: me.user.twitterUsername ?? undefined,
            stats: undefined,
            nftTokenId: me.user.nftTokenId ?? undefined,
            createdAt: me.user.createdAt,
            onChainRegistered: me.user.onChainRegistered ?? undefined,
          }

          setUser(hydratedUser)
        } else {
          setUser({
            id: privyUser.id,
            walletAddress: wallet?.address,
            displayName: privyUser.email?.address || wallet?.address || 'Anonymous',
            email: privyUser.email?.address,
            onChainRegistered: false,
          })
        }
      } catch (error) {
        logger.error(
          'Failed to resolve authenticated user via /api/users/me',
          { error },
          'useAuth'
        )
        setNeedsOnboarding(true)
        setNeedsOnchain(false)
        setUser({
          id: privyUser.id,
          walletAddress: wallet?.address,
          displayName: privyUser.email?.address || wallet?.address || 'Anonymous',
          email: privyUser.email?.address,
          profileImageUrl: user?.profileImageUrl ?? undefined,
          coverImageUrl: user?.coverImageUrl ?? undefined,
          onChainRegistered: false,
        })
      } finally {
        setIsLoadingProfile(false)
      }
    }

    const promise = run().finally(() => {
      fetchInFlightRef.current = null
      if (typeof window !== 'undefined' && tokenRetryTimeoutRef.current) {
        window.clearTimeout(tokenRetryTimeoutRef.current)
        tokenRetryTimeoutRef.current = null
      }
    })

    fetchInFlightRef.current = promise
    await promise
  }

  const synchronizeWallet = () => {
    if (!wallet) return
    if (wallet.address === lastSyncedWalletAddress) return

    lastSyncedWalletAddress = wallet.address
    setWallet({
      address: wallet.address,
      chainId: wallet.chainId,
    })
  }

  const linkSocialAccounts = async () => {
    if (!authenticated || !privyUser) return
    if (needsOnboarding || needsOnchain) return
    if (linkedSocialUsers.has(privyUser.id)) return

    const token = await getAccessToken()
    if (!token) return

    linkedSocialUsers.add(privyUser.id)

    const userWithFarcaster = privyUser as PrivyUser & { farcaster?: { username?: string; displayName?: string } }
    const userWithTwitter = privyUser as PrivyUser & { twitter?: { username?: string } }

    try {
      if (userWithFarcaster.farcaster) {
        const farcaster = userWithFarcaster.farcaster
        await apiFetch(`/api/users/${encodeURIComponent(privyUser.id)}/link-social`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            platform: 'farcaster',
            username: farcaster.username || farcaster.displayName,
          }),
        })
        logger.info('Linked Farcaster account during auth sync', { username: farcaster.username }, 'useAuth')
      }

      if (userWithTwitter.twitter) {
        const twitter = userWithTwitter.twitter
        await apiFetch(`/api/users/${encodeURIComponent(privyUser.id)}/link-social`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            platform: 'twitter',
            username: twitter.username,
          }),
        })
        logger.info('Linked Twitter account during auth sync', { username: twitter.username }, 'useAuth')
      }

      if (wallet?.address) {
        await apiFetch(`/api/users/${encodeURIComponent(privyUser.id)}/link-social`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            platform: 'wallet',
            address: wallet.address,
          }),
        })
        logger.info('Linked wallet during auth sync', { address: wallet.address }, 'useAuth')
      }
    } catch (error) {
      logger.warn('Failed to auto-link social accounts', { error }, 'useAuth')
    }
  }

  useEffect(() => {
    void persistAccessToken()
  }, [authenticated, getAccessToken])

  useEffect(() => {
    return () => {
      if (typeof window !== 'undefined' && tokenRetryTimeoutRef.current) {
        window.clearTimeout(tokenRetryTimeoutRef.current)
        tokenRetryTimeoutRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    if (!authenticated || !privyUser) {
      linkedSocialUsers.delete(privyUser?.id ?? '')
      lastSyncedWalletAddress = null
      clearAuth()
      return
    }

    synchronizeWallet()
    void fetchCurrentUser()
  }, [authenticated, privyUser?.id, wallet?.address, wallet?.chainId])

  useEffect(() => {
    void linkSocialAccounts()
  }, [authenticated, privyUser?.id, wallet?.address, needsOnboarding])

  const refresh = async () => {
    if (!authenticated || !privyUser) return
    await fetchCurrentUser()
  }

  const handleLogout = async () => {
    await logout()
    clearAuth()
    if (typeof window !== 'undefined') {
      window.__privyAccessToken = null
    }
  }

  return {
    ready,
    authenticated,
    loadingProfile: isLoadingProfile,
    user,
    wallet,
    needsOnboarding,
    needsOnchain,
    login,
    logout: handleLogout,
    refresh,
  }
}
