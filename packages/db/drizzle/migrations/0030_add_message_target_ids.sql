-- Migration: Add targetIds column and coordinator message type
-- Purpose: Enable message routing in team chat by tracking which agents/coordinator a message targets
--
-- This allows:
-- - User messages without @mentions to target 'coordinator'
-- - User messages with @mentions to target specific agent IDs
-- - Proper filtering in recentMessages providers for scoped context
-- - Coordinator messages to be identified by their type in addition to senderId

-- ============================================================================
-- Step 1: Add 'coordinator' to message_type enum
-- ============================================================================

-- Add 'coordinator' value to the message_type enum for coordinator assistant messages
ALTER TYPE "message_type" ADD VALUE IF NOT EXISTS 'coordinator';

-- ============================================================================
-- Step 2: Add targetIds column
-- ============================================================================

-- Add nullable text array column for target IDs
-- NULL for non-team-chat messages and agent/coordinator responses
-- Contains ['coordinator'] for messages without @mentions
-- Contains agent IDs for messages with @mentions
ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "targetIds" TEXT[];

-- ============================================================================
-- Step 2: Create index for efficient array lookups
-- ============================================================================

-- GIN index for efficient ANY() queries on the array
CREATE INDEX IF NOT EXISTS "Message_targetIds_idx" ON "Message" USING GIN ("targetIds");
