import type { AgentTemplate } from '@babylon/agents/client';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';

const STORAGE_KEY = 'babylon_agent_draft';

/**
 * Name component pools for generating unique agent names
 * Total combinations: 76 prefixes × 41 suffixes × 9000 numbers = 28,044,000+
 */
const NAME_PREFIXES = [
  // Greek letters
  'Alpha',
  'Beta',
  'Gamma',
  'Delta',
  'Epsilon',
  'Zeta',
  'Eta',
  'Theta',
  'Iota',
  'Kappa',
  'Lambda',
  'Mu',
  'Nu',
  'Xi',
  'Omicron',
  'Pi',
  'Rho',
  'Sigma',
  'Tau',
  'Upsilon',
  'Phi',
  'Chi',
  'Psi',
  'Omega',
  // Tech/Cyber
  'Quantum',
  'Neo',
  'Cyber',
  'Nexus',
  'Apex',
  'Vertex',
  'Pulse',
  'Flux',
  'Vector',
  'Helix',
  'Prism',
  'Matrix',
  'Cipher',
  'Binary',
  'Neural',
  // Nature/Elements
  'Nova',
  'Solar',
  'Lunar',
  'Stellar',
  'Cosmic',
  'Astral',
  'Phoenix',
  'Storm',
  'Thunder',
  'Frost',
  'Ember',
  'Shadow',
  'Dawn',
  'Dusk',
  // Power/Status
  'Iron',
  'Steel',
  'Titan',
  'Atlas',
  'Orion',
  'Vortex',
  'Blaze',
  'Spark',
  'Echo',
  'Phantom',
  'Specter',
  'Raven',
  'Falcon',
  'Hawk',
  'Eagle',
  // Abstract
  'Zen',
  'Aura',
  'Axiom',
  'Lumen',
  'Photon',
  'Quark',
  'Volt',
  'Arc',
];

const NAME_SUFFIXES = [
  // Role-based
  'Trader',
  'Agent',
  'Bot',
  'AI',
  'Mind',
  'Brain',
  'Sage',
  'Oracle',
  // Technical
  'Core',
  'Node',
  'Edge',
  'Prime',
  'Pro',
  'Max',
  'Ultra',
  'Plus',
  'X',
  'Zero',
  'One',
  'Protocol',
  'System',
  'Engine',
  'Logic',
  // Abstract
  'Flow',
  'Wave',
  'Sync',
  'Link',
  'Net',
  'Hub',
  'Lab',
  'Works',
  'Force',
  'Drive',
  'Pulse',
  'Signal',
  'Stream',
  'Grid',
  'Mesh',
];

const generateAgentName = (): string => {
  const prefix =
    NAME_PREFIXES[Math.floor(Math.random() * NAME_PREFIXES.length)]!;
  const suffix =
    NAME_SUFFIXES[Math.floor(Math.random() * NAME_SUFFIXES.length)]!;
  const number = Math.floor(Math.random() * 9000) + 1000;
  return `${prefix}${suffix}-${number}`;
};

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
      // Check for saved draft
      const savedData = localStorage.getItem(STORAGE_KEY);
      if (savedData) {
        const parsed = JSON.parse(savedData);
        if (parsed.profileData?.displayName && parsed.profileData?.username) {
          setProfileData(parsed.profileData);
        }
        if (parsed.agentData?.system) {
          setAgentData(parsed.agentData);
        }
        if (parsed.profileData?.displayName && parsed.profileData?.username) {
          setIsInitialized(true);
          return;
        }
      }

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
      const agentName = generateAgentName();

      // Process template with agent name
      const processedTemplate = {
        ...template,
        name: template.name.replace('{{agentName}}', agentName),
        system: template.system.replace(/{{agentName}}/g, agentName),
        personality: template.personality.replace(/{{agentName}}/g, agentName),
        tradingStrategy: template.tradingStrategy.replace(
          /{{agentName}}/g,
          agentName
        ),
      };

      // Random images
      const randomPfp = Math.floor(Math.random() * TOTAL_PROFILE_PICTURES) + 1;
      const randomBanner =
        Math.floor(Math.random() * TOTAL_PROFILE_PICTURES) + 1;

      setProfileData({
        username: agentName.toLowerCase().replace(/\s+/g, ''),
        displayName: processedTemplate.name,
        bio: processedTemplate.description,
        profileImageUrl: `/assets/user-profiles/profile-${randomPfp}.jpg`,
        coverImageUrl: `/assets/user-banners/banner-${randomBanner}.jpg`,
      });

      setAgentData({
        system: processedTemplate.system,
        personality: processedTemplate.bio,
        tradingStrategy: processedTemplate.tradingStrategy,
        initialDeposit: 100,
      });

      setIsInitialized(true);
    };

    loadTemplate();
  }, []);

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
