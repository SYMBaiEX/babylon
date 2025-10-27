/**
 * Example Usage of GameRecap Component
 *
 * This shows how to integrate the GameRecap into your viewer
 */
import { useState } from 'react';
import { GameRecap } from './GameRecap';
import { extractGameRecapData } from '../utils/gameDataExtractor';
import type { GeneratedGame, GameHistory } from '../../generator/GameGenerator';

export function ViewerExample() {
  const [game, setGame] = useState<GeneratedGame | null>(null);
  const [previousGames, setPreviousGames] = useState<GameHistory[]>([]);
  const [currentDay, setCurrentDay] = useState(1);

  // Load game from file
  const loadGame = async (file: File) => {
    const text = await file.text();
    const data = JSON.parse(text) as GeneratedGame;
    setGame(data);
    setCurrentDay(1);
  };

  // Load previous games history
  const loadHistory = async (file: File) => {
    const text = await file.text();
    const history = JSON.parse(text) as GameHistory | GameHistory[];
    setPreviousGames(Array.isArray(history) ? history : [history]);
  };

  if (!game) {
    return (
      <div className="viewer-loading">
        <h1>🎮 Babylon Game Viewer</h1>
        <div className="file-loaders">
          <div className="loader-section">
            <h3>Load Game</h3>
            <input
              type="file"
              accept=".json"
              onChange={(e) => e.target.files?.[0] && loadGame(e.target.files[0])}
            />
            <p className="hint">Load latest.json or any game-*.json file</p>
          </div>
          
          <div className="loader-section optional">
            <h3>Load History (Optional)</h3>
            <input
              type="file"
              accept=".json"
              onChange={(e) => e.target.files?.[0] && loadHistory(e.target.files[0])}
            />
            <p className="hint">Load game history for context</p>
          </div>
        </div>
        
        <style>{`
          .viewer-loading {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            background: #0a0a0f;
            color: #e0e0e0;
            padding: 40px;
          }
          
          .viewer-loading h1 {
            margin: 0 0 40px 0;
            font-size: 48px;
            color: #4fc3f7;
          }
          
          .file-loaders {
            display: flex;
            flex-direction: column;
            gap: 24px;
            max-width: 500px;
            width: 100%;
          }
          
          .loader-section {
            background: rgba(255, 255, 255, 0.05);
            padding: 24px;
            border-radius: 12px;
            border: 2px solid rgba(255, 255, 255, 0.1);
          }
          
          .loader-section.optional {
            opacity: 0.7;
          }
          
          .loader-section h3 {
            margin: 0 0 12px 0;
            color: #fff;
          }
          
          .loader-section input {
            width: 100%;
            padding: 12px;
            background: rgba(0, 0, 0, 0.3);
            border: 1px solid rgba(255, 255, 255, 0.2);
            border-radius: 6px;
            color: #fff;
            cursor: pointer;
          }
          
          .hint {
            margin: 8px 0 0 0;
            color: #999;
            font-size: 12px;
          }
        `}</style>
      </div>
    );
  }

  // Extract recap data
  const recapData = extractGameRecapData(game, previousGames, currentDay);

  return (
    <div className="babylon-viewer">
      {/* Show the recap/context view */}
      <GameRecap data={recapData} />
      
      {/* Day controls */}
      <div className="day-controls">
        <button onClick={() => setCurrentDay(Math.max(1, currentDay - 1))}>
          ← Previous Day
        </button>
        <span className="current-day">Day {currentDay} / 30</span>
        <button onClick={() => setCurrentDay(Math.min(30, currentDay + 1))}>
          Next Day →
        </button>
      </div>

      <style>{`
        .babylon-viewer {
          min-height: 100vh;
          background: #0a0a0f;
        }
        
        .day-controls {
          position: fixed;
          bottom: 24px;
          left: 50%;
          transform: translateX(-50%);
          display: flex;
          gap: 16px;
          align-items: center;
          background: rgba(0, 0, 0, 0.9);
          padding: 16px 24px;
          border-radius: 100px;
          border: 1px solid rgba(255, 255, 255, 0.2);
          box-shadow: 0 4px 24px rgba(0, 0, 0, 0.5);
        }
        
        .day-controls button {
          background: #4fc3f7;
          color: #000;
          border: none;
          padding: 8px 16px;
          border-radius: 20px;
          font-weight: bold;
          cursor: pointer;
          transition: all 0.2s;
        }
        
        .day-controls button:hover {
          background: #81d4fa;
          transform: scale(1.05);
        }
        
        .day-controls button:disabled {
          background: #333;
          color: #666;
          cursor: not-allowed;
          transform: none;
        }
        
        .current-day {
          color: #fff;
          font-weight: bold;
          font-size: 16px;
          min-width: 120px;
          text-align: center;
        }
      `}</style>
    </div>
  );
}

