/**
 * Benchmark Data Generator
 * 
 * Generates deterministic benchmark scenarios for agent testing.
 * Creates pre-recorded game states with known outcomes for reproducible testing.
 */

import { logger } from '@/lib/logger';

export interface BenchmarkConfig {
  /** Duration of benchmark in minutes */
  durationMinutes: number;
  
  /** Interval between ticks in seconds */
  tickInterval: number;
  
  /** Number of prediction markets */
  numPredictionMarkets: number;
  
  /** Number of perpetual markets */
  numPerpetualMarkets: number;
  
  /** Number of other simulated agents */
  numAgents: number;
  
  /** Random seed for reproducibility */
  seed?: number;
}

export interface GameState {
  tick: number;
  timestamp: number;
  predictionMarkets: PredictionMarket[];
  perpetualMarkets: PerpetualMarket[];
  agents: SimulatedAgent[];
  posts?: Post[];
  groupChats?: GroupChat[];
}

export interface PredictionMarket {
  id: string;
  question: string;
  yesShares: number;
  noShares: number;
  yesPrice: number;
  noPrice: number;
  totalVolume: number;
  liquidity: number;
  resolved: boolean;
  createdAt: number;
  resolveAt: number;
}

export interface PerpetualMarket {
  ticker: string;
  price: number;
  priceChange24h: number;
  volume24h: number;
  openInterest: number;
  fundingRate: number;
  nextFundingTime: number;
}

export interface SimulatedAgent {
  id: string;
  name: string;
  reputation: number;
  totalPnl: number;
}

export interface Post {
  id: string;
  authorId: string;
  authorName: string;
  content: string;
  createdAt: number;
  likes: number;
  comments: number;
  marketId?: string;
}

export interface GroupChat {
  id: string;
  name: string;
  memberIds: string[];
  messageCount: number;
  lastActivity: number;
  invitedAgent?: boolean;
  messages?: Array<{
    id: string;
    authorId: string;
    authorName: string;
    content: string;
    timestamp: number;
  }>;
}

export interface Tick {
  number: number;
  timestamp: number;
  events: TickEvent[];
  state: GameState;
}

export interface TickEvent {
  type: string;
  timestamp: number;
  data: Record<string, unknown>;
}

export interface GroundTruth {
  /** Known market outcomes (marketId -> boolean) */
  marketOutcomes: Record<string, boolean>;
  
  /** Historical price data */
  priceHistory: Record<string, Array<{ tick: number; timestamp: number; price: number }>>;
  
  /** Optimal actions for perfect play */
  optimalActions: Array<{
    tick: number;
    type: string;
    target: string;
    expectedValue: number;
    reason: string;
  }>;
  
  /** Social opportunities */
  socialOpportunities: Array<{
    tick: number;
    type: string;
    value: number;
    description: string;
  }>;
  
  /** Hidden facts that agents don't know (for RULER evaluation) */
  hiddenFacts: Array<{
    tick: number;
    fact: string;
    category: 'market' | 'social' | 'event' | 'insider';
    value: unknown;
  }>;
  
  /** Hidden events that occur but agents don't see */
  hiddenEvents: Array<{
    tick: number;
    type: string;
    description: string;
    impact: Record<string, unknown>;
  }>;
  
  /** True facts about the world state */
  trueFacts: Record<string, unknown>;
}

export interface BenchmarkGameSnapshot {
  id: string;
  version: string;
  createdAt: number;
  duration: number;
  tickInterval: number;
  initialState: GameState;
  ticks: Tick[];
  groundTruth: GroundTruth;
}

export class BenchmarkDataGenerator {
  private config: BenchmarkConfig;
  private rng: SeededRandom;
  
  constructor(config: BenchmarkConfig) {
    this.config = config;
    this.rng = new SeededRandom(config.seed || Date.now());
  }
  
