'use client'

import { useEffect, useRef } from 'react'
import { useGameStore } from '@/stores/gameStore'

/**
 * Global game playback manager
 * Runs in the background across all pages to keep timeline advancing
 */
export function GamePlaybackManager() {
  const { isPlaying, speed, totalDurationMs, advanceTime } = useGameStore()
  const intervalRef = useRef<NodeJS.Timeout | undefined>(undefined)

  useEffect(() => {
    if (isPlaying && totalDurationMs > 0) {
      intervalRef.current = setInterval(() => {
        advanceTime(speed)
      }, 50)
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
    }

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [isPlaying, speed, totalDurationMs, advanceTime])

  // This component doesn't render anything
  return null
}




