import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface User {
  id: string
  walletAddress?: string
  displayName: string
  email?: string
}

interface Wallet {
  address: string
  chainId: string
}

interface AuthState {
  user: User | null
  wallet: Wallet | null
  setUser: (user: User) => void
  setWallet: (wallet: Wallet) => void
  clearAuth: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      wallet: null,
      setUser: (user) => set({ user }),
      setWallet: (wallet) => set({ wallet }),
      clearAuth: () => set({ user: null, wallet: null }),
    }),
    {
      name: 'babylon-auth',
    }
  )
)
