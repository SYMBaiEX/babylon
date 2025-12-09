/**
 * Narrative State Service - Arc plan persistence
 *
 * Uses @babylon/db as the unified interface for storage.
 * Works with both PostgreSQL and JSON backends.
 */

import { db } from '@babylon/db';
import { generateSnowflakeId, logger } from '@babylon/shared';
import type { QuestionArcPlan as ArcPlanType } from './question-arc-planner';

/** Calculate signal ratio from phase targets */
const ratio = (correct: number, wrong: number) => correct / (correct + wrong);

/** Save arc plan for a question */
export async function saveArcPlan(
  questionId: string,
  arc: ArcPlanType
): Promise<void> {
  await db.questionArcPlan.create({
    data: {
      id: await generateSnowflakeId(),
      questionId,
      uncertaintyPeakDay: arc.uncertaintyPeakDay,
      clarityOnsetDay: arc.clarityOnsetDay,
      verificationDay: arc.verificationDay,
      insiderActorIds: arc.insiders,
      deceiverActorIds: arc.deceivers,
      phaseRatios: {
        early: ratio(
          arc.phases.early.targetCorrectSignals,
          arc.phases.early.targetWrongSignals
        ),
        middle: ratio(
          arc.phases.middle.targetCorrectSignals,
          arc.phases.middle.targetWrongSignals
        ),
        late: ratio(
          arc.phases.late.targetCorrectSignals,
          arc.phases.late.targetWrongSignals
        ),
        climax: 1.0,
      },
      createdAt: new Date(),
    },
  });
  logger.info('Saved arc plan', { questionId }, 'NarrativeStateService');
}

/** Get arc plan for a question */
export async function getArcPlan(questionId: string) {
  return db.questionArcPlan.findFirst({
    where: { questionId },
  });
}
