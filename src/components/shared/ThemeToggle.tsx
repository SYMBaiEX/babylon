'use client'

import { Moon, Sun } from 'lucide-react'
import { useTheme } from 'next-themes'
import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'

interface ThemeToggleProps {
  compact?: boolean
}

export function ThemeToggle({ compact = false }: ThemeToggleProps) {
  const [mounted, setMounted] = useState(false)
  const { theme, setTheme, resolvedTheme } = useTheme()

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return (
      <button
        className={cn(
          'relative inline-flex items-center bg-sidebar-accent',
          compact ? 'h-8 w-8' : 'h-10 w-20'
        )}
        aria-label="Toggle theme"
      >
        <span className="sr-only">Toggle theme</span>
      </button>
    )
  }

  // Use resolvedTheme to get the actual theme (handles system preference)
  const isDark = resolvedTheme === 'dark'

  if (compact) {
    // Compact single-icon mode for collapsed sidebar - Early 2000s Twitter: Simple button
    return (
      <button
        onClick={() => {
          // If on system, set explicit theme to opposite of current resolved theme
          // Otherwise toggle between light/dark
          if (theme === 'system') {
            setTheme(isDark ? 'light' : 'dark')
          } else {
            setTheme(isDark ? 'light' : 'dark')
          }
        }}
        className={cn(
          'relative inline-flex h-10 w-10 items-center justify-center transition-all duration-200',
          'bg-sidebar-accent hover:bg-sidebar-accent/80',
          isDark ? 'bg-sidebar-primary' : 'bg-sidebar-primary'
        )}
        aria-label={`Switch to ${isDark ? 'light' : 'dark'} mode`}
      >
        <Sun
          className={cn(
            'h-5 w-5 transition-all duration-200 ease-out',
            isDark
              ? 'rotate-90 scale-0 opacity-0'
              : 'rotate-0 scale-100 opacity-100 text-white'
          )}
        />
        <Moon
          className={cn(
            'absolute h-5 w-5 transition-all duration-200 ease-out',
            isDark
              ? 'rotate-0 scale-100 opacity-100 text-white'
              : '-rotate-90 scale-0 opacity-0'
          )}
        />
      </button>
    )
  }

  // Regular toggle mode - Early 2000s Twitter: Simple toggle without neumorphic effects
  return (
    <button
      onClick={() => {
        // Handle system theme properly
        if (theme === 'system') {
          // If system, switch to opposite of current resolved theme
          setTheme(isDark ? 'light' : 'dark')
        } else {
          // If explicit theme, toggle between light/dark
          setTheme(isDark ? 'light' : 'dark')
        }
      }}
      className={cn(
        'relative inline-flex h-10 w-20 items-center transition-all duration-200',
        'bg-sidebar-accent hover:bg-sidebar-accent/80'
      )}
      aria-label={`Switch to ${isDark ? 'light' : 'dark'} mode`}
    >
      {/* Toggle circle */}
      <span
        className={cn(
          'relative inline-flex h-8 w-8 transform items-center justify-center transition-all duration-200 ease-out',
          'bg-sidebar-primary',
          isDark ? 'translate-x-11' : 'translate-x-1'
        )}
      >
        {/* Icon container */}
        <span className="absolute inset-0 flex items-center justify-center">
          <Sun
            className={cn(
              'h-4 w-4 transition-all duration-200 ease-out',
              isDark
                ? 'rotate-90 scale-0 opacity-0'
                : 'rotate-0 scale-100 opacity-100 text-white'
            )}
          />
          <Moon
            className={cn(
              'absolute h-4 w-4 transition-all duration-200 ease-out',
              isDark
                ? 'rotate-0 scale-100 opacity-100 text-white'
                : '-rotate-90 scale-0 opacity-0'
            )}
          />
        </span>
      </span>
    </button>
  )
}
