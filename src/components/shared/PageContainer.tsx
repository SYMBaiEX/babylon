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
        // Sharp corners, simple boxy layout
        'bg-background overflow-hidden',
        'h-full min-h-full w-full',
        // Desktop: Simple container - use full height
        'md:h-full',
        // Consistent padding: 16px mobile, 24px desktop
        !noPadding && 'px-4 md:px-6',
        className
      )}
    >
      {children}
    </div>
  )
}
