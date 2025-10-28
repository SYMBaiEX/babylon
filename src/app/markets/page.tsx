'use client'

import { useState } from 'react'
import { Search } from 'lucide-react'
import { PageContainer } from '@/components/shared/PageContainer'
import { cn } from '@/lib/utils'

export default function MarketsPage() {
  const [searchQuery, setSearchQuery] = useState('')

  return (
    <PageContainer noPadding className="flex flex-col">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background border-b border-border">
        <div className="p-4">
          <h1 className="text-2xl font-bold mb-4 text-foreground">Prediction Markets</h1>

          {/* Search bar */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <input
              type="search"
              placeholder="Search markets..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={cn(
                'w-full pl-10 pr-4 py-3 rounded-lg',
                'bg-muted border border-border text-foreground',
                'placeholder:text-muted-foreground',
                'focus:outline-none focus:ring-2 focus:ring-primary',
                'transition-all duration-200'
              )}
            />
          </div>
        </div>
      </div>

      {/* Content area */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto p-4">
          <div className="text-center text-muted-foreground py-12">
            <h2 className="text-2xl font-bold mb-2 text-foreground">Markets Page</h2>
            <p className="mt-4 text-sm">Prediction markets will appear here</p>
            <p className="text-xs mt-2">YES/NO markets with live odds and trading</p>
          </div>
        </div>
      </div>
    </PageContainer>
  )
}
