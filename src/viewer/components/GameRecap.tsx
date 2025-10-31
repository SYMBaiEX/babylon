/**
 * Game Recap
 * Comprehensive summary of game history and current setup
 */
import type { GameHistoryItem } from './GameHistoryPanel';
import { GameHistoryPanel } from './GameHistoryPanel';
import type { Scenario, Question, Actor } from './WorldContextPanel';
import { WorldContextPanel } from './WorldContextPanel';
import type { ActorMoodState, ActorRelationship } from './ActorMoodDisplay';
import { ActorMoodDisplay } from './ActorMoodDisplay';

export interface GameRecapData {
  // Previous games history
  previousGames: GameHistoryItem[];
  
  // Current game setup
  mainActors: Actor[];
  scenarios: Scenario[];
  questions: Question[];
  
  // Actor emotional states
  actorMoodStates: ActorMoodState[];
  relationships: ActorRelationship[];
  
  // Context summaries
  worldSummary?: string;
  previousContext?: string;
  
  // Meta info
  gameNumber: number;
  startDate: string;
  endDate: string;
}

interface GameRecapProps {
  data: GameRecapData;
  className?: string;
}

export function GameRecap({ data, className = '' }: GameRecapProps) {
  return (
    <div className={`game-recap ${className}`}>
      <header className="recap-header">
        <div className="header-content">
          <h1>🎮 Babylon Game #{data.gameNumber}</h1>
          <p className="game-period">
            {new Date(data.startDate).toLocaleDateString()} — {new Date(data.endDate).toLocaleDateString()}
          </p>
        </div>
        <div className="header-stats">
          <div className="stat-item">
            <span className="stat-value">{data.scenarios.length}</span>
            <span className="stat-label">Scenarios</span>
          </div>
          <div className="stat-item">
            <span className="stat-value">{data.questions.length}</span>
            <span className="stat-label">Questions</span>
          </div>
          <div className="stat-item">
            <span className="stat-value">{data.mainActors.length}</span>
            <span className="stat-label">Main Actors</span>
          </div>
        </div>
      </header>
      
      <div className="recap-content">
        {/* Game History */}
        <section className="recap-section">
          <GameHistoryPanel
            previousGames={data.previousGames}
          />
        </section>
        
        {/* World Context */}
        <section className="recap-section">
          <WorldContextPanel
            mainActors={data.mainActors}
            scenarios={data.scenarios}
            questions={data.questions}
            worldSummary={data.worldSummary}
            previousContext={data.previousContext}
          />
        </section>
        
        {/* Actor Moods & Relationships */}
        <section className="recap-section">
          <ActorMoodDisplay
            actors={data.actorMoodStates}
            relationships={data.relationships}
          />
        </section>
        
        {/* Summary */}
        <section className="recap-section summary">
          <div className="summary-card">
            <h2>📊 Game Summary</h2>
            <div className="summary-grid">
              <div className="summary-item">
                <h3>Previous Context</h3>
                {data.previousGames.length > 0 ? (
                  <p>
                    This is game #{data.gameNumber}, following{' '}
                    {data.previousGames.length} previous game{data.previousGames.length > 1 ? 's' : ''}.
                    The world has been shaped by these events, and the current questions
                    arise naturally from the unfolding narrative.
                  </p>
                ) : (
                  <p>
                    This is the inaugural game. The world is fresh, actors are establishing
                    their positions, and the first predictions are about to unfold over the
                    next 30 days.
                  </p>
                )}
              </div>
              
              <div className="summary-item">
                <h3>Key Dynamics</h3>
                <ul>
                  <li>
                    <strong>{data.mainActors.length} main actors</strong> are at the center of attention
                  </li>
                  <li>
                    <strong>{data.scenarios.length} scenarios</strong> create the narrative framework
                  </li>
                  <li>
                    <strong>{data.questions.length} prediction markets</strong> track key outcomes
                  </li>
                  <li>
                    <strong>{data.relationships.length} relationships</strong> shape social dynamics
                  </li>
                </ul>
              </div>
              
              <div className="summary-item full-width">
                <h3>What to Watch</h3>
                <div className="watch-list">
                  {data.questions.slice(0, 3).map((q, i) => {
                    const scenario = data.scenarios.find(s => s.id === q.scenario);
                    return (
                      <div key={q.id} className="watch-item">
                        <span className="watch-rank">#{i + 1}</span>
                        <div className="watch-content">
                          <p className="watch-question">{q.text}</p>
                          <p className="watch-scenario">
                            Part of: {scenario?.title || 'General scenario'}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>

      <style>{`
        .game-recap {
          min-height: 100vh;
          background: #0a0a0f;
          color: #e0e0e0;
        }
        
        .recap-header {
          background: linear-gradient(135deg, #1a1a2e 0%, #2a2a4e 100%);
          padding: 32px;
          border-bottom: 2px solid rgba(255, 255, 255, 0.1);
          display: flex;
          justify-content: space-between;
          align-items: center;
          flex-wrap: wrap;
          gap: 24px;
        }
        
        .header-content h1 {
          margin: 0 0 8px 0;
          color: #fff;
          font-size: 32px;
        }
        
        .game-period {
          margin: 0;
          color: #999;
          font-size: 16px;
        }
        
        .header-stats {
          display: flex;
          gap: 32px;
        }
        
        .stat-item {
          display: flex;
          flex-direction: column;
          align-items: center;
        }
        
        .stat-value {
          font-size: 32px;
          font-weight: bold;
          color: #4fc3f7;
          line-height: 1;
        }
        
        .stat-label {
          font-size: 12px;
          color: #999;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          margin-top: 4px;
        }
        
        .recap-content {
          padding: 24px;
          max-width: 1400px;
          margin: 0 auto;
        }
        
        .recap-section {
          margin-bottom: 24px;
        }
        
        .recap-section.summary {
          margin-top: 32px;
        }
        
        .summary-card {
          background: linear-gradient(135deg, #2a1a3e 0%, #3a2a4e 100%);
          border-radius: 12px;
          padding: 24px;
          border: 1px solid rgba(255, 255, 255, 0.1);
        }
        
        .summary-card h2 {
          margin: 0 0 20px 0;
          color: #fff;
          font-size: 24px;
        }
        
        .summary-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
          gap: 20px;
        }
        
        .summary-item {
          background: rgba(0, 0, 0, 0.2);
          padding: 16px;
          border-radius: 8px;
        }
        
        .summary-item.full-width {
          grid-column: 1 / -1;
        }
        
        .summary-item h3 {
          margin: 0 0 12px 0;
          color: #4fc3f7;
          font-size: 16px;
        }
        
        .summary-item p {
          margin: 0;
          color: #ccc;
          font-size: 14px;
          line-height: 1.6;
        }
        
        .summary-item ul {
          list-style: none;
          padding: 0;
          margin: 0;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        
        .summary-item li {
          color: #ccc;
          font-size: 14px;
          line-height: 1.6;
          padding-left: 20px;
          position: relative;
        }
        
        .summary-item li:before {
          content: "→";
          position: absolute;
          left: 0;
          color: #4fc3f7;
          font-weight: bold;
        }
        
        .watch-list {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        
        .watch-item {
          display: flex;
          gap: 12px;
          background: rgba(0, 0, 0, 0.2);
          padding: 12px;
          border-radius: 6px;
          border-left: 3px solid #4fc3f7;
        }
        
        .watch-rank {
          flex-shrink: 0;
          width: 32px;
          height: 32px;
          border-radius: 50%;
          background: #4fc3f7;
          color: #000;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: bold;
          font-size: 14px;
        }
        
        .watch-content {
          flex: 1;
        }
        
        .watch-question {
          margin: 0 0 4px 0;
          color: #fff;
          font-size: 14px;
          font-weight: 500;
        }
        
        .watch-scenario {
          margin: 0;
          color: #999;
          font-size: 12px;
        }
      `}</style>
    </div>
  );
}

