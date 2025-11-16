import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Re-export date formatting functions from shared utils for convenience
import { formatDate, formatTime } from '@/shared/utils'
export { formatDate, formatTime }

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

export function formatNumber(num: number): string {
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`
  return num.toString()
}

export function formatCurrency(amount: number, decimals = 2): string {
  return `$${amount.toFixed(decimals)}`
}

export function formatPercentage(value: number): string {
  return `${Math.round(value)}%`
}

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
