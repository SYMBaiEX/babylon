/**
 * Game Onboarding Service
 *
 * Manages the game tutorial flow for new users.
 * Tracks progress through onboarding steps and awards points.
 */

import {
  and,
  db,
  eq,
  type GameOnboardingRow,
  type GameOnboardingState,
  type GameOnboardingStep,
  gameOnboarding,
} from '@babylon/db';
import {
  generateSnowflakeId,
  getNextOnboardingStep,
  logger,
  ONBOARDING_STEP_ORDER,
  ONBOARDING_STEP_POINTS,
} from '@babylon/shared';
import { EarnedPointsService } from './earned-points-service';

/**
 * Type guard to validate that a value is a valid GameOnboardingState.
 * Checks for required properties and their types.
 */
function isGameOnboardingState(value: unknown): value is GameOnboardingState {
  if (value === null || typeof value !== 'object') {
    return false;
  }

  const obj = value as Record<string, unknown>;

  return (
    Array.isArray(obj.completedSteps) &&
    typeof obj.currentStep === 'string' &&
    (obj.startedAt === null || typeof obj.startedAt === 'string') &&
    (obj.completedAt === null || typeof obj.completedAt === 'string') &&
    Array.isArray(obj.rewards)
  );
}

/**
 * Get a validated GameOnboardingState from a raw value, with fallback to safe defaults.
 */
function getValidatedState(
  rawState: unknown,
  userId: string
): GameOnboardingState {
  if (isGameOnboardingState(rawState)) {
    return rawState;
  }

  // Log warning for malformed state
  logger.warn(
    'Malformed or null onboarding state, using defaults',
    { userId, rawState: typeof rawState },
    'GameOnboarding'
  );

  // Return safe default state
  return {
    completedSteps: [],
    currentStep: 'welcome',
    startedAt: null,
    completedAt: null,
    rewards: [],
  };
}

/**
 * Create or get onboarding record for a user.
 * Uses INSERT ... ON CONFLICT DO NOTHING then SELECT for atomic, race-free creation.
 */
