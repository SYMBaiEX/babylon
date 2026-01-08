-- Migration: Add Procedural Narrative System
-- PR #0: AI procedural narrative system with perpetuals and prediction markets integration
-- 
-- This migration adds:
-- 1. GameOnboarding table for tutorial progression
-- 2. QuestionArcPlan table for narrative arc configuration
-- 3. ArcState table for narrative state machine
-- 4. ActorState columns for activity tracking
-- 5. OrganizationState columns for narrative-driven pricing

-- ============================================================================
-- 1. GameOnboarding Table
-- ============================================================================
CREATE TABLE IF NOT EXISTS "GameOnboarding" (
    "id" TEXT PRIMARY KEY,
    "userId" TEXT NOT NULL UNIQUE,
    "currentStep" TEXT NOT NULL DEFAULT 'welcome',
    "state" JSONB DEFAULT '{"completedSteps":[],"currentStep":"welcome","startedAt":null,"completedAt":null,"rewards":[]}'::jsonb,
    "isComplete" BOOLEAN NOT NULL DEFAULT false,
    "skippedAt" TIMESTAMP,
    "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Note: GameOnboarding_userId_idx is not needed because userId is UNIQUE (implicit index)
CREATE INDEX IF NOT EXISTS "GameOnboarding_isComplete_idx" ON "GameOnboarding" ("isComplete");
CREATE INDEX IF NOT EXISTS "GameOnboarding_currentStep_idx" ON "GameOnboarding" ("currentStep");

-- ============================================================================
-- 2. QuestionArcPlan Table
-- ============================================================================
CREATE TABLE IF NOT EXISTS "QuestionArcPlan" (
    "id" TEXT PRIMARY KEY,
    "questionId" TEXT NOT NULL REFERENCES "Market" ("id") ON DELETE CASCADE,
    "uncertaintyPeakDay" INTEGER NOT NULL,
    "clarityOnsetDay" INTEGER NOT NULL,
    "verificationDay" INTEGER NOT NULL,
    "insiderActorIds" JSONB DEFAULT '[]'::jsonb,
    "deceiverActorIds" JSONB DEFAULT '[]'::jsonb,
    "phaseRatios" JSONB NOT NULL,
    "createdAt" TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "QuestionArcPlan_questionId_idx" ON "QuestionArcPlan" ("questionId");

-- ============================================================================
-- 3. ArcState Table
-- ============================================================================
CREATE TABLE IF NOT EXISTS "ArcState" (
    "id" TEXT PRIMARY KEY,
    "questionId" TEXT NOT NULL REFERENCES "Market" ("id") ON DELETE CASCADE,
    "currentState" TEXT NOT NULL,
    "stateEnteredAt" TIMESTAMP NOT NULL,
    "eventsGenerated" INTEGER NOT NULL DEFAULT 0,
    "lastEventAt" TIMESTAMP,
    "pendingTransitions" JSONB DEFAULT '[]'::jsonb,
    "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Note: ArcState_questionId_idx is not needed because ArcState_questionId_unique provides the same coverage
CREATE INDEX IF NOT EXISTS "ArcState_currentState_idx" ON "ArcState" ("currentState");
CREATE UNIQUE INDEX IF NOT EXISTS "ArcState_questionId_unique" ON "ArcState" ("questionId");

-- ============================================================================
-- 4. ActorState columns for activity tracking
-- ============================================================================
-- Add new columns if they don't exist (safe idempotent migration)
DO $$ 
BEGIN
    -- Activity tracking columns
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'ActorState' AND column_name = 'lastPostAt') THEN
        ALTER TABLE "ActorState" ADD COLUMN "lastPostAt" TIMESTAMP;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'ActorState' AND column_name = 'lastActiveAt') THEN
        ALTER TABLE "ActorState" ADD COLUMN "lastActiveAt" TIMESTAMP;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'ActorState' AND column_name = 'postsToday') THEN
        ALTER TABLE "ActorState" ADD COLUMN "postsToday" INTEGER NOT NULL DEFAULT 0;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'ActorState' AND column_name = 'postsTodayResetAt') THEN
        ALTER TABLE "ActorState" ADD COLUMN "postsTodayResetAt" TIMESTAMP;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'ActorState' AND column_name = 'currentMood') THEN
        ALTER TABLE "ActorState" ADD COLUMN "currentMood" DECIMAL(4,3) DEFAULT '0';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'ActorState' AND column_name = 'recentMemories') THEN
        ALTER TABLE "ActorState" ADD COLUMN "recentMemories" JSONB DEFAULT '[]'::jsonb;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'ActorState' AND column_name = 'relationships') THEN
        ALTER TABLE "ActorState" ADD COLUMN "relationships" JSONB DEFAULT '{}'::jsonb;
    END IF;
END $$;

-- Create indexes for ActorState activity columns
CREATE INDEX IF NOT EXISTS "ActorState_lastPostAt_idx" ON "ActorState" ("lastPostAt");
CREATE INDEX IF NOT EXISTS "ActorState_lastActiveAt_idx" ON "ActorState" ("lastActiveAt");

-- ============================================================================
-- 5. OrganizationState columns for narrative-driven pricing
-- ============================================================================
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'OrganizationState' AND column_name = 'basePrice') THEN
        ALTER TABLE "OrganizationState" ADD COLUMN "basePrice" DOUBLE PRECISION;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'OrganizationState' AND column_name = 'sentiment') THEN
        ALTER TABLE "OrganizationState" ADD COLUMN "sentiment" INTEGER DEFAULT 0;
        -- Backfill any NULL values to 0 and make column NOT NULL
        UPDATE "OrganizationState" SET "sentiment" = 0 WHERE "sentiment" IS NULL;
        ALTER TABLE "OrganizationState" ALTER COLUMN "sentiment" SET NOT NULL;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'OrganizationState' AND column_name = 'activeModifiers') THEN
        ALTER TABLE "OrganizationState" ADD COLUMN "activeModifiers" JSONB DEFAULT '[]'::jsonb;
    END IF;
END $$;

-- Create indexes for OrganizationState
CREATE INDEX IF NOT EXISTS "OrganizationState_sentiment_idx" ON "OrganizationState" ("sentiment");
