'use client';

import { cn } from '@babylon/shared';

export type WalletTab = 'overview' | 'tokens' | 'nfts' | 'activity';

interface WalletTabsProps {
  activeTab: WalletTab;
  onTabChange: (tab: WalletTab) => void;
}

const tabs: { id: WalletTab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'tokens', label: 'Tokens' },
  { id: 'nfts', label: 'NFTs' },
  { id: 'activity', label: 'Activity' },
];

export function WalletTabs({ activeTab, onTabChange }: WalletTabsProps) {
  return (
    <div className="flex gap-1 border-border border-b">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onTabChange(tab.id)}
          className={cn(
            'relative px-4 py-2.5 font-medium text-sm transition-colors',
            activeTab === tab.id
              ? 'text-foreground'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          {tab.label}
          {activeTab === tab.id && (
            <span className="absolute inset-x-0 bottom-0 h-0.5 bg-[#0066FF]" />
          )}
        </button>
      ))}
    </div>
  );
}
