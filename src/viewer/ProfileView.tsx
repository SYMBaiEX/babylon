/**
 * Profile View - Twitter-style actor profile page
 * Shows actor details, their posts, and related content
 */
import { useMemo, useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import type { GeneratedGame } from '../generator/GameGenerator';
import { WorldContextPanel } from './components/WorldContextPanel';

interface TimelineDay {
  day: number;
  timestamp: number;
  label: string;
  gameId: string;
  gameName: string;
}

interface GameRange {
  gameId: string;
  gameName: string;
  startTime: number;
  endTime: number;
}

interface ProfileViewProps {
  allGames: GeneratedGame[];
  currentTimeMs: number;
  setCurrentTimeMs: (ms: number) => void;
  isPlaying: boolean;
  setIsPlaying: (playing: boolean) => void;
  speed: number;
  setSpeed: (speed: number) => void;
  startTime: number | null;
  endTime: number | null;
  totalDurationMs: number;
  timelineDays: TimelineDay[];
  gameRanges: GameRange[];
}

interface Actor {
  id: string;
  name: string;
  username?: string;
  description: string;
  domain?: string[];
  tier?: string;
  role?: string;
  personality?: string;
  quirks?: string[];
  affiliations?: string[];
  aliases?: string[];
  postStyle?: string;
  postExample?: string[];
}

interface ActorData {
  id: string;
  name: string;
  username?: string;
  description: string;
  domain?: string[];
  personality?: string;
  quirks?: string[];
  affiliations?: string[];
  aliases?: string[];
  postStyle?: string;
  postExample?: string[];
  tier: string;
}

interface ActorsDatabase {
  version: string;
  description: string;
  actors: ActorData[];
}

export function ProfileView({
  allGames,
  currentTimeMs,
  setCurrentTimeMs,
  isPlaying,
  setIsPlaying,
  speed,
  setSpeed,
  startTime,
  endTime,
  totalDurationMs,
  timelineDays,
  gameRanges
}: ProfileViewProps) {
  const [searchParams] = useSearchParams();
  const profileId = searchParams.get('id');
  const [actorsDb, setActorsDb] = useState<ActorsDatabase | null>(null);

  // Load actors database for full profile info
  useEffect(() => {
    fetch('/data/actors.json')
      .then(res => res.json())
      .then(data => setActorsDb(data));
  }, []);

  // Find actor from game data and merge with full actor data
  const actor = useMemo(() => {
    if (!profileId || allGames.length === 0) return null;

    const currentGame = allGames[allGames.length - 1];
    if (!currentGame) return null;

    // Search in all actor tiers
    const allActors = [
      ...currentGame.setup.mainActors,
      ...currentGame.setup.supportingActors,
      ...currentGame.setup.extras
    ];
    
    const gameActor = allActors.find(a => a.id === profileId);
    if (!gameActor) return null;

    // Try to get full data from actors database
    const fullActorData = actorsDb?.actors.find(a => a.id === profileId);
    
    // Merge both sources, preferring full database data when available
    return {
      ...gameActor,
      username: fullActorData?.username,
      quirks: fullActorData?.quirks,
      aliases: fullActorData?.aliases,
      description: fullActorData?.description || gameActor.description,
      personality: fullActorData?.personality || gameActor.personality
    } as Actor;
  }, [profileId, allGames, actorsDb]);

  // Get all posts from this actor (filtered by current time)
  const actorPosts = useMemo(() => {
    if (!profileId || !startTime) return [];

    const posts: Array<{
      content: string;
      timestamp: string;
      timestampMs: number;
      type: string;
      sentiment: number;
      clueStrength: number;
      gameId: string;
    }> = [];

    allGames.forEach(g => {
      g.timeline?.forEach(day => {
        day.feedPosts?.forEach(post => {
          if (post.author === profileId) {
            const postTime = new Date(post.timestamp).getTime();
            posts.push({
              content: post.content,
              timestamp: post.timestamp,
              timestampMs: postTime,
              type: post.type,
              sentiment: post.sentiment,
              clueStrength: post.clueStrength,
              gameId: g.id
            });
          }
        });
      });
    });

    // Filter by current time and sort newest first
    const currentTimeAbsolute = startTime + currentTimeMs;
    return posts
      .filter(p => p.timestampMs <= currentTimeAbsolute)
      .sort((a, b) => b.timestampMs - a.timestampMs);
  }, [profileId, allGames, startTime, currentTimeMs]);

  if (!profileId) {
    return (
      <div style={{
        background: '#000',
        minHeight: '100vh',
        color: '#e7e9ea',
        padding: 40,
        textAlign: 'center'
      }}>
        <h2>No profile ID provided</h2>
        <Link to="/feed" style={{ color: '#1d9bf0', textDecoration: 'none' }}>
          ← Back to Feed
        </Link>
      </div>
    );
  }

  if (!actor) {
    return (
      <div style={{
        background: '#000',
        minHeight: '100vh',
        color: '#e7e9ea',
        padding: 40,
        textAlign: 'center'
      }}>
        <h2>Actor not found: {profileId}</h2>
        <Link to="/feed" style={{ color: '#1d9bf0', textDecoration: 'none' }}>
          ← Back to Feed
        </Link>
      </div>
    );
  }

  const currentDate = startTime ? new Date(startTime + currentTimeMs) : null;

  return (
    <div style={{
      background: '#000',
      minHeight: '100vh',
      color: '#e7e9ea',
      display: 'grid',
      gridTemplateColumns: '1fr 400px',
      gap: 0
    }}>
      {/* Left Column - Profile Content */}
      <div>
        {/* Header with back button */}
        <div style={{
          position: 'sticky',
          top: 0,
          background: 'rgba(0, 0, 0, 0.85)',
          backdropFilter: 'blur(12px)',
          borderBottom: '1px solid #2f3336',
          zIndex: 100,
          padding: '12px 16px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
            <Link 
              to="/feed" 
              style={{ 
                color: '#e7e9ea',
                fontSize: 20,
                textDecoration: 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 34,
                height: 34,
                borderRadius: '50%',
                transition: 'background 0.2s'
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = '#16181c'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
            >
              ←
            </Link>
            <div>
              <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>{actor.name}</h2>
              <div style={{ fontSize: 13, color: '#71767b' }}>
                {actorPosts.length} posts
              </div>
            </div>
          </div>
        </div>

        {/* Profile Header */}
        <div style={{ maxWidth: 600, margin: '0 auto' }}>
        {/* Cover Image Placeholder */}
        <div style={{
          height: 200,
          background: 'linear-gradient(135deg, #1d9bf0 0%, #0c7abf 100%)',
          borderBottom: '1px solid #2f3336'
        }} />

        {/* Profile Info */}
        <div style={{ padding: '12px 16px 16px' }}>
          {/* Avatar */}
          <div style={{ marginTop: -67, marginBottom: 12 }}>
            <div style={{
              width: 133,
              height: 133,
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              border: '4px solid #000',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 52,
              fontWeight: 700,
              color: '#fff',
              overflow: 'hidden'
            }}>
              <img 
                src={`/images/actors/${actor.id}.jpg`}
                alt={actor.name}
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover'
                }}
                onError={(e) => {
                  // Try organization image if actor image fails
                  const currentSrc = e.currentTarget.src;
                  if (currentSrc.includes('/actors/')) {
                    e.currentTarget.src = `/images/organizations/${actor.id}.jpg`;
                  } else {
                    // Final fallback to letter avatar
                    e.currentTarget.style.display = 'none';
                    const parent = e.currentTarget.parentElement;
                    if (parent) {
                      parent.textContent = actor.name.charAt(0).toUpperCase();
                    }
                  }
                }}
              />
            </div>
          </div>

          {/* Name and username */}
          <div style={{ marginBottom: 12 }}>
            <h1 style={{ 
              margin: 0, 
              fontSize: 20, 
              fontWeight: 800, 
              color: '#e7e9ea' 
            }}>
              {actor.name}
            </h1>
            {actor.username && (
              <div style={{ fontSize: 15, color: '#71767b', marginTop: 2 }}>
                @{actor.username}
              </div>
            )}
          </div>

          {/* Description (Bio) */}
          <div style={{
            fontSize: 15,
            lineHeight: 1.5,
            color: '#e7e9ea',
            marginBottom: 12
          }}>
            {actor.description}
          </div>
        </div>

        {/* Tabs */}
        <div style={{
          borderBottom: '1px solid #2f3336',
          display: 'flex',
          justifyContent: 'space-around'
        }}>
          <button style={{
            flex: 1,
            padding: '16px',
            background: 'none',
            border: 'none',
            borderBottom: '4px solid #1d9bf0',
            color: '#e7e9ea',
            fontWeight: 700,
            fontSize: 15,
            cursor: 'pointer'
          }}>
            Posts
          </button>
          <button style={{
            flex: 1,
            padding: '16px',
            background: 'none',
            border: 'none',
            borderBottom: '4px solid transparent',
            color: '#71767b',
            fontWeight: 700,
            fontSize: 15,
            cursor: 'pointer'
          }}>
            Media
          </button>
        </div>

        {/* Posts Timeline */}
        <div>
          {actorPosts.map((post, i) => {
            const postDate = new Date(post.timestamp);
            
            return (
              <div
                key={i}
                style={{
                  padding: '12px 16px',
                  borderBottom: '1px solid #2f3336',
                  background: '#000',
                  cursor: 'pointer',
                  transition: 'background 0.2s'
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = '#080808'}
                onMouseLeave={(e) => e.currentTarget.style.background = '#000'}
              >
                <div style={{ display: 'flex', gap: 12 }}>
                  {/* Avatar */}
                  <div style={{
                    width: 40,
                    height: 40,
                    borderRadius: '50%',
                    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#fff',
                    fontWeight: 'bold',
                    fontSize: 16,
                    flexShrink: 0,
                    overflow: 'hidden'
                  }}>
                    <img 
                      src={`/images/actors/${actor.id}.jpg`}
                      alt={actor.name}
                      style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover'
                      }}
                      onError={(e) => {
                        // Try organization image if actor image fails
                        const currentSrc = e.currentTarget.src;
                        if (currentSrc.includes('/actors/')) {
                          e.currentTarget.src = `/images/organizations/${actor.id}.jpg`;
                        } else {
                          // Final fallback to letter avatar
                          e.currentTarget.style.display = 'none';
                          const parent = e.currentTarget.parentElement;
                          if (parent) {
                            parent.textContent = actor.name.charAt(0).toUpperCase();
                          }
                        }
                      }}
                    />
                  </div>

                  {/* Content */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {/* Author and metadata */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
                      <span style={{ fontWeight: 700, fontSize: 15, color: '#e7e9ea' }}>
                        {actor.name}
                      </span>
                      <span style={{ color: '#71767b', fontSize: 15 }}>·</span>
                      <span style={{ fontSize: 15, color: '#71767b' }}>
                        {postDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} at {postDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>

                    {/* Post content */}
                    <div style={{
                      fontSize: 15,
                      lineHeight: 1.5,
                      color: '#e7e9ea',
                      wordWrap: 'break-word',
                      marginBottom: 8
                    }}>
                      {post.content}
                    </div>

                    {/* Metadata */}
                    <div style={{
                      display: 'flex',
                      gap: 16,
                      fontSize: 13,
                      color: '#71767b'
                    }}>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}

          {actorPosts.length === 0 && (
            <div style={{
              padding: 60,
              textAlign: 'center',
              color: '#71767b',
              fontSize: 15
            }}>
              No posts yet
            </div>
          )}
        </div>
        </div>
      </div>

      {/* Right Column - Timeline Controls */}
      <div style={{
        background: '#000',
        borderLeft: '1px solid #2f3336',
        padding: '16px',
        overflowY: 'auto',
        height: '100vh',
        position: 'sticky',
        top: 0
      }}>
        <div>
          <h3 style={{
            margin: '0 0 16px 0',
            fontSize: 18,
            fontWeight: 700,
            color: '#e7e9ea'
          }}>
            Timeline
          </h3>

          {/* Playback Buttons */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            <button 
              onClick={() => { setCurrentTimeMs(0); setIsPlaying(false); }}
              style={{ 
                padding: '8px 12px', 
                cursor: 'pointer',
                background: '#16181c',
                border: '1px solid #2f3336',
                borderRadius: 6,
                color: '#e7e9ea',
                fontSize: 13,
                fontWeight: 600
              }}
            >
              ⏮️
            </button>
            
            <button 
              onClick={() => setIsPlaying(!isPlaying)}
              disabled={!startTime}
              style={{ 
                flex: 1,
                padding: '8px 12px', 
                cursor: startTime ? 'pointer' : 'not-allowed',
                background: isPlaying ? '#f44336' : '#1d9bf0',
                border: 'none',
                borderRadius: 6,
                color: '#fff',
                fontWeight: 700,
                fontSize: 14
              }}
            >
              {isPlaying ? '⏸️ Pause' : '▶️ Play'}
            </button>
            
            <button 
              onClick={() => { setCurrentTimeMs(totalDurationMs); setIsPlaying(false); }}
              disabled={!startTime}
              style={{ 
                padding: '8px 12px', 
                cursor: startTime ? 'pointer' : 'not-allowed',
                background: '#16181c',
                border: '1px solid #2f3336',
                borderRadius: 6,
                color: '#e7e9ea',
                fontSize: 13,
                fontWeight: 600
              }}
            >
              ⏭️
            </button>
          </div>

          {/* Speed Control */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 13, color: '#71767b', marginBottom: 8 }}>Speed</div>
            <select 
              value={speed} 
              onChange={(e) => setSpeed(Number(e.target.value))}
              style={{ 
                width: '100%',
                padding: '8px 12px', 
                cursor: 'pointer',
                background: '#16181c',
                border: '1px solid #2f3336',
                borderRadius: 6,
                color: '#e7e9ea',
                fontSize: 14
              }}
            >
              <option value={100}>100x</option>
              <option value={50}>50x</option>
              <option value={10}>10x</option>
              <option value={5}>5x</option>
              <option value={2}>2x</option>
              <option value={1}>1x</option>
            </select>
          </div>

          {/* Time Display */}
          <div style={{
            padding: '12px',
            background: '#16181c',
            borderRadius: 6,
            border: '1px solid #2f3336',
            marginBottom: 16
          }}>
            <div style={{ fontSize: 12, color: '#71767b', marginBottom: 4 }}>Current Time</div>
            <div style={{ fontSize: 15, fontWeight: 600, color: '#e7e9ea' }}>
              {currentDate ? currentDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'No timeline'}
            </div>
            <div style={{ fontSize: 13, color: '#71767b', marginTop: 2 }}>
              {currentDate ? currentDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : ''}
            </div>
          </div>

          {/* Time Slider */}
          <input
            type="range"
            min={0}
            max={totalDurationMs || 100}
            value={currentTimeMs}
            onChange={(e) => { setCurrentTimeMs(Number(e.target.value)); setIsPlaying(false); }}
            disabled={!startTime}
            style={{ 
              width: '100%',
              height: 6,
              cursor: startTime ? 'pointer' : 'not-allowed',
              accentColor: '#1d9bf0',
              marginBottom: 8
            }}
          />

          <div style={{ fontSize: 11, color: '#71767b', textAlign: 'center', marginBottom: 16 }}>
            {actorPosts.length} posts visible
          </div>

          {/* Game Ranges */}
          {gameRanges.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 13, color: '#71767b', marginBottom: 8 }}>Games</div>
              {gameRanges.map((range, idx) => (
                <div
                  key={range.gameId}
                  style={{
                    padding: '8px 12px',
                    background: '#16181c',
                    border: '1px solid #2f3336',
                    borderRadius: 6,
                    marginBottom: 6,
                    fontSize: 13,
                    color: '#e7e9ea'
                  }}
                >
                  <div style={{ fontWeight: 600, marginBottom: 2 }}>
                    Game {idx + 1}: {range.gameName}
                  </div>
                  <div style={{ fontSize: 11, color: '#71767b' }}>
                    {new Date(range.startTime).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - {new Date(range.endTime).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Timeline Days Quick Jump */}
          {timelineDays.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 13, color: '#71767b', marginBottom: 8 }}>Jump to Day</div>
              <select
                onChange={(e) => {
                  const selectedTimestamp = Number(e.target.value);
                  if (startTime && selectedTimestamp > 0) {
                    setCurrentTimeMs(selectedTimestamp - startTime);
                    setIsPlaying(false);
                  }
                }}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  cursor: 'pointer',
                  background: '#16181c',
                  border: '1px solid #2f3336',
                  borderRadius: 6,
                  color: '#e7e9ea',
                  fontSize: 13
                }}
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

          {/* Time Range Display */}
          {startTime && endTime && (
            <div style={{
              marginTop: 16,
              padding: '8px 12px',
              background: '#16181c',
              border: '1px solid #2f3336',
              borderRadius: 6,
              fontSize: 11,
              color: '#71767b'
            }}>
              <div>Start: {new Date(startTime).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</div>
              <div>End: {new Date(endTime).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</div>
            </div>
          )}
        </div>

        {/* World Context with Questions */}
        <div style={{ marginTop: 24 }}>
          {allGames.length > 0 && allGames[allGames.length - 1] && (
            <WorldContextPanel
              mainActors={allGames[allGames.length - 1].setup.mainActors.map(a => ({
                id: a.id,
                name: a.name,
                description: a.description || '',
                tier: a.tier,
                role: a.role,
                domain: a.domain
              }))}
              scenarios={allGames[allGames.length - 1].setup.scenarios}
              questions={allGames[allGames.length - 1].setup.questions}
              worldSummary={`Tracking ${allGames[allGames.length - 1].setup.questions.length} prediction markets across ${allGames[allGames.length - 1].setup.scenarios.length} scenarios with ${allGames[allGames.length - 1].setup.mainActors.length} main actors.`}
            />
          )}
        </div>
      </div>
    </div>
  );
}

