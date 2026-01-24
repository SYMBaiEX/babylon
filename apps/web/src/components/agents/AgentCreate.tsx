/**
 * Agent Create Component
 *
 * @description Reusable multi-step form for creating a new agent.
 * Used in both the standalone create page and the Command Center.
 */

'use client';

import { cn } from '@babylon/shared';
import { ArrowLeft, Bot, Loader2, Wallet } from 'lucide-react';
import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import { Skeleton } from '@/components/shared/Skeleton';
import { useAuth } from '@/hooks/useAuth';
import { useWalletBalance } from '@/hooks/useWalletBalance';
import {
  AgentConfigForm,
  type AgentSettingsData,
  AgentSettingsStep,
  AgentSetupModal,
  ProfilePreviewCard,
} from '@/app/agents/create/components';
import { useAgentForm } from '@/app/agents/create/hooks';

const TOTAL_PROFILE_PICTURES = 100;
const TOTAL_BANNERS = 100;
const DEFAULT_MAX_DEPOSIT = 10000;

enum Step {
  Profile = 1,
  Prompts = 2,
  Settings = 3,
}

interface AgentCreateProps {
  /** Called when back is pressed on step 1 */
  onBack?: () => void;
  /** Back button label for step 1 */
  backLabel?: string;
  /** Called when agent is successfully created */
  onSuccess?: (agent: { id: string; username?: string }) => void;
  /** Whether to show in compact mode (no page padding) */
  compact?: boolean;
}

/**
 * Agent Create Component
 *
 * Multi-step form for creating a new agent.
 * Can be used standalone or embedded in other views.
 */
