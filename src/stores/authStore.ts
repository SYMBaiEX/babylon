/**
 * Authentication Store
 * 
 * @module stores/authStore
 * 
 * @description
 * Zustand store managing global authentication state for the Babylon application.
 * Handles user profile data, wallet connection, onboarding flow, and session persistence.
 * 
 * **Key Features:**
 * - User profile and authentication state
 * - Wallet connection tracking
 * - Onboarding status management
 * - localStorage persistence for session continuity
 * - Login modal control
 * - Social connection status (Farcaster, Twitter)
 * 
 * @example
 * ```typescript
 * import { useAuthStore } from '@/stores/authStore'
 * 
 * function MyComponent() {
 *   const { user, setUser, logout, showLoginModal } = useAuthStore()
 *   
 *   if (!user) {
 *     return <button onClick={() => showLoginModal()}>Login</button>
 *   }
 *   
 *   return <div>Welcome, {user.displayName}!</div>
 * }
 * ```
 */

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/**
 * User profile data structure.
 * Contains user information, authentication status, and preferences.
 */
export interface User {
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
  isAdmin?: boolean
  isBanned?: boolean
  bannedAt?: string | null
  bannedReason?: string | null
  reputationPoints?: number
  referralCount?: number
  referralCode?: string
  onChainRegistered?: boolean
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
  // Legal and compliance
  tosAccepted?: boolean
  tosAcceptedAt?: string | null
  tosAcceptedVersion?: string | null
  privacyPolicyAccepted?: boolean
  privacyPolicyAcceptedAt?: string | null
  privacyPolicyAcceptedVersion?: string | null
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
  needsOnboarding: boolean
  needsOnchain: boolean
  setUser: (user: User) => void
  setWallet: (wallet: Wallet) => void
  setLoadedUserId: (userId: string) => void
  setIsLoadingProfile: (loading: boolean) => void
  setNeedsOnboarding: (needsOnboarding: boolean) => void
  setNeedsOnchain: (needsOnchain: boolean) => void
  clearAuth: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      wallet: null,
      loadedUserId: null,
      isLoadingProfile: false,
      needsOnboarding: false,
      needsOnchain: false,
      setUser: (user) => set({ user }),
      setWallet: (wallet) => set({ wallet }),
      setLoadedUserId: (userId) => set({ loadedUserId: userId }),
      setIsLoadingProfile: (loading) => set({ isLoadingProfile: loading }),
      setNeedsOnboarding: (needsOnboarding) => set({ needsOnboarding }),
      setNeedsOnchain: (needsOnchain) => set({ needsOnchain }),
      clearAuth: () => set({
        user: null,
        wallet: null,
        loadedUserId: null,
        isLoadingProfile: false,
        needsOnboarding: false,
        needsOnchain: false,
      }),
    }),
    {
      name: 'babylon-auth',
      version: 1, // Increment this to invalidate old cached data
    }
  )
)
