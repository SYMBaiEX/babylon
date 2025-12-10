'use client';

import { ArrowLeft, Bot, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import { PageContainer } from '@/components/shared/PageContainer';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/hooks/useAuth';
import { useWalletBalance } from '@/hooks/useWalletBalance';
import { useAuthStore } from '@/stores/authStore';
import {
  AgentConfigForm,
  EditProfileModal,
  ProfilePreviewCard,
} from './components';
import { useAgentForm } from './hooks';

const TOTAL_PROFILE_PICTURES = 100;
const DEFAULT_MAX_DEPOSIT = 10000;

export default function CreateAgentPage() {
  const router = useRouter();
  const { user } = useAuthStore();
  const { ready, authenticated, getAccessToken } = useAuth();
  const { balance } = useWalletBalance(user?.id ?? null);

  // Show sign-in prompt for unauthenticated users
  if (!ready || !authenticated) {
    return (
      <PageContainer>
        <div className="p-4">
          <div className="flex flex-col items-center justify-center rounded-lg border border-[#0066FF]/20 bg-gradient-to-br from-[#0066FF]/10 to-purple-500/10 px-4 py-16">
            <Bot className="mb-4 h-16 w-16 text-[#0066FF]" />
            <h3 className="mb-2 font-bold text-2xl">Create an Agent</h3>
            <p className="mb-6 max-w-md text-center text-muted-foreground text-sm">
              Please sign in to create an AI agent
            </p>
          </div>
        </div>
      </PageContainer>
    );
  }

  const [showEditModal, setShowEditModal] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  const {
    profileData,
    agentData,
    isInitialized,
    generatingField,
    updateProfileField,
    updateAgentField,
    setProfileData,
    regenerateField,
    clearDraft,
  } = useAgentForm();

  // User balance for max deposit - default to 10k if balance not available
  const maxDeposit = Math.max(
    100,
    Math.min(balance ?? DEFAULT_MAX_DEPOSIT, DEFAULT_MAX_DEPOSIT)
  );

  // Cycle through pre-made images
  const cycleImage = useCallback(
    (type: 'profile' | 'cover') => {
      const basePath =
        type === 'profile'
          ? '/assets/user-profiles/profile-'
          : '/assets/user-banners/banner-';
      const current =
        type === 'profile'
          ? profileData.profileImageUrl
          : profileData.coverImageUrl;

      let nextIndex = Math.floor(Math.random() * TOTAL_PROFILE_PICTURES) + 1;

      // Avoid same image
      if (current?.includes(basePath)) {
        const match = current.match(/-(\d+)\.jpg/);
        if (match) {
          const currentIndex = parseInt(match[1]!, 10);
          while (nextIndex === currentIndex) {
            nextIndex = Math.floor(Math.random() * TOTAL_PROFILE_PICTURES) + 1;
          }
        }
      }

      const newUrl = `${basePath}${nextIndex}.jpg`;
      updateProfileField(
        type === 'profile' ? 'profileImageUrl' : 'coverImageUrl',
        newUrl
      );
    },
    [profileData.profileImageUrl, profileData.coverImageUrl, updateProfileField]
  );

  // Handle agent creation
  const handleCreate = useCallback(async () => {
    // Validation
    if (!profileData.displayName.trim()) {
      toast.error('Agent name is required');
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

    // Split personality by newlines for bio array (original behavior)
    const bioArray = agentData.personality.split('\n').filter((b) => b.trim());

    // Append trading strategy to system prompt (original behavior)
    const systemPrompt = agentData.tradingStrategy.trim()
      ? `${agentData.system}\n\nTrading Strategy: ${agentData.tradingStrategy}`
      : agentData.system;

    const response = await fetch('/api/agents', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        // API expects 'name', not 'displayName'
        name: profileData.displayName,
        // API expects 'description' for the profile bio
        description: profileData.bio,
        profileImageUrl: profileData.profileImageUrl,
        coverImageUrl: profileData.coverImageUrl,
        // Combined system prompt with trading strategy
        system: systemPrompt,
        // Bio array from personality split
        bio: bioArray,
        personality: agentData.personality,
        tradingStrategy: agentData.tradingStrategy,
        initialDeposit: agentData.initialDeposit,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      toast.error(errorData.error || 'Failed to create agent');
      setIsCreating(false);
      return;
    }

    const result = await response.json();
    clearDraft();
    toast.success('Agent created successfully!');
    router.push(`/agents/${result.agent.id}`);
  }, [profileData, agentData, getAccessToken, clearDraft, router]);

  return (
    <PageContainer className="py-6">
      <div className="mx-auto max-w-4xl space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Link
            href="/agents"
            className="rounded-lg p-2 transition-colors hover:bg-muted"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="flex items-center gap-2 font-bold text-2xl">
              <Bot className="h-6 w-6 text-cyan-500" />
              Create AI Agent
            </h1>
            <p className="text-muted-foreground">
              Configure your autonomous trading agent
            </p>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Profile Preview - Left Column */}
          <div className="space-y-4 lg:col-span-1">
            <ProfilePreviewCard
              profileData={profileData}
              onEdit={() => setShowEditModal(true)}
              onCycleProfilePic={() => cycleImage('profile')}
              onCycleBanner={() => cycleImage('cover')}
              isLoading={!isInitialized}
            />

            {/* Quick Stats */}
            <Card className="border-border/50">
              <CardContent className="space-y-3 p-4">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Initial Deposit</span>
                  <span className="font-mono">
                    {agentData.initialDeposit.toLocaleString()} pts
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Your Balance</span>
                  <span className="font-mono">
                    {(balance ?? 0).toLocaleString()} pts
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Configuration - Right Column */}
          <div className="space-y-6 lg:col-span-2">
            <Card className="border-border/50">
              <CardHeader className="pb-4">
                <CardTitle className="flex items-center gap-2 text-lg">
                  Agent Configuration
                </CardTitle>
              </CardHeader>
              <CardContent>
                {isInitialized ? (
                  <AgentConfigForm
                    agentData={agentData}
                    generatingField={generatingField}
                    maxDeposit={maxDeposit}
                    onFieldChange={updateAgentField}
                    onRegenerate={regenerateField}
                  />
                ) : (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Actions */}
            <div className="flex justify-end gap-3">
              <Button
                variant="outline"
                onClick={() => router.push('/agents')}
                disabled={isCreating}
              >
                Cancel
              </Button>
              <Button
                onClick={handleCreate}
                disabled={isCreating || !isInitialized}
                className="min-w-[140px] bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600"
              >
                {isCreating ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creating...
                  </>
                ) : (
                  'Create Agent'
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Edit Profile Modal */}
      {showEditModal && (
        <EditProfileModal
          isOpen={showEditModal}
          onClose={() => setShowEditModal(false)}
          profileData={profileData}
          onSave={setProfileData}
        />
      )}
    </PageContainer>
  );
}
