/**
 * Narrative Event Processor
 *
 * Unified arc event system that:
 * 1. Processes arc state transitions for prediction questions
 * 2. Generates structured events that drive narrative and market movements
 * 3. Creates world events for feed content
 * 4. Triggers article generation for significant events
 *
 * This is the single source of truth for arc-driven content generation.
 */

import {
  type ArcState,
  type ArcStateType,
  and,
  arcStates,
  db,
  eq,
  type LongTermArcState,
  type MarketImpact,
  type PendingTransition,
  questionArcPlans,
  questions,
  type StructuredEventData,
  worldEvents,
} from '@babylon/db';
import { generateSnowflakeId, logger } from '@babylon/shared';
import type { BabylonLLMClient } from '../llm/openai-client';
import { toSafeDayNumber } from '../utils/date-utils';
import { secureRandom } from '../utils/entropy';
import { generateArticlesForArcEvent } from './event-generation-helpers';

// Re-export the BabylonLLMClient type for callers
export type { BabylonLLMClient } from '../llm/openai-client';

/**
 * Day ranges for each arc state (for 30-day long-term arcs)
 */
const STATE_DAY_RANGES: Record<LongTermArcState, [number, number]> = {
  setup: [1, 3],
  tension: [4, 10],
  escalation: [11, 18],
  crisis: [19, 24],
  revelation: [25, 27],
  resolution: [28, 30],
};

/**
 * Minimum hours between event generations to prevent spam
 */
const EVENT_COOLDOWN_HOURS = 2;

/**
 * Helper to prepare world event data from an arc event.
 * Shared between createWorldEventFromArcEvent and createWorldEventFromArcEventTx
 * to avoid code duplication.
 */
async function prepareWorldEventData(
  structuredEvent: StructuredEventData,
  questionText: string,
  timestamp: Date,
  dayNumber?: number,
  questionNumber?: number | null
): Promise<{
  eventId: string;
  values: {
    id: string;
    eventType: StructuredEventData['type'];
    description: string;
    actors: string[];
    relatedQuestion: number | undefined;
    visibility: 'public' | 'leaked';
    gameId: string;
    dayNumber: number | undefined;
    timestamp: Date;
    pointsToward: 'YES' | 'NO' | null;
  };
}> {
  const templates = WORLD_EVENT_DESCRIPTION_TEMPLATES[structuredEvent.type];
  const template = templates[Math.floor(secureRandom() * templates.length)]!;
  const topic =
    questionText.length > 80 ? questionText.slice(0, 80) + '...' : questionText;
  const description = template.replace('{topic}', topic);

  const eventId = await generateSnowflakeId();
  const safeDayNumber =
    typeof dayNumber === 'number' ? toSafeDayNumber(dayNumber) : undefined;

  return {
    eventId,
    values: {
      id: eventId,
      eventType: structuredEvent.type,
      description,
      actors: structuredEvent.affectedActors,
      relatedQuestion: questionNumber ?? undefined,
      visibility: structuredEvent.type === 'leak' ? 'leaked' : 'public',
      gameId: 'continuous',
      dayNumber: safeDayNumber,
      timestamp,
      pointsToward:
        structuredEvent.signalDirection === 'NEUTRAL'
          ? null
          : structuredEvent.signalDirection,
    },
  };
}

/**
 * Description templates for world events by event type.
 * Shared between createWorldEventFromArcEvent and createWorldEventFromArcEventTx.
 */
const WORLD_EVENT_DESCRIPTION_TEMPLATES: Record<
  StructuredEventData['type'],
  string[]
