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
import { toast } from 'sonner';
import { GameGuideModal } from '@/components/onboarding/GameGuideModal';
import { useAuth } from '@/hooks/useAuth';
import { useAuthStore } from '@/stores/authStore';
import { apiFetch } from '@/utils/api-fetch';

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
 * - On-chain step is done/skipped
 * - Guide not yet completed
 * - User is not an NPC/actor
 */
export function GameGuideProvider({ children }: { children: React.ReactNode }) {
  const { authenticated, user, loadingProfile, needsOnboarding, needsOnchain } =
    useAuth();
  const { setUser } = useAuthStore();

  const [isOpen, setIsOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const hasAutoShown = useRef(false);

  const hasCompleted = Boolean(user?.gameGuideCompletedAt);
  const userId = user?.id;

  // Check if guide should auto-open (only once per session)
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

  // Reset on logout
  useEffect(() => {
    if (!authenticated) {
      hasAutoShown.current = false;
      setIsOpen(false);
    }
  }, [authenticated]);

  const openGuide = useCallback(() => setIsOpen(true), []);

  const handleComplete = useCallback(async () => {
    if (!user || isSubmitting) return;
    setIsSubmitting(true);
    setIsOpen(false);

    const res = await apiFetch('/api/users/me/game-guide', { method: 'POST' });

    if (res.ok) {
      const { gameGuideCompletedAt } = (await res.json()) as {
        gameGuideCompletedAt: string;
      };
      setUser({ ...user, gameGuideCompletedAt });
    } else {
      logger.error('Failed to save game guide', { status: res.status }, 'GameGuideProvider');
      toast.error('Failed to save progress. The guide may appear again later.');
    }
    setIsSubmitting(false);
  }, [user, setUser, isSubmitting]);

  const value = useMemo(
    () => ({ isOpen, openGuide, hasCompleted }),
    [isOpen, openGuide, hasCompleted]
  );

  return (
    <GameGuideContext.Provider value={value}>
      {children}
      <GameGuideModal isOpen={isOpen} onComplete={handleComplete} />
    </GameGuideContext.Provider>
  );
}
