import type { AgentTemplate } from '@babylon/agents/client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';

const STORAGE_KEY = 'babylon_agent_draft';

// Agent name generation
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

const generateAgentName = (): { username: string; displayName: string } => {
  const prefix =
    NAME_PREFIXES[Math.floor(Math.random() * NAME_PREFIXES.length)]!;
  const suffix =
    NAME_SUFFIXES[Math.floor(Math.random() * NAME_SUFFIXES.length)]!;

  // Use 6-digit number for better uniqueness at scale
  // Range: 100000-999999 = 900,000 possible numbers
  // Combined with ~2,275 name combos = ~2 billion unique usernames
  const number = Math.floor(Math.random() * 900000) + 100000;

  const displayName = `${prefix} ${suffix}`;
  const username = `${prefix.toLowerCase()}${suffix.toLowerCase()}${number}`;

  return { username, displayName };
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

  // Generate default agent name on mount
  const [initialName] = useState(() => generateAgentName());

  const [profileData, setProfileData] = useState<ProfileFormData>({
    username: initialName.username,
    displayName: initialName.displayName,
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

  // Track the name currently used in prompts (for replacement when user changes it)
  const nameInPromptsRef = useRef<string>(initialName.displayName);

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

      // Update profile data (preserve generated name)
      setProfileData((prev) => ({
        username: prev.username,
        displayName: prev.displayName,
        bio: template.description,
        profileImageUrl:
          prev.profileImageUrl ||
          `/assets/user-profiles/profile-${randomPfp}.jpg`,
        coverImageUrl:
          prev.coverImageUrl ||
          `/assets/user-banners/banner-${randomBanner}.jpg`,
      }));

      // Replace {{agentName}} placeholder with generated display name
      const displayName = initialName.displayName;
      setAgentData((prev) => ({
        system: template.system.replace(/\{\{agentName\}\}/g, displayName),
        personality: template.bio.replace(/\{\{agentName\}\}/g, displayName),
        tradingStrategy: template.tradingStrategy.replace(
          /\{\{agentName\}\}/g,
          displayName
        ),
        initialDeposit: prev.initialDeposit,
      }));

      setIsInitialized(true);
    };

    loadTemplate();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initialName is stable (from useState initializer), runs once on mount
  }, []);

  // Note: When displayName changes, we find and replace the old name with the new name
  // in the system prompt, personality, and trading strategy fields.

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

      // When displayName changes, replace the old name with new name in prompts
      if (field === 'displayName' && value) {
        const oldName = nameInPromptsRef.current;

        // Only replace if there's a previous name and it's different
        if (oldName && oldName !== value) {
          const escapeRegex = (str: string) =>
            str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          // Use word boundaries to avoid replacing substrings (e.g., "Nova" in "Innovative")
          const oldNameRegex = new RegExp(`\\b${escapeRegex(oldName)}\\b`, 'g');

          setAgentData((prevAgent) => ({
            ...prevAgent,
            system: prevAgent.system.replace(oldNameRegex, value),
            personality: prevAgent.personality.replace(oldNameRegex, value),
            tradingStrategy: prevAgent.tradingStrategy.replace(
              oldNameRegex,
              value
            ),
          }));
        }

        // Update the tracked name
        nameInPromptsRef.current = value;
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
      const value = (result.value as string).trim();

      if (field === 'personality') {
        const personalityLines = value
          .split('|')
          .map((s: string) => s.trim())
          .filter((s: string) => s);
        updateAgentField('personality', personalityLines.join('\n'));
      } else {
        updateAgentField(
          field as keyof AgentFormData,
          value.replace(/\n\n+/g, '\n')
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
    regenerateField,
    clearDraft,
  };
}