> = {
  rumor: [
    'Unconfirmed reports suggest developments regarding {topic}',
    'Sources claim new information about {topic}',
    'Speculation grows around {topic}',
  ],
  leak: [
    'Leaked documents reveal details about {topic}',
    'Anonymous source exposes information on {topic}',
    'Internal memo surfaces regarding {topic}',
  ],
  denial: [
    'Officials deny reports about {topic}',
    'Spokesperson refutes claims regarding {topic}',
    'Strong denial issued concerning {topic}',
  ],
  confirmation: [
    'Sources confirm developments in {topic}',
    'Official statement verifies {topic}',
    'Breaking: Confirmation on {topic}',
  ],
  reversal: [
    'Unexpected reversal in {topic}',
    'Major shift reported on {topic}',
    'Surprise development contradicts earlier reports on {topic}',
  ],
  proof: [
    'Definitive evidence emerges on {topic}',
    'Documentation confirms outcome of {topic}',
    'Final proof released regarding {topic}',
  ],
};

/**
 * Get the expected arc state for a given day number (long-term arcs only)
 */
export function getExpectedState(dayNumber: number): LongTermArcState {
  // Guard against invalid day numbers to avoid misleading 'resolution' fallback
  if (dayNumber < 1) {
    throw new Error(
      `Invalid dayNumber ${dayNumber}: arc states start at day 1. ` +
        `Ensure the game has started before querying arc state.`
    );
  }

  for (const [state, [start, end]] of Object.entries(STATE_DAY_RANGES)) {
    if (dayNumber >= start && dayNumber <= end) {
      return state as LongTermArcState;
    }
  }
  // After day 30, remain in resolution
  return 'resolution';
}

/**
 * Check if a state transition should occur (long-term arcs only)
 */
export function evaluateStateTransition(
  arc: ArcState,
  dayNumber: number
): LongTermArcState | null {
  const expectedState = getExpectedState(dayNumber);

  if (expectedState !== arc.currentState) {
    return expectedState;
  }

  // Check pending transitions
  // Cast from unknown since JSONB columns don't have type info at runtime
  const pending = (arc.pendingTransitions as PendingTransition[] | null) ?? [];
  for (const transition of pending) {
    if (dayNumber >= transition.triggerDay) {
      // Probability check
      if (
        transition.probability === undefined ||
        secureRandom() < transition.probability
      ) {
        return transition.targetState as LongTermArcState;
      }
    }
  }

  return null;
}

/**
 * Transition an arc to a new state with optimistic locking (long-term arcs only)
 * Includes retry logic for optimistic lock conflicts.
 */
