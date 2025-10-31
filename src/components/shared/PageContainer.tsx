import { cn } from '@/lib/utils'
import type { ReactNode } from 'react'

interface PageContainerProps {
  children: ReactNode
  className?: string
  noPadding?: boolean
}

export function PageContainer({ children, className, noPadding = false }: PageContainerProps) {
  return (
    <div
      className={cn(
        // Early 2000s Twitter: Sharp corners, simple boxy layout
        'bg-background overflow-hidden',
        'h-full min-h-full',
        // Desktop: Simple container - no wrapper padding, use full height
        'md:h-full',
        !noPadding && 'md:p-6',
        className
      )}
    >
      {children}
    </div>
  )
}
