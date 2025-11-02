import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface User {
  id: string
  walletAddress?: string
  displayName: string
  email?: string
  username?: string
  bio?: string
  profileImageUrl?: string
  coverImageUrl?: string
  profileComplete?: boolean
  nftTokenId?: number | null
  createdAt?: string
  isActor?: boolean
  reputationPoints?: number
  referralCount?: number
  referralCode?: string
  hasFarcaster?: boolean
  hasTwitter?: boolean
  farcasterUsername?: string
  twitterUsername?: string
  showTwitterPublic?: boolean
  showFarcasterPublic?: boolean
  showWalletPublic?: boolean
  bannerLastShown?: string
  bannerDismissCount?: number
  usernameChangedAt?: string | null
  stats?: {
    positions?: number
    comments?: number
    reactions?: number
    followers?: number
    following?: number
  }
}

interface Wallet {
  address: string
  chainId: string
}

interface AuthState {
  user: User | null
  wallet: Wallet | null
  loadedUserId: string | null
  isLoadingProfile: boolean
  setUser: (user: User) => void
  setWallet: (wallet: Wallet) => void
  setLoadedUserId: (userId: string) => void
  setIsLoadingProfile: (loading: boolean) => void
  clearAuth: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      wallet: null,
      loadedUserId: null,
      isLoadingProfile: false,
      setUser: (user) => set({ user }),
      setWallet: (wallet) => set({ wallet }),
      setLoadedUserId: (userId) => set({ loadedUserId: userId }),
      setIsLoadingProfile: (loading) => set({ isLoadingProfile: loading }),
      clearAuth: () => set({ user: null, wallet: null, loadedUserId: null, isLoadingProfile: false }),
    }),
    {
      name: 'babylon-auth',
    }
  )
)
