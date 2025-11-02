'use client'

import { useAuth } from '@/hooks/useAuth'
import { cn } from '@/lib/utils'

export function FeedAuthBanner() {
  const { login, authenticated } = useAuth()

  // Don't show if user is authenticated
  if (authenticated) {
    return null
  }

  return (
    <div
      className={cn(
        'fixed bottom-0 left-0 right-0 z-50',
        'bg-white text-black',
        'border-t-2'
      )}
    >
      <div className="max-w-7xl mx-auto px-4 py-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex-1">
            <h3 className="font-bold text-lg mb-1">
              Join the conversation.
            </h3>
            <p className="text-sm opacity-90">
              You're still early!
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={login}
              className={cn(
                'px-6 py-2 font-bold',
                'bg-background text-foreground',
                'hover:bg-background/90',
                'transition-colors',
                'bg-primary text-primary-foreground'
              )}
            >
              Log in
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

