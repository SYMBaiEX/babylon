import { db, type Question, worldEvents } from '@babylon/db';
import { generateSnowflakeId } from '@babylon/shared';

// Minimal question type for event generation (only fields actually used)
type QuestionForEvent = Pick<Question, 'id' | 'text' | 'questionNumber'>;

/**
 * Generate simple announcement events based on active questions
 */
export async function generateEvents(
  questions: QuestionForEvent[],
  timestamp: Date
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

    const dayNum = Math.floor(Date.now() / (1000 * 60 * 60 * 24));
    const safeDayNumber =
      dayNum >= 0 && dayNum <= 2147483647 ? dayNum : undefined;

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
    });
    eventsCreated++;
  }

  return eventsCreated;
}

