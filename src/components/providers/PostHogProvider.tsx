'use client'

/**
 * PostHog Provider
 * Initializes PostHog and provides tracking context
 */

import { useEffect, useRef } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import { posthog, initPostHog } from '@/lib/posthog/client'

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const initialized = useRef(false)

  // Initialize PostHog once
  useEffect(() => {
    if (!initialized.current) {
      initPostHog()
      initialized.current = true
    }
  }, [])

  // Track page views
  useEffect(() => {
    if (pathname) {
      let url = window.origin + pathname
      if (searchParams && searchParams.toString()) {
        url = url + `?${searchParams.toString()}`
      }
      
      // Track pageview with PostHog
      if (typeof window !== 'undefined' && posthog) {
        posthog.capture('$pageview', {
          $current_url: url,
          $pathname: pathname,
          $search_params: searchParams?.toString() || '',
        })
      }
    }
  }, [pathname, searchParams])

  return <>{children}</>
}

