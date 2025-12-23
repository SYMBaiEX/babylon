import type { AgentTemplate } from '@babylon/agents/client';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';

const STORAGE_KEY = 'babylon_agent_draft';

export interface ProfileFormData {
  username: string;
  displayName: string;
  bio: string;
  profileImageUrl: string;
  coverImageUrl: string;
}

export interface AgentFormData {
  system: string;
  personality: string;
  tradingStrategy: string;
  initialDeposit: number;
}

interface UseAgentFormResult {
  profileData: ProfileFormData;
  agentData: AgentFormData;
  isInitialized: boolean;
  generatingField: string | null;
  updateProfileField: (field: keyof ProfileFormData, value: string) => void;
  updateAgentField: (
    field: keyof AgentFormData,
    value: string | number
  ) => void;
  setProfileData: React.Dispatch<React.SetStateAction<ProfileFormData>>;
  regenerateField: (field: string) => Promise<void>;
  clearDraft: () => void;
}

const TOTAL_PROFILE_PICTURES = 100;

/**
 * Hook for managing agent creation form state
 *
 * Features:
 * - Auto-loads random template on init
 * - Persists draft to localStorage
 * - AI-powered field regeneration
 * - Profile and agent config state management
 */
export function useAgentForm(): UseAgentFormResult {
  const { getAccessToken } = useAuth();

  const [profileData, setProfileData] = useState<ProfileFormData>({
    username: '',
    displayName: '',
    bio: '',
    profileImageUrl: '',
    coverImageUrl: '',
  });

  const [agentData, setAgentData] = useState<AgentFormData>({
    system: '',
    personality: '',
    tradingStrategy: '',
    initialDeposit: 100,
  });

  const [isInitialized, setIsInitialized] = useState(false);
  const [generatingField, setGeneratingField] = useState<string | null>(null);

  // Load template on mount
  useEffect(() => {
    const loadTemplate = async () => {
      // Clear any old draft - we want fresh template with name modal
      localStorage.removeItem(STORAGE_KEY);

      // Load random template
      const indexResponse = await fetch('/api/agent-templates');
      if (!indexResponse.ok) {
        console.error('Failed to load template index');
        setIsInitialized(true);
        return;
      }

      const index = (await indexResponse.json()) as { templates: string[] };
      if (!index.templates || index.templates.length === 0) {
        setIsInitialized(true);
        return;
      }

      const randomTemplate =
        index.templates[Math.floor(Math.random() * index.templates.length)]!;
      const templateResponse = await fetch(
        `/api/agent-templates/${randomTemplate}`
      );

      if (!templateResponse.ok) {
        setIsInitialized(true);
        return;
      }

      const template = (await templateResponse.json()) as AgentTemplate;

      // Random images
      const randomPfp = Math.floor(Math.random() * TOTAL_PROFILE_PICTURES) + 1;
      const randomBanner =
        Math.floor(Math.random() * TOTAL_PROFILE_PICTURES) + 1;

      // Update profile data
      setProfileData((prev) => ({
        username: prev.username || '',
        displayName: prev.displayName || '',
        bio: template.description,
        profileImageUrl:
          prev.profileImageUrl ||
          `/assets/user-profiles/profile-${randomPfp}.jpg`,
        coverImageUrl:
          prev.coverImageUrl ||
          `/assets/user-banners/banner-${randomBanner}.jpg`,
      }));

      // Keep {{agentName}} placeholder - will be replaced when user sets their name
      setAgentData({
        system: template.system,
        personality: template.bio,
        tradingStrategy: template.tradingStrategy,
        initialDeposit: 100,
      });

      setIsInitialized(true);
    };

    loadTemplate();
  }, []);

  // Replace {{agentName}} placeholder with user's name when both are available
  useEffect(() => {
    if (!agentData.system || !profileData.displayName) return;
    if (!agentData.system.includes('{{agentName}}')) return;

    setAgentData((prev) => ({
      ...prev,
      system: prev.system.replace(/\{\{agentName\}\}/g, profileData.displayName),
      personality: prev.personality.replace(
        /\{\{agentName\}\}/g,
        profileData.displayName
      ),
      tradingStrategy: prev.tradingStrategy.replace(
        /\{\{agentName\}\}/g,
        profileData.displayName
      ),
    }));
  }, [agentData.system, profileData.displayName]);

  // Auto-save to localStorage
  useEffect(() => {
    if (!isInitialized) return;
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ profileData, agentData })
    );
  }, [profileData, agentData, isInitialized]);

  const updateProfileField = useCallback(
    (field: keyof ProfileFormData, value: string) => {
      setProfileData((prev) => ({ ...prev, [field]: value }));

      // When displayName is set, replace {{agentName}} placeholder
      if (field === 'displayName' && value) {
        setAgentData((prevAgent) => {
          if (!prevAgent.system.includes('{{agentName}}')) return prevAgent;

          return {
            ...prevAgent,
            system: prevAgent.system.replace(/\{\{agentName\}\}/g, value),
            personality: prevAgent.personality.replace(/\{\{agentName\}\}/g, value),
            tradingStrategy: prevAgent.tradingStrategy.replace(
              /\{\{agentName\}\}/g,
              value
            ),
          };
        });
      }
    },
    []
  );

  const updateAgentField = useCallback(
    (field: keyof AgentFormData, value: string | number) => {
      setAgentData((prev) => ({ ...prev, [field]: value }));
    },
    []
  );

  const regenerateField = useCallback(
    async (field: string) => {
      setGeneratingField(field);

      const token = await getAccessToken();
      if (!token) {
        toast.error('Authentication required');
        setGeneratingField(null);
        return;
      }

      const response = await fetch('/api/agents/generate-field', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fieldName: field,
          currentValue: agentData[field as keyof AgentFormData],
          context: {
            name: profileData.displayName,
            description: profileData.bio,
            system: agentData.system,
            personality: agentData.personality,
            tradingStrategy: agentData.tradingStrategy,
          },
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        toast.error(errorData.error || 'Failed to generate field');
        setGeneratingField(null);
        return;
      }

      const result = await response.json();
      const strippedValue = (result.value as string)
        .replace(/<think>[\s\S]*?<\/think>/gi, '')
        .trim();

      if (field === 'personality') {
        const personalityLines = strippedValue
          .split('|')
          .map((s: string) => s.trim())
          .filter((s: string) => s);
        updateAgentField('personality', personalityLines.join('\n'));
      } else {
        updateAgentField(
          field as keyof AgentFormData,
          strippedValue.replace(/\n\n+/g, '\n')
        );
      }

      toast.success(`Regenerated ${field}!`);
      setGeneratingField(null);
    },
    [agentData, profileData, getAccessToken, updateAgentField]
  );

  const clearDraft = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  return {
    profileData,
    agentData,
    isInitialized,
    generatingField,
    updateProfileField,
    updateAgentField,
    setProfileData,
    regenerateField,
    clearDraft,
  };
}
