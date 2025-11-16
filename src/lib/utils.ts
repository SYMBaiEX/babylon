/**
 * Utility functions for formatting and string manipulation
 */

import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

/**
 * Merge Tailwind CSS classes with conflict resolution
 * Combines clsx and tailwind-merge for optimal class handling
 * 
 * @param inputs - Class values (strings, objects, arrays, etc.)
 * @returns Merged class string with Tailwind conflicts resolved
 * 
 * @example
 * ```ts
 * cn('px-2 py-1', 'px-4') // Returns 'py-1 px-4' (px-2 overridden by px-4)
 * ```
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Re-export date formatting functions from shared utils for convenience
import { formatDate, formatTime } from '@/shared/utils'
export { formatDate, formatTime }

/**
 * Format a date as relative time (e.g., "5m", "2h", "3d")
 * Falls back to formatted date if older than 7 days
 * 
 * @param date - Date to format (Date object or ISO string)
 * @returns Relative time string or formatted date
 * 
 * @example
 * ```ts
 * formatRelativeTime(new Date(Date.now() - 3000)) // "3s"
 * formatRelativeTime(new Date(Date.now() - 3600000)) // "1h"
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
 * Format number with K/M suffixes for large values
 * 
 * @param num - Number to format
 * @returns Formatted string (e.g., "1.5K", "2.3M", "500")
 * 
 * @example
 * ```ts
 * formatNumber(1500) // "1.5K"
 * formatNumber(2300000) // "2.3M"
 * formatNumber(500) // "500"
 * ```
 */
export function formatNumber(num: number): string {
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`
  return num.toString()
}

/**
 * Format amount as currency string
 * 
 * @param amount - Amount to format
 * @param decimals - Number of decimal places (default: 2)
 * @returns Formatted currency string (e.g., "$123.45")
 * 
 * @example
 * ```ts
 * formatCurrency(123.456) // "$123.46"
 * formatCurrency(1000, 0) // "$1000"
 * ```
 */
export function formatCurrency(amount: number, decimals = 2): string {
  return `$${amount.toFixed(decimals)}`
}

/**
 * Format value as percentage
 * 
 * @param value - Value to format (0-1 range or 0-100 range)
 * @returns Formatted percentage string (e.g., "50%")
 * 
 * @example
 * ```ts
 * formatPercentage(0.5) // "0%"
 * formatPercentage(50) // "50%"
 * ```
 */
export function formatPercentage(value: number): string {
  return `${Math.round(value)}%`
}

/**
 * Sanitize ID for safe use in file paths and URLs
 * Converts to lowercase, replaces spaces with hyphens, removes special characters
 * 
 * @param id - ID to sanitize
 * @returns Sanitized ID safe for file paths, or "unknown" if id is falsy
 * 
 * @example
 * ```ts
 * sanitizeId("My User Name") // "my-user-name"
 * sanitizeId("user@123") // "user123"
 * sanitizeId(null) // "unknown"
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
