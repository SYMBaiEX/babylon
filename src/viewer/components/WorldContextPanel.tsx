/**
 * World Context Panel
 * Shows current world situation and how we got here
 */
import React from 'react';

export interface Scenario {
  id: number;
  title: string;
  description: string;
  theme: string;
  mainActors: string[];
}

export interface Question {
  id: number;
  text: string;
  scenario: number;
  outcome: boolean;
  rank: number;
}

export interface Actor {
  id: string;
  name: string;
  description: string;
  tier: string;
  role: string;
  domain?: string[];
}

interface WorldContextPanelProps {
  mainActors: Actor[];
  scenarios: Scenario[];
  questions: Question[];
  worldSummary?: string;
  previousContext?: string;
  className?: string;
}

export function WorldContextPanel({
  mainActors,
  scenarios,
  questions,
  worldSummary,
  previousContext,
  className = ''
}: WorldContextPanelProps) {
  return (
    <div className={`world-context-panel ${className}`}>
      <h2>🌍 World Context</h2>
      <p className="subtitle">The situation that led to these predictions</p>
      
      {previousContext && (
        <div className="context-section previous">
          <h3>📖 The Story So Far</h3>
          <p className="context-text">{previousContext}</p>
        </div>
      )}
      
      {worldSummary && (
        <div className="context-section current">
          <h3>🎯 Current Situation</h3>
          <p className="context-text">{worldSummary}</p>
        </div>
      )}
      
      <div className="context-section actors">
        <h3>👥 Key Players</h3>
        <div className="actors-grid">
          {mainActors.map((actor) => (
            <div key={actor.id} className="actor-card">
              <div className="actor-header">
                <h4>{actor.name}</h4>
                <span className="tier">{actor.tier.replace('_TIER', '')}</span>
              </div>
              <p className="actor-desc">{actor.description}</p>
              {actor.domain && actor.domain.length > 0 && (
                <div className="domains">
                  {actor.domain.map((d) => (
                    <span key={d} className="domain-tag">{d}</span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
      
      <div className="context-section scenarios">
        <h3>📋 Active Scenarios</h3>
        <div className="scenarios-list">
          {scenarios.map((scenario) => (
            <div key={scenario.id} className="scenario-card">
              <div className="scenario-header">
                <h4>{scenario.title}</h4>
                <span className="theme-tag">{scenario.theme}</span>
              </div>
              <p className="scenario-desc">{scenario.description}</p>
              
              {/* Show questions for this scenario */}
              {questions.filter(q => q.scenario === scenario.id).length > 0 && (
                <div className="scenario-questions">
                  <h5>Prediction Markets:</h5>
                  <ul>
                    {questions
                      .filter(q => q.scenario === scenario.id)
                      .map((q) => (
                        <li key={q.id} className="question-item">
                          <span className="question-id">#{q.id}</span>
                          <span className="question-text">{q.text}</span>
                          <span className={`outcome-badge ${q.outcome ? 'yes' : 'no'}`}>
                            {q.outcome ? 'Will Happen' : 'Will Not Happen'}
                          </span>
                        </li>
                      ))}
                  </ul>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
      
      <div className="context-section why-relevant">
        <h3>❓ Why These Questions Matter</h3>
        <div className="relevance-grid">
          {questions.map((q) => {
            const scenario = scenarios.find(s => s.id === q.scenario);
            return (
              <div key={q.id} className="relevance-card">
                <div className="relevance-header">
                  <span className="question-rank">Rank #{q.rank}</span>
                  <span className="scenario-ref">{scenario?.theme || 'General'}</span>
                </div>
                <p className="relevance-question">{q.text}</p>
                <p className="relevance-why">
                  This question represents a critical moment in the {scenario?.theme || 'ongoing'} narrative, 
                  where the outcome will significantly impact the trajectory of events and the involved parties.
                </p>
              </div>
            );
          })}
        </div>
      </div>

      <style>{`
        .world-context-panel {
          padding: 20px;
          background: linear-gradient(135deg, #2e1e3e 0%, #3e2a4e 100%);
          border-radius: 12px;
          color: #e0e0e0;
        }
        
        .world-context-panel h2 {
          margin: 0 0 8px 0;
          color: #fff;
          font-size: 24px;
        }
        
        .world-context-panel .subtitle {
          margin: 0 0 24px 0;
          color: #999;
          font-size: 14px;
        }
        
        .context-section {
          margin-bottom: 24px;
          padding: 16px;
          background: rgba(255, 255, 255, 0.05);
          border-radius: 8px;
          border: 1px solid rgba(255, 255, 255, 0.1);
        }
        
        .context-section h3 {
          margin: 0 0 12px 0;
          color: #fff;
          font-size: 18px;
        }
        
        .context-section.previous {
          border-left: 3px solid #9c27b0;
        }
        
        .context-section.current {
          border-left: 3px solid #4caf50;
        }
        
        .context-text {
          margin: 0;
          color: #ccc;
          line-height: 1.6;
          font-size: 14px;
        }
        
        .actors-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
          gap: 12px;
        }
        
        .actor-card {
          background: rgba(0, 0, 0, 0.2);
          padding: 12px;
          border-radius: 6px;
          border: 1px solid rgba(255, 255, 255, 0.1);
        }
        
        .actor-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 8px;
        }
        
        .actor-header h4 {
          margin: 0;
          color: #fff;
          font-size: 16px;
        }
        
        .tier {
          background: rgba(255, 255, 255, 0.1);
          padding: 2px 8px;
          border-radius: 12px;
          font-size: 11px;
          font-weight: bold;
          color: #4fc3f7;
        }
        
        .actor-desc {
          margin: 0 0 8px 0;
          color: #aaa;
          font-size: 13px;
          line-height: 1.4;
        }
        
        .domains {
          display: flex;
          flex-wrap: wrap;
          gap: 4px;
        }
        
        .domain-tag {
          background: rgba(79, 195, 247, 0.2);
          color: #4fc3f7;
          padding: 2px 6px;
          border-radius: 4px;
          font-size: 11px;
        }
        
        .scenarios-list {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        
        .scenario-card {
          background: rgba(0, 0, 0, 0.2);
          padding: 16px;
          border-radius: 6px;
          border-left: 3px solid #ff9800;
        }
        
        .scenario-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 8px;
        }
        
        .scenario-header h4 {
          margin: 0;
          color: #fff;
          font-size: 16px;
        }
        
        .theme-tag {
          background: rgba(255, 152, 0, 0.2);
          color: #ff9800;
          padding: 4px 8px;
          border-radius: 4px;
          font-size: 11px;
          font-weight: bold;
          text-transform: uppercase;
        }
        
        .scenario-desc {
          margin: 0 0 12px 0;
          color: #ccc;
          font-size: 14px;
          line-height: 1.5;
        }
        
        .scenario-questions h5 {
          margin: 0 0 8px 0;
          color: #aaa;
          font-size: 13px;
        }
        
        .scenario-questions ul {
          list-style: none;
          padding: 0;
          margin: 0;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        
        .question-item {
          display: flex;
          gap: 8px;
          align-items: center;
          padding: 8px;
          background: rgba(0, 0, 0, 0.2);
          border-radius: 4px;
        }
        
        .question-id {
          flex-shrink: 0;
          color: #666;
          font-size: 12px;
          font-weight: bold;
        }
        
        .question-text {
          flex: 1;
          color: #ddd;
          font-size: 13px;
        }
        
        .outcome-badge {
          flex-shrink: 0;
          padding: 2px 8px;
          border-radius: 12px;
          font-size: 11px;
          font-weight: bold;
        }
        
        .outcome-badge.yes {
          background: rgba(76, 175, 80, 0.2);
          color: #4caf50;
        }
        
        .outcome-badge.no {
          background: rgba(244, 67, 54, 0.2);
          color: #f44336;
        }
        
        .relevance-grid {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        
        .relevance-card {
          background: rgba(0, 0, 0, 0.2);
          padding: 12px;
          border-radius: 6px;
          border-left: 3px solid #9c27b0;
        }
        
        .relevance-header {
          display: flex;
          justify-content: space-between;
          margin-bottom: 8px;
        }
        
        .question-rank {
          color: #9c27b0;
          font-weight: bold;
          font-size: 12px;
        }
        
        .scenario-ref {
          color: #666;
          font-size: 11px;
          text-transform: uppercase;
        }
        
        .relevance-question {
          margin: 0 0 8px 0;
          color: #fff;
          font-size: 14px;
          font-weight: 500;
        }
        
        .relevance-why {
          margin: 0;
          color: #aaa;
          font-size: 12px;
          line-height: 1.5;
          font-style: italic;
        }
      `}</style>
    </div>
  );
}

