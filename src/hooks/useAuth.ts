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

  // Sync Privy state with Zustand store
  useEffect(() => {
    if (authenticated && user) {
      setUser({
        id: user.id,
        walletAddress: wallet?.address,
        displayName: user.email?.address || wallet?.address || 'Anonymous',
      })

      if (wallet) {
        setWallet({
          address: wallet.address,
          chainId: wallet.chainId,
        })
      }
    } else {
      clearAuth()
    }
  }, [authenticated, user, wallet, setUser, setWallet, clearAuth])

  return {
    ready,
    authenticated,
    user,
    wallet,
    login,
    logout,
  }
}
