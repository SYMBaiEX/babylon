'use client';

import { cn } from '@babylon/shared';
import { MoreVertical, Settings, Square } from 'lucide-react';
import { useState } from 'react';
import { Avatar } from '@/components/shared/Avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

/** Agent info for member list */
interface TeamChatAgent {
  id: string;
  username: string | null;
  displayName: string | null;
  profileImageUrl: string | null;
  isAgent: boolean;
  modelTier: 'free' | 'pro';
  virtualBalance: number;
}

/** Team chat info for member list */
interface TeamChatInfo {
  agents: TeamChatAgent[];
  agentCount: number;
}

interface MemberListProps {
  teamChat: TeamChatInfo | null | undefined;
  /** Called when a link is clicked (for closing drawer on mobile) */
  onClose?: () => void;
  /** IDs of agents currently processing */
  processingAgentIds?: Set<string>;
  /** Called when an agent is clicked (to tag in input) */
  onTagAgent?: (agent: TeamChatAgent) => void;
  /** Called when "Stop" is clicked on a processing agent */
  onStopAgent?: (agentId: string) => void;
  /** Called when "Settings" is clicked */
  onViewSettings?: (agentId: string) => void;
}

/**
 * Member list component for Agents sidebar/drawer
 *
 * Shows all agents in the team chat.
 * Click on an agent to tag them in the message input.
 * Used by both desktop sidebar and mobile drawer.
 */
export function MemberList({
  teamChat,
  onClose,
  processingAgentIds = new Set(),
  onTagAgent,
  onStopAgent,
  onViewSettings,
}: MemberListProps) {
  // Track which dropdown is open (by agent id)
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      {/* Agents */}
      <div>
        {teamChat?.agents.length ? (
          <nav role="list" aria-label="Team agents" className="space-y-1">
            {teamChat.agents.map((agent) => {
              const isProcessing = processingAgentIds.has(agent.id);
              const agentName = agent.displayName || agent.username || 'Agent';

              return (
                <div
                  key={agent.id}
                  className={cn(
                    'group flex min-w-0 items-center gap-2 rounded-lg p-2 transition-colors',
                    'hover:bg-muted/50',
                    isProcessing && 'opacity-70'
                  )}
                >
                  {/* Agent info - clickable to tag in input */}
                  <button
                    type="button"
                    onClick={() => onTagAgent?.(agent)}
                    disabled={isProcessing}
                    className={cn(
                      'flex min-w-0 flex-1 items-center gap-3 text-left',
                      isProcessing ? 'cursor-not-allowed' : 'cursor-pointer'
                    )}
                    aria-label={`Tag ${agentName}`}
                  >
                    <div className="relative">
                      <Avatar
                        src={agent.profileImageUrl ?? undefined}
                        name={agentName}
                        size="sm"
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <p className="truncate font-medium text-foreground text-sm">
                          {agentName}
                        </p>
                        {agent.modelTier === 'pro' && (
                          <span className="shrink-0 rounded bg-primary/20 px-1.5 py-0.5 font-medium text-[10px] text-primary">
                            PRO
                          </span>
                        )}
                      </div>
                      {agent.username && (
                        <p className="truncate text-muted-foreground text-xs">
                          @{agent.username}
                        </p>
                      )}
                    </div>
                  </button>

                  {/* Stop button when processing, otherwise show dropdown menu */}
                  {isProcessing ? (
                    <button
                      type="button"
                      className="relative flex h-7 w-7 flex-shrink-0 items-center justify-center rounded transition-colors hover:bg-primary/10"
                      onClick={() => onStopAgent?.(agent.id)}
                      aria-label={`Stop ${agentName}`}
                    >
                      {/* Spinning ring */}
                      <div className="absolute inset-0.5 animate-spin rounded-full border-2 border-transparent border-t-primary" />
                      {/* Stop square in center */}
                      <Square className="relative h-3 w-3 fill-primary text-primary" />
                    </button>
                  ) : (
                    <DropdownMenu
                      open={openDropdown === agent.id}
                      onOpenChange={(open) =>
                        setOpenDropdown(open ? agent.id : null)
                      }
                    >
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          className={cn(
                            'flex h-7 w-7 flex-shrink-0 items-center justify-center rounded transition-colors',
                            'text-muted-foreground hover:bg-muted hover:text-foreground',
                            'opacity-0 focus:opacity-100 group-hover:opacity-100',
                            openDropdown === agent.id && 'opacity-100'
                          )}
                          aria-label={`Options for ${agentName}`}
                        >
                          <MoreVertical className="h-4 w-4" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-48">
                        {/* Agent Settings */}
                        <DropdownMenuItem
                          onClick={() => {
                            onViewSettings?.(agent.id);
                            onClose?.();
                            setOpenDropdown(null);
                          }}
                        >
                          <Settings className="mr-2 h-4 w-4" />
                          Settings
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              );
            })}
          </nav>
        ) : null}
      </div>
    </div>
  );
}
