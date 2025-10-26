/**
 * Game History Panel
 * Shows previous games with key outcomes and highlights
 */
import React from 'react';

export interface GameHistoryItem {
  gameNumber: number;
  completedAt: string;
  summary: string;
  keyOutcomes: {
    questionText: string;
    outcome: boolean;
    explanation: string;
  }[];
  highlights: string[];
  topMoments: string[];
}

interface GameHistoryPanelProps {
  previousGames: GameHistoryItem[];
  className?: string;
}

export function GameHistoryPanel({ previousGames, className = '' }: GameHistoryPanelProps) {
  if (previousGames.length === 0) {
    return (
      <div className={`game-history-panel empty ${className}`}>
        <h2>📜 Game History</h2>
        <p className="empty-state">This is the first game. No history yet.</p>
      </div>
    );
  }

  return (
    <div className={`game-history-panel ${className}`}>
      <h2>📜 Previous Games ({previousGames.length})</h2>
      <p className="subtitle">History that led to the current situation</p>
      
      <div className="games-list">
        {previousGames.map((game) => (
          <div key={game.gameNumber} className="game-card">
            <div className="game-header">
              <h3>Game #{game.gameNumber}</h3>
              <span className="date">{new Date(game.completedAt).toLocaleDateString()}</span>
            </div>
            
            <p className="summary">{game.summary}</p>
            
            {game.keyOutcomes.length > 0 && (
              <div className="outcomes-section">
                <h4>Key Outcomes:</h4>
                <ul className="outcomes-list">
                  {game.keyOutcomes.map((outcome, i) => (
                    <li key={i} className={`outcome ${outcome.outcome ? 'yes' : 'no'}`}>
                      <span className="icon">{outcome.outcome ? '✅' : '❌'}</span>
                      <div className="outcome-content">
                        <strong>{outcome.questionText}</strong>
                        <p className="explanation">{outcome.explanation}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            
            {game.highlights.length > 0 && (
              <div className="highlights-section">
                <h4>Highlights:</h4>
                <ul className="highlights-list">
                  {game.highlights.slice(0, 3).map((highlight, i) => (
                    <li key={i}>{highlight}</li>
                  ))}
                </ul>
              </div>
            )}
            
            {game.topMoments.length > 0 && (
              <div className="moments-section">
                <h4>🔥 Top Moments:</h4>
                <ul className="moments-list">
                  {game.topMoments.slice(0, 2).map((moment, i) => (
                    <li key={i}>{moment}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ))}
      </div>

      <style>{`
        .game-history-panel {
          padding: 20px;
          background: linear-gradient(135deg, #1e1e2e 0%, #2a2a3e 100%);
          border-radius: 12px;
          color: #e0e0e0;
        }
        
        .game-history-panel h2 {
          margin: 0 0 8px 0;
          color: #fff;
          font-size: 24px;
        }
        
        .game-history-panel .subtitle {
          margin: 0 0 20px 0;
          color: #999;
          font-size: 14px;
        }
        
        .game-history-panel.empty {
          text-align: center;
          padding: 40px 20px;
        }
        
        .empty-state {
          color: #666;
          font-style: italic;
        }
        
        .games-list {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        
        .game-card {
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 8px;
          padding: 16px;
          transition: all 0.2s;
        }
        
        .game-card:hover {
          background: rgba(255, 255, 255, 0.08);
          border-color: rgba(255, 255, 255, 0.2);
          transform: translateY(-2px);
        }
        
        .game-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 12px;
        }
        
        .game-header h3 {
          margin: 0;
          color: #4fc3f7;
          font-size: 18px;
        }
        
        .game-header .date {
          color: #999;
          font-size: 12px;
        }
        
        .summary {
          margin: 0 0 16px 0;
          color: #ccc;
          line-height: 1.5;
        }
        
        .outcomes-section,
        .highlights-section,
        .moments-section {
          margin-top: 12px;
        }
        
        .outcomes-section h4,
        .highlights-section h4,
        .moments-section h4 {
          margin: 0 0 8px 0;
          color: #aaa;
          font-size: 14px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        
        .outcomes-list {
          list-style: none;
          padding: 0;
          margin: 0;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        
        .outcome {
          display: flex;
          gap: 8px;
          padding: 8px;
          background: rgba(0, 0, 0, 0.2);
          border-radius: 4px;
          border-left: 3px solid;
        }
        
        .outcome.yes {
          border-left-color: #4caf50;
        }
        
        .outcome.no {
          border-left-color: #f44336;
        }
        
        .outcome .icon {
          flex-shrink: 0;
          font-size: 16px;
        }
        
        .outcome-content {
          flex: 1;
        }
        
        .outcome-content strong {
          display: block;
          color: #fff;
          margin-bottom: 4px;
        }
        
        .outcome-content .explanation {
          margin: 0;
          color: #999;
          font-size: 13px;
        }
        
        .highlights-list,
        .moments-list {
          list-style: none;
          padding: 0;
          margin: 0;
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        
        .highlights-list li,
        .moments-list li {
          padding: 6px 8px;
          background: rgba(255, 255, 255, 0.03);
          border-radius: 4px;
          color: #ccc;
          font-size: 13px;
          line-height: 1.4;
        }
        
        .highlights-list li:before {
          content: "•";
          color: #4fc3f7;
          font-weight: bold;
          margin-right: 8px;
        }
        
        .moments-list li:before {
          content: "🔥";
          margin-right: 8px;
        }
      `}</style>
    </div>
  );
}

