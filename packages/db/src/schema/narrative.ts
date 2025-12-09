import { relations } from 'drizzle-orm';
import { index, integer, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { questions } from './markets';

/**
 * QuestionArcPlan - Narrative arc configuration for a prediction question.
 * Stores timing milestones and actor assignments for signal generation.
 */
export const questionArcPlans = pgTable(
  'QuestionArcPlan',
  {
    id: text('id').primaryKey(),
    questionId: text('questionId')
      .notNull()
      .references(() => questions.id, { onDelete: 'cascade' }),

    // Narrative timing (day numbers)
    uncertaintyPeakDay: integer('uncertaintyPeakDay').notNull(),
    clarityOnsetDay: integer('clarityOnsetDay').notNull(),
    verificationDay: integer('verificationDay').notNull(),

    // Actor assignments
    insiderActorIds: jsonb('insiderActorIds').$type<string[]>().default([]),
    deceiverActorIds: jsonb('deceiverActorIds').$type<string[]>().default([]),

    // Phase signal ratios (correctSignals / totalSignals)
    phaseRatios: jsonb('phaseRatios')
      .$type<{ early: number; middle: number; late: number; climax: number }>()
      .notNull(),

    createdAt: timestamp('createdAt', { mode: 'date' }).notNull().defaultNow(),
  },
  (t) => [index('QuestionArcPlan_questionId_idx').on(t.questionId)]
);

export const questionArcPlansRelations = relations(questionArcPlans, ({ one }) => ({
  question: one(questions, {
    fields: [questionArcPlans.questionId],
    references: [questions.id],
  }),
}));

export type QuestionArcPlan = typeof questionArcPlans.$inferSelect;
export type NewQuestionArcPlan = typeof questionArcPlans.$inferInsert;
