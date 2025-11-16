'use client'

import { Search, X } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Props for the SearchBar component.
 */
interface SearchBarProps {
  /** Current search input value */
  value: string
  /** Callback when search value changes */
  onChange: (value: string) => void
  /** Placeholder text */
  placeholder?: string
  /** Additional CSS classes */
  className?: string
  /** Whether to use compact styling */
  compact?: boolean
}

/**
 * Search bar input component with icon and clear button.
 * 
 * Provides a search input field with search icon and optional
 * clear button. Supports both standard and compact variants.
 * 
 * @param props - SearchBar component props
 * @returns Search bar element
 * 
 * @example
 * ```tsx
 * <SearchBar
 *   value={searchQuery}
 *   onChange={setSearchQuery}
 *   placeholder="Search users..."
 * />
 * ```
 */
export function SearchBar({ value, onChange, placeholder = 'Search...', className, compact = false }: SearchBarProps) {
  return (
    <div className={cn('relative', className)}>
      <div className={cn(
        'absolute top-1/2 -translate-y-1/2 pointer-events-none',
        compact ? 'left-3' : 'left-4'
      )}>
        <Search className={cn(compact ? 'w-3.5 h-3.5' : 'w-4 h-4', 'text-primary')} />
      </div>
      <input
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          'w-full',
          'bg-muted/50 border border-border',
          'focus:outline-none focus:border-border',
          'transition-all duration-200',
          'text-foreground',
          compact 
            ? 'pl-9 pr-9 py-1.5 text-sm' 
            : 'pl-11 pr-10 py-2.5',
          'rounded-full'
        )}
      />
      {value && (
        <button
          onClick={() => onChange('')}
          className={cn(
            'absolute top-1/2 -translate-y-1/2 hover:bg-muted/50 p-1 transition-colors',
            compact ? 'right-2' : 'right-3'
          )}
        >
          <X className={cn(compact ? 'w-3.5 h-3.5' : 'w-4 h-4', 'text-muted-foreground')} />
        </button>
      )}
      <style jsx>{`
        input::placeholder {
          color: hsl(var(--muted-foreground));
          opacity: 0.6;
        }
      `}</style>
    </div>
  )
}
