/**
 * Babylon Game Viewer
 * Interactive timeline viewer for generated games
 */
import React from 'react';
import { useEffect, useRef, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import type { GeneratedGame } from '../generator/GameGenerator';
import { FeedView } from './FeedView';
import { ProfileView } from './ProfileView';

export function App() {
  const [allGames, setAllGames] = useState<GeneratedGame[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Time-based playback state
  const [currentTimeMs, setCurrentTimeMs] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  
  const intervalRef = useRef<NodeJS.Timeout>();

  // Auto-load all games on mount
  useEffect(() => {
    const loadAllGames = async () => {
      setLoading(true);
      setError(null);
      
      const loadedGames: GeneratedGame[] = [];
      
      // Try to load genesis.json from project root
      try {
        const genesisResponse = await fetch('/genesis.json');
        if (genesisResponse.ok && genesisResponse.headers.get('content-type')?.includes('application/json')) {
          const genesis = await genesisResponse.json();
          loadedGames.push(genesis);
        }
      } catch (e) {
        // Silently skip if file doesn't exist - this is expected on first run
      }
      
      // Try to load latest.json from games folder
      try {
        const latestResponse = await fetch('/games/latest.json');
        if (latestResponse.ok && latestResponse.headers.get('content-type')?.includes('application/json')) {
          const latest = await latestResponse.json();
          loadedGames.push(latest);
        }
      } catch (e) {
        // Silently skip if file doesn't exist - this is expected on first run
      }
      
      // Sort games chronologically by generatedAt
      loadedGames.sort((a, b) => 
        new Date(a.generatedAt).getTime() - new Date(b.generatedAt).getTime()
      );
      
      setAllGames(loadedGames);
      setLoading(false);
      
      if (loadedGames.length === 0) {
        setError('No game files found. Please generate a game with: bun run generate');
      }
    };
    
    loadAllGames();
  }, []);

  // Calculate time range and timeline positions from all loaded games
  const { startTime, endTime, totalDurationMs, timelineDays, gameRanges } = React.useMemo(() => {
    if (allGames.length === 0) return { 
      startTime: null, 
      endTime: null, 
      totalDurationMs: 0, 
      timelineDays: [],
      gameRanges: []
    };

    // Get all timestamps from all games
    const allTimestamps: number[] = [];
    const days: Array<{ day: number, timestamp: number, label: string, gameId: string, gameName: string }> = [];
    const ranges: Array<{ gameId: string, gameName: string, startTime: number, endTime: number }> = [];
    
    allGames.forEach((g, idx) => {
      const gameName = g.id.includes('genesis') ? `Game 1 (Oct)` : `Game ${idx + 1} (Nov)`;
      let gameStart: number | null = null;
      let gameEnd: number | null = null;
      
      g.timeline?.forEach(day => {
        const firstPost = day.feedPosts?.[0];
        if (firstPost) {
          const ts = new Date(firstPost.timestamp).getTime();
          allTimestamps.push(ts);
          days.push({
            day: day.day,
            timestamp: ts,
            label: new Date(firstPost.timestamp).toLocaleDateString(),
            gameId: g.id,
            gameName
          });
          
          if (!gameStart || ts < gameStart) gameStart = ts;
          if (!gameEnd || ts > gameEnd) gameEnd = ts;
        }
      });
      
      if (gameStart && gameEnd) {
        ranges.push({ gameId: g.id, gameName, startTime: gameStart, endTime: gameEnd });
      }
    });

    if (allTimestamps.length === 0) return { 
      startTime: null, 
      endTime: null, 
      totalDurationMs: 0, 
      timelineDays: [],
      gameRanges: []
    };

    const start = Math.min(...allTimestamps);
    const end = Math.max(...allTimestamps);
    
    return {
      startTime: start,
      endTime: end,
      totalDurationMs: end - start,
      timelineDays: days.sort((a, b) => a.timestamp - b.timestamp),
      gameRanges: ranges
    };
  }, [allGames]);


  // Time-based continuous playback
  useEffect(() => {
    if (isPlaying && totalDurationMs > 0) {
      intervalRef.current = setInterval(() => {
        setCurrentTimeMs(prev => {
          const next = prev + (1000 * speed); // Advance by 1 second * speed
          if (next >= totalDurationMs) {
            setIsPlaying(false);
            return totalDurationMs;
          }
          return next;
        });
      }, 50); // Update every 50ms for smooth animation
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    }

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isPlaying, speed, totalDurationMs]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.key === ' ') {
        e.preventDefault();
        setIsPlaying(!isPlaying);
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [isPlaying]);

  // Wrap with router
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/feed" replace />} />
        <Route 
          path="/feed" 
          element={
            <FeedView
              allGames={allGames}
              currentTimeMs={currentTimeMs}
              setCurrentTimeMs={setCurrentTimeMs}
              isPlaying={isPlaying}
              setIsPlaying={setIsPlaying}
              speed={speed}
              setSpeed={setSpeed}
              startTime={startTime}
              totalDurationMs={totalDurationMs}
            />
          } 
        />
        <Route 
          path="/profile" 
          element={
            <ProfileView
              allGames={allGames}
              currentTimeMs={currentTimeMs}
              setCurrentTimeMs={setCurrentTimeMs}
              isPlaying={isPlaying}
              setIsPlaying={setIsPlaying}
              speed={speed}
              setSpeed={setSpeed}
              startTime={startTime}
              totalDurationMs={totalDurationMs}
            />
          } 
        />
      </Routes>
    </BrowserRouter>
  );
}
