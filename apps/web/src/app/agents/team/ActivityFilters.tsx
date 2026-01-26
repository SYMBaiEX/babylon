'use client';

import { cn } from '@babylon/shared';
import {
  ArrowRightLeft,
  Bot,
  Check,
  ChevronDown,
  Filter,
  MessageCircle,
  MessageSquare,
  Sparkles,
  X,
} from 'lucide-react';
import { memo, useMemo, useState } from 'react';
import type { ActivityTypeFilter } from '@/components/agents/AgentActivityFeed';
import { Avatar } from '@/components/shared/Avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export type ActivityType = ActivityTypeFilter;

export interface AgentOption {
  id: string;
  name: string;
  username?: string;
  profileImageUrl?: string | null;
}

interface ActivityFiltersProps {
  /** Currently selected activity type */
  activityType: ActivityType;
  /** Callback when activity type changes */
  onActivityTypeChange: (type: ActivityType) => void;
  /** Currently selected agent ID (null = all agents) */
  selectedAgentId: string | null;
  /** Callback when agent selection changes */
  onAgentChange: (agentId: string | null) => void;
  /** List of agents to show in dropdown */
  agents: AgentOption[];
  /** Whether agents are still loading */
  agentsLoading?: boolean;
  /** Optional className */
  className?: string;
}

const ACTIVITY_TYPES: {
  value: ActivityType;
  label: string;
  icon: typeof ArrowRightLeft;
  color: string;
  bgColor: string;
}[] = [
  {
    value: 'all',
    label: 'All Activity',
    icon: Sparkles,
    color: 'text-blue-500',
    bgColor: 'bg-blue-500/10',
  },
  {
    value: 'trade',
    label: 'Trades',
    icon: ArrowRightLeft,
    color: 'text-emerald-500',
    bgColor: 'bg-emerald-500/10',
  },
  {
    value: 'post',
    label: 'Posts',
    icon: MessageSquare,
    color: 'text-violet-500',
    bgColor: 'bg-violet-500/10',
  },
  {
    value: 'comment',
    label: 'Comments',
    icon: MessageCircle,
    color: 'text-amber-500',
    bgColor: 'bg-amber-500/10',
  },
];

/**
 * Activity filter bar component.
 *
 * Provides pill-style buttons for activity type filtering and a dropdown
 * for agent selection. Designed for the Command Center activity feed.
 */
