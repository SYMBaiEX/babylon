'use client';

import { cn } from '@babylon/shared';
import { Bug, MessageSquare, Zap, type LucideIcon } from 'lucide-react';

export type FeedbackType = 'bug' | 'feature_request' | 'performance';

interface FeedbackTypeConfig {
  type: FeedbackType;
  icon: LucideIcon;
  title: string;
  description: string;
}

const FEEDBACK_TYPES: FeedbackTypeConfig[] = [
  {
    type: 'bug',
    icon: Bug,
    title: 'Report a Bug',
    description:
      'Help us fix issues by describing what happened and how to reproduce it.',
  },
  {
    type: 'feature_request',
    icon: MessageSquare,
    title: 'Feature Request',
    description:
      'Tell us what you would like to see or change. How strongly do you feel about this?',
  },
  {
    type: 'performance',
    icon: Zap,
    title: 'Performance Issue',
    description:
      'Report performance issues like lag, crashes, or graphical glitches.',
  },
];

interface FeedbackTypeSelectorProps {
  onSelect: (type: FeedbackType) => void;
}

export function FeedbackTypeSelector({ onSelect }: FeedbackTypeSelectorProps) {
  return (
    <div className="space-y-4">
      <h3 className="font-semibold text-foreground text-sm">
        What type of feedback would you like to submit?
      </h3>
      <div className="grid gap-3 sm:grid-cols-3">
        {FEEDBACK_TYPES.map(({ type, icon: Icon, title, description }) => (
          <button
            key={type}
            onClick={() => onSelect(type)}
            className={cn(
              'flex flex-col items-center gap-3 rounded-lg border border-border bg-card p-4',
              'transition-all hover:border-[#1c9cf0] hover:bg-muted/50',
              'text-left'
            )}
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#1c9cf0]/20">
              <Icon className="h-6 w-6 text-[#1c9cf0]" />
            </div>
            <div className="text-center">
              <div className="font-semibold text-foreground text-sm">
                {title}
              </div>
              <div className="mt-1 text-muted-foreground text-xs">
                {description}
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

export function getFeedbackTypeConfig(type: FeedbackType): FeedbackTypeConfig {
  const config = FEEDBACK_TYPES.find((c) => c.type === type);
  // Type guard: FEEDBACK_TYPES always has the bug type, so this is safe
  return config ?? FEEDBACK_TYPES[0]!;
}

