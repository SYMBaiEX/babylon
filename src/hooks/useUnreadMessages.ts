/**
 * Hook for efficiently polling unread/pending message counts
 * 
 * Polls every 30 seconds to check for:
 * - Pending DM requests from anons
 * - New messages in existing chats
 * 
 * Returns counts for displaying notification badges
 */

import { useEffect, useState } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { useAuth } from '@/hooks/useAuth';

interface UnreadCounts {
  pendingDMs: number;
  hasNewMessages: boolean;
}

export function useUnreadMessages() {
  const { authenticated } = useAuth();
  const { getAccessToken } = usePrivy();
  const [counts, setCounts] = useState<UnreadCounts>({
    pendingDMs: 0,
    hasNewMessages: false,
  });
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    // Only poll if user is authenticated
    if (!authenticated) {
      setCounts({ pendingDMs: 0, hasNewMessages: false });
      return;
    }

    // Fetch unread counts
    const fetchCounts = async () => {
      try {
        const token = await getAccessToken();
        if (!token) return;

        const response = await fetch('/api/chats/unread-count', {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!response.ok) {
          console.error('Failed to fetch unread counts:', response.status);
          return;
        }

        const data = await response.json();
        setCounts({
          pendingDMs: data.pendingDMs || 0,
          hasNewMessages: data.hasNewMessages || false,
        });
      } catch (error) {
        console.error('Error fetching unread counts:', error);
      } finally {
        setIsLoading(false);
      }
    };

    // Initial fetch
    setIsLoading(true);
    fetchCounts();

    // Poll every 30 seconds
    const interval = setInterval(fetchCounts, 30000);

    return () => clearInterval(interval);
  }, [authenticated, getAccessToken]);

  return {
    ...counts,
    totalUnread: counts.pendingDMs + (counts.hasNewMessages ? 1 : 0),
    isLoading,
  };
}

