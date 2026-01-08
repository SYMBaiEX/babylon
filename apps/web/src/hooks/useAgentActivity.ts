/**
 * Hook for real-time agent activity updates.
 *
 * Combines SSE real-time updates with initial data fetching and polling fallback.
 * Provides a unified interface for displaying agent activity in the UI.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { type Channel, useSSEChannel } from './useSSE';

// Activity types matching the API response
interface AgentInfo {
  id: string;
  name: string;
  profileImageUrl: string | null;
}

interface TradeActivityData {
  tradeId: string;
  marketType: 'prediction' | 'perp';
  marketId: string | null;
  ticker: string | null;
  marketQuestion: string | null;
  action: string;
  side: string | null;
  amount: number;
  price: number;
  pnl: number | null;
  reasoning: string | null;
}

interface PostActivityData {
  postId: string;
  contentPreview: string;
}

interface CommentActivityData {
  commentId: string;
  postId: string;
  contentPreview: string;
  parentCommentId: string | null;
}

interface MessageActivityData {
  messageId: string;
  chatId: string;
  recipientId: string | null;
  contentPreview: string;
}

export interface AgentActivity {
  type: 'trade' | 'post' | 'comment' | 'message';
  id: string;
  timestamp: string;
  agent?: AgentInfo;
  data:
    | TradeActivityData
    | PostActivityData
    | CommentActivityData
    | MessageActivityData;
}

interface AgentActivityResponse {
  success: boolean;
  agentId?: string;
  agentName?: string;
  activities: AgentActivity[];
  pagination: {
    limit: number;
    count: number;
    hasMore: boolean;
  };
}

interface UseAgentActivityOptions {
  agentId?: string;
  limit?: number;
  type?: 'all' | 'trade' | 'post' | 'comment';
  pollInterval?: number;
  enableSSE?: boolean;
}

interface UseAgentActivityReturn {
  activities: AgentActivity[];
  isLoading: boolean;
  error: Error | null;
  isConnected: boolean;
  hasMore: boolean;
  refresh: () => Promise<void>;
}

/**
 * Hook for fetching and subscribing to agent activity updates.
 *
 * @param options - Configuration options
 * @param options.agentId - Specific agent ID to fetch activity for (optional, fetches all if not provided)
 * @param options.limit - Maximum number of activities to fetch (default: 50)
 * @param options.type - Filter by activity type (default: 'all')
 * @param options.pollInterval - Polling interval in ms for fallback updates (default: 30000)
 * @param options.enableSSE - Whether to enable real-time SSE updates (default: true)
 *
 * @returns Activity data, loading state, error state, and connection status
 *
 * @example
 * ```tsx
 * // Get activity for a specific agent
 * const { activities, isLoading, isConnected } = useAgentActivity({
 *   agentId: 'agent-123',
 *   limit: 20,
 * });
 *
 * // Get activity for all user's agents
 * const { activities, isLoading } = useAgentActivity({ limit: 50 });
 * ```
 */
