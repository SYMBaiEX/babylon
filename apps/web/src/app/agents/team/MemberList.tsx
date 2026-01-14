'use client';

import { Bot, Plus } from 'lucide-react';
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
}

/**
 * Member list component for Command Center sidebar/drawer
 *
 * Shows the current user and all agents in the team chat.
 * Used by both desktop sidebar and mobile drawer.
 */
export function MemberList({ user, teamChat, onClose }: MemberListProps) {
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
          <nav role="list" aria-label="Team agents" className="space-y-3">
            {teamChat.agents.map((agent) => (
              <Link
                key={agent.id}
                href={`/agents/${agent.id}`}
                onClick={onClose}
                role="listitem"
                className="flex items-center gap-3 rounded-lg p-2 transition-colors hover:bg-muted/50"
              >
                <Avatar
                  src={agent.profileImageUrl ?? undefined}
                  name={agent.displayName || agent.username || 'Agent'}
                  size="sm"
                />
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
                <Bot
                  className="h-4 w-4 flex-shrink-0 text-blue-500"
                  aria-hidden="true"
                />
              </Link>
            ))}
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
