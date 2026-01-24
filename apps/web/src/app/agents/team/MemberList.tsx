'use client';

import { cn } from '@babylon/shared';
import {
  Check,
  Loader2,
  MoreVertical,
  Plus,
  Settings,
  User,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Avatar } from '@/components/shared/Avatar';
import { Separator } from '@/components/shared/Separator';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

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
  const router = useRouter();
  // Track which dropdown is open (by agent id)
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);

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
          {selectedAgentIds.size > 0 ? (
            <span className="ml-2 text-blue-500">
              · {selectedAgentIds.size} selected
            </span>
          ) : (
            <span className="ml-2 font-normal normal-case opacity-70">
              · Click to select
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
              const agentName = agent.displayName || agent.username || 'Agent';

              return (
                <div
                  key={agent.id}
                  className={cn(
                    'group flex items-center gap-2 rounded-lg p-2 transition-colors',
                    isSelected
                      ? 'bg-blue-500/15 ring-1 ring-blue-500/30'
                      : 'hover:bg-muted/50',
                    isProcessing && 'opacity-70'
                  )}
                >
                  {/* Agent info - clickable to toggle selection */}
                  <button
                    type="button"
                    onClick={() => canSelect && onToggleAgent(agent.id)}
                    disabled={isProcessing}
                    className={cn(
                      'flex flex-1 items-center gap-3 text-left',
                      isProcessing ? 'cursor-not-allowed' : 'cursor-pointer'
                    )}
                    aria-label={
                      isSelected
                        ? `Deselect ${agentName}`
                        : `Select ${agentName}`
                    }
                  >
                    <div className="relative">
                      <Avatar
                        src={agent.profileImageUrl ?? undefined}
                        name={agentName}
                        size="sm"
                      />
                      {isSelected && !isProcessing && (
                        <div className="-right-1 -bottom-1 absolute rounded-full bg-blue-500 p-0.5">
                          <Check className="h-2.5 w-2.5 text-white" />
                        </div>
                      )}
                      {isProcessing && (
                        <div className="-right-1 -bottom-1 absolute rounded-full bg-background p-0.5">
                          <Loader2 className="h-3 w-3 animate-spin text-blue-500" />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-foreground text-sm">
                        {agentName}
                      </p>
                      {agent.username && (
                        <p className="truncate text-muted-foreground text-xs">
                          @{agent.username}
                        </p>
                      )}
                    </div>
                    {isProcessing && (
                      <span className="flex-shrink-0 text-blue-500 text-xs">
                        Working...
                      </span>
                    )}
                  </button>

                  {/* 3-dot dropdown menu */}
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
                      {/* Select/Unselect */}
                      <DropdownMenuItem
                        onClick={() => {
                          if (canSelect) onToggleAgent(agent.id);
                          setOpenDropdown(null);
                        }}
                        disabled={isProcessing}
                      >
                        <Check className="mr-2 h-4 w-4" />
                        {isSelected ? 'Unselect' : 'Select'}
                      </DropdownMenuItem>

                      <DropdownMenuSeparator />

                      {/* View Profile */}
                      <DropdownMenuItem
                        onClick={() => {
                          router.push(`/agents/${agent.id}`);
                          onClose?.();
                          setOpenDropdown(null);
                        }}
                      >
                        <User className="mr-2 h-4 w-4" />
                        View Profile
                      </DropdownMenuItem>

                      {/* Agent Settings (dummy) */}
                      <DropdownMenuItem
                        onClick={() => {
                          router.push(`/agents/${agent.id}/settings`);
                          onClose?.();
                          setOpenDropdown(null);
                        }}
                      >
                        <Settings className="mr-2 h-4 w-4" />
                        Settings
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
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
