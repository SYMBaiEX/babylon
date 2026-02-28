/**
 * Waitlist Email Bonus API (PLACEHOLDER)
 *
 * @route POST /api/waitlist/bonus/email - Award email bonus
 * @access Authenticated
 *
 * @description
 * PLACEHOLDER: This file is intentionally at /placeholder/email/ so it does NOT
 * serve at the real path. Backend dev must move/copy this to
 * /api/waitlist/bonus/email/route.ts and implement WaitlistService.awardEmailBonus().
 *
 * Awards waitlist bonus points (100 points) for providing an email address.
 * One-time bonus per user. Saves email to users table.
 */

import {
  authenticate,
  successResponse,
  WaitlistService,
  withErrorHandling,
} from '@babylon/api';
import { POINTS } from '@babylon/shared';
import type { NextRequest } from 'next/server';
import { z } from 'zod';

const EmailBonusSchema = z.object({
  email: z.string().email('Valid email is required'),
});

export const POST = withErrorHandling(async (request: NextRequest) => {
  const authUser = await authenticate(request);
  const userId = authUser.userId;

  const body = await request.json();
  const { email } = EmailBonusSchema.parse(body);

  // TODO: Backend must implement WaitlistService.awardEmailBonus()
  // It should:
  // 1. Check if user already has pointsAwardedForEmail flag set
  // 2. Save email to users table
  // 3. Award POINTS.EMAIL_SUBMIT (100) bonus points
  // 4. Create points transaction with reason 'email_submit'
  // 5. Set pointsAwardedForEmail = true
  const awardEmailBonus = (
    WaitlistService as unknown as {
      awardEmailBonus: (userId: string, email: string) => Promise<boolean>;
    }
  ).awardEmailBonus;
  const awarded = await awardEmailBonus(userId, email);

  return successResponse({
    awarded,
    bonusAmount: awarded ? POINTS.EMAIL_SUBMIT : 0,
    message: awarded
      ? 'Email bonus awarded'
      : 'Email bonus already awarded or user not found',
  });
});
