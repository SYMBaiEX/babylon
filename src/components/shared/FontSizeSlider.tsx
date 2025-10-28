'use client'

import { useFontSize } from '@/contexts/FontSizeContext'
import { Type } from 'lucide-react'
import { cn } from '@/lib/utils'

export function FontSizeSlider() {
  const { fontSize, setFontSize } = useFontSize()

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFontSize(parseFloat(e.target.value))
  }

  return (
    <div className="hidden md:flex items-center gap-3 px-4 py-2 bg-sidebar-accent rounded-xl border border-border">
      <Type className="w-4 h-4" style={{ color: '#1c9cf0' }} />
      <input
        type="range"
        min="0.75"
        max="1.5"
        step="0.05"
        value={fontSize}
        onChange={handleChange}
        className={cn(
          'w-24 h-2 bg-sidebar rounded-full appearance-none cursor-pointer',
          'accent-[#1c9cf0]',
          '[&::-webkit-slider-thumb]:appearance-none',
          '[&::-webkit-slider-thumb]:w-4',
          '[&::-webkit-slider-thumb]:h-4',
          '[&::-webkit-slider-thumb]:rounded-full',
          '[&::-webkit-slider-thumb]:bg-[#1c9cf0]',
          '[&::-webkit-slider-thumb]:cursor-pointer',
          '[&::-moz-range-thumb]:w-4',
          '[&::-moz-range-thumb]:h-4',
          '[&::-moz-range-thumb]:rounded-full',
          '[&::-moz-range-thumb]:bg-[#1c9cf0]',
          '[&::-moz-range-thumb]:border-0',
          '[&::-moz-range-thumb]:cursor-pointer'
        )}
        aria-label="Adjust content size"
        title={`Content size: ${Math.round(fontSize * 100)}%`}
      />
      <span className="text-xs text-muted-foreground font-mono w-10">
        {Math.round(fontSize * 100)}%
      </span>
    </div>
  )
}
