/**
 * Content Pacing Configuration
 *
 * Controls the rate and timing of content generation to ensure realistic
 * posting patterns that mimic real social media behavior.
 *
 * @module engine/config/content-pacing
 *
 * @description
 * **Problem Solved:**
 * Without pacing controls, all actors post at maximum rate every tick, creating
 * an unrealistic flood of content that makes feeds overwhelming.
 *
 * **Pacing Mechanisms:**
 * 1. **Time-of-Day Multiplier** - Off-peak hours (9pm-9am) have reduced activity
 * 2. **Per-Actor Daily Limits** - Each actor can only post N times per day
 * 3. **Minimum Post Interval** - Actors must wait between posts
 * 4. **Global Per-Tick Limits** - Cap total posts per tick
 *
 * @example
 * ```typescript
 * import { CONTENT_PACING, getTimeOfDayMultiplier, shouldActorPost } from './config/content-pacing';
 *
 * // Check if actor should post based on pacing rules
 * if (!shouldActorPost(actorId, lastPostTime, dailyPostCount)) {
 *   return; // Skip this actor
 * }
 * ```
 */

/**
 * Content pacing configuration constants
 */
export const CONTENT_PACING = {
  /**
   * Activity multiplier during peak hours (9am-9pm local time).
   * 1.0 = full activity
   */
  peakHoursMultiplier: 1.0,

  /**
   * Activity multiplier during off-peak hours (9pm-9am local time).
   * Lower values reduce the probability of content generation.
   */
  offPeakMultiplier: 0.3,

  /**
   * Maximum posts any single actor can make in a 24-hour period.
   * Prevents any character from dominating the feed.
   */
  maxPostsPerActorPerDay: 5,

  /**
   * Minimum time in milliseconds between posts from the same actor.
   * 30 minutes = 1800000ms
   */
  minTimeBetweenPostsMs: 30 * 60 * 1000,

  /**
   * Maximum posts to generate across all actors in a single tick.
   * Prevents overwhelming the feed during any single tick.
   */
  maxPostsPerTick: 5,

  /**
   * Target number of posts per hour across all actors.
   * Used for probabilistic generation decisions.
   */
  targetPostsPerHour: 12,

  /**
   * Hours that count as "peak" for activity multiplier.
   * Default: 9am to 9pm (21:00)
   */
  peakHourStart: 9,
  peakHourEnd: 21,
} as const;

/**
 * Get the activity multiplier based on current hour.
 *
 * @param hour - Hour in 24h format (0-23). Defaults to current hour.
 * @returns Multiplier value (0.0-1.0) for content generation probability
 */
export function getTimeOfDayMultiplier(hour?: number): number {
  const currentHour = hour ?? new Date().getHours();

  const isPeakHour =
    currentHour >= CONTENT_PACING.peakHourStart &&
    currentHour < CONTENT_PACING.peakHourEnd;

  return isPeakHour
    ? CONTENT_PACING.peakHoursMultiplier
    : CONTENT_PACING.offPeakMultiplier;
}

/**
 * Check if an actor should post based on pacing rules.
 *
 * Evaluates:
 * 1. Daily post limit not exceeded
 * 2. Minimum time since last post has passed
 * 3. Time-of-day probability check
 *
 * @param lastPostTime - When the actor last posted (or null if never)
 * @param dailyPostCount - How many posts the actor has made today
 * @param hour - Current hour (0-23), defaults to current time
 * @returns True if actor should be allowed to post
 */
export function shouldActorPost(
  lastPostTime: Date | null,
  dailyPostCount: number,
  hour?: number
): boolean {
  // Check daily limit
  if (dailyPostCount >= CONTENT_PACING.maxPostsPerActorPerDay) {
    return false;
  }

  // Check minimum interval between posts
  if (lastPostTime) {
    const timeSinceLastPost = Date.now() - lastPostTime.getTime();
    if (timeSinceLastPost < CONTENT_PACING.minTimeBetweenPostsMs) {
      return false;
    }
  }

  // Time-of-day probability check
  const multiplier = getTimeOfDayMultiplier(hour);
  if (multiplier < 1.0 && Math.random() > multiplier) {
    return false;
  }

  return true;
}

/**
 * Calculate how many posts should be generated this tick based on pacing.
 *
 * Uses probabilistic selection to maintain target posts per hour
 * while respecting the per-tick maximum.
 *
 * @param eligibleActorCount - Number of actors that passed individual pacing checks
 * @param ticksPerHour - How many ticks occur per hour (default: 60 for 1-minute ticks)
 * @returns Number of posts to generate (0 to maxPostsPerTick)
 */
export function calculatePostsForTick(
  eligibleActorCount: number,
  ticksPerHour: number = 60
): number {
  const targetPostsPerTick = CONTENT_PACING.targetPostsPerHour / ticksPerHour;

  // Use the minimum of eligible actors and calculated target
  const calculatedPosts = Math.min(
    eligibleActorCount,
    Math.ceil(targetPostsPerTick)
  );

  // Apply the per-tick maximum
  return Math.min(calculatedPosts, CONTENT_PACING.maxPostsPerTick);
}

/**
 * Check if the current date is a new day compared to a reference date.
 * Used for resetting daily post counts.
 *
 * @param referenceDate - The date to compare against
 * @param currentDate - Current date (defaults to now)
 * @returns True if currentDate is a different calendar day than referenceDate
 */
export function isNewDay(referenceDate: Date, currentDate?: Date): boolean {
  const now = currentDate ?? new Date();
  return (
    now.getFullYear() !== referenceDate.getFullYear() ||
    now.getMonth() !== referenceDate.getMonth() ||
    now.getDate() !== referenceDate.getDate()
  );
}