export async function transitionArcState(
  arcId: string,
  newState: LongTermArcState,
  currentState?: ArcStateType
): Promise<boolean> {
  const MAX_RETRIES = 3;
  const RETRY_BASE_DELAY_MS = 50;

  // If currentState provided, use optimistic locking with retry
  if (currentState) {
    let attemptState = currentState;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      const now = new Date();
      const result = await db
        .update(arcStates)
        .set({
          currentState: newState,
          stateEnteredAt: now,
          updatedAt: now,
          // Clear pending transitions that triggered
          pendingTransitions: [],
        })
        .where(
          and(eq(arcStates.id, arcId), eq(arcStates.currentState, attemptState))
        )
        .returning({ id: arcStates.id });

      if (result.length > 0) {
        logger.info(
          `Arc ${arcId} transitioned to ${newState}`,
          { arcId, newState },
          'NarrativeEventProcessor'
        );
        return true;
      }

      // Conflict - log and retry
      logger.warn(
        `Optimistic lock conflict transitioning arc ${arcId} (attempt ${attempt + 1}/${MAX_RETRIES})`,
        { arcId, currentState: attemptState, newState },
        'NarrativeEventProcessor'
      );

      if (attempt < MAX_RETRIES - 1) {
        // Re-read current state for next attempt
        const [arc] = await db
          .select({ currentState: arcStates.currentState })
          .from(arcStates)
          .where(eq(arcStates.id, arcId))
          .limit(1);

        if (!arc) {
          logger.warn(
            `Arc ${arcId} not found during retry`,
            { arcId },
            'NarrativeEventProcessor'
          );
          return false;
        }

        attemptState = arc.currentState;

        // Exponential backoff
        const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    logger.warn(
      `Arc ${arcId} transition failed after ${MAX_RETRIES} attempts`,
      { arcId, currentState, newState },
      'NarrativeEventProcessor'
    );
    return false;
  } else {
    // Fallback to simple update (for backward compatibility)
    const now = new Date();
    await db
      .update(arcStates)
      .set({
        currentState: newState,
        stateEnteredAt: now,
        updatedAt: now,
        pendingTransitions: [],
      })
      .where(eq(arcStates.id, arcId));

    logger.info(
      `Arc ${arcId} transitioned to ${newState}`,
      { arcId, newState },
      'NarrativeEventProcessor'
    );
    return true;
  }
}

/**
 * Check if an event should be generated for this arc (long-term arcs only)
 */
export function shouldGenerateEvent(arc: ArcState): boolean {
  // Event generation probability based on state
  const probabilities: Record<LongTermArcState, number> = {
    setup: 0.3, // 30% chance per tick
    tension: 0.4,
    escalation: 0.5,
    crisis: 0.6,
    revelation: 0.7,
    resolution: 0.2,
  };

  const prob = probabilities[arc.currentState as LongTermArcState] ?? 0.3;

  // Reduce probability if we recently generated an event
  if (arc.lastEventAt) {
    const hoursSinceLastEvent =
      (Date.now() - arc.lastEventAt.getTime()) / (1000 * 60 * 60);
    if (hoursSinceLastEvent < EVENT_COOLDOWN_HOURS) {
      return false; // Cooldown
    }
  }

  return secureRandom() < prob;
}

/**
 * Generate a structured event for an arc based on current state
 */
export async function generateStructuredEvent(
  arc: ArcState,
  arcPlan: { insiderActorIds: string[]; deceiverActorIds: string[] } | null
): Promise<StructuredEventData> {
  // Event types appropriate for each state (long-term arcs only)
  const stateEventTypes: Record<
    LongTermArcState,
    StructuredEventData['type'][]
  > = {
    setup: ['rumor'],
    tension: ['rumor', 'leak', 'denial'],
    escalation: ['leak', 'denial', 'confirmation'],
    crisis: ['denial', 'confirmation', 'reversal'],
    revelation: ['confirmation', 'proof'],
    resolution: ['proof'],
  };

  const possibleTypes = stateEventTypes[
    arc.currentState as LongTermArcState
  ] ?? ['rumor'];
  const eventType =
    possibleTypes[Math.floor(secureRandom() * possibleTypes.length)]!;

  // Severity increases as arc progresses
  const severityByState: Record<LongTermArcState, number> = {
    setup: 1,
    tension: 2,
    escalation: 3,
    crisis: 4,
    revelation: 4,
    resolution: 5,
  };
  const baseSeverity =
    severityByState[arc.currentState as LongTermArcState] ?? 2;
  // Compute severity with proper bounds checking (1-5 range)
  const rawSeverity = Math.max(
    1,
    Math.min(5, baseSeverity + Math.floor(secureRandom() * 2))
  );
  const severity = rawSeverity as 1 | 2 | 3 | 4 | 5;

  // Signal direction based on event type and state
  let signalDirection: 'YES' | 'NO' | 'NEUTRAL';
  if (eventType === 'denial' || eventType === 'reversal') {
    signalDirection = 'NO';
  } else if (eventType === 'confirmation' || eventType === 'proof') {
    signalDirection = 'YES';
  } else {
    signalDirection = secureRandom() > 0.5 ? 'YES' : 'NO';
  }

  // Signal strength increases with severity
  const signalStrength = 0.3 + severity * 0.14;

  // Affected actors from arc plan
  const affectedActors = [
    ...(arcPlan?.insiderActorIds ?? []),
    ...(arcPlan?.deceiverActorIds ?? []),
  ].slice(0, 5);

  // Get affected stocks from question context
  const affectedStocks = await getAffectedStocksForQuestion(arc.questionId);

  // Generate market impacts based on event type and severity
  const marketImpacts: MarketImpact[] = affectedStocks.map((ticker) => ({
    stockTicker: ticker,
    direction:
      signalDirection === 'YES'
        ? 'up'
        : signalDirection === 'NO'
          ? 'down'
          : secureRandom() > 0.5
            ? 'up'
            : 'down',
    magnitude: severity <= 2 ? 'minor' : severity <= 4 ? 'moderate' : 'major',
    duration:
      eventType === 'rumor' || eventType === 'denial'
        ? 'hours'
        : eventType === 'proof'
          ? 'days'
          : 'hours',
  }));

  const event: StructuredEventData = {
    arcId: arc.id,
    type: eventType,
    severity,
    affectedActors,
    affectedStocks,
    affectedQuestions: [arc.questionId],
    signalDirection,
    signalStrength,
    marketImpacts,
  };

  return event;
}

/**
 * Create a world event from a structured arc event.
 * This makes the event visible in the feed and can trigger article generation.
 */
export async function createWorldEventFromArcEvent(
  structuredEvent: StructuredEventData,
  questionText: string,
  timestamp: Date,
  dayNumber?: number,
  questionNumber?: number | null
): Promise<string> {
  const prepared = await prepareWorldEventData(
    structuredEvent,
    questionText,
    timestamp,
    dayNumber,
    questionNumber
  );

  await db.insert(worldEvents).values(prepared.values);

  logger.info(
    'Created world event from arc event',
    {
      eventId: prepared.eventId,
      arcId: structuredEvent.arcId,
      type: structuredEvent.type,
      severity: structuredEvent.severity,
    },
    'NarrativeEventProcessor'
  );

  return prepared.eventId;
}

/**
 * Transaction-aware version of createWorldEventFromArcEvent.
 * Used within db.transaction() to ensure atomicity with arc state updates.
 */
async function createWorldEventFromArcEventTx(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  structuredEvent: StructuredEventData,
  questionText: string,
  timestamp: Date,
  dayNumber?: number,
  questionNumber?: number | null
): Promise<string> {
  const prepared = await prepareWorldEventData(
    structuredEvent,
    questionText,
    timestamp,
    dayNumber,
    questionNumber
  );

  await tx.insert(worldEvents).values(prepared.values);

  logger.info(
    'Created world event from arc event (tx)',
    {
      eventId: prepared.eventId,
      arcId: structuredEvent.arcId,
      type: structuredEvent.type,
      severity: structuredEvent.severity,
    },
    'NarrativeEventProcessor'
  );

  return prepared.eventId;
}

/**
 * Get question text and number by ID for world event creation
 */
async function getQuestionDetails(
  questionId: string
): Promise<{ text: string; questionNumber: number | null }> {
  const [question] = await db
    .select({ text: questions.text, questionNumber: questions.questionNumber })
    .from(questions)
    .where(eq(questions.id, questionId))
    .limit(1);

  // Log a warning if question is not found for visibility
  if (!question) {
    logger.warn(
      'Question not found for world event creation, using fallback values',
      {
        questionId,
        fallbackText: 'Unknown question',
        fallbackQuestionNumber: null,
      },
      'NarrativeEventProcessor'
    );
  }

  return {
    text: question?.text ?? 'Unknown question',
    questionNumber: question?.questionNumber ?? null,
  };
}

/**
 * Get affected stock tickers for a question.
 * Parses the question text for organization mentions and returns their tickers.
 */
async function getAffectedStocksForQuestion(
  questionId: string
): Promise<string[]> {
  try {
    // Dynamic import to avoid circular dependencies
    const { StaticDataRegistry } = await import('./static-data-registry');

    // First, get the question text
    const [question] = await db
      .select({ text: questions.text })
      .from(questions)
      .where(eq(questions.id, questionId))
      .limit(1);

    if (!question) {
      return [];
    }

    // Get all organizations and look for mentions in the question text
    const allOrgs = StaticDataRegistry.getAllOrganizations();
    const questionTextLower = question.text.toLowerCase();

    const mentionedOrgs = allOrgs.filter((org) => {
      // Check if org name is mentioned in question
      const nameMatch = questionTextLower.includes(org.name.toLowerCase());
      // Check if ticker is mentioned (e.g., "$PEAR" or "PEAR")
      const tickerMatch =
        org.ticker &&
        (questionTextLower.includes(`$${org.ticker.toLowerCase()}`) ||
          questionTextLower.includes(org.ticker.toLowerCase()));
      // Check if original name is mentioned
      const originalMatch =
        org.originalName &&
        questionTextLower.includes(org.originalName.toLowerCase());

      return nameMatch || tickerMatch || originalMatch;
    });

    // Return tickers for mentioned orgs
    const tickers = mentionedOrgs
      .map((org) => org.ticker)
      .filter((t): t is string => t !== undefined && t !== null);

    // If no specific orgs found from question text, try to find relevant orgs
    // from the arc plan's associated actors
    if (tickers.length === 0) {
      // Get the arc plan for this question to find associated actors
      const arcPlanResult = await db
        .select({
          insiderActorIds: questionArcPlans.insiderActorIds,
          deceiverActorIds: questionArcPlans.deceiverActorIds,
        })
        .from(questionArcPlans)
        .where(eq(questionArcPlans.questionId, questionId))
        .limit(1);

      const arcPlan = arcPlanResult[0];
      if (arcPlan) {
        const actorIds = [
          ...(arcPlan.insiderActorIds || []),
          ...(arcPlan.deceiverActorIds || []),
        ];

        // Find organizations these actors are affiliated with
        const affiliatedTickers = new Set<string>();
        for (const actorId of actorIds) {
          const actor = StaticDataRegistry.getActor(actorId);
          if (actor?.affiliations) {
            for (const affId of actor.affiliations) {
              const org = allOrgs.find((o) => o.id === affId);
              if (org?.ticker) {
                affiliatedTickers.add(org.ticker);
              }
            }
          }
        }

        if (affiliatedTickers.size > 0) {
          logger.debug(
            'Found affected stocks from arc actors',
            {
              questionId,
              tickers: Array.from(affiliatedTickers),
              actorCount: actorIds.length,
            },
            'NarrativeEventProcessor'
          );
          return Array.from(affiliatedTickers);
        }
      }

      // Last resort: return empty array instead of random stocks
      // Random stocks would create misleading market effects
      logger.debug(
        'No affected stocks found for question',
        { questionId },
        'NarrativeEventProcessor'
      );
      return [];
    }

    return tickers;
  } catch (error) {
    logger.warn(
      'Failed to get affected stocks for question',
      {
        questionId,
        error: error instanceof Error ? error.message : String(error),
      },
      'NarrativeEventProcessor'
    );
    return [];
  }
}

/**
 * Process a single arc tick - check for transitions and event generation
 *
 * @param arcId - The arc state ID to process
 * @param dayNumber - The current game day number
 * @param llmClient - Optional LLM client for generating articles on significant events
 */
export async function processArcTick(
  arcId: string,
  dayNumber: number,
  llmClient?: BabylonLLMClient | null
): Promise<{
  transitioned: boolean;
  eventGenerated: boolean;
  newState?: ArcStateType;
}> {
  // Get arc state
  const [arc] = await db
    .select()
    .from(arcStates)
    .where(eq(arcStates.id, arcId))
    .limit(1);

  if (!arc) {
    logger.warn(`Arc ${arcId} not found`, { arcId }, 'NarrativeEventProcessor');
    return { transitioned: false, eventGenerated: false };
  }

  // Check for state transitions with optimistic locking
  const newState = evaluateStateTransition(arc, dayNumber);
  let transitioned = false;

  if (newState) {
    transitioned = await transitionArcState(arcId, newState, arc.currentState);
  }

  // Check if event should be generated
  const shouldGenerate = shouldGenerateEvent(arc);
  let eventGenerated = false;

  if (shouldGenerate) {
    const now = new Date();

    // FIRST: Gather all data needed BEFORE acquiring the lock
    // This ensures we don't hold a lock while doing expensive queries/LLM calls

    // Get arc plan for actor assignments
    const [arcPlan] = await db
      .select({
        insiderActorIds: questionArcPlans.insiderActorIds,
        deceiverActorIds: questionArcPlans.deceiverActorIds,
      })
      .from(questionArcPlans)
      .where(eq(questionArcPlans.questionId, arc.questionId))
      .limit(1);

    // Normalize null arrays to empty arrays
    const normalizedArcPlan = arcPlan
      ? {
          insiderActorIds: arcPlan.insiderActorIds ?? [],
          deceiverActorIds: arcPlan.deceiverActorIds ?? [],
        }
      : null;

    // Generate the structured event (may involve DB queries for affected stocks)
    const structuredEvent = await generateStructuredEvent(
      arc,
      normalizedArcPlan
    );

    // Get question details before the transaction
    const questionDetails = await getQuestionDetails(arc.questionId);

    // NOW: Use a transaction to atomically update arc state AND create world event
    // This prevents inconsistent state if either operation fails
    let worldEventId: string;
    try {
      worldEventId = await db.transaction(async (tx) => {
        // Acquire the optimistic lock
        const updateResult = await tx
          .update(arcStates)
          .set({
            eventsGenerated: (arc.eventsGenerated ?? 0) + 1,
            lastEventAt: now,
            updatedAt: now,
          })
          .where(
            and(eq(arcStates.id, arcId), eq(arcStates.updatedAt, arc.updatedAt))
          )
          .returning({ id: arcStates.id });

        if (updateResult.length === 0) {
          // Optimistic lock conflict - throw to rollback transaction
          throw new Error('OPTIMISTIC_LOCK_CONFLICT');
        }

        // Create the world event within the same transaction
        const eventId = await createWorldEventFromArcEventTx(
          tx,
          structuredEvent,
          questionDetails.text,
          now,
          dayNumber,
          questionDetails.questionNumber
        );

        return eventId;
      });
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === 'OPTIMISTIC_LOCK_CONFLICT'
      ) {
        logger.warn(
          `Optimistic lock conflict for arc ${arcId}, skipping event generation`,
          { arcId },
          'NarrativeEventProcessor'
        );
        return {
          transitioned,
          eventGenerated: false,
          newState: newState ?? undefined,
        };
      }
      throw error; // Re-throw other errors
    }

    // Apply market impacts AFTER the transaction succeeds (non-critical, can fail independently)
    if (structuredEvent.marketImpacts.length > 0) {
      try {
        const { applyEventToMarkets } = await import('./event-market-pipeline');
        const modifiersApplied = await applyEventToMarkets(structuredEvent);
        logger.info(
          `Applied ${modifiersApplied} market modifiers from event`,
          { arcId, modifiersApplied },
          'NarrativeEventProcessor'
        );
      } catch (marketError) {
        logger.warn(
          'Failed to apply market impacts for arc event',
          {
            arcId,
            worldEventId,
            error:
              marketError instanceof Error
                ? marketError.message
                : String(marketError),
          },
          'NarrativeEventProcessor'
        );
      }
    }

    // Trigger article generation for significant events (severity >= 3)
    // Reuse questionDetails already fetched earlier instead of re-querying
    if (structuredEvent.severity >= 3 && llmClient) {
      try {
        // Only generate articles if we have valid question details
        if (
          questionDetails.text !== 'Unknown question' &&
          questionDetails.questionNumber !== null
        ) {
          const articlesGenerated = await generateArticlesForArcEvent(
            worldEventId,
            'created', // Arc events are 'created' status
            {
              id: arc.questionId,
              text: questionDetails.text,
              questionNumber: questionDetails.questionNumber,
            },
            llmClient,
            now,
            dayNumber
          );

          if (articlesGenerated > 0) {
            logger.info(
              `Generated ${articlesGenerated} articles for arc event`,
              { arcId, worldEventId, severity: structuredEvent.severity },
              'NarrativeEventProcessor'
            );
          }
        }
      } catch (articleError) {
        logger.warn(
          'Failed to generate articles for arc event',
          {
            arcId,
            worldEventId,
            error:
              articleError instanceof Error
                ? articleError.message
                : String(articleError),
          },
          'NarrativeEventProcessor'
        );
      }
    }

    eventGenerated = true;

    logger.info(
      `Generated ${structuredEvent.type} event for arc ${arcId}`,
      {
        arcId,
        eventType: structuredEvent.type,
        severity: structuredEvent.severity,
        signalDirection: structuredEvent.signalDirection,
      },
      'NarrativeEventProcessor'
    );
  }

  return {
    transitioned,
    eventGenerated,
    newState: newState ?? undefined,
  };
}

