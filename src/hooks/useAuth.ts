'use client';

import { useEffect, useMemo } from 'react';

import {
  type ConnectedWallet,
  type User as PrivyUser,
  usePrivy,
  useWallets,
} from '@privy-io/react-auth';

import { apiFetch } from '@/lib/api/fetch';
import { logger } from '@/lib/logger';

import { type User, useAuthStore } from '@/stores/authStore';

interface UseAuthReturn {
  ready: boolean;
  authenticated: boolean;
  loadingProfile: boolean;
  user: User | null;
  wallet: ConnectedWallet | undefined;
  needsOnboarding: boolean;
  needsOnchain: boolean;
  login: () => void;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

let lastSyncedWalletAddress: string | null = null;

// Global fetch management - shared across ALL useAuth instances
let globalFetchInFlight: Promise<void> | null = null;
let globalTokenRetryTimeout: number | null = null;

export function useAuth(): UseAuthReturn {
  const {
    ready,
    authenticated,
    user: privyUser,
    login,
    logout,
    getAccessToken,
  } = usePrivy();
  const { wallets } = useWallets();
  const {
    user,
    isLoadingProfile,
    needsOnboarding,
    needsOnchain,
    setUser,
    setWallet,
    setNeedsOnboarding,
    setNeedsOnchain,
    setLoadedUserId,
    setIsLoadingProfile,
    clearAuth,
  } = useAuthStore();

  const wallet = useMemo(() => {
    if (wallets.length === 0) return undefined;
    return (
      wallets.find(
        (candidate) =>
          candidate.walletClientType === 'privy' ||
          candidate.walletClientType === 'privy-v2'
      ) ?? wallets[0]
    );
  }, [wallets]);

  const persistAccessToken = async (): Promise<string | null> => {
    if (!authenticated) {
      if (typeof window !== 'undefined') {
        window.__privyAccessToken = null;
      }
      return null;
    }

    try {
      const token = await getAccessToken();
      if (typeof window !== 'undefined') {
        window.__privyAccessToken = token;
      }
      return token ?? null;
    } catch (error) {
      logger.warn('Failed to obtain Privy access token', { error }, 'useAuth');
      return null;
    }
  };

  const fetchCurrentUser = async () => {
    if (!authenticated || !privyUser) return;

    // Use global ref to prevent ANY duplicate calls across all components
    if (globalFetchInFlight) {
      await globalFetchInFlight;
      return;
    }

    const run = async () => {
      setIsLoadingProfile(true);
      setLoadedUserId(privyUser.id);

      try {
        const token = await persistAccessToken();
        if (!token) {
          logger.warn(
            'Privy access token unavailable; delaying /api/users/me fetch',
            { userId: privyUser.id },
            'useAuth'
          );
          setIsLoadingProfile(false);
          if (typeof window !== 'undefined') {
            if (globalTokenRetryTimeout) {
              window.clearTimeout(globalTokenRetryTimeout);
            }
            globalTokenRetryTimeout = window.setTimeout(() => {
              void fetchCurrentUser();
            }, 200);
          }
          return;
        }

        const response = await apiFetch('/api/users/me');
        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
          const message =
            data?.error ||
            `Failed to load authenticated user (status ${response.status})`;
          throw new Error(message);
        }

        const me = data as {
          authenticated: boolean;
          needsOnboarding: boolean;
          needsOnchain: boolean;
          user: (User & { createdAt?: string; updatedAt?: string }) | null;
        };

        setNeedsOnboarding(me.needsOnboarding);
        setNeedsOnchain(me.needsOnchain);

        const fallbackProfileImageUrl = user?.profileImageUrl;
        const fallbackCoverImageUrl = user?.coverImageUrl;

        if (me.user) {
          const hydratedUser: User = {
            id: me.user.id,
            walletAddress: me.user.walletAddress ?? wallet?.address,
            displayName:
              me.user.displayName ||
              privyUser.email?.address ||
              wallet?.address ||
              'Anonymous',
            email: privyUser.email?.address,
            username: me.user.username ?? undefined,
            bio: me.user.bio ?? undefined,
            profileImageUrl:
              me.user.profileImageUrl ?? fallbackProfileImageUrl ?? undefined,
            coverImageUrl:
              me.user.coverImageUrl ?? fallbackCoverImageUrl ?? undefined,
            profileComplete: me.user.profileComplete ?? false,
            reputationPoints: me.user.reputationPoints ?? undefined,
            referralCount: undefined,
            referralCode: me.user.referralCode ?? undefined,
            hasFarcaster: me.user.hasFarcaster ?? undefined,
            hasTwitter: me.user.hasTwitter ?? undefined,
            farcasterUsername: me.user.farcasterUsername ?? undefined,
            twitterUsername: me.user.twitterUsername ?? undefined,
            stats: undefined,
            nftTokenId: me.user.nftTokenId ?? undefined,
            createdAt: me.user.createdAt,
            onChainRegistered: me.user.onChainRegistered ?? undefined,
          };

          // Only update if data has actually changed (prevent infinite re-render loop)
          const hasChanged =
            !user ||
            user.id !== hydratedUser.id ||
            user.username !== hydratedUser.username ||
            user.displayName !== hydratedUser.displayName ||
            user.profileComplete !== hydratedUser.profileComplete ||
            user.onChainRegistered !== hydratedUser.onChainRegistered ||
            user.profileImageUrl !== hydratedUser.profileImageUrl ||
            user.coverImageUrl !== hydratedUser.coverImageUrl ||
            user.bio !== hydratedUser.bio ||
            user.walletAddress !== hydratedUser.walletAddress;

          if (hasChanged) {
            setUser(hydratedUser);
          }
        } else {
          // Only set user if not already set to prevent re-render loops
          if (!user || user.id !== privyUser.id) {
            setUser({
              id: privyUser.id,
              walletAddress: wallet?.address,
              displayName:
                privyUser.email?.address || wallet?.address || 'Anonymous',
              email: privyUser.email?.address,
              onChainRegistered: false,
            });
          }
        }
      } catch (error) {
        logger.error(
          'Failed to resolve authenticated user via /api/users/me',
          { error },
          'useAuth'
        );
        setNeedsOnboarding(true);
        setNeedsOnchain(false);

        // Only set user if not already set to prevent re-render loops
        if (!user || user.id !== privyUser.id) {
          setUser({
            id: privyUser.id,
            walletAddress: wallet?.address,
            displayName:
              privyUser.email?.address || wallet?.address || 'Anonymous',
            email: privyUser.email?.address,
            profileImageUrl: user?.profileImageUrl ?? undefined,
            coverImageUrl: user?.coverImageUrl ?? undefined,
            onChainRegistered: false,
          });
        }
      } finally {
        setIsLoadingProfile(false);
      }
    };

    const promise = run().finally(() => {
      globalFetchInFlight = null;
      if (typeof window !== 'undefined' && globalTokenRetryTimeout) {
        window.clearTimeout(globalTokenRetryTimeout);
        globalTokenRetryTimeout = null;
      }
    });

    globalFetchInFlight = promise;
    await promise;
  };

