'use client'

import Link from 'next/link'
import Image from 'next/image'
import { cn } from '@/lib/utils'

export function MobileHeader() {
  return (
    <header
      className={cn(
        'md:hidden',
        'fixed top-0 left-0 right-0 z-40',
        'bg-sidebar/95 backdrop-blur-md',
        'border-b-2',
        'transition-all duration-300'
      )}
      style={{ borderColor: '#1c9cf0' }}
    >
      <div className="flex items-center justify-between h-16 px-4">
        <Link
          href="/feed"
          className={cn(
            'flex items-center gap-3',
            'hover:scale-105 transition-transform duration-300'
          )}
        >
          <Image
            src="/assets/logos/logo.svg"
            alt="Babylon Logo"
            width={32}
            height={32}
            className="flex-shrink-0 w-8 h-8"
          />
          <span
            className={cn(
              'text-xl font-bold',
              'bg-gradient-to-br from-sidebar-primary to-primary',
              'bg-clip-text text-transparent'
            )}
          >
            Babylon
          </span>
        </Link>
      </div>
    </header>
  )
}
