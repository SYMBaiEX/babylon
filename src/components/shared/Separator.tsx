import { cn } from '@/lib/utils'

interface SeparatorProps {
  className?: string
  orientation?: 'horizontal' | 'vertical'
}

export function Separator({ className, orientation = 'horizontal' }: SeparatorProps) {
  if (orientation === 'vertical') {
    return (
      <div className={cn('w-px h-full', className)}>
        <div
          className="w-px h-full rounded-full"
          style={{
            background: 'linear-gradient(180deg, transparent, rgba(28, 156, 240, 0.3), transparent)',
            boxShadow: '1px 0 2px rgba(0, 0, 0, 0.1)'
          }}
        />
      </div>
    )
  }

  return (
    <div className={cn('h-px w-full', className)}>
      <div
        className="h-px w-full rounded-full"
        style={{
          background: 'linear-gradient(90deg, transparent, rgba(28, 156, 240, 0.3), transparent)',
          boxShadow: '0 1px 2px rgba(0, 0, 0, 0.1)'
        }}
      />
    </div>
  )
}

