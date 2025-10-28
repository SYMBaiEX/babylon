import { usePrivy, useWallets } from '@privy-io/react-auth'
import { useEffect } from 'react'
import { useAuthStore } from '@/stores/authStore'

export function useAuth() {
  const { ready, authenticated, user, login, logout } = usePrivy()
  const { wallets } = useWallets()
  const { setUser, setWallet, clearAuth } = useAuthStore()

  const wallet = wallets[0] // Get first connected wallet

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
