import Image from 'next/image'
import { cn } from '@/lib/utils'
import { memo, type CSSProperties } from 'react'

interface BouncingLogoProps {
  size?: number
  className?: string
  withGlow?: boolean
}

function BouncingLogoComponent({
  size = 64,
  className,
  withGlow = true,
}: BouncingLogoProps) {
  const dimensionStyle: CSSProperties = {
    width: size,
    height: size,
  }

  return (
    <div
      className={cn('relative flex items-center justify-center', className)}
      style={dimensionStyle}
      aria-label="Babylon loading indicator"
      role="status"
    >
      {withGlow && (
        <div
          className="absolute inset-0 rounded-full bg-[#0066FF]/15 blur-xl animate-pulse"
          aria-hidden="true"
        />
      )}
      <div className="relative animate-bounce">
        <Image
          src="/assets/logos/logo.svg"
          alt="Babylon"
          width={size}
          height={size}
          priority={size <= 64}
        />
      </div>
    </div>
  )
}

export const BouncingLogo = memo(BouncingLogoComponent)


