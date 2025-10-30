import { usePrivy, useWallets, type User, type ConnectedWallet } from '@privy-io/react-auth'
import { useEffect } from 'react'
import { useAuthStore } from '@/stores/authStore'

interface UseAuthReturn {
  ready: boolean
  authenticated: boolean
  user: User | null
  wallet: ConnectedWallet | undefined
  login: () => void
  logout: () => Promise<void>
}

export function useAuth(): UseAuthReturn {
  const { ready, authenticated, user, login, logout, getAccessToken } = usePrivy()
  const { wallets } = useWallets()
  const { setUser, setWallet, clearAuth } = useAuthStore()

  const wallet = wallets[0] // Get first connected wallet

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
    if (authenticated && user) {
      if (wallet) {
        setWallet({
          address: wallet.address,
          chainId: wallet.chainId,
        })
      }

      // Fetch complete user profile from database
      const loadUserProfile = async () => {
        fetch(`/api/users/${user.id}/profile`)
          .then(res => res.json())
          .then(data => {
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
            } else {
              // Fallback if profile fetch fails
              setUser({
                id: user.id,
                walletAddress: wallet?.address,
                displayName: user.email?.address || wallet?.address || 'Anonymous',
                email: user.email?.address,
              })
            }
          })
          .catch(err => {
            console.error('Error loading user profile:', err)
            // Fallback if profile fetch fails
            setUser({
              id: user.id,
              walletAddress: wallet?.address,
              displayName: user.email?.address || wallet?.address || 'Anonymous',
              email: user.email?.address,
            })
          })
      }

      // Check if new user and redirect to profile setup
      const checkNewUser = async () => {
        const token = await getAccessToken()
        const response = await fetch(`/api/users/${user.id}/is-new`, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        })
        if (response.ok) {
          const data = await response.json()
          if (data.needsSetup && typeof window !== 'undefined') {
            // Redirect to profile setup
            const currentPath = window.location.pathname
            if (currentPath !== '/profile/setup') {
              window.location.href = '/profile/setup'
            }
          }
        }
      }

      loadUserProfile()
      checkNewUser()
    } else {
      clearAuth()
    }
  }, [authenticated, user, wallet, setUser, setWallet, clearAuth])

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