export async function getOrCreateOnboarding(
  userId: string
): Promise<GameOnboardingRow> {
  const id = await generateSnowflakeId();
  const now = new Date();
  const initialState: GameOnboardingState = {
    completedSteps: [],
    currentStep: 'welcome',
    startedAt: now.toISOString(),
    completedAt: null,
    rewards: [],
  };

  // Attempt insert, do nothing on conflict (userId is unique)
  await db
    .insert(gameOnboarding)
    .values({
      id,
      userId,
      currentStep: 'welcome',
      state: initialState,
      isComplete: false,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing({ target: gameOnboarding.userId });

  // Select the row (either just created or already existed)
  const [row] = await db
    .select()
    .from(gameOnboarding)
    .where(eq(gameOnboarding.userId, userId))
    .limit(1);

  if (!row) {
    // This should never happen, but handle gracefully
    throw new Error(`Failed to get or create onboarding for user ${userId}`);
  }

  // Log only if this was a new creation (check if createdAt matches)
  if (row.createdAt.getTime() === now.getTime()) {
    logger.info(
      `Created game onboarding for user ${userId}`,
      { userId, onboardingId: row.id },
      'GameOnboarding'
    );
  }

  return row;
}

/** Maximum retry attempts for optimistic locking */
const MAX_OPTIMISTIC_LOCK_RETRIES = 3;

/**
 * Complete an onboarding step and award points.
 * Uses optimistic locking to prevent race conditions from awarding duplicate points.
 */
export async function completeOnboardingStep(
  userId: string,
  step: GameOnboardingStep,
  retryCount = 0
): Promise<{
  success: boolean;
  pointsAwarded: number;
  nextStep: GameOnboardingStep;
  isComplete: boolean;
}> {
  const onboarding = await getOrCreateOnboarding(userId);
  const state = getValidatedState(onboarding.state, userId);

  // Check if already completed
  if (state.completedSteps.includes(step)) {
    return {
      success: false,
      pointsAwarded: 0,
      nextStep: state.currentStep,
      isComplete: onboarding.isComplete,
    };
  }

  // Award points
  const points = ONBOARDING_STEP_POINTS[step];

  // Update state
  state.completedSteps.push(step);
  state.currentStep = getNextOnboardingStep(step);
  state.rewards.push({ step, points });

  const isComplete = state.currentStep === 'complete';
  if (isComplete) {
    state.completedAt = new Date().toISOString();
  }

  // Update database with optimistic lock check on updatedAt
  // This prevents race conditions where concurrent requests both pass the
  // already-completed check before either writes to the database
  const result = await db
    .update(gameOnboarding)
    .set({
      currentStep: state.currentStep,
      state,
      isComplete,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(gameOnboarding.userId, userId),
        eq(gameOnboarding.updatedAt, onboarding.updatedAt)
      )
    )
    .returning();

  // If no rows updated, someone else modified it - retry with fresh data
  if (!result || result.length === 0) {
    if (retryCount >= MAX_OPTIMISTIC_LOCK_RETRIES) {
      logger.warn(
        `Optimistic lock retry limit reached for onboarding step completion`,
        { userId, step, retryCount },
        'GameOnboarding'
      );
      return {
        success: false,
        pointsAwarded: 0,
        nextStep: state.currentStep,
        isComplete: onboarding.isComplete,
      };
    }

    logger.debug(
      `Optimistic lock conflict, retrying onboarding step completion`,
      { userId, step, retryCount: retryCount + 1 },
      'GameOnboarding'
    );
    return completeOnboardingStep(userId, step, retryCount + 1);
  }

  logger.info(
    `User ${userId} completed onboarding step ${step}`,
    { userId, step, points, nextStep: state.currentStep, isComplete },
    'GameOnboarding'
  );

  // Award bonus points to user balance
  if (points > 0) {
    try {
      await EarnedPointsService.awardBonusPoints(
        userId,
        points,
        `onboarding_${step}`
      );
    } catch (error) {
      // Log but don't fail - onboarding completion is more important
      logger.warn(
        `Failed to award bonus points for onboarding step`,
        {
          userId,
          step,
          points,
          error: error instanceof Error ? error.message : String(error),
        },
        'GameOnboarding'
      );
    }
  }

  return {
    success: true,
    pointsAwarded: points,
    nextStep: state.currentStep,
    isComplete,
  };
}

/**
 * Get onboarding status for a user
 */
export async function getOnboardingStatus(userId: string): Promise<{
  currentStep: GameOnboardingStep;
  completedSteps: GameOnboardingStep[];
  totalPointsEarned: number;
  isComplete: boolean;
} | null> {
  const onboarding = await getOrCreateOnboarding(userId);
  const state = getValidatedState(onboarding.state, userId);

  const totalPointsEarned = state.rewards.reduce((sum, r) => sum + r.points, 0);

  return {
    currentStep: state.currentStep,
    completedSteps: state.completedSteps,
    totalPointsEarned,
    isComplete: onboarding.isComplete,
  };
}

/**
 * Skip onboarding for a user
 */
export async function skipOnboarding(userId: string): Promise<void> {
  const onboarding = await getOrCreateOnboarding(userId);

  await db
    .update(gameOnboarding)
    .set({
      isComplete: true,
      skippedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(gameOnboarding.userId, userId));

  logger.info(
    `User ${userId} skipped onboarding`,
    { userId, onboardingId: onboarding.id },
    'GameOnboarding'
  );
}

/**
 * Check if a user needs onboarding
 */
export async function needsOnboarding(userId: string): Promise<boolean> {
  const [onboarding] = await db
    .select({
      isComplete: gameOnboarding.isComplete,
      skippedAt: gameOnboarding.skippedAt,
    })
    .from(gameOnboarding)
    .where(eq(gameOnboarding.userId, userId))
    .limit(1);

  if (!onboarding) {
    return true; // No record = needs onboarding
  }

  return !onboarding.isComplete && !onboarding.skippedAt;
}

/**
 * Game Onboarding Service class
 */
export class GameOnboardingService {
  async getOrCreate(userId: string): Promise<GameOnboardingRow> {
    return getOrCreateOnboarding(userId);
  }

  async completeStep(
    userId: string,
    step: GameOnboardingStep
  ): Promise<{
    success: boolean;
    pointsAwarded: number;
    nextStep: GameOnboardingStep;
    isComplete: boolean;
  }> {
    return completeOnboardingStep(userId, step);
  }

  async getStatus(userId: string) {
    return getOnboardingStatus(userId);
  }

  async skip(userId: string): Promise<void> {
    return skipOnboarding(userId);
  }

  async needsOnboarding(userId: string): Promise<boolean> {
    return needsOnboarding(userId);
  }

  getStepOrder(): GameOnboardingStep[] {
    return [...ONBOARDING_STEP_ORDER];
  }

  getStepPoints(): Record<GameOnboardingStep, number> {
    return { ...ONBOARDING_STEP_POINTS };
  }
}

// Singleton instance
export const gameOnboardingService = new GameOnboardingService();
