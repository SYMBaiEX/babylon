'use client';

import { logger } from '@babylon/shared';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { GameGuideModal } from '@/components/onboarding/GameGuideModal';
import { useAuth } from '@/hooks/useAuth';
import { useAuthStore } from '@/stores/authStore';
import { apiFetch } from '@/utils/api-fetch';

/** LocalStorage key for tracking game guide completion (backup for API) */
const GAME_GUIDE_COMPLETED_KEY = 'babylon-game-guide-completed';

/**
 * Check if user has completed game guide (checks both API and localStorage backup)
 */
function hasCompletedGameGuide(
  userId: string | undefined,
  apiCompletedAt: string | null | undefined
): boolean {
  // If API says completed, it's completed
  if (apiCompletedAt) return true;

  // Check localStorage backup (keyed by userId to support multiple accounts)
  if (typeof window === 'undefined' || !userId) return false;

  try {
    const stored = localStorage.getItem(GAME_GUIDE_COMPLETED_KEY);
    if (!stored) return false;
    const completedUsers = JSON.parse(stored) as Record<string, boolean>;
    return completedUsers[userId] === true;
  } catch {
    return false;
  }
}

/**
 * Mark game guide as completed in localStorage (backup for API)
 */
function markGameGuideCompleted(userId: string): void {
  if (typeof window === 'undefined') return;

  try {
    const stored = localStorage.getItem(GAME_GUIDE_COMPLETED_KEY);
    const completedUsers = stored
      ? (JSON.parse(stored) as Record<string, boolean>)
      : {};
    completedUsers[userId] = true;
    localStorage.setItem(
      GAME_GUIDE_COMPLETED_KEY,
      JSON.stringify(completedUsers)
    );
  } catch {
    // Ignore localStorage errors
  }
}

interface GameGuideContextValue {
  isOpen: boolean;
  openGuide: () => void;
  hasCompleted: boolean;
}

const GameGuideContext = createContext<GameGuideContextValue | null>(null);

/** Access game guide state. Throws if used outside GameGuideProvider. */
export function useGameGuide(): GameGuideContextValue {
  const ctx = useContext(GameGuideContext);
  if (!ctx) throw new Error('useGameGuide requires GameGuideProvider');
  return ctx;
}

/**
 * Manages the game onboarding guide. Auto-shows when:
 * - User is authenticated with complete profile
 * - On-chain step is done
 * - Guide not yet completed (checked via API AND localStorage backup)
 * - User is not an NPC/actor
 */
export function GameGuideProvider({ children }: { children: React.ReactNode }) {
  const {
    ready,
    authenticated,
    user,
    loadingProfile,
    needsOnboarding,
    needsOnchain,
  } = useAuth();
  const { setUser } = useAuthStore();

  const [isOpen, setIsOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const hasAutoShown = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  const userId = user?.id;
  const gameGuideCompletedAt = user?.gameGuideCompletedAt;

  // Check completion via both API response AND localStorage backup
  // Memoized to avoid localStorage access on every render
  const hasCompleted = useMemo(
    () => hasCompletedGameGuide(userId, gameGuideCompletedAt),
    [userId, gameGuideCompletedAt]
  );

  // Check if guide should auto-open (only once per session)
  // Only shows after user has completed onboarding (profile + on-chain)
  const shouldAutoShow =
    authenticated &&
    !loadingProfile &&
    !needsOnboarding &&
    !needsOnchain &&
    !hasCompleted &&
    !user?.isActor;

  useEffect(() => {
    if (shouldAutoShow && !hasAutoShown.current && !isOpen) {
      logger.info('Auto-opening game guide', { userId }, 'GameGuideProvider');
      hasAutoShown.current = true;
      setIsOpen(true);
    }
  }, [shouldAutoShow, isOpen, userId]);

  // Reset on logout - only when Privy is ready and user is confirmed logged out
  // Don't reset during initial load when `ready` is false
  useEffect(() => {
    if (ready && !authenticated) {
      hasAutoShown.current = false;
      setIsOpen(false);
    }
  }, [ready, authenticated]);

  // Cleanup: abort any in-flight request on unmount
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  const openGuide = useCallback(() => setIsOpen(true), []);

  const handleComplete = useCallback(async () => {
    // Guard against double-submit or missing user
    if (!user || isSubmitting) return;

    // Capture userId for logging (user object might change during async)
    const currentUserId = user.id;

    // Immediately save to localStorage as backup (prevents showing again even if API fails)
    markGameGuideCompleted(currentUserId);

    // Close the modal immediately for better UX
    setIsOpen(false);

    // Abort any previous in-flight request
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setIsSubmitting(true);

    try {
      const res = await apiFetch('/api/users/me/game-guide', {
        method: 'POST',
        signal: controller.signal,
      });

      // Check if aborted before processing response
      if (controller.signal.aborted) return;

      if (res.ok) {
        const { gameGuideCompletedAt } = (await res.json()) as {
          gameGuideCompletedAt: string;
        };
        // Use fresh user state from store to avoid overwriting newer data with stale closure
        const freshUser = useAuthStore.getState().user;
        if (freshUser) {
          setUser({ ...freshUser, gameGuideCompletedAt });
        }
        logger.info(
          'Game guide completion saved',
          { userId: currentUserId },
          'GameGuideProvider'
        );
      } else {
        // API failed but localStorage backup is already saved
        // User won't see the guide again, but we log the error
        logger.error(
          'Failed to save game guide to API (localStorage backup saved)',
          { status: res.status, userId: currentUserId },
          'GameGuideProvider'
        );
      }
    } catch (error) {
      // Ignore abort errors, they're expected on unmount
      if (error instanceof Error && error.name === 'AbortError') return;

      // API failed but localStorage backup is already saved
      logger.error(
        'Game guide API error (localStorage backup saved)',
        { error, userId: currentUserId },
        'GameGuideProvider'
      );
    } finally {
      // Only clear submitting if not aborted (component still mounted)
      if (!controller.signal.aborted) {
        setIsSubmitting(false);
      }
    }
  }, [user, setUser, isSubmitting]);

  const value = useMemo(
    () => ({ isOpen, openGuide, hasCompleted }),
    [isOpen, openGuide, hasCompleted]
  );

  return (
    <GameGuideContext.Provider value={value}>
      {children}
      <GameGuideModal
        isOpen={isOpen}
        onComplete={handleComplete}
        isSubmitting={isSubmitting}
      />
    </GameGuideContext.Provider>
  );
}
