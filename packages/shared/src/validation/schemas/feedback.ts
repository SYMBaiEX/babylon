/**
 * Game Feedback Validation Schema
 *
 * Shared schema for validating game feedback submissions.
 * Used by both the API route and test files.
 */

import { z } from 'zod';

export const FeedbackTypeSchema = z.enum([
  'bug',
  'feature_request',
  'performance',
]);
export type FeedbackType = z.infer<typeof FeedbackTypeSchema>;

export const GameFeedbackSchema = z
  .object({
    feedbackType: FeedbackTypeSchema,
    description: z
      .string()
      .min(10, 'Description must be at least 10 characters')
      .max(5000),
    stepsToReproduce: z.string().max(2000).optional(),
    screenshotUrl: z.string().url().optional().or(z.literal('')),
    rating: z.number().int().min(1).max(5).optional(),
  })
  .refine((data) => data.feedbackType !== 'bug' || !!data.stepsToReproduce, {
    message: 'Steps to reproduce are required for bug reports',
    path: ['stepsToReproduce'],
  })
  .refine(
    (data) =>
      data.feedbackType !== 'feature_request' || data.rating !== undefined,
    {
      message: 'Rating is required for feature requests',
      path: ['rating'],
    }
  );

export type GameFeedback = z.infer<typeof GameFeedbackSchema>;
