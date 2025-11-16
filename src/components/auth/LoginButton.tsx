'use client'

import { Wallet } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { cn } from '@/lib/utils'

/**
 * Login button component for wallet connection.
 * 
 * Displays a "Connect Wallet" button that triggers the authentication
 * flow when clicked. Automatically disables when auth is not ready.
 * Uses Privy for wallet connection.
 * 
 * @returns Login button element
 * 
 * @example
 * ```tsx
 * <LoginButton />
 * ```
 */
export function LoginButton() {
  const { ready, login } = useAuth()

  return (
    <button
      onClick={login}
      disabled={!ready}
      className={cn(
        'w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-full font-semibold',
        'bg-sidebar-primary text-sidebar-primary-foreground',
        'hover:bg-sidebar-primary/90',
        'transition-colors duration-200',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        'text-[15px] leading-5'
      )}
    >
      <Wallet className="w-5 h-5" />
      <span>Connect Wallet</span>
    </button>
  )
}
