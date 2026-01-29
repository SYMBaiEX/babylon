-- Rollback Migration: Remove targetIds column from Message table
-- Use this to undo migration 0030_add_message_target_ids.sql

-- ============================================================================
-- Step 1: Drop index
-- ============================================================================

DROP INDEX IF EXISTS "Message_targetIds_idx";

-- ============================================================================
-- Step 2: Drop column
-- ============================================================================

ALTER TABLE "Message" DROP COLUMN IF EXISTS "targetIds";
