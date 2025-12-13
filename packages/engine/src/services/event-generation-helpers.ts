import { db, type Question, worldEvents } from '@babylon/db';
import { generateSnowflakeId, logger } from '@babylon/shared';
import {
  getArcPlan,
  getPhaseForDay,
  getSignalDirection,
} from './narrative-state-service';
import { toSafeDayNumber } from '../utils/date-utils';

// Minimal question type for event generation (only fields actually used)
// outcome is optional - only used for arc plan signal direction, and the code handles missing outcome
type QuestionForEvent = Pick<Question, 'id' | 'text' | 'questionNumber'> & {
  outcome?: boolean | null;
};

/**
 * Generate simple announcement events based on active questions
 *
 * @description
 * Generates events with signal direction based on the narrative arc plan.
 * Events now have a `pointsToward` field that indicates whether the event
 * suggests YES or NO outcome, following phase-appropriate distributions.
 *
 * @param questions - Active questions to generate events for
 * @param timestamp - Timestamp for the generated events
 * @param currentDay - Current game day (optional, used for arc plan phase detection)
 * @returns Number of events created
 */
export async function generateEvents(
  questions: QuestionForEvent[],
  timestamp: Date,
  currentDay?: number
): Promise<number> {
  if (questions.length === 0) return 0;

  let eventsCreated = 0;
  const eventsToGenerate = Math.min(2, questions.length);

  for (let i = 0; i < eventsToGenerate; i++) {
    const question = questions[i];

    if (!question || !question.text) {
      continue;
    }

    // Validate integer fields to prevent overflow
    const questionNum =
      typeof question.questionNumber === 'number' &&
      Number.isFinite(question.questionNumber) &&
      question.questionNumber >= 0 &&
      question.questionNumber <= 2147483647
        ? question.questionNumber
        : undefined;

    const safeDayNumber =
      typeof currentDay === 'number' ? toSafeDayNumber(currentDay) : undefined;

    // Get arc plan for signal direction
    let pointsToward: 'YES' | 'NO' | null = null;
    if (currentDay !== undefined) {
      const arcPlan = await getArcPlan(question.id);
      if (arcPlan) {
        const phase = getPhaseForDay(currentDay, arcPlan);
        // Events don't have an actor, so pass empty string
        // Use question.outcome if available, default to true
        const outcome = question.outcome ?? true;
        const signal = getSignalDirection(arcPlan, phase, '', outcome);
        pointsToward = signal.direction === 'NEUTRAL' ? null : signal.direction;

        logger.debug(
          'Event signal direction determined',
          {
            questionId: question.id,
            currentDay,
            phase,
            pointsToward,
            outcome,
          },
          'EventGeneration'
        );
      }
    }

    await db.insert(worldEvents).values({
      id: await generateSnowflakeId(),
      eventType: 'announcement',
      description: `Development regarding: ${question.text}`,
      actors: [],
      relatedQuestion: questionNum,
      visibility: 'public',
      gameId: 'continuous',
      dayNumber: safeDayNumber,
      timestamp: timestamp,
      pointsToward,
    });
    eventsCreated++;
  }

  return eventsCreated;
}
