import { usePrivy, useWallets, type User, type ConnectedWallet } from '@privy-io/react-auth'
import { useEffect, useMemo } from 'react'
import { useAuthStore } from '@/stores/authStore'
import { OnboardingService } from '@/lib/services/onboarding-service'

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
let lastSyncedWalletAddress: string | null = null

export function useAuth(): UseAuthReturn {
  const { ready, authenticated, user, login, logout, getAccessToken } = usePrivy()
  const { wallets } = useWallets()
  const {
    setUser,
    setWallet,
    clearAuth,
    loadedUserId,
    isLoadingProfile,
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
          console.error('Error getting access token:', error)
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
            profileComplete: data.user.profileComplete,
          })
          return
        }
      } catch (error) {
        console.error('Error loading user profile:', error)
      }

      // Fallback if profile fetch fails
      setUser({
        id: user.id,
        walletAddress: wallet?.address,
        displayName: user.email?.address || wallet?.address || 'Anonymous',
        email: user.email?.address,
      })
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
          console.warn('Failed to check new user status:', response.status, response.statusText)
          return
        }

        // Check if response is JSON before parsing
        const contentType = response.headers.get('content-type')
        if (!contentType || !contentType.includes('application/json')) {
          console.warn('Non-JSON response from is-new endpoint')
          return
        }

        const data = await response.json()
        if (data.needsSetup && typeof window !== 'undefined') {
          const currentPath = window.location.pathname
          if (currentPath !== '/profile/setup') {
            window.location.href = '/profile/setup'
          }
        }
      } catch (error) {
        // Silently handle errors - don't block user flow
        console.warn('Error checking new user status:', error)
      }
    }

    const checkOnboarding = async () => {
      try {
        // Check if user is already onboarded on-chain (doesn't require wallet)
        const status = await OnboardingService.checkOnboardingStatus(user.id)

        if (status.isOnboarded) {
          console.log('User already onboarded on-chain with NFT #', status.tokenId)
          return
        }

        // For onboarding, we need a wallet address
        // Privy creates embedded wallets for email-only users, so wait for wallet
        if (!wallet?.address) {
          // If user authenticated but no wallet yet, wait a bit for embedded wallet creation
          // Privy creates embedded wallets automatically for users-without-wallets
          console.log('Waiting for wallet connection for onboarding...')
          
          // Retry after a short delay (embedded wallet creation can take a moment)
          setTimeout(() => {
            if (wallets.length > 0 && wallets[0]?.address && !checkedOnboardingUsers.has(user.id)) {
              checkedOnboardingUsers.add(user.id)
              void checkOnboarding()
            }
          }, 2000)
          return
        }

        console.log('User not onboarded, triggering on-chain registration...')

        // Trigger on-chain registration and points award
        const result = await OnboardingService.completeOnboarding(
          user.id,
          wallet.address
        )

        if (result.success) {
          console.log('Onboarding complete!', {
            tokenId: result.tokenId,
            points: result.points,
            txHash: result.transactionHash,
          })

          // Show success notification (optional, requires toast library)
          if (typeof window !== 'undefined' && (window as any).toast) {
            (window as any).toast.success(
              `Welcome! You've received ${result.points} points and NFT #${result.tokenId}`
            )
          }
        } else {
          // Don't log as error if it's just "user not found" - that's expected for new users
          // The user will be created when they try to onboard
          if (result.error && !result.error.includes('not found')) {
            console.error('Onboarding failed:', result.error)
          } else {
            console.log('Onboarding pending - user may need to complete signup first')
          }
        }
      } catch (error) {
        console.error('Error during onboarding check:', error)
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
  }, [authenticated, user, wallet, wallets, setUser, setWallet, clearAuth, getAccessToken])

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
