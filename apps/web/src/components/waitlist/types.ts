/**
 * Waitlist and leaderboard types for the ComingSoon component system.
 * Extracted for reuse across dashboard, hooks, and modal components.
 */

/**
 * Waitlist data structure containing user position and points information.
 */
export interface WaitlistData {
  position: number;
  leaderboardRank: number;
  waitlistPosition: number;
  totalAhead: number;
  totalCount: number;
  percentile: number;
  inviteCode: string;
  points: number;
  pointsBreakdown: {
    total: number;
    invite: number;
    earned: number;
    bonus: number;
    base: number;
  };
  referralCount: number;
  weeklyReferralCount?: number;
  weeklyLimit?: number;
  invitedCount?: number;
  qualifiedCount?: number;
  totalReferralPoints?: number;
  invitedUsers?: ReferralUser[];
  qualifiedUsers?: ReferralUser[];
}

/**
 * Top user structure for leaderboard display.
 */
export interface TopUser {
  id: string;
  username: string | null;
  displayName: string | null;
  profileImageUrl: string | null;
  invitePoints: number;
  reputationPoints: number;
  referralCount: number;
  rank: number;
}

/**
 * Referral user structure for invited/qualified users display.
 */
export interface ReferralUser {
  id: string;
  username: string | null;
  displayName: string | null;
  profileImageUrl: string | null;
  email?: string | null;
  farcasterUsername?: string | null;
  twitterUsername?: string | null;
  createdAt: string;
  completedAt?: string;
  status: 'pending' | 'qualified';
}

/**
 * Profile form state for user profile editing.
 */
export interface ProfileFormState {
  username: string;
  displayName: string;
  bio: string;
  profileImageUrl: string;
  coverImageUrl: string;
}

/**
 * Username validation status.
 */
export type UsernameStatus = 'available' | 'taken' | null;

/**
 * Leaderboard tab options.
 */
export type LeaderboardTab = 'leaderboard' | 'inviters';

/**
 * Referral tab options.
 */
export type ReferralTab = 'pending' | 'qualified';
