/**
 * Shared Types for Test Files
 * 
 * Centralized type definitions for all test files to ensure consistency
 * and eliminate use of 'any' types.
 */

import type { Page, Route } from '@playwright/test';
import type { PrismaClient } from '@prisma/client';

/**
 * Playwright Page type (re-exported for convenience)
 */
export type TestPage = Page;

/**
 * Playwright Route type (re-exported for convenience)
 */
export type TestRoute = Route;

/**
 * Error with message property
 */
export interface ErrorWithMessage {
  message: string;
  code?: number | string;
  [key: string]: unknown;
}

/**
 * Check if error has message property
 */
export function isErrorWithMessage(error: unknown): error is ErrorWithMessage {
  return (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof (error as ErrorWithMessage).message === 'string'
  );
}

/**
 * A2A Client Error
 */
export interface A2AClientError extends Error {
  code?: number;
  data?: unknown;
}

/**
 * Test User type
 */
export interface TestUser {
  id: string;
  username: string;
  displayName: string;
  email?: string;
  walletAddress?: string;
  privyId?: string;
  bio?: string;
  reputationPoints?: number;
  virtualBalance?: number;
  isAgent?: boolean;
  isActor?: boolean;
  isAdmin?: boolean;
  isBanned?: boolean;
  isTest?: boolean;
  profileComplete?: boolean;
  hasUsername?: boolean;
  updatedAt?: Date;
  createdAt?: Date;
}

/**
 * Test Actor type
 */
export interface TestActor {
  id: string;
  name: string;
  realName?: string;
  username?: string;
  description?: string;
}

/**
 * Experience Service type
 */
export interface ExperienceService {
  recordExperience: (data: {
    type: string;
    outcome: string;
    context: string;
    action: string;
    result: string;
    learning: string;
    domain: string;
    tags: string[];
    confidence: number;
    importance: number;
  }) => Promise<{ id: string; learning: string }>;
  queryExperiences: (query: { query: string; limit: number }) => Promise<unknown[]>;
}

/**
 * Runtime Service type
 */
export type RuntimeService = ExperienceService | unknown;

/**
 * Provider Result type
 */
export interface ProviderResult {
  text?: string;
  data?: {
    gainers?: unknown[];
    losers?: unknown[];
    balances?: {
      virtualBalance?: number;
      reputationPoints?: number;
      [key: string]: unknown;
    };
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

/**
 * Message type for agent runtime
 */
export interface AgentMessage {
  userId: string;
  agentId: string;
  content: {
    text: string;
    [key: string]: unknown;
  };
  roomId?: string;
  [key: string]: unknown;
}

/**
 * Prisma Client with extended types for testing
 */
export type TestPrismaClient = PrismaClient & {
  trajectory?: {
    count: () => Promise<number>;
    findMany: (args: unknown) => Promise<unknown[]>;
    findUnique: (args: { where: { trajectoryId: string } }) => Promise<unknown>;
    delete: (args: { where: { trajectoryId: string } }) => Promise<unknown>;
    deleteMany: (args: { where: { trajectoryId: { in: string[] } } }) => Promise<{ count: number }>;
    groupBy: (args: unknown) => Promise<unknown[]>;
  };
  llmCallLog?: {
    deleteMany: (args: { where: { trajectoryId: string } }) => Promise<{ count: number }>;
    aggregate: (args: unknown) => Promise<unknown>;
  };
};

/**
 * Route handler function type
 */
export type RouteHandler = (route: Route) => void | Promise<void>;

/**
 * Route fulfillment options
 */
export interface RouteFulfillOptions {
  status?: number;
  contentType?: string;
  body?: string;
  headers?: Record<string, string>;
}

/**
 * Mock API response
 */
export interface MockAPIResponse<T = unknown> {
  success?: boolean;
  data?: T;
  error?: string;
  message?: string;
  [key: string]: unknown;
}

/**
 * A2A Request Result
 */
export interface A2ARequestResult {
  success: boolean;
  message: string;
  block?: {
    blockedId: string;
    reason?: string;
    [key: string]: unknown;
  };
  mute?: {
    mutedId: string;
    reason?: string;
    [key: string]: unknown;
  };
  report?: {
    reportedUserId?: string;
    reportedPostId?: string;
    category: string;
    status: string;
    priority: string;
    [key: string]: unknown;
  };
  isBlocked?: boolean;
  isMuted?: boolean;
  blocks?: unknown[];
  mutes?: unknown[];
  pagination?: {
    total: number;
    limit: number;
    offset: number;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

/**
 * Benchmark Config
 */
export interface BenchmarkConfig {
  durationMinutes: number;
  tickInterval: number;
  numPredictionMarkets: number;
  numPerpetualMarkets: number;
  numAgents: number;
  seed: number;
}

/**
 * Simulation Config
 */
export interface SimulationConfig {
  snapshot: {
    id: string;
    version: string;
    duration: number;
    ticks: unknown[];
    initialState: {
      predictionMarkets: unknown[];
      perpetualMarkets: unknown[];
      agents: unknown[];
    };
    groundTruth: {
      marketOutcomes: Record<string, boolean>;
      priceHistory: Record<string, unknown[]>;
      optimalActions: unknown[];
    };
  };
  agentId: string;
  fastForward?: boolean;
  responseTimeout?: number;
}

/**
 * Simulation Result
 */
export interface SimulationResult {
  id: string;
  agentId: string;
  benchmarkId: string;
  ticksProcessed: number;
  actions: Array<{
    type: string;
    [key: string]: unknown;
  }>;
  metrics: {
    totalPnl: number;
    predictionMetrics: {
      totalPositions: number;
      correctPredictions: number;
      accuracy: number;
      [key: string]: unknown;
    };
    perpMetrics: Record<string, unknown>;
    socialMetrics: Record<string, unknown>;
    timing: Record<string, unknown>;
    optimalityScore: number;
    [key: string]: unknown;
  };
  trajectory: {
    states: unknown[];
    actions: unknown[];
    rewards: unknown[];
    windowId: string;
    [key: string]: unknown;
  };
}

/**
 * Feedback Metadata
 */
export interface FeedbackMetadata {
  profitable?: boolean;
  autoGenerated?: boolean;
  won?: boolean;
  [key: string]: unknown;
}

/**
 * Cron Job
 */
export interface CronJob {
  path: string;
  [key: string]: unknown;
}