/**
 * Create an arc state for a question.
 * Returns existing arc ID if one already exists (unique constraint).
 */
export async function createArcState(questionId: string): Promise<string> {
  // First check if arc already exists (idempotent)
  const [existing] = await db
    .select({ id: arcStates.id })
    .from(arcStates)
    .where(eq(arcStates.questionId, questionId))
    .limit(1);

  if (existing) {
    logger.debug(
      `Arc state already exists for question ${questionId}`,
      { arcId: existing.id, questionId },
      'NarrativeEventProcessor'
    );
    return existing.id;
  }

  const id = await generateSnowflakeId();
  const now = new Date();

  try {
    await db.insert(arcStates).values({
      id,
      questionId,
      currentState: 'setup',
      stateEnteredAt: now,
      eventsGenerated: 0,
      pendingTransitions: [],
      createdAt: now,
      updatedAt: now,
    });

    logger.info(
      `Created arc state for question ${questionId}`,
      { arcId: id, questionId },
      'NarrativeEventProcessor'
    );

    return id;
  } catch (error) {
    // Handle unique constraint violation (race condition)
    // Check for Postgres error code 23505 (unique_violation) or fallback to message check
    const isUniqueViolation =
      (error as { code?: string }).code === '23505' ||
      (error instanceof Error && error.message.includes('unique constraint'));

    if (isUniqueViolation) {
      const [racedExisting] = await db
        .select({ id: arcStates.id })
        .from(arcStates)
        .where(eq(arcStates.questionId, questionId))
        .limit(1);

      if (racedExisting) {
        logger.debug(
          `Arc state created by another process for question ${questionId}`,
          { arcId: racedExisting.id, questionId },
          'NarrativeEventProcessor'
        );
        return racedExisting.id;
      }
    }
    throw error;
  }
}

/**
 * Narrative Event Processor Service class
 */
export class NarrativeEventProcessorService {
  getExpectedState(dayNumber: number): ArcStateType {
    return getExpectedState(dayNumber);
  }

  async processArcTick(
    arcId: string,
    dayNumber: number,
    llmClient?: BabylonLLMClient | null
  ): Promise<{
    transitioned: boolean;
    eventGenerated: boolean;
    newState?: ArcStateType;
  }> {
    return processArcTick(arcId, dayNumber, llmClient);
  }

  async createArcState(questionId: string): Promise<string> {
    return createArcState(questionId);
  }
}

// Singleton instance
export const narrativeEventProcessor = new NarrativeEventProcessorService();
