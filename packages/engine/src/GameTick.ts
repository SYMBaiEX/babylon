/**
 * Game state store contract and tick data types. Implemented by
 * InMemoryStateStore for offline simulation; the live tick executor is
 * `executeGameTick` in game-tick.ts.
 */

import type { GameTime } from './GameClock';

/** Result of executing one game tick */
export interface TickResult {
  time: GameTime;
  postsCreated: number;
  eventsCreated: number;
  articlesCreated: number;
  tradesExecuted: number;
  marketsUpdated: number;
  questionsResolved: number;
  questionsCreated: number;
}

/** Configuration for a game tick */
export interface TickConfig {
  /** Skip content generation (posts, events, articles) */
  skipContent?: boolean;
  /** Skip NPC trading decisions */
  skipTrading?: boolean;
  /** Skip question resolution */
  skipResolution?: boolean;
  /** Maximum time budget for this tick (ms) */
  budgetMs?: number;
}

/** Abstract interface for game state storage */
export interface GameStateStore {
  // Questions
  getActiveQuestions(): Promise<ActiveQuestion[]>;
  getQuestionsToResolve(beforeTime: Date): Promise<ActiveQuestion[]>;
  createQuestion(question: QuestionInput): Promise<string>;
  resolveQuestion(questionId: string, outcome: boolean): Promise<void>;

  // Markets
  getActiveMarkets(): Promise<ActiveMarket[]>;
  updateMarketPrice(
    marketId: string,
    yesPrice: number,
    noPrice: number
  ): Promise<void>;

  // Content
  createPost(post: PostInput): Promise<string>;
  createEvent(event: EventInput): Promise<string>;
  createArticle(article: ArticleInput): Promise<string>;

  // Actors
  getActors(limit?: number): Promise<GameActor[]>;
  getOrganizations(): Promise<GameOrganization[]>;

  // Trading
  executeTrade(trade: TradeInput): Promise<TradeResult>;
  getPositions(actorId: string): Promise<Position[]>;
}

export interface ActiveQuestion {
  id: string;
  questionNumber: number;
  text: string;
  status: 'active' | 'resolved';
  outcome?: boolean;
  resolutionDate?: Date;
  scenarioId?: number;
}

export interface ActiveMarket {
  id: string;
  questionNumber: number;
  yesShares: number;
  noShares: number;
  yesPrice: number;
  noPrice: number;
  resolved: boolean;
}

export interface QuestionInput {
  text: string;
  resolutionDate: Date;
  scenarioId?: number;
}

export interface PostInput {
  authorId: string;
  content: string;
  type: 'post' | 'article' | 'reply';
  timestamp: Date;
}

export interface EventInput {
  type: string;
  description: string;
  day: number;
  hour: number;
  actors: string[];
  visibility: 'public' | 'leaked' | 'private';
  pointsToward?: 'YES' | 'NO';
  relatedQuestion?: number;
}

export interface ArticleInput {
  title: string;
  content: string;
  summary: string;
  authorOrgId: string;
  timestamp: Date;
  category?: string;
}

export interface GameActor {
  id: string;
  name: string;
  tier?: string;
  personality?: string;
  domain?: string[];
}

export interface GameOrganization {
  id: string;
  name: string;
  type: 'company' | 'media' | 'government';
}

export interface TradeInput {
  actorId: string;
  marketId: string;
  side: 'YES' | 'NO';
  amount: number;
}

export interface TradeResult {
  success: boolean;
  shares?: number;
  price?: number;
  totalCost?: number;
  error?: string;
}

export interface Position {
  marketId: string;
  side: 'YES' | 'NO';
  shares: number;
  avgPrice: number;
}

/** Services needed to execute a tick */
export interface TickServices {
  /** LLM client for content generation */
  llm?: {
    generatePost(actor: GameActor, context: string): Promise<string>;
    generateArticle(
      org: GameOrganization,
      topic: string
    ): Promise<ArticleInput>;
    generateTradingDecision(
      actor: GameActor,
      markets: ActiveMarket[]
    ): Promise<TradeInput | null>;
  };
  /** Market decision engine */
  marketDecisions?: {
    generateBatchDecisions(): Promise<TradeInput[]>;
  };
  /** Question manager */
  questionManager?: {
    generateQuestion(): Promise<QuestionInput>;
    generateResolutionProof(
      question: ActiveQuestion
    ): Promise<{ description: string; proof?: string }>;
  };
}
