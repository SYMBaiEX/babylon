'use client'

import { LoginModal } from './LoginModal'
import { useLoginModal } from '@/hooks/useLoginModal'
import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'

function GlobalLoginModalContent() {
  const { isOpen, closeLoginModal, title, message } = useLoginModal()
  const searchParams = useSearchParams()

  // Check if dev mode is enabled via URL parameter
  const isDevMode = searchParams.get('dev') === 'true'
  
  // Hide on production (babylon.market) on home page unless ?dev=true
  const isProduction = typeof window !== 'undefined' && window.location.hostname === 'babylon.market'
  const isHomePage = typeof window !== 'undefined' && window.location.pathname === '/'
  const shouldHide = isProduction && isHomePage && !isDevMode

  // If should be hidden, don't render anything
  if (shouldHide) {
    return null
  }

  return (
    <LoginModal
      isOpen={isOpen}
      onClose={closeLoginModal}
      title={title}
      message={message}
    />
  )
}

export function GlobalLoginModal() {
  return (
    <Suspense fallback={null}>
      <GlobalLoginModalContent />
    </Suspense>
  )
}

