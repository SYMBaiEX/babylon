'use client'

import { cn } from '@/lib/utils'

interface FeedToggleProps {
  activeTab: 'latest' | 'following'
  onTabChange: (tab: 'latest' | 'following') => void
}

export function FeedToggle({ activeTab, onTabChange }: FeedToggleProps) {
  return (
    <div className="flex items-center w-full border-b border-border">
      <button
        onClick={() => onTabChange('latest')}
        className={cn(
          'flex-1 px-4 py-3 text-sm sm:text-base font-semibold transition-all duration-200',
          'relative whitespace-nowrap text-center',
          'hover:bg-muted/30',
          activeTab === 'latest'
            ? 'text-foreground'
            : 'text-muted-foreground hover:text-foreground'
        )}
      >
        Latest
        {activeTab === 'latest' && (
          <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#0066FF]" />
        )}
      </button>
      <button
        onClick={() => onTabChange('following')}
        className={cn(
          'flex-1 px-4 py-3 text-sm sm:text-base font-semibold transition-all duration-200',
          'relative whitespace-nowrap text-center',
          'hover:bg-muted/30',
          activeTab === 'following'
            ? 'text-foreground'
            : 'text-muted-foreground hover:text-foreground'
        )}
      >
        Following
        {activeTab === 'following' && (
          <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#0066FF]" />
        )}
      </button>
    </div>
  )
}
