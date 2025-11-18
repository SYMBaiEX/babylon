import { useEffect, useState } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { useAuth } from '@/hooks/useAuth';

/**
 * Represents unread message counts.
 */
interface UnreadCounts {
  /** Number of pending DM requests from anonymous users */
  pendingDMs: number;
  /** Whether there are new messages in existing chats */
  hasNewMessages: boolean;
}

/**
 * Hook for efficiently polling unread and pending message counts.
 * 
 * Polls the API every 30 seconds to check for:
 * - Pending DM requests from anonymous users
 * - New messages in existing chats
 * 
 * Returns counts suitable for displaying notification badges. Only polls
 * when the user is authenticated. Automatically stops polling on unmount
 * or when user logs out.
 * 
 * @returns An object containing:
 * - `pendingDMs`: Number of pending DM requests
 * - `hasNewMessages`: Whether there are new messages in existing chats
 * - `totalUnread`: Combined unread count (pendingDMs + 1 if hasNewMessages)
 * - `isLoading`: Whether counts are currently being fetched
 * 
 * @example
 * ```tsx
 * const { pendingDMs, hasNewMessages, totalUnread } = useUnreadMessages();
 * 
 * return (
 *   <Badge>
 *     {totalUnread > 0 && totalUnread}
 *   </Badge>
 * );
 * ```
 */
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
      const token = await getAccessToken();
      if (!token) return;

      const response = await fetch('/api/chats/unread-count', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        setIsLoading(false);
        return;
      }

      const data = await response.json();
      setCounts({
        pendingDMs: data.pendingDMs || 0,
        hasNewMessages: data.hasNewMessages || false,
      });
      setIsLoading(false);
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

