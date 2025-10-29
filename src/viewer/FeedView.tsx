/**
 * X-Style Feed View
 * Main feed page with tab navigation for Feed and Messages
 */
import React, { useState, useRef } from 'react';
import { Link } from 'react-router-dom';
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

interface FeedViewProps {
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

export function FeedView({
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
}: FeedViewProps) {
  const [selectedTab, setSelectedTab] = useState<'feed' | 'messages'>('feed');
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [messageSearchQuery, setMessageSearchQuery] = useState('');
  const feedContainerRef = useRef<HTMLDivElement>(null);

  // Calculate current date
  const currentDate = startTime ? new Date(startTime + currentTimeMs) : null;

  // Get all feed posts filtered by current time
  const visibleFeedPosts = React.useMemo(() => {
    if (!startTime || !currentDate) return [];

    const posts: Array<{
      post: {
        author: string;
        authorName: string;
        content: string;
        timestamp: string;
        type: string;
        sentiment: number;
        clueStrength: number;
        replyTo?: string;
      };
      gameId: string;
      gameName: string;
      timestampMs: number;
    }> = [];

    allGames.forEach((g) => {
      const gameName = g.id.includes('genesis') ? 'October' : new Date(g.generatedAt).toLocaleDateString('en-US', { month: 'long' });
      
      g.timeline?.forEach(day => {
        day.feedPosts?.forEach(post => {
          const postTime = new Date(post.timestamp).getTime();
          posts.push({
            post,
            gameId: g.id,
            gameName,
            timestampMs: postTime
          });
        });
      });
    });

    const currentTimeAbsolute = startTime + currentTimeMs;
    const filtered = posts
      .filter(p => p.timestampMs <= currentTimeAbsolute)
      .sort((a, b) => b.timestampMs - a.timestampMs);

    // Apply search filter
    if (searchQuery) {
      return filtered.filter(p => 
        p.post.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.post.authorName.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    return filtered;
  }, [allGames, startTime, currentDate, currentTimeMs, searchQuery]);

  // Get all unique groups from timeline (where actual messages are)
  const allGroups = React.useMemo(() => {
    const groupsMap = new Map<string, { id: string; name: string; messageCount: number }>();
    
    // First, build a map of groupId -> name from setup
    const groupNameMap = new Map<string, string>();
    allGames.forEach(g => {
      g.setup?.groupChats?.forEach(groupChat => {
        groupNameMap.set(groupChat.id, groupChat.name);
      });
    });
    
    // Then count messages per group
    allGames.forEach(g => {
      g.timeline.forEach(day => {
        Object.keys(day.groupChats || {}).forEach(groupId => {
          const messages = day.groupChats?.[groupId];
          const messageCount = Array.isArray(messages) ? messages.length : 0;
          
          if (groupsMap.has(groupId)) {
            const existing = groupsMap.get(groupId)!;
            existing.messageCount += messageCount;
          } else {
            // Use stored name from setup, fallback to formatted ID
            const name = groupNameMap.get(groupId) || 
                        groupId.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
            groupsMap.set(groupId, {
              id: groupId,
              name,
              messageCount
            });
          }
        });
      });
    });
    
    const allGroupsList = Array.from(groupsMap.values()).sort((a, b) => b.messageCount - a.messageCount);
    
    // Apply search filter
    if (messageSearchQuery) {
      return allGroupsList.filter(g => 
        g.name.toLowerCase().includes(messageSearchQuery.toLowerCase())
      );
    }
    
    return allGroupsList;
  }, [allGames, messageSearchQuery]);

  // Get messages for selected group (time-filtered)
  const selectedGroupMessages = React.useMemo(() => {
    if (!selectedGroup || !startTime || !currentDate) return [];
    
    const messages: Array<{
      from: string;
      message: string;
      timestamp: string;
      timestampMs: number;
      day: number;
      gameId: string;
    }> = [];
    
    allGames.forEach(g => {
      g.timeline.forEach(day => {
        const groupMsgs = day.groupChats?.[selectedGroup];
        if (groupMsgs && Array.isArray(groupMsgs)) {
          groupMsgs.forEach((msg: { from: string; message: string; timestamp?: string }) => {
            const msgTime = msg.timestamp || `${day.summary.split(':')[0]}T12:00:00Z`;
            const timestampMs = new Date(msgTime).getTime();
            
            messages.push({
              from: msg.from,
              message: msg.message,
              timestamp: msgTime,
              timestampMs,
              day: day.day,
              gameId: g.id
            });
          });
        }
      });
    });
    
    // Filter by current time and sort chronologically
    const currentTimeAbsolute = startTime + currentTimeMs;
    let filtered = messages
      .filter(m => m.timestampMs <= currentTimeAbsolute)
      .sort((a, b) => a.timestampMs - b.timestampMs);
    
    // Apply search filter
    if (messageSearchQuery) {
      filtered = filtered.filter(m => 
        m.message.toLowerCase().includes(messageSearchQuery.toLowerCase()) ||
        m.from.toLowerCase().includes(messageSearchQuery.toLowerCase())
      );
    }
    
    return filtered;
  }, [selectedGroup, allGames, startTime, currentDate, currentTimeMs, messageSearchQuery]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#000' }}>
      {/* Tab Navigation */}
      <div style={{
        display: 'flex',
        borderBottom: '1px solid #2f3336',
        background: '#000',
        position: 'sticky',
        top: 0,
        zIndex: 20
      }}>
        <button
          onClick={() => setSelectedTab('feed')}
          style={{
            flex: 1,
            padding: '16px',
            background: 'none',
            border: 'none',
            borderBottom: selectedTab === 'feed' ? '4px solid #1d9bf0' : '4px solid transparent',
            color: selectedTab === 'feed' ? '#e7e9ea' : '#71767b',
            fontSize: 15,
            fontWeight: 700,
            cursor: 'pointer',
            transition: 'all 0.2s'
          }}
          onMouseEnter={(e) => {
            if (selectedTab !== 'feed') e.currentTarget.style.background = '#080808';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'none';
          }}
        >
          Feed
        </button>
        <button
          onClick={() => setSelectedTab('messages')}
          style={{
            flex: 1,
            padding: '16px',
            background: 'none',
            border: 'none',
            borderBottom: selectedTab === 'messages' ? '4px solid #1d9bf0' : '4px solid transparent',
            color: selectedTab === 'messages' ? '#e7e9ea' : '#71767b',
            fontSize: 15,
            fontWeight: 700,
            cursor: 'pointer',
            transition: 'all 0.2s'
          }}
          onMouseEnter={(e) => {
            if (selectedTab !== 'messages') e.currentTarget.style.background = '#080808';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'none';
          }}
        >
          Messages
        </button>
      </div>

      {/* Content Area */}
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0, overflow: 'hidden' }}>
        {selectedTab === 'feed' ? (
          <>
            {/* Feed Tab - Left Column: Posts */}
            <div style={{ 
              borderRight: '1px solid #2f3336',
              display: 'flex',
              flexDirection: 'column',
              height: '100%'
            }}>
              {/* Feed Header */}
              <div style={{
                padding: '12px 16px',
                borderBottom: '1px solid #2f3336',
                background: '#000',
                position: 'sticky',
                top: 0,
                zIndex: 10
              }}>
                <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#e7e9ea', marginBottom: 12 }}>
                  Feed
                </h2>
                
                {/* Search Bar */}
                <div style={{ position: 'relative', marginBottom: 8 }}>
                  <input
                    type="text"
                    placeholder="Search posts and users..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '10px 40px 10px 40px',
                      background: '#202327',
                      border: '1px solid #2f3336',
                      borderRadius: 20,
                      color: '#e7e9ea',
                      fontSize: 14,
                      outline: 'none',
                      transition: 'all 0.2s'
                    }}
                    onFocus={(e) => {
                      e.currentTarget.style.background = '#000';
                      e.currentTarget.style.borderColor = '#1d9bf0';
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.background = '#202327';
                      e.currentTarget.style.borderColor = '#2f3336';
                    }}
                  />
                  {/* Search Icon */}
                  <div style={{
                    position: 'absolute',
                    left: 12,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: '#71767b',
                    fontSize: 16,
                    pointerEvents: 'none'
                  }}>
                    🔍
                  </div>
                  {/* Clear Button */}
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery('')}
                      style={{
                        position: 'absolute',
                        right: 12,
                        top: '50%',
                        transform: 'translateY(-50%)',
                        background: '#1d9bf0',
                        border: 'none',
                        borderRadius: '50%',
                        width: 20,
                        height: 20,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                        color: '#fff',
                        fontSize: 12,
                        fontWeight: 'bold'
                      }}
                    >
                      ×
                    </button>
                  )}
                </div>

                <div style={{ fontSize: 13, color: '#71767b' }}>
                  {searchQuery ? (
                    <>
                      {visibleFeedPosts.length} result{visibleFeedPosts.length !== 1 ? 's' : ''} for "{searchQuery}"
                    </>
                  ) : (
                    <>
                      {visibleFeedPosts.length} posts • {currentDate?.toLocaleDateString()}
                    </>
                  )}
                </div>
              </div>

              {/* Feed Content */}
              <div 
                ref={feedContainerRef}
                style={{
                  flex: 1,
                  overflowY: 'auto',
                  overflowX: 'hidden'
                }}
              >
                {visibleFeedPosts.map((item, i) => {
                  const post = item.post;
                  const postDate = new Date(post.timestamp);
                  
                  return (
                    <div
                      key={`${item.gameId}-${post.timestamp}-${i}`}
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
                        <Link 
                          to={`/profile?id=${post.author}`}
                          style={{
                            width: 40,
                            height: 40,
                            borderRadius: '50%',
                            background: 'linear-gradient(135deg, #1d9bf0 0%, #0c7abf 100%)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: '#fff',
                            fontWeight: 'bold',
                            fontSize: 16,
                            flexShrink: 0,
                            textDecoration: 'none',
                            transition: 'opacity 0.2s',
                            overflow: 'hidden'
                          }}
                          onMouseEnter={(e) => e.currentTarget.style.opacity = '0.8'}
                          onMouseLeave={(e) => e.currentTarget.style.opacity = '1'}
                        >
                          <img 
                            src={`/images/actors/${post.author}.jpg`}
                            alt={post.authorName}
                            style={{
                              width: '100%',
                              height: '100%',
                              objectFit: 'cover'
                            }}
                            onError={(e) => {
                              // Try organization image if actor image fails
                              const currentSrc = e.currentTarget.src;
                              if (currentSrc.includes('/actors/')) {
                                e.currentTarget.src = `/images/organizations/${post.author}.jpg`;
                              } else {
                                // Final fallback to letter avatar
                                e.currentTarget.style.display = 'none';
                                const parent = e.currentTarget.parentElement;
                                if (parent) {
                                  parent.textContent = post.authorName.charAt(0).toUpperCase();
                                }
                              }
                            }}
                          />
                        </Link>

                        {/* Content */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          {/* Author and metadata */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
                            <Link 
                              to={`/profile?id=${post.author}`}
                              style={{ 
                                fontWeight: 700, 
                                fontSize: 15, 
                                color: '#e7e9ea',
                                textDecoration: 'none'
                              }}
                              onMouseEnter={(e) => e.currentTarget.style.textDecoration = 'underline'}
                              onMouseLeave={(e) => e.currentTarget.style.textDecoration = 'none'}
                            >
                              {searchQuery && post.authorName.toLowerCase().includes(searchQuery.toLowerCase()) ? (
                                post.authorName.split(new RegExp(`(${searchQuery})`, 'gi')).map((part, i) => 
                                  part.toLowerCase() === searchQuery.toLowerCase() ? (
                                    <span key={i} style={{ background: '#1d9bf0', color: '#000', fontWeight: 700, padding: '2px 4px', borderRadius: 3 }}>
                                      {part}
                                    </span>
                                  ) : (
                                    <span key={i}>{part}</span>
                                  )
                                )
                              ) : (
                                post.authorName
                              )}
                            </Link>
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
                            {searchQuery ? (
                              post.content.split(new RegExp(`(${searchQuery})`, 'gi')).map((part, i) => 
                                part.toLowerCase() === searchQuery.toLowerCase() ? (
                                  <span key={i} style={{ background: '#1d9bf0', color: '#000', fontWeight: 600, padding: '2px 4px', borderRadius: 3 }}>
                                    {part}
                                  </span>
                                ) : (
                                  <span key={i}>{part}</span>
                                )
                              )
                            ) : (
                              post.content
                            )}
                          </div>

                          {/* Metadata */}
                          <div style={{
                            display: 'flex',
                            gap: 16,
                            fontSize: 13,
                            color: '#71767b'
                          }}>
                            {post.replyTo && <span>↩️ Reply</span>}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}

                {visibleFeedPosts.length === 0 && (
                  <div style={{
                    padding: 60,
                    textAlign: 'center',
                    color: '#71767b',
                    fontSize: 16
                  }}>
                    ⏱️ Move the time slider to see posts appear
                  </div>
                )}
              </div>
            </div>

            {/* Feed Tab - Right Column: Timeline Controls + Questions */}
            <div style={{
              background: '#000',
              overflowY: 'auto',
              padding: '16px',
              display: 'flex',
              flexDirection: 'column',
              gap: 24
            }}>
              {/* Timeline Controls */}
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
                  {visibleFeedPosts.length} posts visible
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
          </>
        ) : (
          <>
            {/* Messages Tab - Left Column: Groups List */}
            <div style={{
              borderRight: '1px solid #2f3336',
              background: '#000',
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column'
            }}>
              <div style={{
                padding: '12px 16px',
                borderBottom: '1px solid #2f3336',
                background: '#000',
                position: 'sticky',
                top: 0,
                zIndex: 10
              }}>
                <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#e7e9ea', marginBottom: 12 }}>
                  Group Chats
                </h2>
                
                {/* Search Bar */}
                <div style={{ position: 'relative', marginBottom: 8 }}>
                  <input
                    type="text"
                    placeholder="Search groups and messages..."
                    value={messageSearchQuery}
                    onChange={(e) => setMessageSearchQuery(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '10px 40px 10px 40px',
                      background: '#202327',
                      border: '1px solid #2f3336',
                      borderRadius: 20,
                      color: '#e7e9ea',
                      fontSize: 14,
                      outline: 'none',
                      transition: 'all 0.2s'
                    }}
                    onFocus={(e) => {
                      e.currentTarget.style.background = '#000';
                      e.currentTarget.style.borderColor = '#1d9bf0';
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.background = '#202327';
                      e.currentTarget.style.borderColor = '#2f3336';
                    }}
                  />
                  {/* Search Icon */}
                  <div style={{
                    position: 'absolute',
                    left: 12,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: '#71767b',
                    fontSize: 16,
                    pointerEvents: 'none'
                  }}>
                    🔍
                  </div>
                  {/* Clear Button */}
                  {messageSearchQuery && (
                    <button
                      onClick={() => setMessageSearchQuery('')}
                      style={{
                        position: 'absolute',
                        right: 12,
                        top: '50%',
                        transform: 'translateY(-50%)',
                        background: '#1d9bf0',
                        border: 'none',
                        borderRadius: '50%',
                        width: 20,
                        height: 20,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                        color: '#fff',
                        fontSize: 12,
                        fontWeight: 'bold'
                      }}
                    >
                      ×
                    </button>
                  )}
                </div>

                <div style={{ fontSize: 13, color: '#71767b' }}>
                  {messageSearchQuery ? (
                    <>
                      {allGroups.length} group{allGroups.length !== 1 ? 's' : ''} found
                    </>
                  ) : (
                    <>
                      {allGroups.length} groups
                    </>
                  )}
                </div>
              </div>

              {/* Groups List */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '8px' }}>
                {allGroups.map(group => (
                  <div
                    key={group.id}
                    onClick={() => setSelectedGroup(group.id)}
                    style={{
                      padding: '12px',
                      background: selectedGroup === group.id ? '#1d2026' : '#16181c',
                      borderRadius: 8,
                      cursor: 'pointer',
                      border: `1px solid ${selectedGroup === group.id ? '#1d9bf0' : '#2f3336'}`,
                      transition: 'all 0.2s'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = '#1d2026';
                    }}
                    onMouseLeave={(e) => {
                      if (selectedGroup !== group.id) {
                        e.currentTarget.style.background = '#16181c';
                      }
                    }}
                  >
                    <div style={{
                      fontWeight: 600,
                      fontSize: 15,
                      color: '#e7e9ea',
                      marginBottom: 4
                    }}>
                      💬 {group.name}
                    </div>
                    <div style={{
                      fontSize: 13,
                      color: '#71767b'
                    }}>
                      {group.messageCount} messages
                    </div>
                  </div>
                ))}

                {allGroups.length === 0 && (
                  <div style={{
                    padding: 60,
                    textAlign: 'center',
                    color: '#71767b',
                    fontSize: 16
                  }}>
                    No group chats yet
                  </div>
                )}
              </div>
            </div>

            {/* Messages Tab - Right Column: Selected Group Messages */}
            <div style={{
              background: '#000',
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column'
            }}>
              {selectedGroup ? (
                <>
                  <div style={{
                    padding: '12px 16px',
                    borderBottom: '1px solid #2f3336',
                    background: '#000',
                    position: 'sticky',
                    top: 0,
                    zIndex: 10
                  }}>
                    <button
                      onClick={() => setSelectedGroup(null)}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#1d9bf0',
                        cursor: 'pointer',
                        fontSize: 14,
                        padding: 0,
                        marginBottom: 8
                      }}
                    >
                      ← Back
                    </button>
                    <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#e7e9ea' }}>
                      {allGroups.find(g => g.id === selectedGroup)?.name || 'Group'}
                    </h3>
                    <div style={{ fontSize: 13, color: '#71767b', marginTop: 4 }}>
                      {messageSearchQuery ? (
                        <>
                          {selectedGroupMessages.length} message{selectedGroupMessages.length !== 1 ? 's' : ''} matching "{messageSearchQuery}"
                        </>
                      ) : (
                        <>
                          {selectedGroupMessages.length} messages
                        </>
                      )}
                    </div>
                  </div>

                  {/* Group Messages */}
                  <div>
                    {selectedGroupMessages.map((msg, i) => (
                      <div
                        key={i}
                        style={{
                          padding: '12px 16px',
                          borderBottom: '1px solid #2f3336',
                          background: '#000'
                        }}
                      >
                        <div style={{ fontWeight: 700, fontSize: 14, color: '#e7e9ea', marginBottom: 4 }}>
                          {messageSearchQuery ? (
                            msg.from.split(new RegExp(`(${messageSearchQuery})`, 'gi')).map((part, j) => 
                              part.toLowerCase() === messageSearchQuery.toLowerCase() ? (
                                <span key={j} style={{ background: '#1d9bf0', color: '#000', fontWeight: 700, padding: '2px 4px', borderRadius: 3 }}>
                                  {part}
                                </span>
                              ) : (
                                <span key={j}>{part}</span>
                              )
                            )
                          ) : (
                            msg.from
                          )}
                        </div>
                        <div style={{ fontSize: 14, color: '#e7e9ea', lineHeight: 1.4 }}>
                          {messageSearchQuery ? (
                            msg.message.split(new RegExp(`(${messageSearchQuery})`, 'gi')).map((part, j) => 
                              part.toLowerCase() === messageSearchQuery.toLowerCase() ? (
                                <span key={j} style={{ background: '#1d9bf0', color: '#000', fontWeight: 600, padding: '2px 4px', borderRadius: 3 }}>
                                  {part}
                                </span>
                              ) : (
                                <span key={j}>{part}</span>
                              )
                            )
                          ) : (
                            msg.message
                          )}
                        </div>
                        <div style={{ fontSize: 12, color: '#71767b', marginTop: 4 }}>
                          {new Date(msg.timestamp).toLocaleString()}
                        </div>
                      </div>
                    ))}

                    {selectedGroupMessages.length === 0 && (
                      <div style={{
                        padding: 60,
                        textAlign: 'center',
                        color: '#71767b',
                        fontSize: 16
                      }}>
                        ⏱️ Move the time slider to see messages appear
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#71767b',
                  fontSize: 16
                }}>
                  ← Select a group chat to view messages
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
