'use client'

/**
 * Registry Page - Redirects to Explore
 * 
 * The registry functionality has been moved to the Explore page.
 * This page now redirects to /explore?tab=registry
 */

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { BouncingLogo } from '@/components/shared/BouncingLogo'

export default function RegistryPage() {
  const router = useRouter()

  useEffect(() => {
    router.replace('/explore?tab=registry')
  }, [router])

  return (
    <div className="flex items-center justify-center min-h-screen">
            <div className="text-center">
              <div className="mx-auto mb-4 flex justify-center">
                <BouncingLogo size={48} />
              </div>
        <p className="text-muted-foreground">Redirecting to Explore...</p>
      </div>
    </div>
  )
}