  const synchronizeWallet = () => {
    if (!wallet) return;
    if (wallet.address === lastSyncedWalletAddress) return;

    lastSyncedWalletAddress = wallet.address;
    setWallet({
      address: wallet.address,
      chainId: wallet.chainId,
    });
  };

  useEffect(() => {
    void persistAccessToken();
  }, [authenticated, getAccessToken]);

  useEffect(() => {
    return () => {
      if (typeof window !== 'undefined' && globalTokenRetryTimeout) {
        window.clearTimeout(globalTokenRetryTimeout);
        globalTokenRetryTimeout = null;
      }
    };
  }, []);

  // Sync wallet separately from fetching user
  useEffect(() => {
    if (authenticated && privyUser) {
      synchronizeWallet();
    }
  }, [authenticated, privyUser, wallet?.address, wallet?.chainId]);

  // Fetch user only when authentication status or user ID changes
  useEffect(() => {
    if (!authenticated || !privyUser) {
      lastSyncedWalletAddress = null;
      clearAuth();
      return;
    }

    void fetchCurrentUser();
  }, [authenticated, privyUser?.id]);

  const refresh = async () => {
    if (!authenticated || !privyUser) return;
    await fetchCurrentUser();
  };

  const handleLogout = async () => {
    await logout();
    clearAuth();
    if (typeof window !== 'undefined') {
      window.__privyAccessToken = null;
    }
  };

  return {
    ready,
    authenticated,
    loadingProfile: isLoadingProfile,
    user,
    wallet,
    needsOnboarding,
    needsOnchain,
    login,
    logout: handleLogout,
    refresh,
  };
}
