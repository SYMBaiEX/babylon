import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

/**
 * Utility Functions
 * 
 * @description Shared utility functions for class name merging, date formatting,
 * number formatting, and string sanitization. Used throughout the application.
 */

/**
 * Merge class names with Tailwind CSS conflict resolution
 * 
 * @description Combines class names using clsx and resolves Tailwind CSS conflicts
 * using tailwind-merge. Ensures that conflicting Tailwind classes are properly
 * overridden (e.g., "p-4 p-6" becomes "p-6").
 * 
 * @param {...ClassValue} inputs - Class names to merge (strings, arrays, objects)
 * @returns {string} Merged class name string
 * 
 * @example
 * ```typescript
 * cn('p-4', 'p-6') // Returns 'p-6'
 * cn('bg-red-500', { 'bg-blue-500': isActive }) // Returns 'bg-blue-500' if isActive
 * ```
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Re-export date formatting functions from shared utils for convenience
import { formatDate, formatTime } from '@/shared/utils'
export { formatDate, formatTime }

/**
 * Format relative time (e.g., "5m", "2h", "3d")
 * 
 * @description Converts a date to a human-readable relative time string.
 * Shows seconds, minutes, hours, or days relative to now. Falls back to
 * formatted date for dates older than 7 days.
 * 
 * @param {Date | string} date - Date to format
 * @returns {string} Relative time string (e.g., "5m", "2h", "3d") or formatted date
 * 
 * @example
 * ```typescript
 * formatRelativeTime(new Date(Date.now() - 300000)) // Returns "5m"
 * formatRelativeTime(new Date(Date.now() - 86400000)) // Returns "1d"
 * ```
 */
export function formatRelativeTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  const now = new Date()
  const diff = now.getTime() - d.getTime()
  const seconds = Math.floor(diff / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  if (seconds < 60) return `${seconds}s`
  if (minutes < 60) return `${minutes}m`
  if (hours < 24) return `${hours}h`
  if (days < 7) return `${days}d`
  return formatDate(d)
}

/**
 * Format number with K/M suffixes
 * 
 * @description Formats large numbers with K (thousands) or M (millions) suffixes.
 * Rounds to one decimal place for readability.
 * 
 * @param {number} num - Number to format
 * @returns {string} Formatted number string (e.g., "1.5K", "2.3M")
 * 
 * @example
 * ```typescript
 * formatNumber(1500) // Returns "1.5K"
 * formatNumber(2300000) // Returns "2.3M"
 * formatNumber(500) // Returns "500"
 * ```
 */
export function formatNumber(num: number): string {
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`
  return num.toString()
}

/**
 * Format number as currency
 * 
 * @description Formats a number as US dollar currency with specified decimal places.
 * 
 * @param {number} amount - Amount to format
 * @param {number} decimals - Number of decimal places (default: 2)
 * @returns {string} Formatted currency string (e.g., "$123.45")
 * 
 * @example
 * ```typescript
 * formatCurrency(123.456) // Returns "$123.46"
 * formatCurrency(1000, 0) // Returns "$1000"
 * ```
 */
export function formatCurrency(amount: number, decimals = 2): string {
  return `$${amount.toFixed(decimals)}`
}

/**
 * Format number as percentage
 * 
 * @description Converts a decimal number to a percentage string, rounded to nearest integer.
 * 
 * @param {number} value - Decimal value (0-1) or percentage value (0-100)
 * @returns {string} Formatted percentage string (e.g., "50%")
 * 
 * @example
 * ```typescript
 * formatPercentage(0.5) // Returns "50%"
 * formatPercentage(0.123) // Returns "12%"
 * ```
 */
export function formatPercentage(value: number): string {
  return `${Math.round(value)}%`
}

/**
 * Sanitize ID for use in file paths
 * 
 * @description Converts an ID string to a safe format for use in file paths and URLs.
 * Converts to lowercase, replaces spaces with hyphens, and removes special characters.
 * Returns "unknown" if ID is null or undefined.
 * 
 * @param {string | undefined | null} id - ID to sanitize
 * @returns {string} Sanitized ID string safe for file paths
 * 
 * @example
 * ```typescript
 * sanitizeId("My User ID!") // Returns "my-user-id"
 * sanitizeId(null) // Returns "unknown"
 * sanitizeId("user_123") // Returns "user_123"
 * ```
 */
export function sanitizeId(id: string | undefined | null): string {
  // Sanitize ID for use in file paths
  // Convert to lowercase, replace spaces with hyphens
  // Keep alphanumeric, hyphens, and underscores
  // Remove other special characters
  if (!id) {
    return 'unknown'
  }
  return id
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9\-_]/g, '')
    .trim()
}
