'use client';

import { Loader2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { AgentSettings } from '@/components/agents/AgentSettings';
import { useAuth } from '@/hooks/useAuth';

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

  // Fetch agent data
  const fetchAgent = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const token = await getAccessToken();
      if (!token) {
        setError('Not authenticated');
        return;
      }

      const res = await fetch(`/api/agents/${agentId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        throw new Error('Failed to fetch agent');
      }

      const data = await res.json();
      setAgent(data.agent);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load agent');
    } finally {
      setLoading(false);
    }
  }, [agentId, getAccessToken]);

  useEffect(() => {
    fetchAgent();
  }, [fetchAgent]);

  // Handle update from AgentSettings
  const handleUpdate = useCallback(() => {
    fetchAgent();
    onAgentUpdated?.();
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

  return (
    <div className="p-4">
      <AgentSettings agent={agent} onUpdate={handleUpdate} />
    </div>
  );
}
