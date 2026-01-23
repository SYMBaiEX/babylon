'use client';

import { cn } from '@babylon/shared';
import { Bot, Check, Loader2, Plus } from 'lucide-react';
import Link from 'next/link';
import { Avatar } from '@/components/shared/Avatar';
import { Separator } from '@/components/shared/Separator';
import { Button } from '@/components/ui/button';

/** Agent info for member list */
interface TeamChatAgent {
  id: string;
  username: string | null;
  displayName: string | null;
  profileImageUrl: string | null;
}

/** User info for member list */
interface UserInfo {
  profileImageUrl?: string | null | undefined;
  displayName?: string | null | undefined;
  username?: string | null | undefined;
}

/** Team chat info for member list */
interface TeamChatInfo {
  agents: TeamChatAgent[];
  agentCount: number;
}

interface MemberListProps {
  user: UserInfo | null | undefined;
  teamChat: TeamChatInfo | null | undefined;
  /** Called when a link is clicked (for closing drawer on mobile) */
  onClose?: () => void;
  /** IDs of currently selected agents */
  selectedAgentIds?: Set<string>;
  /** IDs of agents currently processing */
  processingAgentIds?: Set<string>;
  /** Called when an agent is toggled for selection */
  onToggleAgent?: (agentId: string) => void;
}

/**
 * Member list component for Command Center sidebar/drawer
 *
 * Shows the current user and all agents in the team chat.
 * Supports agent selection for parallel task execution.
 * Used by both desktop sidebar and mobile drawer.
 */
export function MemberList({
  user,
  teamChat,
  onClose,
  selectedAgentIds = new Set(),
  processingAgentIds = new Set(),
  onToggleAgent,
}: MemberListProps) {
  return (
    <div className="flex-1 overflow-y-auto p-4">
      {/* You (the user) */}
      <div className="mb-4">
        <p className="mb-2 font-medium text-muted-foreground text-xs uppercase">
          You
        </p>
        <div className="flex items-center gap-3">
          <Avatar
            src={user?.profileImageUrl ?? undefined}
            name={user?.displayName || user?.username || 'You'}
            size="sm"
          />
          <span className="font-medium text-foreground text-sm">
            {user?.displayName || user?.username || 'You'}
          </span>
        </div>
      </div>

      <Separator className="my-4" />

      {/* Agents */}
      <div>
        <p className="mb-2 font-medium text-muted-foreground text-xs uppercase">
          Agents ({teamChat?.agentCount ?? 0})
          {selectedAgentIds.size > 0 && (
            <span className="ml-2 text-blue-500">
              · {selectedAgentIds.size} selected
            </span>
          )}
        </p>
        {!teamChat?.agents.length ? (
          <p className="text-muted-foreground text-sm">
            No agents yet.{' '}
            <Link
              href="/agents/create"
              className="text-blue-500 hover:underline"
              onClick={onClose}
            >
              Create one
            </Link>
          </p>
        ) : (
          <nav role="list" aria-label="Team agents" className="space-y-1">
            {teamChat.agents.map((agent) => {
              const isSelected = selectedAgentIds.has(agent.id);
              const isProcessing = processingAgentIds.has(agent.id);
              const canSelect = !isProcessing && onToggleAgent;

              return (
                <div key={agent.id} className="flex items-center gap-2">
                  {/* Selection checkbox/button */}
                  {onToggleAgent && (
                    <button
                      type="button"
                      onClick={() => canSelect && onToggleAgent(agent.id)}
                      disabled={isProcessing}
                      className={cn(
                        'flex h-5 w-5 flex-shrink-0 items-center justify-center rounded border transition-colors',
                        isSelected
                          ? 'border-blue-500 bg-blue-500 text-white'
                          : 'border-muted-foreground/30 hover:border-blue-500/50',
                        isProcessing && 'cursor-not-allowed opacity-50'
                      )}
                      aria-label={
                        isSelected
                          ? `Deselect ${agent.displayName || agent.username}`
                          : `Select ${agent.displayName || agent.username}`
                      }
                    >
                      {isSelected && <Check className="h-3 w-3" />}
                    </button>
                  )}

                  {/* Agent info - clickable to go to profile */}
                  <Link
                    href={`/agents/${agent.id}`}
                    onClick={onClose}
                    className={cn(
                      'flex flex-1 items-center gap-3 rounded-lg p-2 transition-colors hover:bg-muted/50',
                      isSelected && 'bg-blue-500/10'
                    )}
                  >
                    <div className="relative">
                      <Avatar
                        src={agent.profileImageUrl ?? undefined}
                        name={agent.displayName || agent.username || 'Agent'}
                        size="sm"
                      />
                      {isProcessing && (
                        <div className="-right-1 -bottom-1 absolute rounded-full bg-background p-0.5">
                          <Loader2 className="h-3 w-3 animate-spin text-blue-500" />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-foreground text-sm">
                        {agent.displayName || agent.username || 'Agent'}
                      </p>
                      {agent.username && (
                        <p className="truncate text-muted-foreground text-xs">
                          @{agent.username}
                        </p>
                      )}
                    </div>
                    {isProcessing ? (
                      <span className="flex-shrink-0 text-blue-500 text-xs">
                        Working...
                      </span>
                    ) : (
                      <Bot
                        className="h-4 w-4 flex-shrink-0 text-blue-500"
                        aria-hidden="true"
                      />
                    )}
                  </Link>
                </div>
              );
            })}
          </nav>
        )}
      </div>

      {/* Add agent button */}
      <div className="mt-4">
        <Link href="/agents/create" onClick={onClose}>
          <Button variant="outline" size="sm" className="w-full gap-2">
            <Plus className="h-4 w-4" />
            Add Agent
          </Button>
        </Link>
      </div>
    </div>
  );
}
