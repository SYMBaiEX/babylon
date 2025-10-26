/**
 * Babylon Game Simulator - Autonomous Game Engine
 * 
 * Runs complete prediction market games without human input.
 * Game progresses toward a predetermined outcome over 30 simulated days.
 * 
 * @module engine/GameSimulator
 */

import { EventEmitter } from 'events';
import { v4 as uuid } from 'uuid';

/**
 * Game configuration for simulation
 */
export interface GameConfig {
  /** Predetermined outcome (true = YES, false = NO) */
  outcome: boolean;
  /** Number of AI agents (2-20) */
  numAgents?: number;
  /** Game duration in days */
  duration?: number;
  /** Liquidity parameter for LMSR */
  liquidityB?: number;
  /** Percentage of agents who are insiders (0-1) */
  insiderPercentage?: number;
}

/**
 * Complete game result with event log
 */
export interface GameResult {
  /** Unique game ID */
  id: string;
  /** Market question */
  question: string;
  /** Predetermined outcome */
  outcome: boolean;
  /** Start timestamp */
  startTime: number;
  /** End timestamp */
  endTime: number;
  /** Complete event log */
  events: GameEvent[];
  /** Final agent states */
  agents: AgentState[];
  /** Final market state */
  market: MarketState;
  /** Reputation changes */
  reputationChanges: ReputationChange[];
  /** Winner agent IDs */
  winners: string[];
}

/**
 * Game event types
 */
export type GameEventType =
  | 'game:started'
  | 'day:changed'
  | 'clue:distributed'
  | 'agent:bet'
  | 'agent:post'
  | 'agent:dm'
  | 'market:updated'
  | 'outcome:revealed'
  | 'game:ended';

/**
 * Single game event
 */
export interface GameEvent {
  type: GameEventType;
  timestamp: number;
  day: number;
  data: any;
  agentId?: string;
}

export interface AgentState {
  id: string;
  name: string;
  yesShares: number;
  noShares: number;
  reputation: number;
  isInsider: boolean;
  cluesReceived: number;
}

export interface MarketState {
  yesShares: number;
  noShares: number;
  yesOdds: number;
  noOdds: number;
  totalVolume: number;
}

export interface ReputationChange {
  agentId: string;
  before: number;
  after: number;
  change: number;
  reason: string;
}

/**
 * Autonomous Game Simulator
 * 
 * Runs complete prediction market games without human intervention.
 * All agent decisions are AI-driven based on their knowledge and role.
 * 
 * @example
 * ```typescript
 * const simulator = new GameSimulator({ outcome: true, numAgents: 5 });
 * const result = await simulator.runCompleteGame();
 * 
 * console.log(`Game: ${result.question}`);
 * console.log(`Outcome: ${result.outcome ? 'YES' : 'NO'}`);
 * console.log(`Duration: ${result.endTime - result.startTime}ms`);
 * console.log(`Events: ${result.events.length}`);
 * ```
 */
export class GameSimulator extends EventEmitter {
  private config: Required<GameConfig>;
  private events: GameEvent[] = [];
  private currentDay = 0;

  constructor(config: GameConfig) {
    super();
    
    // Set defaults
    this.config = {
      outcome: config.outcome,
      numAgents: config.numAgents || 5,
      duration: config.duration || 30,
      liquidityB: config.liquidityB || 100,
      insiderPercentage: config.insiderPercentage || 0.3,
    };
  }

