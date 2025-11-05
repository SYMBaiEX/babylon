'use client'

import type { ReactNode } from 'react';
import { createContext, useContext, useState, useEffect } from 'react'

type FontSize = 'small' | 'medium' | 'large' | number

interface FontSizeContextType {
  fontSize: number
  setFontSize: (size: number) => void
  fontSizePreset: FontSize
  setFontSizePreset: (preset: FontSize) => void
}

const FontSizeContext = createContext<FontSizeContextType | undefined>(undefined)

const FONT_SIZE_PRESETS = {
  small: 0.875, // 14px base
  medium: 1, // 16px base
  large: 1.125, // 18px base
}

const STORAGE_KEY = 'babylon-font-size'

export function FontSizeProvider({ children }: { children: ReactNode }) {
  const [fontSize, setFontSizeState] = useState(1) // Default to medium (100%)
  const [fontSizePreset, setFontSizePresetState] = useState<FontSize>('medium')

  // Load from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      const parsed = JSON.parse(stored)
      setFontSizeState(parsed.fontSize || 1)
      setFontSizePresetState(parsed.preset || 'medium')
    }
  }, [])

  const setFontSize = (size: number) => {
    setFontSizeState(size)
    // Determine preset or custom
    const preset = Object.entries(FONT_SIZE_PRESETS).find(([, value]) => value === size)?.[0] as FontSize || size
    setFontSizePresetState(preset)
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ fontSize: size, preset }))
  }

  const setFontSizePreset = (preset: FontSize) => {
    if (typeof preset === 'string' && preset in FONT_SIZE_PRESETS) {
      const size = FONT_SIZE_PRESETS[preset]
      setFontSizeState(size)
      setFontSizePresetState(preset)
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ fontSize: size, preset }))
    } else if (typeof preset === 'number') {
      setFontSize(preset)
    }
  }

  return (
    <FontSizeContext.Provider value={{ fontSize, setFontSize, fontSizePreset, setFontSizePreset }}>
      {children}
    </FontSizeContext.Provider>
  )
}

export function useFontSize() {
  const context = useContext(FontSizeContext)
  if (context === undefined) {
    throw new Error('useFontSize must be used within a FontSizeProvider')
  }
  return context
}