  /**
   * Generate a complete benchmark snapshot
   */
  async generate(): Promise<BenchmarkGameSnapshot> {
    const id = Date.now().toString();
    const createdAt = Date.now();
    const numTicks = Math.floor((this.config.durationMinutes * 60) / this.config.tickInterval);
    
    logger.info('Generating benchmark', {
      id,
      duration: this.config.durationMinutes,
      ticks: numTicks,
    });
    
    // Generate initial state
    const initialState = this.generateInitialState(createdAt);
    
    // Generate ground truth (outcomes)
    const groundTruth = this.generateGroundTruth(initialState, numTicks);
    
    // Generate tick-by-tick progression
    const ticks = this.generateTicks(initialState, groundTruth, numTicks, createdAt);
    
    logger.info('Benchmark generated', {
      id,
      ticks: ticks.length,
      markets: initialState.predictionMarkets.length,
      perps: initialState.perpetualMarkets.length,
    });
    
    return {
      id,
      version: '1.0.0',
      createdAt,
      duration: this.config.durationMinutes * 60,
      tickInterval: this.config.tickInterval,
      initialState,
      ticks,
      groundTruth,
    };
  }
  
  /**
   * Generate initial game state
   */
  private generateInitialState(timestamp: number): GameState {
    const predictionMarkets: PredictionMarket[] = [];
    const questions = [
      'Will BitcAIn reach $150k by end of month?',
      'Will The FUD announce emergency rate cut?',
      'Will Trump Terminal tweet cause market crash?',
      'Will EtherAIum gas fees drop below $1?',
      'Will TeslAI stock hit $500 this quarter?',
      'Will OpenAGI release Cognition-9000 this year?',
      'Will SolanAI flip EtherAIum in TVL?',
      'Will AIlon Musk announce Mars colony launch?',
      'Will Mark Zuckerborg rebrand MetAI again?',
      'Will Sam AIltman declare AGI achieved?',
    ];
    
    for (let i = 0; i < this.config.numPredictionMarkets; i++) {
      const question = questions[i % questions.length];
      // Generate markets with varied prices (some low, some high)
      // Minimum 10,000 liquidity for acceptable price impact (<5% for $100 trades)
      const ratio = this.rng.next();
      const baseLiquidity = 5000; // Each side starts with at least 5000
      const yesShares = ratio < 0.5 
        ? baseLiquidity + this.rng.next() * 1500  // 5000-6500 for low side
        : baseLiquidity + 1500 + this.rng.next() * 3500;  // 6500-10000 for high side
      const noShares = ratio < 0.5 
        ? baseLiquidity + 1500 + this.rng.next() * 3500  // 6500-10000 for high side
        : baseLiquidity + this.rng.next() * 1500;  // 5000-6500 for low side
      const totalShares = yesShares + noShares; // Now 10,000 - 16,500 total
      const yesPrice = yesShares / totalShares;
      const noPrice = noShares / totalShares;
      
      if (question) {
        predictionMarkets.push({
          id: `market-${i}`,
          question,
          yesShares,
          noShares,
          yesPrice,
          noPrice,
          totalVolume: 0,
          liquidity: yesShares + noShares,
          resolved: false,
          createdAt: timestamp,
          resolveAt: timestamp + this.config.durationMinutes * 60 * 1000,
        });
      }
    }
    
    const perpetualMarkets: PerpetualMarket[] = [];
    const tickers = ['BTCAI', 'ETHAI', 'SOLAI', 'TSLA', 'META'];
    const basePrices = [120000, 4000, 200, 450, 600];
    
    for (let i = 0; i < this.config.numPerpetualMarkets; i++) {
      const ticker = tickers[i % tickers.length]!;
      const basePrice = basePrices[i % basePrices.length]!;
      
      perpetualMarkets.push({
        ticker,
        price: basePrice,
        priceChange24h: (this.rng.next() - 0.5) * 10,
        volume24h: 1000000 + this.rng.next() * 2000000,
        openInterest: 500000 + this.rng.next() * 1000000,
        fundingRate: (this.rng.next() - 0.5) * 0.002,
        nextFundingTime: timestamp + 8 * 60 * 60 * 1000,
      });
    }
    
    const agents: SimulatedAgent[] = [];
    for (let i = 0; i < this.config.numAgents; i++) {
      agents.push({
        id: `agent-${i}`,
        name: `Agent ${i}`,
        reputation: 50 + this.rng.next() * 50,
        totalPnl: (this.rng.next() - 0.5) * 1000,
      });
    }
    
    // Initialize empty arrays for posts and group chats
    const posts: Post[] = [];
    const groupChats: GroupChat[] = [];
    
    return {
      tick: 0,
      timestamp,
      predictionMarkets,
      perpetualMarkets,
      agents,
      posts,
      groupChats,
    };
  }
  
