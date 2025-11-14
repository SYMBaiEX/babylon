/**
 * Shared Type Definitions for Tests
 * 
 * Production-ready types to replace all 'any' and 'unknown' usage
 */

import type { Trajectory, TrainingBatch, TrainedModel } from '@prisma/client';

// ============================================================================
// Actors Data Types
// ============================================================================

export interface ActorData {
  id: string;
  name: string;
  realName: string;
  username: string;
  description: string;
  profileDescription: string;
  domain: string[];
  personality: string;
  tier: string;
  hasPool: boolean;
  affiliations?: string[];
  postStyle: string;
  postExample: string[];
  physicalDescription: string;
  profileBanner: string;
  originalFirstName: string;
  originalLastName: string;
  originalHandle: string;
}

export interface OrganizationData {
  id: string;
  name: string;
  type: string;
  description: string;
  postStyle: string;
  postExample: string[];
  initialPrice: number;
  originalName: string;
  originalHandle: string;
}

export interface ActorsDataFile {
  actors: ActorData[];
  organizations: OrganizationData[];
}

// ============================================================================
// Prisma Mock Types
// ============================================================================

export type MockPrismaTrajectory = {
  count: () => Promise<number>;
  groupBy: () => Promise<Array<{ scenarioId: string; _count: number }>>;
  findMany: () => Promise<Array<Pick<Trajectory, 'trajectoryId' | 'stepsJson'>>>;
  updateMany: () => Promise<{ count: number }>;
};

export type MockPrismaTrainingBatch = {
  create: () => Promise<TrainingBatch>;
  findUnique: (args: { where: { batchId: string } }) => Promise<TrainingBatch | null>;
  findFirst: () => Promise<TrainingBatch | null>;
  count: () => Promise<number>;
};

export type MockPrismaTrainedModel = {
  findFirst: () => Promise<TrainedModel | null>;
  create: () => Promise<TrainedModel>;
  count: () => Promise<number>;
};

export type MockPrismaUser = {
  count: () => Promise<number>;
};

export type MockPrismaClient = {
  trajectory: MockPrismaTrajectory;
  trainingBatch: MockPrismaTrainingBatch;
  trainedModel: MockPrismaTrainedModel;
  user: MockPrismaUser;
  $queryRaw: () => Promise<Array<{ result: number }>>;
};

// ============================================================================
// Logger Mock Types
// ============================================================================

export type MockLogger = {
  info: () => void;
  warn: () => void;
  error: () => void;
};

// ============================================================================
// PostHog Types
// ============================================================================

export interface PostHogEvent {
  event: string;
  properties?: Record<string, string | number | boolean | null | undefined>;
}

export interface PostHogConfig {
  respect_dnt?: boolean;
  capture_exceptions?: boolean;
}

export interface PostHogInstance {
  capture: (event: string, properties?: Record<string, string | number | boolean | null | undefined>) => void;
  config?: PostHogConfig;
}

export interface WindowWithPostHog extends Window {
  __postHogEvents?: PostHogEvent[];
  posthog?: PostHogInstance;
}

// ============================================================================
// MetaMask Types (for Synpress)
// ============================================================================

export interface MetaMask {
  connectToDapp: () => Promise<void>;
  confirmSignature: () => Promise<void>;
}

// ============================================================================
// API Response Types
// ============================================================================

export interface ApiResponse<T = Record<string, never>> {
  success?: boolean;
  data?: T;
  error?: string;
  [key: string]: unknown;
}

export interface PerpetualsData {
  positions: Array<{
    id: string;
    ticker?: string;
    side: string;
    unrealizedPnL: number;
  }>;
  stats: {
    totalPositions: number;
    totalPnL: number;
    totalFunding: number;
  };
}

export interface PredictionsData {
  positions: Array<{
    id: string;
    side: string;
    unrealizedPnL: number;
  }>;
  stats: {
    totalPositions: number;
  };
}

export interface PositionsResponse {
  perpetuals: PerpetualsData;
  predictions: PredictionsData;
}

export type PartialPositionsResponse = {
  perpetuals?: PerpetualsData | null;
  predictions?: PredictionsData | undefined;
}

