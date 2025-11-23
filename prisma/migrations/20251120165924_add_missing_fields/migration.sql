-- AlterTable - Add columns first
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "pointsAwardedForShare" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "pointsAwardedForPrivateGroup" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "pointsAwardedForPrivateChannel" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "registrationIpHash" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "lastReferralIpHash" TEXT;
ALTER TABLE "Referral" ADD COLUMN IF NOT EXISTS "suspiciousReferralFlags" JSONB;
