'use client';

import { cn } from '@babylon/shared';
import { Check, ChevronDown, ChevronsUpDown, ChevronUp } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export type BottomPanelTab = 'activity' | 'wallet' | 'pnl' | 'logs';
export type EntityType = 'user' | 'agent';

interface EntityOption {
  id: string;
  name: string;
  type: EntityType;
}

const MIN_HEIGHT = 150;
const MAX_HEIGHT = 500;
export const BOTTOM_PANEL_DEFAULT_HEIGHT = 240;
export const BOTTOM_PANEL_COLLAPSED_HEIGHT = 40;

interface BottomPanelProps {
  isOpen: boolean;
  onToggle: () => void;
  activeTab: BottomPanelTab;
  onTabChange: (tab: BottomPanelTab) => void;
  selectedEntityId: string | null;
  selectedEntityType: EntityType | null;
  onEntityChange: (id: string, type: EntityType) => void;
  userId?: string;
  userName?: string;
  agents: { id: string; name: string }[];
  height: number;
  onHeightChange: (height: number) => void;
  children: React.ReactNode;
}

/**
 * Bottom panel with tabs for Activity, Wallet, PnL, and Logs.
 * Supports viewing both user and agent data.
 * - Agent: Shows all 4 tabs (Activity, Wallet, PnL, Logs)
 * - User: Shows only Wallet and PnL tabs
 * Spans full width, collapsible, and resizable.
 */
