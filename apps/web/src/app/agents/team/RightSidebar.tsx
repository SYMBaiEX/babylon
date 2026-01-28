'use client';

import { cn } from '@babylon/shared';
import { Bot, Settings, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

/** Tab data for right sidebar */
export interface RightSidebarTab {
  id: string;
  type: 'agent-settings' | 'agent-activity' | 'other';
  title: string;
  agentId?: string;
}

// Width constraints
const MIN_WIDTH = 320;
const MAX_WIDTH_WITH_LEFT_SIDEBAR = 600;
const MAX_WIDTH_WITHOUT_LEFT_SIDEBAR = 900;
const DEFAULT_WIDTH = 400;
const LEFT_SIDEBAR_WIDTH = 256; // w-64
const MIN_CHAT_WIDTH = 450; // Minimum chat area width

interface RightSidebarProps {
  tabs: RightSidebarTab[];
  activeTabId: string | null;
  onTabSelect: (tabId: string) => void;
  onTabClose: (tabId: string) => void;
  width: number;
  onWidthChange: (width: number) => void;
  onClose: () => void;
  leftSidebarCollapsed?: boolean;
  children: React.ReactNode;
}

/**
 * Right sidebar panel.
 * Resizable with drag handle. Respects minimum chat width.
 */
export function RightSidebar({
  tabs,
  activeTabId,
  onTabSelect,
  onTabClose,
  width,
  onWidthChange,
  onClose,
  leftSidebarCollapsed = false,
  children,
}: RightSidebarProps) {
  const [isResizing, setIsResizing] = useState(false);
  const [maxWidth, setMaxWidth] = useState(MAX_WIDTH_WITH_LEFT_SIDEBAR);
  const sidebarRef = useRef<HTMLDivElement>(null);

  // Calculate max width based on available space
  // Only recalculate on window resize or left sidebar state change, NOT on width change
  useEffect(() => {
    const calculateMaxWidth = () => {
      // Find the page container using data attribute (more reliable than class selector)
      const pageContainer = sidebarRef.current?.closest(
        '[data-command-center-container]'
      );
      // Use container width if found, otherwise fall back to a reasonable default
      const containerWidth = pageContainer
        ? pageContainer.getBoundingClientRect().width
        : Math.min(window.innerWidth, 1280); // max-w-screen-xl fallback

      const leftSidebarWidth = leftSidebarCollapsed ? 0 : LEFT_SIDEBAR_WIDTH;
      const maxLimit = leftSidebarCollapsed
        ? MAX_WIDTH_WITHOUT_LEFT_SIDEBAR
        : MAX_WIDTH_WITH_LEFT_SIDEBAR;

      // Calculate available space for sidebar
      // Container width - left sidebar - min chat width - buffer for borders
      const availableSpace =
        containerWidth - leftSidebarWidth - MIN_CHAT_WIDTH - 40;

      // Max is the smaller of the limit or available space, but at least MIN_WIDTH
      const newMax = Math.max(MIN_WIDTH, Math.min(availableSpace, maxLimit));
      setMaxWidth(newMax);
    };

    // Run after a short delay to ensure DOM is ready
    const timeoutId = setTimeout(calculateMaxWidth, 50);
    window.addEventListener('resize', calculateMaxWidth);
    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener('resize', calculateMaxWidth);
    };
  }, [leftSidebarCollapsed]); // Removed width and onWidthChange - only recalc on sidebar state/resize

  // Clamp width if it exceeds maxWidth (separate effect to handle width changes)
  useEffect(() => {
    if (width > maxWidth) {
      onWidthChange(maxWidth);
    }
  }, [width, maxWidth, onWidthChange]);

  // Handle resize drag
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      setIsResizing(true);

      const startX = e.clientX;
      const startWidth = width;

      const handleMouseMove = (moveEvent: MouseEvent) => {
        const delta = startX - moveEvent.clientX;
        const newWidth = Math.min(
          Math.max(startWidth + delta, MIN_WIDTH),
          maxWidth
        );
        onWidthChange(newWidth);
      };

      const handleMouseUp = () => {
        setIsResizing(false);
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    },
    [width, maxWidth, onWidthChange]
  );

  // Clamp width to valid range
  const clampedWidth = Math.min(Math.max(width, MIN_WIDTH), maxWidth);

  // Empty state
  const emptyState = (
    <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
      <div className="mb-4 rounded-full bg-muted/50 p-4">
        <Settings className="h-8 w-8 text-muted-foreground" />
      </div>
      <h3 className="mb-2 font-medium text-foreground">No panels open</h3>
      <p className="max-w-[200px] text-muted-foreground text-sm">
        Click &quot;Settings&quot; on an agent to open their settings here
      </p>
    </div>
  );

  return (
    <>
      {/* Backdrop - mobile only */}
      <div
        className="fixed inset-0 z-40 bg-background/80 backdrop-blur-sm lg:hidden"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Sidebar */}
      <div
        ref={sidebarRef}
        className={cn(
          'fixed top-0 right-0 z-50 flex h-full flex-col border-border border-l bg-background',
          'shadow-xl lg:absolute lg:z-40 lg:shadow-none',
          isResizing && 'select-none'
        )}
        style={{ width: clampedWidth }}
      >
        {/* Resize Handle - desktop only */}
        <div
          onMouseDown={handleMouseDown}
          className={cn(
            'absolute top-0 left-0 hidden h-full w-1.5 cursor-col-resize lg:block',
            'hover:bg-primary/30',
            isResizing && 'bg-primary/50'
          )}
        />

        {/* Header - mobile only */}
        <div className="flex shrink-0 items-center justify-between border-border border-b p-3 lg:hidden">
          <span className="font-medium text-sm">Panel</span>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="Close panel"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {tabs.length === 0 ? (
          emptyState
        ) : (
          <>
            {/* Tab Bar */}
            <div className="shrink-0 overflow-x-auto border-border border-b bg-muted/30 px-2 py-1">
              <div className="flex items-center gap-1">
                {tabs.map((tab) => (
                  <div
                    key={tab.id}
                    role="tab"
                    tabIndex={0}
                    onClick={() => onTabSelect(tab.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onTabSelect(tab.id);
                      }
                    }}
                    className={cn(
                      'group flex shrink-0 cursor-pointer items-center gap-1.5 rounded-md px-2 py-1.5 text-sm transition-colors',
                      activeTabId === tab.id
                        ? 'bg-background text-foreground shadow-sm'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                    )}
                  >
                    <Bot className="h-3.5 w-3.5 shrink-0" />
                    <span className="max-w-[100px] truncate">{tab.title}</span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onTabClose(tab.id);
                      }}
                      className={cn(
                        'rounded p-0.5 transition-colors',
                        'text-muted-foreground hover:bg-muted hover:text-foreground',
                        'opacity-0 group-hover:opacity-100',
                        activeTabId === tab.id && 'opacity-100'
                      )}
                      aria-label={`Close ${tab.title}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-auto">{children}</div>
          </>
        )}
      </div>
    </>
  );
}

export { DEFAULT_WIDTH as RIGHT_SIDEBAR_DEFAULT_WIDTH };
