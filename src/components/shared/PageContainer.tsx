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
          .neumorphic-container {
            border: none;
          }
          @media (min-width: 768px) {
            .neumorphic-container {
              box-shadow:
                0 0 1rem 0 rgba(28, 156, 240, 0.15),
                inset 0 0 0 1px rgba(28, 156, 240, 0.2);
            }
          }
          .neumorphic-container:hover {
            box-shadow:
              0 0 1.5rem 0 rgba(28, 156, 240, 0.25),
              inset 0 0 0 1px rgba(28, 156, 240, 0.3);
          }
        `
      }} />
      <div
        className={cn(
          // Mobile: Full space, no container styling
          'bg-background overflow-hidden',
          'h-[calc(100vh-5rem)]',
          // Desktop: Neumorphic container with soft shadows
          'md:rounded-2xl md:h-[calc(100vh-2rem)]',
          'md:neumorphic-container',
          'md:transition-all md:duration-300',
          !noPadding && 'md:p-6',
          className
        )}
      >
        {children}
      </div>
    </>
  )
}
