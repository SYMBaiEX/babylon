'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { useLoginModal } from '@/hooks/useLoginModal'
import { ComingSoon } from '@/components/shared/ComingSoon'
import { Suspense } from 'react'
import { BouncingLogo } from '@/components/shared/BouncingLogo'

function HomePageContent() {
  const router = useRouter()
  const { authenticated } = useAuth()
  const { showLoginModal } = useLoginModal()
  const searchParams = useSearchParams()
  const [shouldShowApp, setShouldShowApp] = useState(false)
  const [isChecking, setIsChecking] = useState(true)

  useEffect(() => {
    // Check if we're on localhost
    const isLocalhost =
      typeof window !== 'undefined' &&
      (window.location.hostname === 'localhost' ||
        window.location.hostname === '127.0.0.1' ||
        window.location.hostname === '')

    // Check for dev query parameters
    const hasDevParam = searchParams.get('dev') !== null || searchParams.get('develop') !== null

    // Show app if on localhost OR has dev param
    const showApp = isLocalhost || hasDevParam
    setShouldShowApp(showApp)
    setIsChecking(false)

    // Only proceed with normal home page logic if we should show the app
    if (showApp) {
      // Show login modal if not authenticated
      if (!authenticated) {
        showLoginModal({
          title: 'Welcome to Babylon',
          message: 'Connect your wallet to start trading prediction markets, replying to NPCs, and earning rewards in this satirical game.',
        })
      }

      // Redirect to feed
      router.push('/feed')
    }
  }, [authenticated, router, showLoginModal, searchParams])

  // Show loading while checking
  if (isChecking) {
    return (
      <div className="flex items-center justify-center h-full">
        <BouncingLogo size={48} />
      </div>
    )
  }

  // Show coming soon if not in dev mode
  if (!shouldShowApp) {
    return <ComingSoon />
  }

  // Show loading while redirecting to feed
  return (
    <div className="flex items-center justify-center h-full">
      <BouncingLogo size={48} />
    </div>
  )
}

export default function HomePage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center h-full">
        <BouncingLogo size={48} />
      </div>
    }>
      <HomePageContent />
    </Suspense>
  )
}
