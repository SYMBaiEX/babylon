'use client'

import { cn } from '@/lib/utils'

interface FeedToggleProps {
  activeTab: 'latest' | 'following' | 'favorites'
  onTabChange: (tab: 'latest' | 'following' | 'favorites') => void
}

export function FeedToggle({ activeTab, onTabChange }: FeedToggleProps) {
  return (
    <div className="sticky top-0 z-10 bg-background">
      <div className="flex items-center justify-around h-14">
        <button
          onClick={() => onTabChange('latest')}
          className={cn(
            'flex-1 h-full font-semibold transition-all duration-300',
            'relative',
            activeTab === 'latest'
              ? 'text-foreground'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted/30'
          )}
        >
          Latest
          {activeTab === 'latest' && (
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-primary rounded-t-full" />
          )}
        </button>
        <button
          onClick={() => onTabChange('following')}
          className={cn(
            'flex-1 h-full font-semibold transition-all duration-300',
            'relative',
            activeTab === 'following'
              ? 'text-foreground'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted/30'
          )}
        >
          Following
          {activeTab === 'following' && (
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-primary rounded-t-full" />
          )}
        </button>
        <button
          onClick={() => onTabChange('favorites')}
          className={cn(
            'flex-1 h-full font-semibold transition-all duration-300',
            'relative',
            activeTab === 'favorites'
              ? 'text-foreground'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted/30'
          )}
        >
          Favorites
          {activeTab === 'favorites' && (
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-primary rounded-t-full" />
          )}
        </button>
      </div>
    </div>
  )
}
