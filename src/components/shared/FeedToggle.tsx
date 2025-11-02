'use client'

import { cn } from '@/lib/utils'

interface FeedToggleProps {
  activeTab: 'latest' | 'following'
  onTabChange: (tab: 'latest' | 'following') => void
}

export function FeedToggle({ activeTab, onTabChange }: FeedToggleProps) {
  return (
    <div className="flex items-center gap-4 sm:gap-6">
      <button
        onClick={() => onTabChange('latest')}
        className={cn(
          'px-2 sm:px-3 py-2 font-semibold text-sm sm:text-base transition-all duration-300',
          'relative whitespace-nowrap',
          activeTab === 'latest'
            ? 'text-foreground'
            : 'text-muted-foreground hover:text-foreground'
        )}
      >
        Latest
        {activeTab === 'latest' && (
          <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />
        )}
      </button>
      <button
        onClick={() => onTabChange('following')}
        className={cn(
          'px-2 sm:px-3 py-2 font-semibold text-sm sm:text-base transition-all duration-300',
          'relative whitespace-nowrap',
          activeTab === 'following'
            ? 'text-foreground'
            : 'text-muted-foreground hover:text-foreground'
        )}
      >
        Following
        {activeTab === 'following' && (
          <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />
        )}
      </button>
    </div>
  )
}
