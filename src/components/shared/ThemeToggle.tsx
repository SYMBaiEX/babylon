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
  const { theme, setTheme } = useTheme()

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return (
      <button
        className={cn(
          'relative inline-flex items-center rounded-full bg-sidebar-accent/30',
          compact ? 'h-8 w-8' : 'h-10 w-20'
        )}
        aria-label="Toggle theme"
      >
        <span className="sr-only">Toggle theme</span>
      </button>
    )
  }

  const isDark = theme === 'dark'

  if (compact) {
    // Compact single-icon mode for collapsed sidebar
    return (
      <>
        <style dangerouslySetInnerHTML={{
          __html: `
            .neumorphic-theme-toggle-compact {
              box-shadow: inset 3px 3px 3px rgba(0, 0, 0, 0.1), inset -3px -3px 3px rgba(255, 255, 255, 0.05);
              transition: all 0.3s ease;
            }

            .neumorphic-theme-toggle-compact:hover {
              box-shadow: none;
            }
          `
        }} />
        <button
          onClick={() => setTheme(isDark ? 'light' : 'dark')}
          className={cn(
            'relative inline-flex h-10 w-10 items-center justify-center rounded-full transition-all duration-300',
            'bg-sidebar-accent/30 neumorphic-theme-toggle-compact'
          )}
          style={{
            backgroundColor: isDark ? '#3b82f6' : '#fbbf24'
          }}
          aria-label={`Switch to ${isDark ? 'light' : 'dark'} mode`}
        >
          <Sun
            className={cn(
              'h-5 w-5 transition-all duration-300 ease-out',
              isDark
                ? 'rotate-90 scale-0 opacity-0'
                : 'rotate-0 scale-100 opacity-100 text-white'
            )}
          />
          <Moon
            className={cn(
              'absolute h-5 w-5 transition-all duration-300 ease-out',
              isDark
                ? 'rotate-0 scale-100 opacity-100 text-white'
                : '-rotate-90 scale-0 opacity-0'
            )}
          />
        </button>
      </>
    )
  }

  // Regular toggle mode
  return (
    <>
      <style dangerouslySetInnerHTML={{
        __html: `
          .neumorphic-theme-toggle {
            box-shadow: inset 5px 5px 5px rgba(0, 0, 0, 0.1), inset -5px -5px 5px rgba(255, 255, 255, 0.05);
            transition: all 0.3s ease;
          }

          .neumorphic-theme-circle {
            box-shadow: 3px 3px 5px rgba(0, 0, 0, 0.15), -3px -3px 5px rgba(255, 255, 255, 0.05);
            transition: all 0.3s ease;
          }
        `
      }} />
      <button
        onClick={() => setTheme(isDark ? 'light' : 'dark')}
        className={cn(
          'relative inline-flex h-10 w-20 items-center rounded-full transition-all duration-300',
          'bg-sidebar-accent/30 neumorphic-theme-toggle'
        )}
        aria-label={`Switch to ${isDark ? 'light' : 'dark'} mode`}
      >
        {/* Toggle circle */}
        <span
          className={cn(
            'relative inline-flex h-8 w-8 transform items-center justify-center rounded-full',
            'transition-all duration-300 ease-out',
            'bg-sidebar-accent/50 neumorphic-theme-circle',
            isDark ? 'translate-x-11' : 'translate-x-1'
          )}
          style={{
            backgroundColor: isDark ? '#3b82f6' : '#fbbf24'
          }}
        >
          {/* Icon container */}
          <span className="absolute inset-0 flex items-center justify-center">
            <Sun
              className={cn(
                'h-4 w-4 transition-all duration-300 ease-out',
                isDark
                  ? 'rotate-90 scale-0 opacity-0'
                  : 'rotate-0 scale-100 opacity-100 text-white'
              )}
            />
            <Moon
              className={cn(
                'absolute h-4 w-4 transition-all duration-300 ease-out',
                isDark
                  ? 'rotate-0 scale-100 opacity-100 text-white'
                  : '-rotate-90 scale-0 opacity-0'
              )}
            />
          </span>
        </span>
      </button>
    </>
  )
}
