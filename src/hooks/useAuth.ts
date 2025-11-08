import { usePrivy, useWallets, type User as PrivyUser, type ConnectedWallet } from '@privy-io/react-auth'
import { useEffect, useMemo } from 'react'
import { useAuthStore, type User } from '@/stores/authStore'
import { OnboardingService } from '@/lib/services/onboarding-service'
import { logger } from '@/lib/logger'

interface UseAuthReturn {
  ready: boolean
  authenticated: boolean
  user: User | null
  wallet: ConnectedWallet | undefined
  login: () => void
  logout: () => Promise<void>
}

const loadedProfileUsers = new Set<string>()
const checkedNewUserUsers = new Set<string>()
const checkedOnboardingUsers = new Set<string>()
const checkedSocialLinks = new Set<string>()
let lastSyncedWalletAddress: string | null = null

export function useAuth(): UseAuthReturn {
  const { ready, authenticated, user: privyUser, login, logout, getAccessToken } = usePrivy()
  const { wallets } = useWallets()
  const {
    user,
    setUser,
    setWallet,
    clearAuth,
    setLoadedUserId,
    setIsLoadingProfile
  } = useAuthStore()

  const wallet = useMemo(() => wallets[0], [wallets]) // Get first connected wallet

  // Store access token globally for API calls
  useEffect(() => {
    const updateAccessToken = async () => {
      if (authenticated) {
        const token = await getAccessToken()
        if (typeof window !== 'undefined') {
          window.__privyAccessToken = token
        }
      } else {
        if (typeof window !== 'undefined') {
          window.__privyAccessToken = null
        }
      }
    }

    updateAccessToken()
  }, [authenticated, getAccessToken])

  // Sync Privy state with Zustand store and check for new users
  useEffect(() => {
    if (!authenticated || !privyUser) {
      loadedProfileUsers.clear()
      checkedNewUserUsers.clear()
      checkedOnboardingUsers.clear()
      checkedSocialLinks.clear()
      lastSyncedWalletAddress = null
      clearAuth()
      return
    }

    if (wallet && lastSyncedWalletAddress !== wallet.address) {
      lastSyncedWalletAddress = wallet.address
      setWallet({
        address: wallet.address,
        chainId: wallet.chainId,
      })
    }

    const loadUserProfile = async () => {
      setIsLoadingProfile(true)
      setLoadedUserId(privyUser.id)
      
      const token = await getAccessToken()
      const response = await fetch(`/api/users/${encodeURIComponent(privyUser.id)}/profile`, {
        headers: {
          ...(token && { Authorization: `Bearer ${token}` }),
        },
      })
      const data = await response.json()

      if (!response.ok) {
        const errorMessage = typeof data?.error === 'string' 
          ? data.error 
          : data?.error?.message || 'Failed to load user profile'
        throw new Error(errorMessage)
      }

      if (data.user) {
        setUser({
          id: privyUser.id,
          walletAddress: wallet?.address,
          displayName: data.user.displayName || privyUser.email?.address || wallet?.address || 'Anonymous',
          email: privyUser.email?.address,
          username: data.user.username,
          bio: data.user.bio,
          profileImageUrl: data.user.profileImageUrl,
          coverImageUrl: data.user.coverImageUrl,
          profileComplete: data.user.profileComplete,
          reputationPoints: data.user.reputationPoints,
          referralCount: data.user.referralCount,
          referralCode: data.user.referralCode,
          hasFarcaster: data.user.hasFarcaster,
          hasTwitter: data.user.hasTwitter,
          farcasterUsername: data.user.farcasterUsername,
          twitterUsername: data.user.twitterUsername,
          usernameChangedAt: data.user.usernameChangedAt,
          nftTokenId: data.user.nftTokenId,
          createdAt: data.user.createdAt,
          stats: data.user.stats,
        })
        setIsLoadingProfile(false)
        return
      }

      // Fallback if profile fetch fails
      setUser({
        id: privyUser.id,
        walletAddress: wallet?.address,
        displayName: privyUser.email?.address || wallet?.address || 'Anonymous',
        email: privyUser.email?.address,
      })
      setIsLoadingProfile(false)
    }

    const checkNewUser = async () => {
      const token = await getAccessToken()
      if (!token) return

      const response = await fetch(`/api/users/${encodeURIComponent(privyUser.id)}/is-new`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      })

      if (!response.ok) return

      const data = await response.json()
      if (data.needsSetup) {
        logger.info('User needs profile setup - onboarding modal will be shown', undefined, 'useAuth')
      }
    }

    const checkOnboarding = async () => {
      // Check if user is already onboarded on-chain (doesn't require wallet)
      const status = await OnboardingService.checkOnboardingStatus(privyUser.id)

      if (status.isOnboarded) {
        logger.info('User already onboarded on-chain with NFT #', status.tokenId, 'useAuth')
        return
      }

      // For onboarding, we need a wallet address
      // Privy creates embedded wallets for email-only users, so wait for wallet
      if (!wallet?.address) {
        // If user authenticated but no wallet yet, wait a bit for embedded wallet creation
        // Privy creates embedded wallets automatically for users-without-wallets
        logger.debug('Waiting for wallet connection for onboarding...', undefined, 'useAuth')
        
        // Retry after a short delay (embedded wallet creation can take a moment)
        setTimeout(() => {
          if (wallets.length > 0 && wallets[0]?.address && !checkedOnboardingUsers.has(privyUser.id)) {
            checkedOnboardingUsers.add(privyUser.id)
            void checkOnboarding()
          }
        }, 2000)
        return
      }

      logger.info('User not onboarded, triggering on-chain registration...', undefined, 'useAuth')

      const referralCode = sessionStorage.getItem('referralCode')
      if (referralCode) {
        logger.info(`Using referral code for onboarding: ${referralCode}`, undefined, 'useAuth')
      }

      const result = await OnboardingService.completeOnboarding(
        privyUser.id,
        wallet.address,
        undefined,
        undefined,
        referralCode || undefined
      )

      if (result.success) {
        sessionStorage.removeItem('referralCode')
        sessionStorage.removeItem('referralCodeTimestamp')
        
        logger.info('Onboarding complete!', {
          tokenId: result.tokenId,
          points: result.points,
          txHash: result.transactionHash,
        }, 'useAuth')
      }
    }

    const checkAndLinkSocialAccounts = async () => {
      const token = await getAccessToken()
      if (!token) return

      // Check for Farcaster connection
      const userWithFarcaster = privyUser as PrivyUser & { farcaster?: { username?: string; displayName?: string } }
      if (userWithFarcaster.farcaster) {
        const farcaster = userWithFarcaster.farcaster
        await fetch(`/api/users/${encodeURIComponent(privyUser.id)}/link-social`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            platform: 'farcaster',
            username: farcaster.username || farcaster.displayName,
          }),
        })
        logger.info('Detected and linked Farcaster account', { username: farcaster.username }, 'useAuth')
      }

      // Check for Twitter/X connection
      const userWithTwitter = privyUser as PrivyUser & { twitter?: { username?: string } }
      if (userWithTwitter.twitter) {
        const twitter = userWithTwitter.twitter
        await fetch(`/api/users/${encodeURIComponent(privyUser.id)}/link-social`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            platform: 'twitter',
            username: twitter.username,
          }),
        })
        logger.info('Detected and linked Twitter account', { username: twitter.username }, 'useAuth')
      }

      // Check for wallet connection
      if (wallet?.address) {
        await fetch(`/api/users/${encodeURIComponent(privyUser.id)}/link-social`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            platform: 'wallet',
            address: wallet.address,
          }),
        })
        logger.info('Detected and linked wallet', { address: wallet.address }, 'useAuth')
      }
    }

    if (!loadedProfileUsers.has(privyUser.id)) {
      loadedProfileUsers.add(privyUser.id)
      void loadUserProfile()
    }

    if (!checkedNewUserUsers.has(privyUser.id)) {
      checkedNewUserUsers.add(privyUser.id)
      void checkNewUser()
    }

    // Check and trigger onboarding if needed
    // For email-only users, Privy creates embedded wallets automatically
    // So we check onboarding status regardless, and wait for wallet if needed
    if (!checkedOnboardingUsers.has(privyUser.id)) {
      checkedOnboardingUsers.add(privyUser.id)
      void checkOnboarding()
    }

    // Check and link social accounts for points
    if (!checkedSocialLinks.has(privyUser.id)) {
      checkedSocialLinks.add(privyUser.id)
      // Delay slightly to ensure profile is loaded first
      setTimeout(() => {
        void checkAndLinkSocialAccounts()
      }, 1000)
    }
  }, [authenticated, privyUser, wallet, wallets, setUser, setWallet, clearAuth, getAccessToken, setIsLoadingProfile, setLoadedUserId])

  // Wrap logout to ensure all state is cleared
  const handleLogout = async () => {
    await logout()
    clearAuth()
    
    // Clear access token
    if (typeof window !== 'undefined') {
      window.__privyAccessToken = null
    }
  }

  return {
    ready,
    authenticated,
    user,
    wallet,
    login,
    logout: handleLogout,
  }
}
