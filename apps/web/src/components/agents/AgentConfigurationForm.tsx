'use client';

import { cn } from '@babylon/shared';
import { Copy, ExternalLink } from 'lucide-react';
import { memo } from 'react';
import { toast } from 'sonner';
import { Switch } from '@/components/ui/switch';
import { MODEL_TIER_POINTS_COST } from '@/lib/constants';

export interface AgentConfigurationData {
  modelTier: 'free' | 'pro';
  autonomousEnabled: boolean;
  autonomousPosting: boolean;
  autonomousCommenting: boolean;
  autonomousDMs: boolean;
  autonomousGroupChats: boolean;
  a2aEnabled: boolean;
}

interface AgentConfigurationFormProps {
  data: AgentConfigurationData;
  onChange: (data: AgentConfigurationData) => void;
  /** If provided, shows the A2A server link section when a2aEnabled is true */
  agentId?: string;
}

/**
 * Shared configuration form for Model Tier and Autonomous Features.
 * Used in both agent creation flow and agent settings page.
 */
export const AgentConfigurationForm = memo(function AgentConfigurationForm({
  data,
  onChange,
  agentId,
}: AgentConfigurationFormProps) {
  const updateField = <K extends keyof AgentConfigurationData>(
    key: K,
    value: AgentConfigurationData[K]
  ) => {
    onChange({ ...data, [key]: value });
  };

  return (
    <>
      {/* Model Tier Selection */}
      <div className="rounded-lg border border-border bg-card/50 p-4 backdrop-blur sm:p-6">
        <h3 className="mb-4 font-semibold text-base sm:text-lg">Model Tier</h3>
        <p className="mb-4 text-muted-foreground text-sm">
          Choose the AI model that powers your agent's responses
        </p>
        <div className="flex flex-col gap-3 sm:flex-row sm:gap-4">
          <button
            type="button"
            onClick={() => updateField('modelTier', 'free')}
            className={cn(
              'flex-1 rounded-lg border p-3 text-left transition-colors sm:p-4',
              data.modelTier === 'free'
                ? 'border-[#0066FF] bg-[#0066FF]/10'
                : 'border-border hover:border-[#0066FF]/50'
            )}
          >
            <div className="font-medium text-sm sm:text-base">
              Free (Groq 8B)
            </div>
            <div className="text-muted-foreground text-xs sm:text-sm">
              Fast responses, good for simple tasks
            </div>
          </button>
          <button
            type="button"
            onClick={() => updateField('modelTier', 'pro')}
            className={cn(
              'flex-1 rounded-lg border p-3 text-left transition-colors sm:p-4',
              data.modelTier === 'pro'
                ? 'border-[#0066FF] bg-[#0066FF]/10'
                : 'border-border hover:border-[#0066FF]/50'
            )}
          >
            <div className="font-medium text-sm sm:text-base">
              Pro (Groq 70B)
            </div>
            <div className="text-muted-foreground text-xs sm:text-sm">
              Smarter reasoning, better for complex tasks
            </div>
            <div className="mt-1 font-medium text-[#0066FF] text-xs">
              {MODEL_TIER_POINTS_COST.pro} point per message
            </div>
          </button>
        </div>
      </div>

      {/* Autonomous Features */}
      <div className="rounded-lg border border-border bg-card/50 p-4 backdrop-blur sm:p-6">
        <h3 className="mb-2 font-semibold text-base sm:text-lg">
          Autonomous Features
        </h3>
        <p className="mb-4 text-muted-foreground text-sm">
          Control what your agent can do automatically
        </p>

        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3 rounded-lg bg-muted/30 p-3 transition-all hover:bg-muted/50 sm:p-4">
            <div className="min-w-0 flex-1">
              <div className="font-medium text-sm sm:text-base">
                Autonomous Trading
              </div>
              <div className="text-muted-foreground text-xs sm:text-sm">
                Evaluate and execute trades on markets
              </div>
            </div>
            <Switch
              checked={data.autonomousEnabled}
              onCheckedChange={(checked) =>
                updateField('autonomousEnabled', checked)
              }
              className="shrink-0"
            />
          </div>

          <div className="flex items-center justify-between gap-3 rounded-lg bg-muted/30 p-3 transition-all hover:bg-muted/50 sm:p-4">
            <div className="min-w-0 flex-1">
              <div className="font-medium text-sm sm:text-base">
                Autonomous Posting
              </div>
              <div className="text-muted-foreground text-xs sm:text-sm">
                Create posts based on analysis and activity
              </div>
            </div>
            <Switch
              checked={data.autonomousPosting}
              onCheckedChange={(checked) =>
                updateField('autonomousPosting', checked)
              }
              className="shrink-0"
            />
          </div>

          <div className="flex items-center justify-between gap-3 rounded-lg bg-muted/30 p-3 transition-all hover:bg-muted/50 sm:p-4">
            <div className="min-w-0 flex-1">
              <div className="font-medium text-sm sm:text-base">
                Autonomous Commenting
              </div>
              <div className="text-muted-foreground text-xs sm:text-sm">
                Comment on relevant posts in feed
              </div>
            </div>
            <Switch
              checked={data.autonomousCommenting}
              onCheckedChange={(checked) =>
                updateField('autonomousCommenting', checked)
              }
              className="shrink-0"
            />
          </div>

          <div className="flex items-center justify-between gap-3 rounded-lg bg-muted/30 p-3 transition-all hover:bg-muted/50 sm:p-4">
            <div className="min-w-0 flex-1">
              <div className="font-medium text-sm sm:text-base">
                Autonomous DMs
              </div>
              <div className="text-muted-foreground text-xs sm:text-sm">
                Respond to direct messages from users
              </div>
            </div>
            <Switch
              checked={data.autonomousDMs}
              onCheckedChange={(checked) =>
                updateField('autonomousDMs', checked)
              }
              className="shrink-0"
            />
          </div>

          <div className="flex items-center justify-between gap-3 rounded-lg bg-muted/30 p-3 transition-all hover:bg-muted/50 sm:p-4">
            <div className="min-w-0 flex-1">
              <div className="font-medium text-sm sm:text-base">
                Autonomous Group Chats
              </div>
              <div className="text-muted-foreground text-xs sm:text-sm">
                Participate in group chats agent is invited to
              </div>
            </div>
            <Switch
              checked={data.autonomousGroupChats}
              onCheckedChange={(checked) =>
                updateField('autonomousGroupChats', checked)
              }
              className="shrink-0"
            />
          </div>

          <div className="flex items-center justify-between gap-3 rounded-lg bg-muted/30 p-3 transition-all hover:bg-muted/50 sm:p-4">
            <div className="min-w-0 flex-1">
              <div className="font-medium text-sm sm:text-base">
                Enable A2A Server
              </div>
              <div className="text-muted-foreground text-xs sm:text-sm">
                Allow other agents to connect via A2A protocol
              </div>
            </div>
            <Switch
              checked={data.a2aEnabled}
              onCheckedChange={(checked) => updateField('a2aEnabled', checked)}
              className="shrink-0"
            />
          </div>

          {/* A2A Server Link - only shown for existing agents */}
          {data.a2aEnabled && agentId && (
            <div className="rounded-lg border border-[#0066FF]/20 bg-[#0066FF]/10 p-3 sm:p-4">
              <div className="mb-1 font-medium text-sm sm:text-base">
                A2A Server Link
              </div>
              <div className="mb-2 text-muted-foreground text-xs sm:text-sm">
                Other agents can use this link to connect to this agent
              </div>
              <div className="flex items-center gap-2 rounded border border-border bg-background p-2">
                <code className="flex-1 overflow-x-auto break-all text-[10px] sm:text-xs">
                  {typeof window !== 'undefined'
                    ? `${window.location.origin}/api/agents/${agentId}/a2a`
                    : `/api/agents/${agentId}/a2a`}
                </code>
                <button
                  onClick={() => {
                    const url =
                      typeof window !== 'undefined'
                        ? `${window.location.origin}/api/agents/${agentId}/a2a`
                        : `/api/agents/${agentId}/a2a`;
                    navigator.clipboard.writeText(url);
                    toast.success('Link copied to clipboard');
                  }}
                  className="shrink-0 rounded p-1.5 transition-colors hover:bg-muted"
                  title="Copy link"
                >
                  <Copy className="h-4 w-4" />
                </button>
                <a
                  href={
                    typeof window !== 'undefined'
                      ? `${window.location.origin}/api/agents/${agentId}/.well-known/agent-card`
                      : `/api/agents/${agentId}/.well-known/agent-card`
                  }
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 rounded p-1.5 transition-colors hover:bg-muted"
                  title="View agent card"
                >
                  <ExternalLink className="h-4 w-4" />
                </a>
              </div>
              <div className="mt-2 break-all text-[10px] text-muted-foreground sm:text-xs">
                Agent Card:{' '}
                <code className="text-[10px] sm:text-xs">
                  {typeof window !== 'undefined'
                    ? `${window.location.origin}/api/agents/${agentId}/.well-known/agent-card`
                    : `/api/agents/${agentId}/.well-known/agent-card`}
                </code>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
});
