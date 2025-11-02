import { usePrivy, useWallets, type User, type ConnectedWallet } from '@privy-io/react-auth'
import { useEffect, useMemo } from 'react'
import { useAuthStore } from '@/stores/authStore'
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
  const { ready, authenticated, user, login, logout, getAccessToken } = usePrivy()
  const { wallets } = useWallets()
  const {
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
        try {
          const token = await getAccessToken()
          if (typeof window !== 'undefined') {
            window.__privyAccessToken = token
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          logger.error('Error getting access token:', { message: errorMessage, error }, 'useAuth')
          if (typeof window !== 'undefined') {
            window.__privyAccessToken = null
          }
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
    if (!authenticated || !user) {
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
      setLoadedUserId(user.id)
      
      try {
        const response = await fetch(`/api/users/${user.id}/profile`)
        const data = await response.json()

        if (!response.ok) {
          throw new Error(data?.error || 'Failed to load user profile')
        }

        if (data.user) {
          setUser({
            id: user.id,
            walletAddress: wallet?.address,
            displayName: data.user.displayName || user.email?.address || wallet?.address || 'Anonymous',
            email: user.email?.address,
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
            nftTokenId: data.user.nftTokenId,
            createdAt: data.user.createdAt,
            stats: data.user.stats,
          })
          setIsLoadingProfile(false)
          return
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        const errorDetails = {
          message: errorMessage,
          userId: user.id,
          error: error instanceof Error ? { name: error.name, message: error.message } : error,
        };
        logger.error('Error loading user profile:', errorDetails, 'useAuth')
      }

      // Fallback if profile fetch fails
      setUser({
        id: user.id,
        walletAddress: wallet?.address,
        displayName: user.email?.address || wallet?.address || 'Anonymous',
        email: user.email?.address,
      })
      setIsLoadingProfile(false)
    }

    const checkNewUser = async () => {
      try {
        const token = await getAccessToken()
        if (!token) return // Skip if no token

        const response = await fetch(`/api/users/${user.id}/is-new`, {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        })

        if (!response.ok) {
          // Don't throw - silently fail if endpoint doesn't exist or errors
          logger.warn('Failed to check new user status:', { status: response.status, statusText: response.statusText }, 'useAuth')
          return
        }

        // Check if response is JSON before parsing
        const contentType = response.headers.get('content-type')
        if (!contentType || !contentType.includes('application/json')) {
          logger.warn('Non-JSON response from is-new endpoint', undefined, 'useAuth')
          return
        }

        const data = await response.json()
        if (data.needsSetup && typeof window !== 'undefined') {
          const currentPath = window.location.pathname
          if (currentPath !== '/profile') {
            window.location.href = '/profile'
          }
        }
      } catch (error) {
        // Silently handle errors - don't block user flow
        logger.warn('Error checking new user status:', error, 'useAuth')
      }
    }

    const checkOnboarding = async () => {
      try {
        // Check if user is already onboarded on-chain (doesn't require wallet)
        const status = await OnboardingService.checkOnboardingStatus(user.id)

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
            if (wallets.length > 0 && wallets[0]?.address && !checkedOnboardingUsers.has(user.id)) {
              checkedOnboardingUsers.add(user.id)
              void checkOnboarding()
            }
          }, 2000)
          return
        }

        logger.info('User not onboarded, triggering on-chain registration...', undefined, 'useAuth')

        // Get referral code from sessionStorage (captured by ReferralCaptureProvider)
        let referralCode: string | null = null
        try {
          referralCode = sessionStorage.getItem('referralCode')
          if (referralCode) {
            logger.info(`Using referral code for onboarding: ${referralCode}`, undefined, 'useAuth')
          }
        } catch (error) {
          logger.warn('Could not access referral code from sessionStorage', error, 'useAuth')
        }

        // Trigger on-chain registration and points award
        const result = await OnboardingService.completeOnboarding(
          user.id,
          wallet.address,
          undefined, // username - will be auto-generated
          undefined, // bio
          referralCode || undefined // referral code from URL
        )

        if (result.success) {
          // Clear referral code after successful onboarding
          try {
            sessionStorage.removeItem('referralCode')
            sessionStorage.removeItem('referralCodeTimestamp')
          } catch (error) {
            // Silently handle errors - sessionStorage may not be available
            logger.debug('Error clearing referral code after onboarding:', error, 'useAuth')
          }
          logger.info('Onboarding complete!', {
            tokenId: result.tokenId,
            points: result.points,
            txHash: result.transactionHash,
          }, 'useAuth')

          // Show success notification (optional, requires toast library)
          if (typeof window !== 'undefined') {
            const windowWithToast = window as typeof window & {
              toast?: {
                success: (message: string) => void
              }
            }
            if (windowWithToast.toast) {
              windowWithToast.toast.success(
                `Welcome! You've received ${result.points} points and NFT #${result.tokenId}`
              )
            }
          }
        } else {
          // Don't log as error if it's just "user not found" - that's expected for new users
          // The user will be created when they try to onboard
          if (result.error && !result.error.includes('not found')) {
            logger.error('Onboarding failed:', result.error, 'useAuth')
          } else {
            logger.debug('Onboarding pending - user may need to complete signup first', undefined, 'useAuth')
          }
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        const errorDetails = {
          message: errorMessage,
          userId: user.id,
          error: error instanceof Error ? { name: error.name, message: error.message } : error,
        };
        logger.error('Error during onboarding check:', errorDetails, 'useAuth')
      }
    }

    const checkAndLinkSocialAccounts = async () => {
      try {
        const token = await getAccessToken()
        if (!token) return

        // Check for Farcaster connection
        const userWithFarcaster = user as User & { farcaster?: { username?: string; displayName?: string } }
        if (userWithFarcaster.farcaster) {
          const farcaster = userWithFarcaster.farcaster
          try {
            await fetch(`/api/users/${user.id}/link-social`, {
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
          } catch (error) {
            logger.warn('Error linking Farcaster account:', error, 'useAuth')
          }
        }

        // Check for Twitter/X connection
        const userWithTwitter = user as User & { twitter?: { username?: string } }
        if (userWithTwitter.twitter) {
          const twitter = userWithTwitter.twitter
          try {
            await fetch(`/api/users/${user.id}/link-social`, {
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
          } catch (error) {
            logger.warn('Error linking Twitter account:', error, 'useAuth')
          }
        }

        // Check for wallet connection
        if (wallet?.address) {
          try {
            await fetch(`/api/users/${user.id}/link-social`, {
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
          } catch (error) {
            logger.warn('Error linking wallet:', error, 'useAuth')
          }
        }
      } catch (error) {
        logger.warn('Error checking social accounts:', error, 'useAuth')
      }
    }

    if (!loadedProfileUsers.has(user.id)) {
      loadedProfileUsers.add(user.id)
      void loadUserProfile()
    }

    if (!checkedNewUserUsers.has(user.id)) {
      checkedNewUserUsers.add(user.id)
      void checkNewUser()
    }

    // Check and trigger onboarding if needed
    // For email-only users, Privy creates embedded wallets automatically
    // So we check onboarding status regardless, and wait for wallet if needed
    if (!checkedOnboardingUsers.has(user.id)) {
      checkedOnboardingUsers.add(user.id)
      void checkOnboarding()
    }

    // Check and link social accounts for points
    if (!checkedSocialLinks.has(user.id)) {
      checkedSocialLinks.add(user.id)
      // Delay slightly to ensure profile is loaded first
      setTimeout(() => {
        void checkAndLinkSocialAccounts()
      }, 1000)
    }
  }, [authenticated, user, wallet, wallets, setUser, setWallet, clearAuth, getAccessToken, setIsLoadingProfile, setLoadedUserId])

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
