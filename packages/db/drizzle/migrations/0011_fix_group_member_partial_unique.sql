-- Migration: Fix GroupMember unique constraint for soft deletes
-- Issue: The current unique constraint on (groupId, userId) prevents users from rejoining groups
-- after leaving because inactive records still exist.
-- Solution: Use a partial unique index that only enforces uniqueness for active members.

-- Step 1: Drop the existing unique constraint
ALTER TABLE "GroupMember" DROP CONSTRAINT IF EXISTS "GroupMember_groupId_userId_key";

-- Step 2: Create a partial unique index that only applies to active members
-- This allows multiple inactive records (history) but ensures only one active member per group
CREATE UNIQUE INDEX "GroupMember_groupId_userId_active_key" 
ON "GroupMember" ("groupId", "userId") 
WHERE "isActive" = true;

-- Step 3: Add a comment to document this pattern
COMMENT ON INDEX "GroupMember_groupId_userId_active_key" IS 
'Partial unique index: only one active member per (groupId, userId). Inactive records are allowed for history.';
