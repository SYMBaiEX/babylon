-- Create enum for realtime outbox status if it does not exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'RealtimeOutboxStatus') THEN
    CREATE TYPE "RealtimeOutboxStatus" AS ENUM ('pending', 'sent', 'failed');
  END IF;
END$$;

-- Create RealtimeOutbox table
CREATE TABLE IF NOT EXISTS "RealtimeOutbox" (
  "id" TEXT PRIMARY KEY,
  "channel" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "version" TEXT DEFAULT 'v1',
  "payload" JSONB NOT NULL,
  "status" "RealtimeOutboxStatus" NOT NULL DEFAULT 'pending',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for outbox lookups
CREATE INDEX IF NOT EXISTS "RealtimeOutbox_status_createdAt_idx" ON "RealtimeOutbox" ("status", "createdAt");
CREATE INDEX IF NOT EXISTS "RealtimeOutbox_channel_status_idx" ON "RealtimeOutbox" ("channel", "status");

-- Align expected User indexes with actual DB state
CREATE INDEX IF NOT EXISTS "User_registrationIpHash_idx" ON "User" ("registrationIpHash");
CREATE INDEX IF NOT EXISTS "User_lastReferralIpHash_idx" ON "User" ("lastReferralIpHash");
