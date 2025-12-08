'use client';

import { logger } from '@babylon/shared';
import { useCallback, useEffect, useState } from 'react';
import type { LeaderboardTab, TopUser, WaitlistData } from '@/components/waitlist/types';
import { useAuth } from '@/hooks/useAuth';

interface UseWaitlistDataOptions {
  authenticated: boolean;
  userId: string | undefined;
  profileComplete: boolean | undefined;
  username: string | undefined;
}

interface UseWaitlistDataReturn {
  waitlistData: WaitlistData | null;
  topUsers: TopUser[];
  leaderboardPage: number;
  leaderboardTotalPages: number;
  leaderboardTab: LeaderboardTab;
  showRankImprovement: boolean;
  setLeaderboardPage: (page: number) => void;
  setLeaderboardTab: (tab: LeaderboardTab) => void;
  fetchWaitlistPosition: (userId: string, skipLeaderboard?: boolean) => Promise<boolean>;
  fetchLeaderboardPage: (page: number, tab?: LeaderboardTab) => Promise<boolean>;
  refreshWaitlistData: () => Promise<void>;
}

const LEADERBOARD_CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
const POLL_INTERVAL = 30000; // 30 seconds

export function useWaitlistData({
  authenticated,
  userId,
  profileComplete,
  username,
}: UseWaitlistDataOptions): UseWaitlistDataReturn {
  const { getAccessToken } = useAuth();

  const [waitlistData, setWaitlistData] = useState<WaitlistData | null>(null);
  const [topUsers, setTopUsers] = useState<TopUser[]>([]);
  const [leaderboardPage, setLeaderboardPage] = useState(1);
  const [leaderboardTotalPages, setLeaderboardTotalPages] = useState(10);
  const [leaderboardTab, setLeaderboardTab] = useState<LeaderboardTab>('leaderboard');
  const [leaderboardLastFetched, setLeaderboardLastFetched] = useState<number>(0);
  const [previousRank, setPreviousRank] = useState<number | null>(null);
  const [showRankImprovement, setShowRankImprovement] = useState(false);

  const getPointsTypeForTab = useCallback(
    (tab: LeaderboardTab) => (tab === 'leaderboard' ? 'total' : 'invite'),
    []
  );

  const fetchWaitlistPosition = useCallback(
    async (fetchUserId: string, skipLeaderboard = false): Promise<boolean> => {
      try {
        const now = Date.now();
        const shouldFetchLeaderboard =
          !skipLeaderboard && now - leaderboardLastFetched > LEADERBOARD_CACHE_DURATION;
        const pointsType = getPointsTypeForTab(leaderboardTab);

        const token = await getAccessToken();

        const requests: Promise<Response>[] = [
          fetch('/api/waitlist/position', {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
          }),
        ];

        if (shouldFetchLeaderboard) {
          requests.push(
            fetch(`/api/waitlist/leaderboard?page=1&limit=10&pointsType=${pointsType}`)
          );
        }

        const results = await Promise.allSettled(requests);
        const positionResult = results[0];
        const leaderboardResult = shouldFetchLeaderboard ? results[1] : null;

        if (!positionResult) {
          logger.error('Position result is undefined', { userId: fetchUserId }, 'useWaitlistData');
          return false;
        }

        if (positionResult.status === 'fulfilled') {
          const positionResponse = positionResult.value;
          if (!positionResponse.ok) {
            const errorText = await positionResponse.text();
            logger.error(
              'Failed to fetch waitlist position',
              { userId: fetchUserId, status: positionResponse.status, errorText },
              'useWaitlistData'
            );
            return false;
          }

          const data = await positionResponse.json();

          if (data.position === null) {
            return false;
          }

          // Check if rank improved
          if (previousRank !== null && data.leaderboardRank < previousRank) {
            setShowRankImprovement(true);
            setTimeout(() => setShowRankImprovement(false), 5000);
          }
          setPreviousRank(data.leaderboardRank);

          setWaitlistData(data);
        } else {
          logger.error(
            'Failed to fetch waitlist position (network error)',
            {
              userId: fetchUserId,
              error:
                positionResult.reason instanceof Error
                  ? positionResult.reason.message
                  : String(positionResult.reason),
            },
            'useWaitlistData'
          );
          return false;
        }

        if (leaderboardResult && leaderboardResult.status === 'fulfilled') {
          const leaderboardResponse = leaderboardResult.value;
          if (leaderboardResponse.ok) {
            try {
              const leaderboardData = await leaderboardResponse.json();
              setTopUsers(leaderboardData.leaderboard || []);
              setLeaderboardTotalPages(leaderboardData.totalPages || 10);
              setLeaderboardLastFetched(now);
              setLeaderboardPage(1);
            } catch (parseError) {
              logger.warn(
                'Failed to parse leaderboard response',
                {
                  error: parseError instanceof Error ? parseError.message : String(parseError),
                },
                'useWaitlistData'
              );
            }
          }
        }

        return true;
      } catch (error) {
        logger.error(
          'Error fetching waitlist position',
          {
            userId: fetchUserId,
            error: error instanceof Error ? error.message : String(error),
          },
          'useWaitlistData'
        );
        return false;
      }
    },
    [leaderboardLastFetched, leaderboardTab, getAccessToken, previousRank, getPointsTypeForTab]
  );

  const fetchLeaderboardPage = useCallback(
    async (page: number, tab: LeaderboardTab = leaderboardTab): Promise<boolean> => {
      const pointsType = getPointsTypeForTab(tab);
      try {
        const response = await fetch(
          `/api/waitlist/leaderboard?page=${page}&limit=10&pointsType=${pointsType}`
        );
        if (!response.ok) {
          logger.warn(
            'Failed to fetch leaderboard page',
            { page, status: response.status },
            'useWaitlistData'
          );
          return false;
        }

        const data = await response.json();
        setTopUsers(data.leaderboard || []);
        setLeaderboardTotalPages(data.totalPages || 10);
        setLeaderboardLastFetched(Date.now());
        return true;
      } catch (error) {
        logger.error(
          'Error fetching leaderboard page',
          {
            page,
            error: error instanceof Error ? error.message : String(error),
          },
          'useWaitlistData'
        );
        return false;
      }
    },
    [leaderboardTab, getPointsTypeForTab]
  );

  const refreshWaitlistData = useCallback(async () => {
    if (userId) {
      await fetchWaitlistPosition(userId, false);
    }
  }, [userId, fetchWaitlistPosition]);

  // Initial fetch when user is authenticated and profile complete
  useEffect(() => {
    if (!authenticated || !userId || !profileComplete || !username) return;

    void fetchWaitlistPosition(userId);
  }, [authenticated, userId, profileComplete, username, fetchWaitlistPosition]);

  // Polling for real-time updates
  useEffect(() => {
    if (!authenticated || !userId || !waitlistData) return;

    const refreshInterval = setInterval(() => {
      void fetchWaitlistPosition(userId, true);
    }, POLL_INTERVAL);

    return () => clearInterval(refreshInterval);
  }, [authenticated, userId, waitlistData, fetchWaitlistPosition]);

  return {
    waitlistData,
    topUsers,
    leaderboardPage,
    leaderboardTotalPages,
    leaderboardTab,
    showRankImprovement,
    setLeaderboardPage,
    setLeaderboardTab,
    fetchWaitlistPosition,
    fetchLeaderboardPage,
    refreshWaitlistData,
  };
}
