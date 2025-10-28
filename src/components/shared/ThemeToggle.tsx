'use client'

import { Moon, Sun } from 'lucide-react'
import { useTheme } from 'next-themes'
import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'

export function ThemeToggle() {
  const [mounted, setMounted] = useState(false)
  const { theme, setTheme } = useTheme()

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return (
      <button
        className="relative inline-flex h-10 w-20 items-center rounded-full bg-muted/50 backdrop-blur-md border border-border/50"
        aria-label="Toggle theme"
      >
        <span className="sr-only">Toggle theme</span>
      </button>
    )
  }

  const isDark = theme === 'dark'

  return (
    <button
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      className={cn(
        'relative inline-flex h-10 w-20 items-center rounded-full transition-all duration-500 ease-out',
        'bg-gradient-to-br shadow-depth hover:shadow-depth-lg',
        'backdrop-blur-xl border',
        'group overflow-hidden',
        isDark
          ? 'from-slate-800/90 to-slate-900/90 border-slate-700/50 shadow-glass-dark'
          : 'from-white/90 to-gray-50/90 border-gray-200/50 shadow-glass'
      )}
      aria-label={`Switch to ${isDark ? 'light' : 'dark'} mode`}
    >
      {/* Sliding background */}
      <span
        className={cn(
          'absolute inset-0 transition-all duration-500 ease-out',
          'bg-gradient-to-br rounded-full',
          isDark
            ? 'from-blue-500/20 to-purple-600/20'
            : 'from-yellow-400/30 to-orange-400/30',
          'opacity-0 group-hover:opacity-100'
        )}
      />

      {/* Toggle circle */}
      <span
        className={cn(
          'relative inline-flex h-8 w-8 transform items-center justify-center rounded-full',
          'transition-all duration-500 ease-out',
          'shadow-lg',
          isDark
            ? 'translate-x-11 bg-gradient-to-br from-slate-700 to-slate-800 shadow-blue-500/30'
            : 'translate-x-1 bg-gradient-to-br from-white to-gray-100 shadow-yellow-500/40'
        )}
      >
        {/* Icon container with rotation animation */}
        <span
          className={cn(
            'absolute inset-0 flex items-center justify-center',
            'transition-all duration-500 ease-out'
          )}
        >
          <Sun
            className={cn(
              'h-4 w-4 transition-all duration-500 ease-out',
              isDark
                ? 'rotate-90 scale-0 opacity-0 text-gray-400'
                : 'rotate-0 scale-100 opacity-100 text-yellow-600'
            )}
          />
          <Moon
            className={cn(
              'absolute h-4 w-4 transition-all duration-500 ease-out',
              isDark
                ? 'rotate-0 scale-100 opacity-100 text-blue-400'
                : '-rotate-90 scale-0 opacity-0 text-gray-400'
            )}
          />
        </span>
      </span>

      {/* Background pattern */}
      <span className="absolute inset-0 opacity-20">
        <span className="absolute inset-0 bg-[radial-gradient(circle_at_50%_120%,rgba(120,119,198,0.3),transparent_50%)]" />
      </span>
    </button>
  )
}
