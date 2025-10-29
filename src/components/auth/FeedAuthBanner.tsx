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
        'bg-primary text-primary-foreground',
        'border-t-2'
      )}
      style={{ borderColor: '#1c9cf0' }}
    >
      <div className="max-w-7xl mx-auto px-4 py-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex-1">
            <h3 className="font-bold text-lg mb-1">
              Don't miss what's happening
            </h3>
            <p className="text-sm opacity-90">
              People on Babylon are the first to know.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={login}
              className={cn(
                'px-6 py-2 rounded-full font-bold',
                'bg-background text-foreground',
                'hover:bg-background/90',
                'transition-colors'
              )}
            >
              Log in
            </button>
            <button
              onClick={login}
              className={cn(
                'px-6 py-2 rounded-full font-bold',
                'bg-white text-black',
                'hover:bg-white/90',
                'transition-colors'
              )}
            >
              Sign up
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

