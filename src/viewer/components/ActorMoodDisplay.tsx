/**
 * Actor Mood Display
 * Shows actor emotional states, luck, and relationships
 */
import { useState } from 'react';
import { moodToEmotion, luckToDescription } from '../../engine/EmotionSystem';

export interface ActorMoodState {
  id: string;
  name: string;
  mood: number;
  luck: 'low' | 'medium' | 'high';
  description?: string;
}

export interface ActorRelationship {
  actor1: string;
  actor2: string;
  relationship: string;
  context: string;
}

interface ActorMoodDisplayProps {
  actors: ActorMoodState[];
  relationships?: ActorRelationship[];
  className?: string;
}

export function ActorMoodDisplay({ actors, relationships = [], className = '' }: ActorMoodDisplayProps) {
  const [selectedActor, setSelectedActor] = useState<string | null>(null);

  // Get relationships for selected actor
  const getActorRelationships = (actorId: string) => {
    return relationships.filter(
      r => r.actor1 === actorId || r.actor2 === actorId
    );
  };

  // Get mood color
  const getMoodColor = (mood: number) => {
    if (mood >= 0.6) return '#4caf50'; // Green
    if (mood >= 0.2) return '#8bc34a'; // Light green
    if (mood >= -0.2) return '#ffc107'; // Yellow
    if (mood >= -0.6) return '#ff9800'; // Orange
    return '#f44336'; // Red
  };

  // Get luck color
  const getLuckColor = (luck: 'low' | 'medium' | 'high') => {
    if (luck === 'high') return '#4caf50';
    if (luck === 'medium') return '#ffc107';
    return '#f44336';
  };

  return (
    <div className={`actor-mood-display ${className}`}>
      <h2>😊 Actor Emotional States</h2>
      <p className="subtitle">Current mood, luck, and relationships</p>
      
      <div className="mood-grid">
        {actors.map((actor) => {
          const emotional = moodToEmotion(actor.mood);
          const luckDesc = luckToDescription(actor.luck);
          const isSelected = selectedActor === actor.id;
          const actorRels = getActorRelationships(actor.id);
          
          return (
            <div
              key={actor.id}
              className={`mood-card ${isSelected ? 'selected' : ''}`}
              onClick={() => setSelectedActor(isSelected ? null : actor.id)}
            >
              <div className="mood-header">
                <h3>{actor.name}</h3>
                {actor.description && (
                  <p className="actor-description">{actor.description}</p>
                )}
              </div>
              
              <div className="mood-stats">
                {/* Mood Bar */}
                <div className="stat-row">
                  <span className="stat-label">Mood:</span>
                  <div className="mood-bar-container">
                    <div
                      className="mood-bar-fill"
                      style={{
                        width: `${((actor.mood + 1) / 2) * 100}%`,
                        backgroundColor: getMoodColor(actor.mood)
                      }}
                    />
                    <span className="mood-value">
                      {actor.mood >= 0 ? '+' : ''}{actor.mood.toFixed(2)}
                    </span>
                  </div>
                </div>
                
                {/* Emotion */}
                <div className="stat-row">
                  <span className="stat-label">Emotion:</span>
                  <span className="emotion-badge" style={{ borderColor: getMoodColor(actor.mood) }}>
                    {emotional.intensity} {emotional.emotion}
                  </span>
                </div>
                
                {/* Luck */}
                <div className="stat-row">
                  <span className="stat-label">Luck:</span>
                  <span 
                    className="luck-badge" 
                    style={{ backgroundColor: getLuckColor(actor.luck) }}
                    title={luckDesc}
                  >
                    {actor.luck.toUpperCase()}
                  </span>
                </div>
              </div>
              
              {/* Relationships (shown when selected) */}
              {isSelected && actorRels.length > 0 && (
                <div className="relationships-section">
                  <h4>Relationships:</h4>
                  <div className="relationships-list">
                    {actorRels.map((rel, i) => {
                      const otherActorId = rel.actor1 === actor.id ? rel.actor2 : rel.actor1;
                      const otherActor = actors.find(a => a.id === otherActorId);
                      
                      return (
                        <div key={i} className="relationship-item">
                          <div className="rel-header">
                            <span className="rel-name">{otherActor?.name || otherActorId}</span>
                            <span className={`rel-type ${rel.relationship.toLowerCase()}`}>
                              {rel.relationship}
                            </span>
                          </div>
                          <p className="rel-context">{rel.context}</p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
      
      {/* Legend */}
      <div className="legend">
        <h4>Legend:</h4>
        <div className="legend-grid">
          <div className="legend-item">
            <span className="legend-title">Mood Range:</span>
            <div className="mood-range">
              <span>-1.0 (Furious)</span>
              <span>0.0 (Neutral)</span>
              <span>+1.0 (Euphoric)</span>
            </div>
          </div>
          <div className="legend-item">
            <span className="legend-title">Luck Levels:</span>
            <div className="luck-levels">
              <span className="luck-badge" style={{ backgroundColor: getLuckColor('low') }}>LOW</span>
              <span className="luck-badge" style={{ backgroundColor: getLuckColor('medium') }}>MEDIUM</span>
              <span className="luck-badge" style={{ backgroundColor: getLuckColor('high') }}>HIGH</span>
            </div>
          </div>
        </div>
        <p className="legend-note">Click on an actor card to see their relationships</p>
      </div>

      <style>{`
        .actor-mood-display {
          padding: 20px;
          background: linear-gradient(135deg, #1e2e3e 0%, #2a3e4e 100%);
          border-radius: 12px;
          color: #e0e0e0;
        }
        
        .actor-mood-display h2 {
          margin: 0 0 8px 0;
          color: #fff;
          font-size: 24px;
        }
        
        .actor-mood-display .subtitle {
          margin: 0 0 20px 0;
          color: #999;
          font-size: 14px;
        }
        
        .mood-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
          gap: 16px;
          margin-bottom: 24px;
        }
        
        .mood-card {
          background: rgba(255, 255, 255, 0.05);
          border: 2px solid rgba(255, 255, 255, 0.1);
          border-radius: 8px;
          padding: 16px;
          cursor: pointer;
          transition: all 0.2s;
        }
        
        .mood-card:hover {
          background: rgba(255, 255, 255, 0.08);
          border-color: rgba(255, 255, 255, 0.2);
          transform: translateY(-2px);
        }
        
        .mood-card.selected {
          border-color: #4fc3f7;
          background: rgba(79, 195, 247, 0.1);
        }
        
        .mood-header h3 {
          margin: 0 0 8px 0;
          color: #fff;
          font-size: 18px;
        }
        
        .actor-description {
          margin: 0 0 12px 0;
          color: #aaa;
          font-size: 12px;
          line-height: 1.4;
        }
        
        .mood-stats {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        
        .stat-row {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        
        .stat-label {
          flex-shrink: 0;
          width: 80px;
          color: #999;
          font-size: 13px;
        }
        
        .mood-bar-container {
          position: relative;
          flex: 1;
          height: 24px;
          background: rgba(0, 0, 0, 0.3);
          border-radius: 12px;
          overflow: hidden;
        }
        
        .mood-bar-fill {
          height: 100%;
          transition: all 0.3s;
          border-radius: 12px;
        }
        
        .mood-value {
          position: absolute;
          right: 8px;
          top: 50%;
          transform: translateY(-50%);
          color: #fff;
          font-size: 11px;
          font-weight: bold;
          text-shadow: 0 0 4px rgba(0,0,0,0.5);
        }
        
        .emotion-badge {
          flex: 1;
          padding: 4px 12px;
          background: rgba(0, 0, 0, 0.3);
          border: 2px solid;
          border-radius: 16px;
          text-align: center;
          font-size: 13px;
          font-weight: 500;
          text-transform: capitalize;
        }
        
        .luck-badge {
          padding: 4px 12px;
          border-radius: 4px;
          font-size: 11px;
          font-weight: bold;
          color: #fff;
          text-shadow: 0 0 4px rgba(0,0,0,0.5);
        }
        
        .relationships-section {
          margin-top: 16px;
          padding-top: 16px;
          border-top: 1px solid rgba(255, 255, 255, 0.1);
        }
        
        .relationships-section h4 {
          margin: 0 0 8px 0;
          color: #aaa;
          font-size: 13px;
        }
        
        .relationships-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        
        .relationship-item {
          background: rgba(0, 0, 0, 0.2);
          padding: 8px;
          border-radius: 4px;
        }
        
        .rel-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 4px;
        }
        
        .rel-name {
          color: #fff;
          font-size: 13px;
          font-weight: 500;
        }
        
        .rel-type {
          padding: 2px 6px;
          border-radius: 4px;
          font-size: 10px;
          font-weight: bold;
          text-transform: uppercase;
        }
        
        .rel-type.ally,
        .rel-type.friend {
          background: rgba(76, 175, 80, 0.3);
          color: #4caf50;
        }
        
        .rel-type.rival,
        .rel-type.enemy,
        .rel-type.hates {
          background: rgba(244, 67, 54, 0.3);
          color: #f44336;
        }
        
        .rel-type.advisor,
        .rel-type.source,
        .rel-type.critic {
          background: rgba(255, 193, 7, 0.3);
          color: #ffc107;
        }
        
        .rel-context {
          margin: 0;
          color: #999;
          font-size: 11px;
          line-height: 1.4;
        }
        
        .legend {
          background: rgba(0, 0, 0, 0.2);
          padding: 16px;
          border-radius: 8px;
        }
        
        .legend h4 {
          margin: 0 0 12px 0;
          color: #aaa;
          font-size: 14px;
        }
        
        .legend-grid {
          display: flex;
          flex-direction: column;
          gap: 12px;
          margin-bottom: 12px;
        }
        
        .legend-item {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        
        .legend-title {
          color: #999;
          font-size: 12px;
          font-weight: bold;
        }
        
        .mood-range {
          display: flex;
          justify-content: space-between;
          font-size: 11px;
          color: #666;
        }
        
        .luck-levels {
          display: flex;
          gap: 8px;
        }
        
        .legend-note {
          margin: 0;
          color: #666;
          font-size: 11px;
          font-style: italic;
        }
      `}</style>
    </div>
  );
}

