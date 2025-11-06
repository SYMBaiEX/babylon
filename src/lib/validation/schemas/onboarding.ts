import { z } from 'zod'
import { UsernameSchema } from './common'

export const OnboardingProfileSchema = z.object({
  username: UsernameSchema,
  displayName: z.string().trim().min(1, 'Display name is required').max(80, 'Display name must be at most 80 characters'),
  bio: z
    .string()
    .trim()
    .max(280, 'Bio must be at most 280 characters')
    .optional()
    .or(z.literal('').transform(() => undefined)),
  profileImageUrl: z
    .string()
    .url('Profile image must be a valid URL')
    .optional()
    .or(z.literal('').transform(() => undefined))
    .nullable(),
  coverImageUrl: z
    .string()
    .url('Cover image must be a valid URL')
    .optional()
    .or(z.literal('').transform(() => undefined))
    .nullable(),
})

export const OnboardingIntentIdSchema = z.object({
  intentId: z.string().uuid('Invalid onboarding intent id'),
})