export function AgentCreate({
  onBack,
  backLabel = 'Back',
  onSuccess,
  compact = false,
}: AgentCreateProps) {
  const { authenticated, getAccessToken, user: authUser } = useAuth();

  // Fetch balance fresh from API
  const { balance, loading: balanceLoading } = useWalletBalance(authUser?.id, {
    enabled: authenticated,
  });

  const [currentStep, setCurrentStep] = useState<Step>(Step.Profile);
  const [isCreating, setIsCreating] = useState(false);

  // Settings state for step 3
  const [settingsData, setSettingsData] = useState<AgentSettingsData>({
    modelTier: 'free',
    autonomousEnabled: true,
    autonomousPosting: false,
    autonomousCommenting: false,
    autonomousDMs: false,
    autonomousGroupChats: false,
    a2aEnabled: true,
  });

  const {
    profileData,
    agentData,
    isInitialized,
    generatingField,
    updateProfileField,
    updateAgentField,
    regenerateField,
    clearDraft,
  } = useAgentForm();

  // Handle profile modal save (step 1 -> step 2)
  const handleProfileSave = useCallback(
    (data: typeof profileData) => {
      if (data.displayName !== profileData.displayName) {
        updateProfileField('displayName', data.displayName);
      }
      if (data.username !== profileData.username) {
        updateProfileField('username', data.username);
      }
      if (data.bio !== profileData.bio) {
        updateProfileField('bio', data.bio);
      }
      if (data.profileImageUrl !== profileData.profileImageUrl) {
        updateProfileField('profileImageUrl', data.profileImageUrl);
      }
      if (data.coverImageUrl !== profileData.coverImageUrl) {
        updateProfileField('coverImageUrl', data.coverImageUrl);
      }
      setCurrentStep(Step.Prompts);
    },
    [profileData, updateProfileField]
  );

  // Handle continue from step 2 -> step 3
  const handleContinueToSettings = useCallback(() => {
    if (!agentData.system.trim()) {
      toast.error('System prompt is required');
      return;
    }
    setCurrentStep(Step.Settings);
  }, [agentData.system]);

  // User balance for max deposit
  const maxDeposit = Math.max(
    100,
    Math.min(balance || DEFAULT_MAX_DEPOSIT, DEFAULT_MAX_DEPOSIT)
  );

  // Cycle through pre-made images
  const cycleImage = useCallback(
    (type: 'profile' | 'cover', direction: 'next' | 'prev') => {
      const basePath =
        type === 'profile'
          ? '/assets/user-profiles/profile-'
          : '/assets/user-banners/banner-';
      const totalImages =
        type === 'profile' ? TOTAL_PROFILE_PICTURES : TOTAL_BANNERS;
      const current =
        type === 'profile'
          ? profileData.profileImageUrl
          : profileData.coverImageUrl;

      let currentIndex = 1;
      if (current?.includes(basePath)) {
        const match = current.match(/-(\d+)\.jpg/);
        if (match) {
          currentIndex = parseInt(match[1]!, 10);
        }
      }

      let nextIndex: number;
      if (direction === 'next') {
        nextIndex = currentIndex >= totalImages ? 1 : currentIndex + 1;
      } else {
        nextIndex = currentIndex <= 1 ? totalImages : currentIndex - 1;
      }

      const newUrl = `${basePath}${nextIndex}.jpg`;
      updateProfileField(
        type === 'profile' ? 'profileImageUrl' : 'coverImageUrl',
        newUrl
      );
    },
    [profileData.profileImageUrl, profileData.coverImageUrl, updateProfileField]
  );

  // Handle agent creation (step 3)
  const handleCreate = useCallback(async () => {
    // Validation
    if (!profileData.displayName.trim()) {
      toast.error('Agent name is required');
      return;
    }
    if (!profileData.username || profileData.username.length < 3) {
      toast.error('Invalid username. Please set up your agent profile first.');
      return;
    }
    if (!agentData.system.trim()) {
      toast.error('System prompt is required');
      return;
    }

    setIsCreating(true);

    const token = await getAccessToken();
    if (!token) {
      toast.error('Please sign in to create an agent');
      setIsCreating(false);
      return;
    }

    // Split personality by newlines for bio array
    const bioArray = agentData.personality.split('\n').filter((b) => b.trim());

    // Append trading strategy to system prompt
    const systemPrompt = agentData.tradingStrategy.trim()
      ? `${agentData.system}\n\nTrading Strategy: ${agentData.tradingStrategy}`
      : agentData.system;

    // Step 1: Create the agent
    const response = await fetch('/api/agents', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: profileData.displayName,
        username: profileData.username,
        description: profileData.bio,
        profileImageUrl: profileData.profileImageUrl,
        coverImageUrl: profileData.coverImageUrl,
        system: systemPrompt,
        bio: bioArray,
        personality: agentData.personality,
        tradingStrategy: agentData.tradingStrategy,
        initialDeposit: agentData.initialDeposit,
        modelTier: settingsData.modelTier,
        autonomousEnabled: settingsData.autonomousEnabled,
        autonomousPosting: settingsData.autonomousPosting,
        autonomousCommenting: settingsData.autonomousCommenting,
        autonomousDMs: settingsData.autonomousDMs,
        autonomousGroupChats: settingsData.autonomousGroupChats,
        a2aEnabled: settingsData.a2aEnabled,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      toast.error(errorData.error || 'Failed to create agent');
      setIsCreating(false);
      return;
    }

    const result = await response.json();
    const agentId = result.agent.id;

    // Generate onboarding message
    try {
      await fetch(`/api/agents/${agentId}/onboarding`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });
    } catch (error) {
      console.warn('Error generating onboarding message:', error);
    }

    clearDraft();
    toast.success('Agent created successfully!');

    // Call success callback with agent info
    onSuccess?.({ id: agentId, username: profileData.username });
  }, [
    profileData,
    agentData,
    settingsData,
    getAccessToken,
    clearDraft,
    onSuccess,
  ]);

  const containerClass = compact ? '' : 'mx-auto max-w-4xl pb-24';

  return (
    <div className={containerClass}>
      {/* Header */}
      <div className="mb-8">
        <button
          onClick={() => {
            if (currentStep === Step.Profile) {
              onBack?.();
            } else {
              setCurrentStep((prev) => prev - 1);
            }
          }}
          className="mb-4 flex items-center gap-3 text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-5 w-5" />
          <span>
            {currentStep === Step.Profile ? backLabel : 'Previous Step'}
          </span>
        </button>
        <div className="flex items-center gap-3">
          <Bot className="h-6 w-6 text-[#0066FF]" />
          <div>
            <h1 className="font-bold text-3xl">Create AI Agent</h1>
            <p className="text-muted-foreground">
              {currentStep === Step.Prompts
                ? "Configure your agent's personality and prompts"
                : currentStep === Step.Settings
                  ? "Set up your agent's capabilities"
                  : 'Configure your autonomous trading agent'}
            </p>
          </div>
        </div>
      </div>

      {/* Main Content */}
      {currentStep === Step.Settings ? (
        // Step 3: Full-width settings (no sidebar)
        <div className="space-y-6">
          <AgentSettingsStep
            settings={settingsData}
            onSettingsChange={setSettingsData}
          />

          {/* Actions */}
          <div className="flex justify-end gap-3 border-border border-t pt-6">
            <button
              onClick={() => setCurrentStep(Step.Prompts)}
              disabled={isCreating}
              className={cn(
                'rounded-lg border border-border px-6 py-3 font-medium transition-colors',
                'text-muted-foreground hover:bg-muted hover:text-foreground',
                'disabled:cursor-not-allowed disabled:opacity-50'
              )}
            >
              Back
            </button>
            <button
              onClick={handleCreate}
              disabled={isCreating}
              className={cn(
                'flex items-center gap-2 rounded-lg px-6 py-3 font-medium transition-all',
                'bg-[#0066FF] text-primary-foreground hover:bg-[#2952d9]',
                'disabled:cursor-not-allowed disabled:opacity-50'
              )}
            >
              {isCreating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                'Create Agent'
              )}
            </button>
          </div>
        </div>
      ) : (
        // Step 2: Grid layout with sidebar
        <div className="grid gap-8 lg:grid-cols-3">
          {/* Profile Preview - Left Column */}
          <div className="space-y-4 lg:col-span-1">
            <ProfilePreviewCard
              profileData={profileData}
              onCycleProfilePic={(direction) => cycleImage('profile', direction)}
              onCycleBanner={(direction) => cycleImage('cover', direction)}
              isLoading={!isInitialized}
            />

            {/* Balance Info */}
            <div className="rounded-lg border border-border bg-muted/30 p-4">
              <div className="mb-3 flex items-center gap-2">
                <Wallet className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium text-sm">Funding</span>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Initial Deposit</span>
                  <span className="font-medium font-mono">
                    {agentData.initialDeposit.toLocaleString()} pts
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Your Balance</span>
                  <span className="font-medium font-mono">
                    {balanceLoading ? '...' : balance.toLocaleString()} pts
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Configuration - Right Column */}
          <div className="space-y-6 lg:col-span-2">
            {/* Step 2: Prompts Configuration */}
            {currentStep === Step.Prompts && (
              <>
                {isInitialized ? (
                  <>
                    <AgentConfigForm
                      agentData={agentData}
                      generatingField={generatingField}
                      maxDeposit={maxDeposit}
                      onFieldChange={updateAgentField}
                      onRegenerate={regenerateField}
                    />

                    {/* Actions */}
                    <div className="flex justify-end gap-3 border-border border-t pt-6">
                      <button
                        onClick={onBack}
                        className={cn(
                          'rounded-lg border border-border px-6 py-3 font-medium transition-colors',
                          'text-muted-foreground hover:bg-muted hover:text-foreground'
                        )}
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleContinueToSettings}
                        disabled={!isInitialized}
                        className={cn(
                          'flex items-center gap-2 rounded-lg px-6 py-3 font-medium transition-all',
                          'bg-[#0066FF] text-primary-foreground hover:bg-[#2952d9]',
                          'disabled:cursor-not-allowed disabled:opacity-50'
                        )}
                      >
                        Continue
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="space-y-6">
                    <div className="space-y-4">
                      <Skeleton className="h-6 w-32" />
                      <Skeleton className="h-32 w-full" />
                    </div>
                    <div className="space-y-4">
                      <Skeleton className="h-6 w-24" />
                      <Skeleton className="h-24 w-full" />
                    </div>
                    <div className="space-y-4">
                      <Skeleton className="h-6 w-36" />
                      <Skeleton className="h-28 w-full" />
                    </div>
                    <div className="space-y-4">
                      <Skeleton className="h-6 w-28" />
                      <Skeleton className="h-10 w-full" />
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* Profile Modal - Step 1 */}
      {currentStep === Step.Profile && (
        <AgentSetupModal
          isOpen={currentStep === Step.Profile}
          onClose={() => onBack?.()}
          profileData={profileData}
          onSave={handleProfileSave}
        />
      )}
    </div>
  );
}

