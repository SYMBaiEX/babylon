'use client';

import { Wallet } from 'lucide-react';

interface WalletEmptyStateProps {
  title: string;
  description: string;
  action?: {
    label: string;
    onClick: () => void;
  };
}

export function WalletEmptyState({
  title,
  description,
  action,
}: WalletEmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-border py-12 text-center">
      <Wallet className="mb-4 h-12 w-12 text-muted-foreground opacity-50" />
      <h3 className="mb-1 font-semibold text-base text-foreground">{title}</h3>
      <p className="mb-4 max-w-xs text-muted-foreground text-sm">
        {description}
      </p>
      {action && (
        <button
          onClick={action.onClick}
          className="rounded-lg bg-[#0066FF] px-4 py-2 font-medium text-sm text-white hover:bg-[#0066FF]/90"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
