'use client';

import { Loader2 } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { AgentSettingsSidebar } from './AgentSettingsSidebar';

interface AgentSettingsData {
  id: string;
  name: string;
  description?: string;
  profileImageUrl?: string;
  system: string;
  bio?: string[];
  personality?: string;
  tradingStrategy?: string;
  modelTier: 'free' | 'pro';
  isActive: boolean;
  autonomousEnabled: boolean;
  autonomousPosting?: boolean;
  autonomousCommenting?: boolean;
  autonomousDMs?: boolean;
  autonomousGroupChats?: boolean;
  a2aEnabled?: boolean;
}

interface AgentSettingsPanelProps {
  agentId: string;
  onAgentUpdated?: () => void;
}

/**
 * Panel component that fetches and displays agent settings.
 * Used inside the RightSidebar tabs.
 */
export function AgentSettingsPanel({
  agentId,
  onAgentUpdated,
}: AgentSettingsPanelProps) {
  const { getAccessToken } = useAuth();
  const [agent, setAgent] = useState<AgentSettingsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch agent data with optional abort signal to prevent state updates after unmount
  const fetchAgent = useCallback(
    async (signal?: AbortSignal): Promise<{ success: boolean } | undefined> => {
      setLoading(true);
      setError(null);

      const token = await getAccessToken();
      if (!token) {
        setError('Not authenticated');
        setLoading(false);
        return undefined;
      }

      let res: Response | undefined;
      try {
        res = await fetch(`/api/agents/${agentId}`, {
          headers: { Authorization: `Bearer ${token}` },
          signal,
        });
      } catch (fetchError) {
        // Fetch threw (network error, aborted, etc.)
        if (!signal?.aborted) {
          setError('Failed to fetch agent');
          setLoading(false);
        }
        return undefined;
      } finally {
        // Ensure loading is cleared even if fetch throws
        if (!signal?.aborted) setLoading(false);
      }

      // Don't update state if request was aborted
      if (signal?.aborted) return undefined;

      // Check if res is defined and ok
      if (!res || !res.ok) {
        setError('Failed to fetch agent');
        return undefined;
      }

      const data = (await res.json()) as { agent: AgentSettingsData };
      if (!signal?.aborted) setAgent(data.agent);
      return { success: true };
    },
    [agentId, getAccessToken]
  );

  // Store AbortController ref for update calls
  const updateControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetchAgent(controller.signal);
    return () => {
      controller.abort();
      // Also abort any pending update requests
      updateControllerRef.current?.abort();
    };
  }, [fetchAgent]);

  // Handle update from AgentSettings
  const handleUpdate = useCallback(async () => {
    // Abort previous update request if still pending
    updateControllerRef.current?.abort();
    const controller = new AbortController();
    updateControllerRef.current = controller;
    const result = await fetchAgent(controller.signal);
    // Only call onAgentUpdated after successful refresh
    if (result?.success) {
      onAgentUpdated?.();
    }
  }, [fetchAgent, onAgentUpdated]);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !agent) {
    return (
      <div className="p-4 text-center text-muted-foreground">
        {error || 'Agent not found'}
      </div>
    );
  }

  return <AgentSettingsSidebar agent={agent} onUpdate={handleUpdate} />;
}
