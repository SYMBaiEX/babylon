'use client'

import { Wallet } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'

export function LoginButton() {
  const { ready, login } = useAuth()

  return (
    <button
      onClick={login}
      disabled={!ready}
      className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
    >
      <Wallet className="w-5 h-5" />
      <span>Login</span>
    </button>
  )
}
