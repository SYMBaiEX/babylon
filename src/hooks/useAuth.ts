import { usePrivy, useWallets, type User, type ConnectedWallet } from '@privy-io/react-auth'
import { useEffect, useMemo } from 'react'
import { useAuthStore } from '@/stores/authStore'

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
let lastSyncedWalletAddress: string | null = null

export function useAuth(): UseAuthReturn {
  const { ready, authenticated, user, login, logout, getAccessToken } = usePrivy()
  const { wallets } = useWallets()
  const { setUser, setWallet, clearAuth } = useAuthStore()

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
        const response = await fetch(`/api/users/${user.id}/is-new`, {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        })

        if (!response.ok) {
          throw new Error('Failed to check new user status')
        }

        const data = await response.json()
        if (data.needsSetup && typeof window !== 'undefined') {
          const currentPath = window.location.pathname
          if (currentPath !== '/profile/setup') {
            window.location.href = '/profile/setup'
          }
        }
      } catch (error) {
        console.error('Error checking new user status:', error)
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
  }, [authenticated, user, wallet, setUser, setWallet, clearAuth, getAccessToken])

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
