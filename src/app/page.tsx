'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { useLoginModal } from '@/hooks/useLoginModal'

export default function HomePage() {
  const router = useRouter()
  const { authenticated } = useAuth()
  const { showLoginModal } = useLoginModal()

  useEffect(() => {
    // Show login modal if not authenticated
    if (!authenticated) {
      showLoginModal({
        title: 'Welcome to Babylon',
        message: 'Connect your wallet to start trading prediction markets, replying to NPCs, and earning rewards in this satirical game.',
      })
    }

    // Redirect to feed
    router.push('/feed')
  }, [authenticated, router, showLoginModal])

  return (
    <div className="flex items-center justify-center h-full">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
    </div>
  )
}
