-- Rollback Migration: Remove range partitioning from Posts and Comments tables
-- 
-- This migration reverses the partitioning changes and restores the original tables.
-- 
-- IMPORTANT: This rollback should only be run if:
-- 1. The partitioned tables haven't been made primary yet
-- 2. Or data can be safely migrated back to unpartitioned tables

-- Drop partitioned Comment tables and indexes
DROP TABLE IF EXISTS "Comment_partitioned" CASCADE;

-- Drop partitioned Post tables and indexes
DROP TABLE IF EXISTS "Post_partitioned" CASCADE;

-- Drop the partition creation function
DROP FUNCTION IF EXISTS create_future_partitions();

-- If the old tables were renamed, restore them:
-- ALTER TABLE "Post_unpartitioned" RENAME TO "Post";
-- ALTER TABLE "Comment_unpartitioned" RENAME TO "Comment";
