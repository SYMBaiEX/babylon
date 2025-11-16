'use client';

import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Props for the EmptyState component.
 */
interface EmptyStateProps {
  /** Optional icon to display */
  icon?: LucideIcon;
  /** Title text */
  title: string;
  /** Description text */
  description: string;
  /** Optional action button */
  action?: {
    /** Button label */
    label: string;
    /** Button click handler */
    onClick: () => void;
  };
  /** Additional CSS classes */
  className?: string;
}

/**
 * Empty state component for displaying when there's no content.
 * 
 * Shows a centered message with optional icon and action button.
 * Used to indicate empty lists, no results, or initial states.
 * 
 * @param props - EmptyState component props
 * @returns Empty state element
 * 
 * @example
 * ```tsx
 * <EmptyState
 *   icon={Inbox}
 *   title="No messages"
 *   description="You don't have any messages yet"
 *   action={{ label: "Send Message", onClick: handleSend }}
 * />
 * ```
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center py-12 px-4 text-center', className)}>
      {Icon && (
        <div className="mb-4 p-4 rounded-full bg-muted/50">
          <Icon size={48} className="text-muted-foreground/70" />
        </div>
      )}
      <h3 className="text-lg font-semibold mb-2">{title}</h3>
      <p className="text-muted-foreground text-sm max-w-sm mb-6">{description}</p>
      {action && (
        <button
          onClick={action.onClick}
          className="px-6 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors font-medium"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}