export function BottomPanel({
  isOpen,
  onToggle,
  activeTab,
  onTabChange,
  selectedEntityId,
  selectedEntityType,
  onEntityChange,
  userId,
  userName,
  agents,
  height,
  onHeightChange,
  children,
}: BottomPanelProps) {
  const [isResizing, setIsResizing] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // Store mouse event handlers in refs for proper cleanup
  const handleMouseMoveRef = useRef<((e: MouseEvent) => void) | null>(null);
  const handleMouseUpRef = useRef<(() => void) | null>(null);

  // Cleanup mouse listeners on unmount
  useEffect(() => {
    return () => {
      if (handleMouseMoveRef.current) {
        document.removeEventListener('mousemove', handleMouseMoveRef.current);
      }
      if (handleMouseUpRef.current) {
        document.removeEventListener('mouseup', handleMouseUpRef.current);
      }
    };
  }, []);

  // Build entity options list (user first, then agents)
  const entities: EntityOption[] = [
    ...(userId
      ? [{ id: userId, name: userName || 'You', type: 'user' as EntityType }]
      : []),
    ...agents.map((a) => ({
      id: a.id,
      name: a.name,
      type: 'agent' as EntityType,
    })),
  ];

  // Get currently selected entity
  const selectedEntity = entities.find(
    (e) => e.id === selectedEntityId && e.type === selectedEntityType
  );

  // Determine which tabs to show based on entity type
  const isUserSelected = selectedEntityType === 'user';
  const allTabs: { id: BottomPanelTab; label: string }[] = [
    { id: 'activity', label: 'Activity' },
    { id: 'wallet', label: 'Wallet' },
    { id: 'pnl', label: 'PnL' },
    { id: 'logs', label: 'Logs' },
  ];
  // Hide Logs and Activity tabs for user
  const tabs = isUserSelected
    ? allTabs.filter((t) => t.id !== 'logs' && t.id !== 'activity')
    : allTabs;

  // Handle tab click - if clicking active tab while open, collapse
  const handleTabClick = useCallback(
    (tab: BottomPanelTab) => {
      if (!isOpen) {
        onTabChange(tab);
        onToggle(); // Open
      } else if (tab === activeTab) {
        onToggle(); // Collapse
      } else {
        onTabChange(tab);
      }
    },
    [isOpen, activeTab, onTabChange, onToggle]
  );

  // Handle resize drag
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (!isOpen) return;
      e.preventDefault();
      setIsResizing(true);

      const startY = e.clientY;
      const startHeight = height;

      const handleMouseMove = (moveEvent: MouseEvent) => {
        const delta = startY - moveEvent.clientY;
        const newHeight = Math.min(
          Math.max(startHeight + delta, MIN_HEIGHT),
          MAX_HEIGHT
        );
        onHeightChange(newHeight);
      };

      const handleMouseUp = () => {
        setIsResizing(false);
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        handleMouseMoveRef.current = null;
        handleMouseUpRef.current = null;
      };

      // Store refs for cleanup on unmount
      handleMouseMoveRef.current = handleMouseMove;
      handleMouseUpRef.current = handleMouseUp;

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    },
    [isOpen, height, onHeightChange]
  );

  return (
    <div
      ref={panelRef}
      className={cn(
        'relative shrink-0 border-border border-t bg-background transition-[height] duration-200',
        isResizing && 'select-none transition-none'
      )}
      style={{ height: isOpen ? height : BOTTOM_PANEL_COLLAPSED_HEIGHT }}
    >
      {/* Resize Handle - only when open */}
      {isOpen && (
        <div
          role="separator"
          tabIndex={0}
          aria-orientation="horizontal"
          aria-valuemin={MIN_HEIGHT}
          aria-valuemax={MAX_HEIGHT}
          aria-valuenow={height}
          aria-label="Resize panel"
          onMouseDown={handleMouseDown}
          onKeyDown={(e) => {
            const STEP = 20;
            const LARGE_STEP = 50;
            let newHeight = height;

            switch (e.key) {
              case 'ArrowUp':
                e.preventDefault();
                newHeight = Math.min(height + STEP, MAX_HEIGHT);
                break;
              case 'ArrowDown':
                e.preventDefault();
                newHeight = Math.max(height - STEP, MIN_HEIGHT);
                break;
              case 'PageUp':
                e.preventDefault();
                newHeight = Math.min(height + LARGE_STEP, MAX_HEIGHT);
                break;
              case 'PageDown':
                e.preventDefault();
                newHeight = Math.max(height - LARGE_STEP, MIN_HEIGHT);
                break;
              case 'Home':
                e.preventDefault();
                newHeight = MAX_HEIGHT;
                break;
              case 'End':
                e.preventDefault();
                newHeight = MIN_HEIGHT;
                break;
              default:
                return;
            }

            if (newHeight !== height) {
              onHeightChange(newHeight);
            }
          }}
          className={cn(
            '-translate-y-1/2 absolute top-0 right-0 left-0 z-10 h-2 cursor-row-resize',
            'hover:bg-primary/30 focus:bg-primary/40 focus:outline-none focus:ring-2 focus:ring-primary/50',
            isResizing && 'bg-primary/50'
          )}
        />
      )}

      {/* Tab Bar */}
      <div className="flex h-10 items-center justify-between border-border border-b bg-muted/30 px-2">
        <div className="flex items-center gap-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => handleTabClick(tab.id)}
              className={cn(
                'rounded-md px-3 py-1.5 font-medium text-xs transition-colors',
                activeTab === tab.id && isOpen
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          {/* Entity Selector Dropdown */}
          {entities.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className={cn(
                    'flex h-7 items-center gap-1.5 rounded-md border border-border bg-background px-2 text-xs transition-colors',
                    'hover:bg-muted focus:outline-none focus:ring-1 focus:ring-primary'
                  )}
                >
                  <span className="max-w-[120px] truncate">
                    {selectedEntity?.name || 'Select...'}
                  </span>
                  <ChevronsUpDown className="h-3 w-3 shrink-0 text-muted-foreground" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="max-h-60 w-48 overflow-y-auto"
              >
                {/* User option first */}
                {userId && (
                  <>
                    <DropdownMenuItem
                      onClick={() => onEntityChange(userId, 'user')}
                      className="flex items-center justify-between"
                    >
                      <span className="truncate font-medium">
                        {userName || 'You'}
                      </span>
                      {selectedEntityId === userId &&
                        selectedEntityType === 'user' && (
                          <Check className="h-4 w-4 shrink-0 text-primary" />
                        )}
                    </DropdownMenuItem>
                    {agents.length > 0 && <DropdownMenuSeparator />}
                  </>
                )}
                {/* Agent options */}
                {agents.map((agent) => (
                  <DropdownMenuItem
                    key={agent.id}
                    onClick={() => onEntityChange(agent.id, 'agent')}
                    className="flex items-center justify-between"
                  >
                    <span className="truncate">{agent.name}</span>
                    {selectedEntityId === agent.id &&
                      selectedEntityType === 'agent' && (
                        <Check className="h-4 w-4 shrink-0 text-primary" />
                      )}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {/* Collapse/Expand toggle */}
          <button
            type="button"
            onClick={onToggle}
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label={isOpen ? 'Collapse panel' : 'Expand panel'}
          >
            {isOpen ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronUp className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>

      {/* Content Area */}
      {isOpen && (
        <div
          className="overflow-auto"
          style={{ height: height - BOTTOM_PANEL_COLLAPSED_HEIGHT }}
        >
          {selectedEntityId ? (
            children
          ) : (
            <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
              Select an option from the dropdown to view details
            </div>
          )}
        </div>
      )}
    </div>
  );
}