  /**
   * Run complete game from start to finish
   * 
   * Simulates entire 30-day game cycle:
   * 1. Generate question aligned with outcome
   * 2. Create agents (some insiders, some outsiders)
   * 3. Distribute clues over time
   * 4. Agents make betting decisions
   * 5. Social interactions occur
   * 6. Market evolves toward outcome
   * 7. Outcome revealed and winners calculated
   * 
   * @returns Complete game result with event log
   */
  async runCompleteGame(): Promise<GameResult> {
    const startTime = Date.now();
    const gameId = uuid();

    // 1. SETUP
    const question = this.generateQuestion();
    const agents = this.createAgents();
    const clueNetwork = this.generateClueNetwork();

    this.emitEvent('game:started', {
      id: gameId,
      question,
      outcome: this.config.outcome,
      agents: agents.length,
    });

    // 2. SIMULATE ALL DAYS
    const market = { yesShares: 0, noShares: 0, yesOdds: 50, noOdds: 50, totalVolume: 0 };

    for (let day = 1; day <= this.config.duration; day++) {
      this.currentDay = day;
      
      this.emitEvent('day:changed', { day });

      // Distribute clues for this day
      const dayClues = this.getCluesForDay(day, agents, clueNetwork);
      dayClues.forEach(clue => {
        this.emitEvent('clue:distributed', clue, clue.agentId);
      });

      // Agents make betting decisions based on their knowledge
      const bets = this.processAgentBets(day, agents, market);
      bets.forEach(bet => {
        // Update market
        if (bet.outcome) {
          market.yesShares += bet.shares;
        } else {
          market.noShares += bet.shares;
        }
        market.totalVolume += bet.amount;
        
        // Recalculate odds (simple LMSR approximation)
        const total = market.yesShares + market.noShares;
        if (total > 0) {
          market.yesOdds = Math.round((market.yesShares / total) * 100);
          market.noOdds = 100 - market.yesOdds;
        }

        this.emitEvent('agent:bet', bet, bet.agentId);
        this.emitEvent('market:updated', market);
      });

      // Agents post to feed
      const posts = this.generatePosts(day, agents);
      posts.forEach(post => {
        this.emitEvent('agent:post', post, post.agentId);
      });
    }

    // 3. REVEAL OUTCOME
    this.emitEvent('outcome:revealed', { outcome: this.config.outcome });

    // 4. CALCULATE WINNERS
    const winners = this.calculateWinners(agents, this.config.outcome);
    const reputationChanges = this.calculateReputationChanges(agents, winners);

    this.emitEvent('game:ended', {
      outcome: this.config.outcome,
      winners: winners.map(a => a.id),
      market,
    });

    const endTime = Date.now();

    return {
      id: gameId,
      question,
      outcome: this.config.outcome,
      startTime,
      endTime,
      events: this.events,
      agents: agents.map(a => ({
        id: a.id,
        name: a.name,
        yesShares: a.yesShares,
        noShares: a.noShares,
        reputation: a.reputation,
        isInsider: a.isInsider,
        cluesReceived: a.cluesReceived.length,
      })),
      market,
      reputationChanges,
      winners: winners.map(a => a.id),
    };
  }

  /**
   * Emit game event and add to log
   */
  private emitEvent(type: GameEventType, data: any, agentId?: string) {
    const event: GameEvent = {
      type,
      timestamp: Date.now(),
      day: this.currentDay,
      data,
      agentId,
    };

    this.events.push(event);
    this.emit(type, event);
    this.emit('event', event); // Generic event listener
  }

  /**
   * Generate question aligned with outcome
   */
  private generateQuestion(): string {
    const topics = [
      "Will Project Omega's satellite launch succeed?",
      "Will the scandal force President Stump to resign?",
      "Will TechCorp's AI breakthrough be announced?",
      "Will the climate summit reach an agreement?",
    ];
    return topics[Math.floor(Math.random() * topics.length)];
  }

  /**
   * Create AI agents with roles
   */
  private createAgents() {
    const agents: any[] = [];
    const numInsiders = Math.floor(this.config.numAgents * this.config.insiderPercentage);

    for (let i = 0; i < this.config.numAgents; i++) {
      agents.push({
        id: `agent-${i + 1}`,
        name: `Agent ${i + 1}`,
        isInsider: i < numInsiders,
        yesShares: 0,
        noShares: 0,
        reputation: 50,
        cluesReceived: [],
        knowledge: [],
      });
    }

    return agents;
  }

