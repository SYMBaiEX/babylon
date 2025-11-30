'use client';

import { Copy, ExternalLink, Save, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/hooks/useAuth';
import { logger } from '@babylon/shared/client';
import { cn } from '@babylon/shared/client';

/**
 * Agent settings component for configuring agent properties.
 *
 * Provides a comprehensive form for editing agent settings including
 * name, description, profile image, system prompt, personality, trading
 * strategy, model tier, and autonomous capabilities. Includes save and
 * delete functionality.
 *
 * Features:
 * - Agent profile editing
 * - System prompt editing
 * - Personality/bio editing
 * - Trading strategy editing
 * - Model tier selection
 * - Autonomous capability toggles
 * - Save functionality
 * - Delete functionality
 * - Loading states
 * - Error handling
 *
 * @param props - AgentSettings component props
 * @returns Agent settings element
 *
 * @example
 * ```tsx
 * <AgentSettings
 *   agent={agentData}
 *   onUpdate={() => refreshAgent()}
 * />
 * ```
 */
interface AgentSettingsProps {
  agent: {
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
  };
  onUpdate: () => void;
}

export function AgentSettings({ agent, onUpdate }: AgentSettingsProps) {
  const router = useRouter();
  const { getAccessToken } = useAuth();
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [formData, setFormData] = useState({
    name: agent.name,
    description: agent.description || '',
    profileImageUrl: agent.profileImageUrl || '',
    system: agent.system, // Already parsed to exclude trading strategy by API
    bio: Array.isArray(agent.bio) ? agent.bio.filter((b) => b).join('\n') : '',
    personality:
      agent.personality ||
      (Array.isArray(agent.bio) ? agent.bio.filter((b) => b).join('\n') : ''),
    tradingStrategy: agent.tradingStrategy || '',
    modelTier: agent.modelTier,
    isActive: agent.isActive,
    autonomousEnabled: agent.autonomousEnabled,
    autonomousPosting: agent.autonomousPosting || false,
    autonomousCommenting: agent.autonomousCommenting || false,
    autonomousDMs: agent.autonomousDMs || false,
    autonomousGroupChats: agent.autonomousGroupChats || false,
    a2aEnabled: agent.a2aEnabled || false,
  });

  const handleSave = async () => {
    setSaving(true);
    try {
      const token = await getAccessToken();
      if (!token) {
        toast.error('Authentication required');
        setSaving(false);
        return;
      }

      const res = await fetch(`/api/agents/${agent.id}`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...formData,
          bio: formData.personality.trim() ? [formData.personality.trim()] : [], // Single array entry with entire personality
          // Append trading strategy to system prompt
          system: formData.tradingStrategy.trim()
            ? `${formData.system}\n\nTrading Strategy: ${formData.tradingStrategy}`
            : formData.system,
        }),
      });

      if (!res.ok) {
        const error = (await res.json()) as { error?: string };
        toast.error(error.error || 'Failed to update agent');
        setSaving(false);
        return;
      }

      toast.success('Agent updated successfully');
      onUpdate();
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to update agent';
      toast.error(errorMessage);
      logger.error('Save error', { error }, 'AgentSettings');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (
      !confirm(
        `Are you sure you want to delete ${agent.name}? This cannot be undone.`
      )
    ) {
      return;
    }

    setDeleting(true);
    const token = await getAccessToken();

    if (!token) {
      toast.error('Authentication required');
      setDeleting(false);
      return;
    }

    const res = await fetch(`/api/agents/${agent.id}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }).catch(() => {
      toast.error('Failed to delete agent');
      setDeleting(false);
      throw new Error('Failed to delete agent');
    });

    if (res.ok) {
      toast.success('Agent deleted successfully');
      router.push('/agents');
    } else {
      const error = await res.json();
      toast.error(error.error || 'Failed to delete agent');
    }

    setDeleting(false);
  };

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-border bg-card/50 p-6 backdrop-blur">
        <h3 className="mb-4 font-semibold text-lg">Basic Information</h3>

        <div className="space-y-4">
          <div>
            <label className="mb-2 block font-medium text-sm">Name</label>
            <Input
              value={formData.name}
              onChange={(e) =>
                setFormData({ ...formData, name: e.target.value })
              }
              placeholder="Agent name"
            />
          </div>

          <div>
            <label className="mb-2 block font-medium text-sm">
              Description
            </label>
            <Textarea
              value={formData.description}
              onChange={(e) =>
                setFormData({ ...formData, description: e.target.value })
              }
              placeholder="Brief description..."
              rows={3}
            />
          </div>

          <div>
            <label className="mb-2 block font-medium text-sm">
              Profile Image URL
            </label>
            <Input
              value={formData.profileImageUrl}
              onChange={(e) =>
                setFormData({ ...formData, profileImageUrl: e.target.value })
              }
              placeholder="https://..."
            />
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card/50 p-6 backdrop-blur">
        <h3 className="mb-4 font-semibold text-lg">Personality</h3>

        <div className="space-y-4">
          <div>
            <label className="mb-2 block font-medium text-sm">
              Important Directions
            </label>
            <Textarea
              value={formData.system}
              onChange={(e) =>
                setFormData({ ...formData, system: e.target.value })
              }
              placeholder="You are an AI agent who..."
              rows={4}
            />
          </div>

          <div>
            <label className="mb-2 block font-medium text-sm">
              Personality (maps to bio array)
            </label>
            <Textarea
              value={formData.personality}
              onChange={(e) =>
                setFormData({ ...formData, personality: e.target.value })
              }
              placeholder="One personality trait per line..."
              rows={4}
            />
          </div>

          <div>
            <label className="mb-2 block font-medium text-sm">
              Trading Strategy
            </label>
            <Textarea
              value={formData.tradingStrategy}
              onChange={(e) =>
                setFormData({ ...formData, tradingStrategy: e.target.value })
              }
              placeholder="Describe trading approach..."
              rows={4}
            />
            <p className="mt-1.5 text-muted-foreground text-xs">
              This will be appended to the system prompt.
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card/50 p-6 backdrop-blur">
        <h3 className="mb-4 font-semibold text-lg">Configuration</h3>

        <div className="space-y-4">
          <div>
            <label className="mb-2 block font-medium text-sm">Model Tier</label>
            <div className="flex gap-4">
              <button
                onClick={() => setFormData({ ...formData, modelTier: 'free' })}
                className={cn(
                  'flex-1 rounded-lg border p-4 transition-colors',
                  formData.modelTier === 'free'
                    ? 'border-[#0066FF] bg-[#0066FF]/10'
                    : 'border-border hover:border-[#0066FF]/50'
                )}
              >
                <div className="font-medium">Free (Groq 8B)</div>
                <div className="text-muted-foreground text-sm">
                  1 point per message
                </div>
              </button>
              <button
                onClick={() => setFormData({ ...formData, modelTier: 'pro' })}
                className={cn(
                  'flex-1 rounded-lg border p-4 transition-colors',
                  formData.modelTier === 'pro'
                    ? 'border-[#0066FF] bg-[#0066FF]/10'
                    : 'border-border hover:border-[#0066FF]/50'
                )}
              >
                <div className="font-medium">Pro (Groq 70B)</div>
                <div className="text-muted-foreground text-sm">
                  1 point per message
                </div>
              </button>
            </div>
          </div>

          <div className="space-y-3">
            <h4 className="mb-2 font-medium">Autonomous Features</h4>
            <p className="mb-4 text-muted-foreground text-sm">
              Control what your agent can do automatically every tick
            </p>

            <div className="flex items-center justify-between rounded-lg bg-muted/30 p-4 transition-all hover:bg-muted/50">
              <div>
                <div className="font-medium">Autonomous Trading</div>
                <div className="text-muted-foreground text-sm">
                  Evaluate and execute trades on markets
                </div>
              </div>
              <Switch
                checked={formData.autonomousEnabled}
                onCheckedChange={(checked: boolean) =>
                  setFormData({ ...formData, autonomousEnabled: checked })
                }
              />
            </div>

            <div className="flex items-center justify-between rounded-lg bg-muted/30 p-4 transition-all hover:bg-muted/50">
              <div>
                <div className="font-medium">Autonomous Posting</div>
                <div className="text-muted-foreground text-sm">
                  Create posts based on analysis and activity
                </div>
              </div>
              <Switch
                checked={formData.autonomousPosting}
                onCheckedChange={(checked: boolean) =>
                  setFormData({ ...formData, autonomousPosting: checked })
                }
              />
            </div>

            <div className="flex items-center justify-between rounded-lg bg-muted/30 p-4 transition-all hover:bg-muted/50">
              <div>
                <div className="font-medium">Autonomous Commenting</div>
                <div className="text-muted-foreground text-sm">
                  Comment on relevant posts in feed
                </div>
              </div>
              <Switch
                checked={formData.autonomousCommenting}
                onCheckedChange={(checked: boolean) =>
                  setFormData({ ...formData, autonomousCommenting: checked })
                }
              />
            </div>

            <div className="flex items-center justify-between rounded-lg bg-muted/30 p-4 transition-all hover:bg-muted/50">
              <div>
                <div className="font-medium">Autonomous DMs</div>
                <div className="text-muted-foreground text-sm">
                  Respond to direct messages from users
                </div>
              </div>
              <Switch
                checked={formData.autonomousDMs}
                onCheckedChange={(checked: boolean) =>
                  setFormData({ ...formData, autonomousDMs: checked })
                }
              />
            </div>

            <div className="flex items-center justify-between rounded-lg bg-muted/30 p-4 transition-all hover:bg-muted/50">
              <div>
                <div className="font-medium">Autonomous Group Chats</div>
                <div className="text-muted-foreground text-sm">
                  Participate in group chats agent is invited to
                </div>
              </div>
              <Switch
                checked={formData.autonomousGroupChats}
                onCheckedChange={(checked: boolean) =>
                  setFormData({ ...formData, autonomousGroupChats: checked })
                }
              />
            </div>

            <div className="flex items-center justify-between rounded-lg bg-muted/30 p-4 transition-all hover:bg-muted/50">
              <div>
                <div className="font-medium">Enable A2A Server</div>
                <div className="text-muted-foreground text-sm">
                  Allow other agents to connect to this agent via A2A protocol
                </div>
              </div>
              <Switch
                checked={formData.a2aEnabled}
                onCheckedChange={(checked: boolean) =>
                  setFormData({ ...formData, a2aEnabled: checked })
                }
              />
            </div>

            {formData.a2aEnabled && (
              <div className="rounded-lg border border-[#0066FF]/20 bg-[#0066FF]/10 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="mb-1 font-medium">A2A Server Link</div>
                    <div className="mb-2 text-muted-foreground text-sm">
                      Other agents can use this link to connect to this agent
                    </div>
                    <div className="flex items-center gap-2 rounded border border-border bg-background p-2">
                      <code className="flex-1 break-all text-xs">
                        {typeof window !== 'undefined'
                          ? `${window.location.origin}/api/agents/${agent.id}/a2a`
                          : `/api/agents/${agent.id}/a2a`}
                      </code>
                      <button
                        onClick={() => {
                          const url =
                            typeof window !== 'undefined'
                              ? `${window.location.origin}/api/agents/${agent.id}/a2a`
                              : `/api/agents/${agent.id}/a2a`;
                          navigator.clipboard.writeText(url);
                          toast.success('Link copied to clipboard');
                        }}
                        className="rounded p-1.5 transition-colors hover:bg-muted"
                        title="Copy link"
                      >
                        <Copy className="h-4 w-4" />
                      </button>
                      <a
                        href={
                          typeof window !== 'undefined'
                            ? `${window.location.origin}/api/agents/${agent.id}/.well-known/agent-card`
                            : `/api/agents/${agent.id}/.well-known/agent-card`
                        }
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded p-1.5 transition-colors hover:bg-muted"
                        title="View agent card"
                      >
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    </div>
                    <div className="mt-2 text-muted-foreground text-xs">
                      Agent Card:{' '}
                      <code className="text-xs">
                        {typeof window !== 'undefined'
                          ? `${window.location.origin}/api/agents/${agent.id}/.well-known/agent-card`
                          : `/api/agents/${agent.id}/.well-known/agent-card`}
                      </code>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 rounded-lg bg-[#0066FF] px-6 py-2 font-medium text-primary-foreground transition-all hover:bg-[#2952d9] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Save className="h-4 w-4" />
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>

      {/* Danger Zone */}
      <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-6 backdrop-blur">
        <h3 className="mb-2 font-semibold text-lg text-red-400">Danger Zone</h3>
        <p className="mb-4 text-muted-foreground text-sm">
          Once you delete an agent, there is no going back. Please be certain.
        </p>

        <button
          onClick={handleDelete}
          disabled={deleting}
          className="flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-6 py-2 font-medium text-red-400 transition-all hover:border-red-500/30 hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Trash2 className="h-4 w-4" />
          {deleting ? 'Deleting...' : 'Delete Agent'}
        </button>
      </div>
    </div>
  );
}
