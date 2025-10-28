import { cn } from '@/lib/utils'
import { ReactNode } from 'react'

interface PageContainerProps {
  children: ReactNode
  className?: string
  noPadding?: boolean
}

export function PageContainer({ children, className, noPadding = false }: PageContainerProps) {
  return (
    <>
      <style dangerouslySetInnerHTML={{
        __html: `
          .page-container-desktop {
            border: none;
          }
          @media (min-width: 768px) {
            .page-container-desktop {
              border: 2px solid #1c9cf0;
            }
          }
        `
      }} />
      <div
        className={cn(
          // Mobile: Full space, no container styling
          'bg-background overflow-hidden page-container-desktop',
          'h-[calc(100vh-5rem)]',
          // Desktop: Contained with border and rounded corners
          'md:rounded-2xl md:h-[calc(100vh-2rem)]',
          !noPadding && 'md:p-6',
          className
        )}
      >
        {children}
      </div>
    </>
  )
}
