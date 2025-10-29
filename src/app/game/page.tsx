'use client'

import { useEffect } from 'react'
import { useGameStore } from '@/stores/gameStore'
import { Play, Pause, SkipBack, SkipForward } from 'lucide-react'
import type { GeneratedGame } from '@/generator/GameGenerator'
import { PageContainer } from '@/components/shared/PageContainer'
import { cn } from '@/lib/utils'

export default function GamePage() {
  const {
    allGames,
    loading,
    error,
    currentTimeMs,
    isPlaying,
    speed,
    startTime,
    endTime,
    totalDurationMs,
    timelineDays,
    gameRanges,
    setAllGames,
    setLoading,
    setError,
    setCurrentTimeMs,
    setIsPlaying,
    setSpeed,
    setTimelineData
  } = useGameStore()

  // Load games on mount
  useEffect(() => {
    const loadAllGames = async () => {
      setLoading(true)
      setError(null)

      const loadedGames: GeneratedGame[] = []

      // Try to load genesis.json
      try {
        const genesisResponse = await fetch('/genesis.json')
        if (genesisResponse.ok && genesisResponse.headers.get('content-type')?.includes('application/json')) {
          const genesis = await genesisResponse.json()
          loadedGames.push(genesis)
        }
      } catch (e) {
        // Silently skip
      }

      // Try to load latest.json
      try {
        const latestResponse = await fetch('/games/latest.json')
        if (latestResponse.ok && latestResponse.headers.get('content-type')?.includes('application/json')) {
          const latest = await latestResponse.json()
          loadedGames.push(latest)
        }
      } catch (e) {
        // Silently skip
      }

      // Sort chronologically
      loadedGames.sort((a, b) =>
        new Date(a.generatedAt).getTime() - new Date(b.generatedAt).getTime()
      )

      setAllGames(loadedGames)
      setLoading(false)

      if (loadedGames.length === 0) {
        setError('No game files found. Generate a game with: bun run generate')
      } else {
        // Calculate timeline data
        calculateTimelineData(loadedGames)
      }
    }

    loadAllGames()
  }, [])

  // Calculate timeline data
  const calculateTimelineData = (games: GeneratedGame[]) => {
    if (games.length === 0) return

    const allTimestamps: number[] = []
    const days: Array<{
      day: number
      timestamp: number
      label: string
      gameId: string
      gameName: string
    }> = []
    const ranges: Array<{
      gameId: string
      gameName: string
      startTime: number
      endTime: number
    }> = []

    games.forEach((g, idx) => {
      const gameName = g.id.includes('genesis') ? `Game 1 (Oct)` : `Game ${idx + 1} (Nov)`
      let gameStart: number | null = null
      let gameEnd: number | null = null

      g.timeline?.forEach((day) => {
        const firstPost = day.feedPosts?.[0]
        if (firstPost) {
          const ts = new Date(firstPost.timestamp).getTime()
          allTimestamps.push(ts)
          days.push({
            day: day.day,
            timestamp: ts,
            label: new Date(firstPost.timestamp).toLocaleDateString(),
            gameId: g.id,
            gameName
          })

          if (!gameStart || ts < gameStart) gameStart = ts
          if (!gameEnd || ts > gameEnd) gameEnd = ts
        }
      })

      if (gameStart && gameEnd) {
        ranges.push({ gameId: g.id, gameName, startTime: gameStart, endTime: gameEnd })
      }
    })

    if (allTimestamps.length === 0) return

    const start = Math.min(...allTimestamps)
    const end = Math.max(...allTimestamps)

    setTimelineData({
      startTime: start,
      endTime: end,
      totalDurationMs: end - start,
      timelineDays: days.sort((a, b) => a.timestamp - b.timestamp),
      gameRanges: ranges
    })
  }

  const currentDate = startTime ? new Date(startTime + currentTimeMs) : null

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-background text-foreground">
        <div className="text-lg">Loading games...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-background">
        <div className="text-lg text-destructive mb-4">⚠️ {error}</div>
        <p className="text-sm text-muted-foreground">
          Generate a game using the CLI to get started
        </p>
      </div>
    )
  }

  return (
    <PageContainer className="overflow-y-auto pb-24 md:pb-4">
      <div className="max-w-[600px] mx-auto px-4 pt-4 space-y-4">
        {/* Current Time Card */}
        <div className={cn(
          'bg-card border border-border rounded-2xl p-4',
          'shadow-md'
        )}>
          <div className="text-xs text-muted-foreground mb-1 font-medium">Current Time</div>
          <div className="text-2xl md:text-3xl font-bold" style={{ color: '#1c9cf0' }}>
            {currentDate ? currentDate.toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              year: 'numeric'
            }) : 'No timeline loaded'}
          </div>
          {currentDate && (
            <div className="text-sm text-muted-foreground mt-1">
              {currentDate.toLocaleTimeString('en-US', {
                hour: '2-digit',
                minute: '2-digit'
              })}
            </div>
          )}
        </div>

        {/* Playback Controls Card */}
        <div className={cn(
          'bg-card border border-border rounded-2xl p-4',
          'shadow-md'
        )}>
          <div className="text-xs text-muted-foreground mb-3 font-medium">Playback</div>

          {/* Playback Buttons */}
          <div className="flex gap-2 mb-3 md:mb-4">
            <button
              onClick={() => {
                setCurrentTimeMs(0)
                setIsPlaying(false)
              }}
              disabled={!startTime}
              className={cn(
                'group relative px-3 py-2.5 md:py-2',
                'bg-secondary text-secondary-foreground',
                'border border-border rounded-xl',
                'hover:bg-secondary/80 active:scale-95',
                'disabled:opacity-50 disabled:cursor-not-allowed',
                'transition-all duration-300'
              )}
            >
              <SkipBack className="w-5 h-5 md:w-4 md:h-4 group-hover:text-primary transition-colors" />
            </button>

            <button
              onClick={() => setIsPlaying(!isPlaying)}
              disabled={!startTime}
              className={cn(
                'group relative flex-1 px-4 py-2.5 md:py-2 rounded-xl font-bold text-sm',
                'disabled:opacity-50 disabled:cursor-not-allowed',
                'flex items-center justify-center gap-2',
                'transition-all duration-300 hover:scale-105 active:scale-95',
                'shadow-md',
                isPlaying
                  ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
                  : 'bg-primary text-primary-foreground hover:bg-primary/90'
              )}
            >
              {isPlaying ? (
                <>
                  <Pause className="w-5 h-5 md:w-4 md:h-4" />
                  Pause
                </>
              ) : (
                <>
                  <Play className="w-5 h-5 md:w-4 md:h-4" />
                  Play
                </>
              )}
            </button>

            <button
              onClick={() => {
                setCurrentTimeMs(totalDurationMs)
                setIsPlaying(false)
              }}
              disabled={!startTime}
              className={cn(
                'group relative px-3 py-2.5 md:py-2',
                'bg-secondary text-secondary-foreground',
                'border border-border rounded-xl',
                'hover:bg-secondary/80 active:scale-95',
                'disabled:opacity-50 disabled:cursor-not-allowed',
                'transition-all duration-300'
              )}
            >
              <SkipForward className="w-5 h-5 md:w-4 md:h-4 group-hover:text-primary transition-colors" />
            </button>
          </div>

          {/* Speed Control - Inline */}
          <div className="flex items-center gap-3">
            <div className="text-xs text-muted-foreground font-medium">Speed:</div>
            <select
              value={speed}
              onChange={(e) => setSpeed(Number(e.target.value))}
              className={cn(
                'flex-1 px-3 py-2',
                'bg-input border border-border rounded-lg',
                'text-sm text-foreground',
                'cursor-pointer transition-all',
                'focus:outline-none focus:ring-2 focus:ring-primary'
              )}
            >
              <option value={100}>100x</option>
              <option value={50}>50x</option>
              <option value={10}>10x</option>
              <option value={5}>5x</option>
              <option value={2}>2x</option>
              <option value={1}>1x</option>
            </select>
          </div>
        </div>

        {/* Timeline Slider Card */}
        <div className={cn(
          'bg-card border border-border rounded-2xl p-4',
          'shadow-md'
        )}>
          <div className="text-xs text-muted-foreground mb-3 font-medium">Timeline Progress</div>

          {/* Timeline Slider */}
          <input
            type="range"
            min={0}
            max={totalDurationMs || 100}
            value={currentTimeMs || 0}
            onChange={(e) => {
              setCurrentTimeMs(Number(e.target.value))
              setIsPlaying(false)
            }}
            disabled={!startTime}
            style={{
              background: startTime
                ? `linear-gradient(to right, #1c9cf0 0%, #1c9cf0 ${((currentTimeMs / totalDurationMs) * 100)}%, rgb(var(--input)) ${((currentTimeMs / totalDurationMs) * 100)}%, rgb(var(--input)) 100%)`
                : undefined
            }}
            className="w-full h-3 rounded-full appearance-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed mb-3 border border-border touch-pan-x [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-background [&::-webkit-slider-thumb]:shadow-lg"
          />

          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <div>
              {allGames.reduce((count, game) => {
                return count + (game.timeline?.reduce((dayCount, day) => {
                  return dayCount + (day.feedPosts?.filter(post => {
                    const postTime = new Date(post.timestamp).getTime()
                    return startTime ? postTime <= startTime + currentTimeMs : false
                  }).length || 0)
                }, 0) || 0)
              }, 0)} posts visible
            </div>
            {startTime && endTime && (
              <div>
                {new Date(startTime).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - {new Date(endTime).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </div>
            )}
          </div>
        </div>

        {/* Jump to Day Card */}
        {timelineDays.length > 0 && (
          <div className={cn(
            'bg-card border border-border rounded-2xl p-4',
            'shadow-md'
          )}>
            <div className="text-xs text-muted-foreground mb-3 font-medium">Jump to Day</div>
            <select
              onChange={(e) => {
                const selectedTimestamp = Number(e.target.value)
                if (startTime && selectedTimestamp > 0) {
                  setCurrentTimeMs(selectedTimestamp - startTime)
                  setIsPlaying(false)
                }
              }}
              className={cn(
                'w-full px-3 py-2.5',
                'bg-input border border-border rounded-lg',
                'text-sm text-foreground',
                'cursor-pointer transition-all',
                'focus:outline-none focus:ring-2 focus:ring-primary'
              )}
            >
              <option value="">Select a day...</option>
              {timelineDays.map((dayInfo) => (
                <option key={`${dayInfo.gameId}-${dayInfo.day}`} value={dayInfo.timestamp}>
                  Day {dayInfo.day} - {dayInfo.label} ({dayInfo.gameName})
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Game Ranges Card */}
        {gameRanges.length > 0 && (
          <div className={cn(
            'bg-card border border-border rounded-2xl p-4',
            'shadow-md'
          )}>
            <div className="text-xs text-muted-foreground mb-3 font-medium">Loaded Games</div>
            <div className="space-y-2">
              {gameRanges.map((range) => (
                <div
                  key={range.gameId}
                  className={cn(
                    'p-3 rounded-lg',
                    'bg-accent/50 border border-border',
                    'transition-all hover:bg-accent/70 active:scale-[0.99]'
                  )}
                >
                  <div className="text-sm font-semibold mb-1">
                    {range.gameName}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {new Date(range.startTime).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric'
                    })} - {new Date(range.endTime).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric'
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </PageContainer>
  )
}