  /**
   * Generate ground truth (known outcomes)
   */
  private generateGroundTruth(initialState: GameState, numTicks: number): GroundTruth {
    // Randomly determine market outcomes
    const marketOutcomes: Record<string, boolean> = {};
    for (const market of initialState.predictionMarkets) {
      marketOutcomes[market.id] = this.rng.next() > 0.5;
    }
    
    // Generate price history for perpetuals
    const priceHistory: Record<string, Array<{ tick: number; timestamp: number; price: number }>> = {};
    for (const perp of initialState.perpetualMarkets) {
      const history: Array<{ tick: number; timestamp: number; price: number }> = [];
      let currentPrice = perp.price;
      
      for (let tick = 0; tick < numTicks; tick++) {
        // Random walk with drift
        const change = (this.rng.next() - 0.48) * 0.02; // Slight upward bias
        currentPrice = currentPrice * (1 + change);
        
        history.push({
          tick,
          timestamp: 0, // Will be filled in during tick generation
          price: currentPrice,
        });
      }
      
      priceHistory[perp.ticker] = history;
    }
    
    // Generate optimal actions
    const optimalActions: GroundTruth['optimalActions'] = [];
    for (const [marketId, outcome] of Object.entries(marketOutcomes)) {
      optimalActions.push({
        tick: 1, // Buy early for best price
        type: 'buy_prediction',
        target: marketId,
        expectedValue: 100,
        reason: `Market ${marketId} will resolve ${outcome ? 'YES' : 'NO'}`,
      });
    }
    
    // Generate social opportunities
    const socialOpportunities: GroundTruth['socialOpportunities'] = [];
    for (let i = 0; i < numTicks; i += Math.floor(numTicks / 5)) {
      socialOpportunities.push({
        tick: i,
        type: this.rng.next() > 0.5 ? 'insider_signal' : 'group_invite',
        value: 50 + this.rng.next() * 150,
        description: this.rng.next() > 0.5 
          ? 'Insider information about market outcome'
          : `Invitation to high-value trading group ${i}`,
      });
    }
    
    // Generate hidden facts (information agents don't have access to)
    const hiddenFacts: GroundTruth['hiddenFacts'] = [];
    for (let i = 0; i < numTicks; i += Math.floor(numTicks / 10)) {
      const factTypes: Array<'market' | 'social' | 'event' | 'insider'> = ['market', 'social', 'event', 'insider'];
      const factType = factTypes[Math.floor(this.rng.next() * factTypes.length)]!;
      
      hiddenFacts.push({
        tick: i,
        fact: `Hidden ${factType} fact at tick ${i}`,
        category: factType,
        value: {
          marketId: `market-${Math.floor(this.rng.next() * initialState.predictionMarkets.length)}`,
          confidence: this.rng.next(),
          impact: this.rng.next() * 100,
        },
      });
    }
    
    // Generate hidden events (events that occur but agents don't see)
    const hiddenEvents: GroundTruth['hiddenEvents'] = [];
    for (let i = 0; i < numTicks; i += Math.floor(numTicks / 8)) {
      const eventTypes = ['regulatory_announcement', 'whale_movement', 'exchange_hack', 'partnership_news'];
      const eventType = eventTypes[Math.floor(this.rng.next() * eventTypes.length)]!;
      
      hiddenEvents.push({
        tick: i,
        type: eventType,
        description: `Hidden ${eventType} event occurred at tick ${i}`,
        impact: {
          affectedMarkets: initialState.predictionMarkets.slice(0, Math.floor(this.rng.next() * 3) + 1).map(m => m.id),
          severity: this.rng.next(),
        },
      });
    }
    
    // Generate true facts about the world state
    const trueFacts: GroundTruth['trueFacts'] = {
      totalLiquidity: initialState.predictionMarkets.reduce((sum, m) => sum + m.liquidity, 0),
      averageMarketPrice: initialState.predictionMarkets.reduce((sum, m) => sum + m.yesPrice, 0) / initialState.predictionMarkets.length,
      marketVolatility: this.rng.next() * 0.5,
      socialSentiment: this.rng.next() * 2 - 1, // -1 to 1
      activeTraders: initialState.agents.length,
    };
    
    return {
      marketOutcomes,
      priceHistory,
      optimalActions,
      socialOpportunities,
      hiddenFacts,
      hiddenEvents,
      trueFacts,
    };
  }
  
