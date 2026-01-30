'use client';

import { cn } from '@babylon/shared';
import {
  Activity,
  Check,
  ChevronDown,
  ChevronsUpDown,
  ChevronUp,
  FileText,
  Wallet,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export type BottomPanelTab = 'activity' | 'portfolio' | 'logs';

interface AgentOption {
  id: string;
  name: string;
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
  selectedAgentId: string | null;
  onAgentChange: (agentId: string) => void;
  agents: AgentOption[];
  height: number;
  onHeightChange: (height: number) => void;
  children: React.ReactNode;
}

/**
 * Bottom panel with tabs for Activity, Portfolio, Logs, Settings.
 * Spans full width, collapsible, and resizable.
 */
export function BottomPanel({
  isOpen,
  onToggle,
  activeTab,
  onTabChange,
  selectedAgentId,
  onAgentChange,
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

  const tabs: { id: BottomPanelTab; label: string; icon: typeof Activity }[] = [
    { id: 'activity', label: 'Activity', icon: Activity },
    { id: 'portfolio', label: 'Portfolio', icon: Wallet },
    { id: 'logs', label: 'Logs', icon: FileText },
  ];

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
          onMouseDown={handleMouseDown}
          className={cn(
            '-translate-y-1/2 absolute top-0 right-0 left-0 z-10 h-2 cursor-row-resize',
            'hover:bg-primary/30',
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
                'flex items-center gap-1.5 rounded-md px-3 py-1.5 font-medium text-xs transition-colors',
                activeTab === tab.id && isOpen
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              )}
            >
              <tab.icon className="h-3.5 w-3.5" />
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          {/* Agent Selector Dropdown */}
          {agents.length > 0 && (
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
                    {agents.find((a) => a.id === selectedAgentId)?.name ||
                      'Select agent'}
                  </span>
                  <ChevronsUpDown className="h-3 w-3 shrink-0 text-muted-foreground" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="max-h-60 w-48 overflow-y-auto"
              >
                {agents.map((agent) => (
                  <DropdownMenuItem
                    key={agent.id}
                    onClick={() => onAgentChange(agent.id)}
                    className="flex items-center justify-between"
                  >
                    <span className="truncate">{agent.name}</span>
                    {selectedAgentId === agent.id && (
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
          {selectedAgentId ? (
            children
          ) : (
            <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
              Select an agent from the sidebar to view details
            </div>
          )}
        </div>
      )}
    </div>
  );
}