  /**
   * Generate clue network aligned with outcome
   */
  private generateClueNetwork() {
    // Simple clue network for now
    const clues: any[] = [];
    const tiers = ['early', 'mid', 'late'];
    
    for (let i = 0; i < 12; i++) {
      const tier = tiers[Math.floor(i / 4)];
      const day = tier === 'early' ? Math.floor(Math.random() * 10) + 1 :
                  tier === 'mid' ? Math.floor(Math.random() * 10) + 11 :
                  Math.floor(Math.random() * 10) + 21;
      
      clues.push({
        id: `clue-${i}`,
        tier,
        day,
        pointsToward: this.config.outcome, // Clues point to correct outcome
        reliability: 0.7 + Math.random() * 0.3,
      });
    }

    return clues;
  }

  /**
   * Get clues to distribute on specific day
   */
  private getCluesForDay(day: number, agents: any[], clueNetwork: any[]) {
    const dayClues = clueNetwork.filter(c => c.day === day);
    const distributed: any[] = [];

    dayClues.forEach(clue => {
      // Give to insiders first
      const insider = agents.find(a => a.isInsider && a.cluesReceived.length < 5);
      if (insider) {
        insider.cluesReceived.push(clue);
        distributed.push({
          agentId: insider.id,
          clue: `Clue #${clue.id}: Points to ${clue.pointsToward ? 'YES' : 'NO'}`,
          tier: clue.tier,
          reliability: clue.reliability,
        });
      }
    });

    return distributed;
  }

  /**
   * Process agent betting decisions
   */
  private processAgentBets(day: number, agents: any[], market: MarketState) {
    const bets: any[] = [];

    // Agents bet based on their knowledge and the market state
    agents.forEach(agent => {
      // Bet on certain days based on clues
      const shouldBet = agent.cluesReceived.length > 0 && 
                       (day % 5 === 0 || day > 20);

      if (shouldBet && Math.random() > 0.5) {
        // Determine outcome based on clues
        const yesClues = agent.cluesReceived.filter((c: any) => c.pointsToward).length;
        const noClues = agent.cluesReceived.length - yesClues;
        const betOnYes = yesClues > noClues;

        const amount = 50 + Math.floor(Math.random() * 100);
        const shares = amount / (betOnYes ? (market.yesOdds || 50) : (market.noOdds || 50)) * 100;

        if (betOnYes) {
          agent.yesShares += shares;
        } else {
          agent.noShares += shares;
        }

        bets.push({
          agentId: agent.id,
          outcome: betOnYes,
          amount,
          shares,
          day,
        });
      }
    });

    return bets;
  }

  /**
   * Generate social posts
   */
  private generatePosts(day: number, agents: any[]) {
    const posts: any[] = [];

    // Some agents post each day
    if (day % 3 === 0) {
      agents.slice(0, 2).forEach(agent => {
        posts.push({
          agentId: agent.id,
          content: `Day ${day}: My analysis suggests ${agent.yesShares > agent.noShares ? 'YES' : 'NO'}`,
          day,
        });
      });
    }

    return posts;
  }

  /**
   * Calculate winners based on outcome
   */
  private calculateWinners(agents: any[], outcome: boolean) {
    return agents.filter(agent => {
      if (outcome) {
        return agent.yesShares > agent.noShares;
      } else {
        return agent.noShares > agent.yesShares;
      }
    });
  }

  /**
   * Calculate reputation changes
   */
  private calculateReputationChanges(agents: any[], winners: any[]): ReputationChange[] {
    return agents.map(agent => {
      const isWinner = winners.some(w => w.id === agent.id);
      const change = isWinner ? 10 : -5;
      
      return {
        agentId: agent.id,
        before: agent.reputation,
        after: agent.reputation + change,
        change,
        reason: isWinner ? 'Correct prediction' : 'Incorrect prediction',
      };
    });
  }
}

