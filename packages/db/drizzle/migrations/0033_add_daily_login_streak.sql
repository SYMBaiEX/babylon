-- Migration: Add daily login streak tracking fields to User table
-- Purpose: BAB-88 - Daily Login Rewards & Streak System
--
-- DEPLOYMENT: This migration MUST run BEFORE deploying the API code that uses these columns.
-- ROLLBACK: See 0033_rollback_add_daily_login_streak.sql
--
-- Fields:
--   dailyLoginStreak: Current consecutive login streak (resets after 36h grace period)
--   lastDailyLogin: Timestamp of last successful daily reward claim
--   longestStreak: All-time longest streak achieved by user
--   totalDailyLogins: Lifetime count of daily reward claims
--
-- Logic (handled in application):
--   - User can claim once every 24 hours minimum
--   - 36-hour grace period: if user doesn't claim within 36h, streak resets
--   - Streak increments on each successful claim within the grace period

-- Add daily login streak fields
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "dailyLoginStreak" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "lastDailyLogin" TIMESTAMP;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "longestStreak" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "totalDailyLogins" INTEGER NOT NULL DEFAULT 0;

-- Index for leaderboard/stats queries on streak
CREATE INDEX IF NOT EXISTS "User_dailyLoginStreak_idx" ON "User" ("dailyLoginStreak");
CREATE INDEX IF NOT EXISTS "User_longestStreak_idx" ON "User" ("longestStreak");

-- Index for finding users with active streaks (for analytics)
CREATE INDEX IF NOT EXISTS "User_lastDailyLogin_idx" ON "User" ("lastDailyLogin");