export function useAgentActivity(
  options: UseAgentActivityOptions = {}
): UseAgentActivityReturn {
  const {
    agentId,
    limit = 50,
    type = 'all',
    pollInterval = 30000,
    enableSSE = true,
  } = options;

  // State for fetched data
  const [fetchedActivities, setFetchedActivities] = useState<AgentActivity[]>(
    []
  );
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [hasMore, setHasMore] = useState(false);

  // Track real-time activities that haven't been merged into fetched data yet
  const [realtimeActivities, setRealtimeActivities] = useState<AgentActivity[]>(
    []
  );

  // Ref to track activities we've already seen to prevent duplicates
  const seenActivityIds = useRef(new Set<string>());

  // Build the API URL
  const apiUrl = useMemo(() => {
    const base = agentId
      ? `/api/agents/${agentId}/activity`
      : '/api/agents/activity';
    const params = new URLSearchParams();
    params.set('limit', String(limit));
    params.set('type', type);
    return `${base}?${params.toString()}`;
  }, [agentId, limit, type]);

  // Fetch function
  const fetchActivities = useCallback(async () => {
    setError(null);
    const response = await fetch(apiUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch activity: ${response.statusText}`);
    }
    const data: AgentActivityResponse = await response.json();

    // Update seen IDs
    for (const activity of data.activities) {
      seenActivityIds.current.add(activity.id);
    }

    setFetchedActivities(data.activities);
    setHasMore(data.pagination?.hasMore ?? false);
    setIsLoading(false);
  }, [apiUrl]);

  // Initial fetch and polling
  useEffect(() => {
    setIsLoading(true);
    fetchActivities().catch((err: Error) => {
      setError(err);
      setIsLoading(false);
    });

    // Set up polling
    const intervalId = setInterval(() => {
      fetchActivities().catch((err: Error) => {
        console.error('Failed to poll agent activity:', err);
      });
    }, pollInterval);

    return () => clearInterval(intervalId);
  }, [fetchActivities, pollInterval]);

  // Handle SSE messages for real-time updates
  const handleSSEMessage = useCallback(
    (message: Record<string, unknown>) => {
      const eventType = message.type as string;
      if (!eventType?.startsWith('agent_') || !message.activity) {
        return;
      }

      const activity = message.activity as {
        type: AgentActivity['type'];
        agentId: string;
        agentName: string;
        timestamp: number;
        data: AgentActivity['data'];
      };

      // Generate unique ID based on activity type and content
      let activityId: string;
      const activityData = activity.data;
      if (activity.type === 'trade' && 'tradeId' in activityData) {
        activityId = activityData.tradeId;
      } else if (activity.type === 'post' && 'postId' in activityData) {
        activityId = activityData.postId;
      } else if (activity.type === 'comment' && 'commentId' in activityData) {
        activityId = activityData.commentId;
      } else if (activity.type === 'message' && 'messageId' in activityData) {
        activityId = activityData.messageId;
      } else {
        activityId = `${activity.type}-${activity.timestamp}`;
      }

      // Skip if we've already seen this activity
      if (seenActivityIds.current.has(activityId)) {
        return;
      }

      seenActivityIds.current.add(activityId);

      const newActivity: AgentActivity = {
        type: activity.type,
        id: activityId,
        timestamp: new Date(activity.timestamp).toISOString(),
        agent: {
          id: activity.agentId,
          name: activity.agentName,
          profileImageUrl: null,
        },
        data: activity.data,
      };

      setRealtimeActivities((prev) => [newActivity, ...prev].slice(0, limit));
    },
    [limit]
  );

  // Subscribe to agent SSE channel
  const sseChannel: Channel | null =
    enableSSE && agentId ? `agent:${agentId}` : null;
  const { isConnected } = useSSEChannel(sseChannel, handleSSEMessage);

  // Merge real-time activities with fetched data
  const activities = useMemo(() => {
    // Combine and deduplicate
    const allActivities = [...realtimeActivities, ...fetchedActivities];
    const uniqueActivities = new Map<string, AgentActivity>();

    for (const activity of allActivities) {
      if (!uniqueActivities.has(activity.id)) {
        uniqueActivities.set(activity.id, activity);
      }
    }

    // Sort by timestamp descending and limit
    return Array.from(uniqueActivities.values())
      .sort(
        (a, b) =>
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      )
      .slice(0, limit);
  }, [fetchedActivities, realtimeActivities, limit]);

  // Refresh function
  const refresh = useCallback(async () => {
    setRealtimeActivities([]);
    setIsLoading(true);
    await fetchActivities().catch((err: Error) => {
      setError(err);
    });
    setIsLoading(false);
  }, [fetchActivities]);

  return {
    activities,
    isLoading,
    error,
    isConnected,
    hasMore,
    refresh,
  };
}

/**
 * Hook for subscribing to real-time activity for all of a user's agents.
 *
 * This is a convenience wrapper that fetches activity from all agents
 * and provides a unified view without needing to specify agent IDs.
 */
export function useAllAgentsActivity(
  options: Omit<UseAgentActivityOptions, 'agentId'> = {}
): UseAgentActivityReturn {
  return useAgentActivity(options);
}