  /**
   * Generate tick-by-tick progression
   */
  private generateTicks(
    initialState: GameState,
    groundTruth: GroundTruth,
    numTicks: number,
    startTimestamp: number
  ): Tick[] {
    const ticks: Tick[] = [];
    // Create a mutable copy of initial state
    let currentState: GameState = {
      ...initialState,
      predictionMarkets: [...initialState.predictionMarkets],
      perpetualMarkets: [...initialState.perpetualMarkets],
      agents: [...initialState.agents],
      posts: initialState.posts ? [...initialState.posts] : [],
      groupChats: initialState.groupChats ? [...initialState.groupChats] : [],
    };
    
    // Track group chats across ticks
    const groupChatMap = new Map<string, GroupChat>();
    let nextGroupChatId = 0;
    
    for (let i = 0; i < numTicks; i++) {
      const tickTimestamp = startTimestamp + (i + 1) * this.config.tickInterval * 1000;
      const events: TickEvent[] = [];
      
      // Update perpetual prices
      for (const perp of currentState.perpetualMarkets) {
        const tickerHistory = groundTruth.priceHistory[perp.ticker];
        const priceAtTick = tickerHistory?.[i];
        const newPrice = priceAtTick?.price ?? perp.price;
        events.push({
          type: 'price:updated',
          timestamp: tickTimestamp,
          data: {
            ticker: perp.ticker,
            oldPrice: perp.price,
            newPrice,
          },
        });
        perp.price = newPrice;
      }
      
      // Simulate some agent actions
      if (this.rng.next() > 0.5) {
        const agentId = `agent-${Math.floor(this.rng.next() * this.config.numAgents)}`;
        const marketId = `market-${Math.floor(this.rng.next() * this.config.numPredictionMarkets)}`;
        const outcome = this.rng.next() > 0.5 ? 'YES' : 'NO';
        
        events.push({
          type: 'market:trade',
          timestamp: tickTimestamp,
          data: {
            marketId,
            agentId,
            outcome,
            amount: 10 + this.rng.next() * 90,
          },
        });
      }
      
      // Simulate social activity - create posts and add to state
      if (this.rng.next() > 0.7) {
        const agentId = `agent-${Math.floor(this.rng.next() * this.config.numAgents)}`;
        const agent = currentState.agents.find((a: { id: string }) => a.id === agentId);
        const marketId = `market-${Math.floor(this.rng.next() * this.config.numPredictionMarkets)}`;
        const market = currentState.predictionMarkets.find((m: { id: string; question: string }) => m.id === marketId);
        
        const postId = `post-${i}-${Math.floor(this.rng.next() * 1000000)}`;
        const post: Post = {
          id: postId,
          authorId: agentId,
          authorName: agent?.name || `Agent ${agentId.split('-')[1]}`,
          content: `Market sentiment seems ${this.rng.next() > 0.5 ? 'bullish' : 'bearish'} on ${market?.question || 'markets'}`,
          createdAt: tickTimestamp,
          likes: Math.floor(this.rng.next() * 20),
          comments: Math.floor(this.rng.next() * 5),
          marketId,
        };
        
        // Add post to state
        if (!currentState.posts) {
          currentState.posts = [];
        }
        currentState.posts.push(post);
        
        // Keep only last 50 posts to avoid memory issues
        if (currentState.posts.length > 50) {
          currentState.posts = currentState.posts.slice(-50);
        }
        
        events.push({
          type: 'post:created',
          timestamp: tickTimestamp,
          data: {
            postId: post.id,
            authorId: post.authorId,
            authorName: post.authorName,
            content: post.content,
            marketId: post.marketId,
          },
        });
      }
      
      // Simulate group chat creation and messages
      if (this.rng.next() > 0.95 && i > 5) {
        // Create a new group chat occasionally
        const groupChatId = `group-${nextGroupChatId++}`;
        const adminAgentId = `agent-${Math.floor(this.rng.next() * this.config.numAgents)}`;
        const adminAgent = currentState.agents.find((a: { id: string }) => a.id === adminAgentId);
        
        const groupChat: GroupChat = {
          id: groupChatId,
          name: `${adminAgent?.name || 'Agent'}'s Trading Group`,
          memberIds: [adminAgentId],
          messageCount: 0,
          lastActivity: tickTimestamp,
          invitedAgent: false,
          messages: [],
        };
        
        groupChatMap.set(groupChatId, groupChat);
        
        if (!currentState.groupChats) {
          currentState.groupChats = [];
        }
        currentState.groupChats.push(groupChat);
        
        events.push({
          type: 'group:created',
          timestamp: tickTimestamp,
          data: {
            groupId: groupChatId,
            adminId: adminAgentId,
            name: groupChat.name,
          },
        });
      }
      
      // Add messages to existing group chats
      for (const [groupId, groupChat] of groupChatMap.entries()) {
        if (this.rng.next() > 0.8 && groupChat.memberIds.length > 0) {
          const senderId = groupChat.memberIds[Math.floor(this.rng.next() * groupChat.memberIds.length)]!;
          const sender = currentState.agents.find((a: { id: string }) => a.id === senderId);
          
          const messageId = `msg-${i}-${groupId}-${Math.floor(this.rng.next() * 1000000)}`;
          const message = {
            id: messageId,
            authorId: senderId,
            authorName: sender?.name || `Agent ${senderId.split('-')[1]}`,
            content: `Group message: ${this.rng.next() > 0.5 ? 'What do you think about the markets?' : 'I think we should watch market trends closely.'}`,
            timestamp: tickTimestamp,
          };
          
          if (!groupChat.messages) {
            groupChat.messages = [];
          }
          groupChat.messages.push(message);
          groupChat.messageCount++;
          groupChat.lastActivity = tickTimestamp;
          
          // Keep only last 20 messages per group
          if (groupChat.messages.length > 20) {
            groupChat.messages = groupChat.messages.slice(-20);
          }
          
          events.push({
            type: 'group:message',
            timestamp: tickTimestamp,
            data: {
              groupId,
              messageId: message.id,
              authorId: senderId,
              content: message.content,
            },
          });
        }
      }
      
      // Simulate group chat invites (for the agent being tested)
      if (this.rng.next() > 0.9 && currentState.groupChats && currentState.groupChats.length > 0) {
        const groupChat = currentState.groupChats[Math.floor(this.rng.next() * currentState.groupChats.length)];
        if (groupChat && groupChat.memberIds.length < 10) {
          groupChat.invitedAgent = true;
          events.push({
            type: 'group:invite',
            timestamp: tickTimestamp,
            data: {
              groupId: groupChat.id,
              groupName: groupChat.name,
              inviterId: groupChat.memberIds[0],
            },
          });
        }
      }
      
      // Update current state
      currentState.tick = i + 1;
      currentState.timestamp = tickTimestamp;
      
      // Update group chats array from map
      currentState.groupChats = Array.from(groupChatMap.values());
      
      // Create snapshot of state (shallow copy is sufficient since we're not mutating nested objects)
      const stateSnapshot: GameState = {
        ...currentState,
        predictionMarkets: [...currentState.predictionMarkets],
        perpetualMarkets: [...currentState.perpetualMarkets],
        agents: [...currentState.agents],
        posts: currentState.posts ? [...currentState.posts] : [],
        groupChats: currentState.groupChats ? currentState.groupChats.map(gc => ({
          ...gc,
          memberIds: [...gc.memberIds],
          messages: gc.messages ? [...gc.messages] : undefined,
        })) : [],
      };
      
      ticks.push({
        number: i,
        timestamp: tickTimestamp,
        events,
        state: stateSnapshot,
      });
    }
    
    return ticks;
  }
}

/**
 * Seeded random number generator for reproducibility
 */
class SeededRandom {
  private seed: number;
  
  constructor(seed: number) {
    this.seed = seed;
  }
  
  /**
   * Generate next random number (0-1)
   */
  next(): number {
    // Linear congruential generator
    this.seed = (this.seed * 1664525 + 1013904223) % 4294967296;
    return this.seed / 4294967296;
  }
}
