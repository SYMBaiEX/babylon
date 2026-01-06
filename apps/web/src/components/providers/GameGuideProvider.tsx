'use client';

import { logger } from '@babylon/shared';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import { GameGuideModal } from '@/components/onboarding/GameGuideModal';
import { useAuth } from '@/hooks/useAuth';
import { useAuthStore } from '@/stores/authStore';
import { apiFetch } from '@/utils/api-fetch';

/**
 * Context value for the GameGuide provider.
 */
interface GameGuideContextValue {
  /** Whether the game guide modal is currently open */
  isOpen: boolean;
  /** Open the game guide modal (for re-viewing) */
  openGuide: () => void;
  /** Whether the user has completed the game guide */
  hasCompleted: boolean;
}

const GameGuideContext = createContext<GameGuideContextValue | null>(null);

/**
 * Hook to access the game guide context.
 *
 * @returns GameGuide context value
 * @throws Error if used outside of GameGuideProvider
 *
 * @example
 * ```tsx
 * const { openGuide, hasCompleted } = useGameGuide();
 *
 * return (
 *   <button onClick={openGuide}>
 *     View Onboarding Guide
 *   </button>
 * );
 * ```
 */
export function useGameGuide(): GameGuideContextValue {
  const context = useContext(GameGuideContext);
  if (!context) {
    throw new Error('useGameGuide must be used within a GameGuideProvider');
  }
  return context;
}

/**
 * Props for the GameGuideProvider component.
 */
interface GameGuideProviderProps {
  children: React.ReactNode;
}

/**
 * Game Guide Provider Component
 *
 * Manages the game onboarding guide state and rendering.
 * Shows the guide automatically when:
 * - User is authenticated
 * - Profile onboarding is complete (profileComplete = true)
 * - User has not completed the game guide yet (gameGuideCompletedAt = null)
 * - User is not an NPC/actor (isActor = false)
 *
 * Also provides a way to re-open the guide from settings/help.
 */
export function GameGuideProvider({ children }: GameGuideProviderProps) {
  const { authenticated, user, loadingProfile, needsOnboarding, needsOnchain } =
    useAuth();
  const { setUser } = useAuthStore();

  const [isOpen, setIsOpen] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);
  const [hasInitialized, setHasInitialized] = useState(false);

  // Determine if the game guide has been completed
  const hasCompleted = Boolean(user?.gameGuideCompletedAt);

  // Determine if we should show the game guide
  // Show when:
  // - Authenticated
  // - Not loading profile
  // - Profile onboarding is complete (needsOnboarding = false)
  // - On-chain step is complete or skipped (needsOnchain = false)
  // - Game guide not yet completed
  // - User is not an NPC/actor
  const shouldShowGuide =
    authenticated &&
    !loadingProfile &&
    !needsOnboarding &&
    !needsOnchain &&
    user &&
    !user.gameGuideCompletedAt &&
    !user.isActor &&
    !isCompleting;

  // Auto-open the guide when conditions are met
  useEffect(() => {
    // Wait for initial load to complete before deciding to show
    if (loadingProfile) {
      return;
    }

    // Mark as initialized after first load
    if (!hasInitialized && authenticated && user) {
      setHasInitialized(true);
    }

    // Only auto-open if we've initialized and should show the guide
    if (hasInitialized && shouldShowGuide && !isOpen) {
      logger.info(
        'Auto-opening game guide for first-time user',
        { userId: user?.id },
        'GameGuideProvider'
      );
      setIsOpen(true);
    }
  }, [
    authenticated,
    loadingProfile,
    hasInitialized,
    shouldShowGuide,
    isOpen,
    user,
  ]);

  // Reset initialization when user logs out
  useEffect(() => {
    if (!authenticated) {
      setHasInitialized(false);
      setIsOpen(false);
    }
  }, [authenticated]);

  const openGuide = useCallback(() => {
    setIsOpen(true);
  }, []);

  const handleComplete = useCallback(async () => {
    if (!user || isCompleting) return;

    setIsCompleting(true);

    logger.info(
      'Completing game guide',
      { userId: user.id },
      'GameGuideProvider'
    );

    const response = await apiFetch('/api/users/me/game-guide', {
      method: 'POST',
    });

    if (response.ok) {
      const data = (await response.json()) as {
        success: boolean;
        gameGuideCompletedAt: string;
      };

      // Update the user in the store
      setUser({
        ...user,
        gameGuideCompletedAt: data.gameGuideCompletedAt,
      });

      logger.info(
        'Game guide completed successfully',
        { userId: user.id, completedAt: data.gameGuideCompletedAt },
        'GameGuideProvider'
      );
    } else {
      // Log error but still close the modal - don't block the user
      const errorText = await response.text().catch(() => 'Unknown error');
      logger.error(
        'Failed to mark game guide as completed',
        { userId: user.id, status: response.status, error: errorText },
        'GameGuideProvider'
      );
    }

    setIsOpen(false);
    setIsCompleting(false);
  }, [user, isCompleting, setUser]);

  const contextValue: GameGuideContextValue = {
    isOpen,
    openGuide,
    hasCompleted,
  };

  return (
    <GameGuideContext.Provider value={contextValue}>
      {children}
      <GameGuideModal isOpen={isOpen} onComplete={handleComplete} />
    </GameGuideContext.Provider>
  );
}