export const ActivityFilters = memo(function ActivityFilters({
  activityType,
  onActivityTypeChange,
  selectedAgentId,
  onAgentChange,
  agents,
  agentsLoading = false,
  className,
}: ActivityFiltersProps) {
  const [agentDropdownOpen, setAgentDropdownOpen] = useState(false);

  // Find the selected agent for display
  const selectedAgent = useMemo(
    () => agents.find((a) => a.id === selectedAgentId),
    [agents, selectedAgentId]
  );

  // Count of active filters (excluding defaults)
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (activityType !== 'all') count++;
    if (selectedAgentId) count++;
    return count;
  }, [activityType, selectedAgentId]);

  const handleClearFilters = () => {
    onActivityTypeChange('all');
    onAgentChange(null);
  };

  return (
    <div className={cn('space-y-4', className)}>
      {/* Filter Bar Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          <Filter className="h-4 w-4" />
          <span className="font-medium">Filters</span>
          {activeFilterCount > 0 && (
            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-blue-500 px-1.5 font-medium text-white text-xs">
              {activeFilterCount}
            </span>
          )}
        </div>

        {activeFilterCount > 0 && (
          <button
            onClick={handleClearFilters}
            className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-muted-foreground text-xs transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="h-3 w-3" />
            Clear all
          </button>
        )}
      </div>

      {/* Filter Controls */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Activity Type Pills */}
        <div className="flex flex-wrap gap-2">
          {ACTIVITY_TYPES.map((type) => {
            const Icon = type.icon;
            const isActive = activityType === type.value;

            return (
              <button
                key={type.value}
                onClick={() => onActivityTypeChange(type.value)}
                className={cn(
                  'group flex items-center gap-2 rounded-full px-4 py-2 font-medium text-sm transition-all duration-200',
                  isActive
                    ? cn(type.bgColor, type.color, 'ring-1 ring-current/20')
                    : 'bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground'
                )}
              >
                <Icon
                  className={cn(
                    'h-4 w-4 transition-transform duration-200 group-hover:scale-110',
                    isActive ? type.color : 'text-current'
                  )}
                />
                <span>{type.label}</span>
              </button>
            );
          })}
        </div>

        {/* Divider */}
        <div className="hidden h-6 w-px bg-border sm:block" />

        {/* Agent Dropdown */}
        <DropdownMenu
          open={agentDropdownOpen}
          onOpenChange={setAgentDropdownOpen}
        >
          <DropdownMenuTrigger asChild>
            <button
              className={cn(
                'flex items-center gap-2 rounded-full px-4 py-2 font-medium text-sm transition-all duration-200',
                selectedAgentId
                  ? 'bg-blue-500/10 text-blue-500 ring-1 ring-blue-500/20'
                  : 'bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground'
              )}
            >
              {selectedAgent ? (
                <>
                  <Avatar
                    id={selectedAgent.id}
                    name={selectedAgent.name}
                    src={selectedAgent.profileImageUrl ?? undefined}
                    type="user"
                    size="sm"
                  />
                  <span className="max-w-24 truncate">
                    {selectedAgent.name}
                  </span>
                </>
              ) : (
                <>
                  <Bot className="h-4 w-4" />
                  <span>All Agents</span>
                </>
              )}
              <ChevronDown
                className={cn(
                  'h-4 w-4 transition-transform duration-200',
                  agentDropdownOpen && 'rotate-180'
                )}
              />
            </button>
          </DropdownMenuTrigger>

          <DropdownMenuContent align="start" className="w-64">
            <DropdownMenuLabel className="flex items-center gap-2 text-muted-foreground">
              <Bot className="h-4 w-4" />
              Filter by Agent
            </DropdownMenuLabel>
            <DropdownMenuSeparator />

            {/* All Agents Option */}
            <DropdownMenuItem
              onClick={() => onAgentChange(null)}
              className="flex items-center justify-between gap-2"
            >
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted">
                  <Sparkles className="h-4 w-4 text-muted-foreground" />
                </div>
                <span className="font-medium">All Agents</span>
              </div>
              {!selectedAgentId && <Check className="h-4 w-4 text-blue-500" />}
            </DropdownMenuItem>

            <DropdownMenuSeparator />

            {/* Agent List */}
            {agentsLoading ? (
              <div className="space-y-2 p-2">
                {[1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="flex animate-pulse items-center gap-2"
                  >
                    <div className="h-8 w-8 rounded-full bg-muted" />
                    <div className="h-4 w-24 rounded bg-muted" />
                  </div>
                ))}
              </div>
            ) : agents.length === 0 ? (
              <div className="p-4 text-center text-muted-foreground text-sm">
                No agents found
              </div>
            ) : (
              <div className="max-h-64 overflow-y-auto">
                {agents.map((agent) => (
                  <DropdownMenuItem
                    key={agent.id}
                    onClick={() => onAgentChange(agent.id)}
                    className="flex items-center justify-between gap-2"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <Avatar
                        id={agent.id}
                        name={agent.name}
                        src={agent.profileImageUrl ?? undefined}
                        type="user"
                        size="sm"
                      />
                      <div className="min-w-0">
                        <div className="truncate font-medium">{agent.name}</div>
                        {agent.username && (
                          <div className="truncate text-muted-foreground text-xs">
                            @{agent.username}
                          </div>
                        )}
                      </div>
                    </div>
                    {selectedAgentId === agent.id && (
                      <Check className="h-4 w-4 shrink-0 text-blue-500" />
                    )}
                  </DropdownMenuItem>
                ))}
              </div>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Active Filters Summary (mobile-friendly) */}
      {activeFilterCount > 0 && (
        <div className="flex flex-wrap items-center gap-2 sm:hidden">
          {activityType !== 'all' && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-xs">
              {ACTIVITY_TYPES.find((t) => t.value === activityType)?.label}
              <button
                onClick={() => onActivityTypeChange('all')}
                className="rounded-full p-0.5 hover:bg-foreground/10"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          )}
          {selectedAgent && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-xs">
              {selectedAgent.name}
              <button
                onClick={() => onAgentChange(null)}
                className="rounded-full p-0.5 hover:bg-foreground/10"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          )}
        </div>
      )}
    </div>
  );
});
