'use client';

import { Bot } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { AgentCreate } from '@/components/agents/AgentCreate';
import { LoginButton } from '@/components/auth/LoginButton';
import { PageContainer } from '@/components/shared/PageContainer';
import { useAuth } from '@/hooks/useAuth';

export default function CreateAgentPage() {
  const router = useRouter();
  const { ready, authenticated } = useAuth();

  // Show sign-in prompt for unauthenticated users
  if (!ready || !authenticated) {
    return (
      <PageContainer noPadding className="flex flex-col">
        <div className="flex flex-1 items-center justify-center p-8">
          <div className="max-w-md text-center">
            <Bot className="mx-auto mb-4 h-16 w-16 text-muted-foreground" />
            <h2 className="mb-2 font-bold text-foreground text-xl">
              Create an Agent
            </h2>
            <p className="mb-6 text-muted-foreground">
              Sign in to create and manage AI agents that can chat and trade
              autonomously
            </p>
            <LoginButton />
          </div>
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <AgentCreate
        onBack={() => router.push('/agents')}
        backLabel="Back"
        onSuccess={(agent) => {
          // Redirect to team chat and select the new agent
          router.push(`/agents/team?selectAgent=${encodeURIComponent(agent.id)}`);
        }}
      />
    </PageContainer>
  );
}
