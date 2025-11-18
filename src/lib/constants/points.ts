/**
 * Points Constants
 * 
 * @description Point award amounts for various actions in the rewards system.
 * Extracted to avoid bundling Prisma into client components. These constants
 * define the point values awarded for user actions like signup, profile completion,
 * social account linking, and referrals.
 */

/**
 * Point award amounts for various user actions
 * 
 * @description Defines the number of points awarded for different user actions
 * in the rewards system. Used by the points service to calculate rewards.
 */
export const POINTS = {
  INITIAL_SIGNUP: 1000,
  PROFILE_COMPLETION: 1000, // Username + Profile Image + Bio (consolidated)
  FARCASTER_LINK: 1000,
  TWITTER_LINK: 1000,
  WALLET_CONNECT: 1000,
  SHARE_ACTION: 1000,
  SHARE_TO_TWITTER: 1000,
  REFERRAL_SIGNUP: 250, // Reward for referrer
  REFERRAL_BONUS: 250,  // Bonus for new user who used a referral code
} as const;

/**
 * Valid reasons for point transactions
 * 
 * @description Enumeration of all valid reasons for awarding or deducting points.
 * Used in balance transactions and points service to track point movements.
 */
export type PointsReason =
  | 'initial_signup'
  | 'profile_completion'
  | 'farcaster_link'
  | 'twitter_link'
  | 'wallet_connect'
  | 'share_action'
  | 'share_to_twitter'
  | 'referral_signup'
  | 'referral_bonus'
  | 'admin_award'
  | 'admin_deduction'
  | 'purchase'
  | 'transfer_sent'
  | 'transfer_received'
  | 'report_reward'; // Reward for successful reporting of CSAM/scammer

