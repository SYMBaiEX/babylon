'use client'

import { cn } from '@/lib/utils'

interface FeedToggleProps {
  activeTab: 'latest' | 'following'
  onTabChange: (tab: 'latest' | 'following') => void
}

export function FeedToggle({ activeTab, onTabChange }: FeedToggleProps) {
  return (
    <div className="flex items-center gap-6">
      <button
        onClick={() => onTabChange('latest')}
        className={cn(
          'px-3 py-2 font-semibold transition-all duration-300',
          'relative',
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
          'px-3 py-2 font-semibold transition-all duration-300',
          'relative',
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
