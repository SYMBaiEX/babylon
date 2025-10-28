'use client'

import { useFontSize } from '@/contexts/FontSizeContext'
import { User } from 'lucide-react'
import { cn } from '@/lib/utils'

export function FontSizePresets() {
  const { fontSizePreset, setFontSizePreset } = useFontSize()

  const presets = [
    { label: 'Small', value: 'small' as const, size: 0.875 },
    { label: 'Medium', value: 'medium' as const, size: 1 },
    { label: 'Large', value: 'large' as const, size: 1.125 },
  ]

  return (
    <div className="space-y-6">
      {/* Preview Sample */}
      <div className="bg-sidebar-accent rounded-xl p-4 border border-border">
        <p className="text-xs text-muted-foreground mb-3 uppercase tracking-wide">Preview</p>
        <div className="space-y-4">
          {presets.map((preset) => (
            <div key={preset.value} className="flex items-start gap-3">
              <div
                className="rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0"
                style={{
                  width: `${preset.size * 2.5}rem`,
                  height: `${preset.size * 2.5}rem`
                }}
              >
                <User
                  className="text-primary"
                  style={{
                    width: `${preset.size * 1.25}rem`,
                    height: `${preset.size * 1.25}rem`
                  }}
                />
              </div>
              <div className="flex-1" style={{ fontSize: `${preset.size}rem` }}>
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-bold text-foreground">Sample User</span>
                  <span className="text-muted-foreground">·</span>
                  <span className="text-muted-foreground">Oct 28</span>
                </div>
                <p className="text-foreground leading-relaxed">
                  This is how posts will appear with {preset.label.toLowerCase()} content size.
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Size Buttons */}
      <div className="flex gap-3">
        {presets.map((preset) => (
          <button
            key={preset.value}
            onClick={() => setFontSizePreset(preset.value)}
            className={cn(
              'flex-1 px-6 py-3 rounded-xl font-semibold transition-all duration-300',
              'border-2',
              fontSizePreset === preset.value
                ? 'border-[#1c9cf0] bg-[#1c9cf0] text-white'
                : 'border-border bg-sidebar-accent text-foreground hover:border-[#1c9cf0] hover:text-[#1c9cf0]'
            )}
          >
            {preset.label}
          </button>
        ))}
      </div>
    </div>
  )
}
