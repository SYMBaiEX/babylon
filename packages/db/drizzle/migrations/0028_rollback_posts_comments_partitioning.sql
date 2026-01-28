-- Rollback Migration: Remove range partitioning from Posts and Comments tables
-- 
-- This migration reverses the partitioning changes and restores the original tables.
-- 
-- IMPORTANT: This rollback should only be run if:
-- 1. The partitioned tables haven't been made primary yet (table swap not done)
-- 2. Or if you're prepared to migrate data back to unpartitioned tables
--
-- WARNING: If the table swap has already occurred (Post_partitioned renamed to Post),
-- dropping the partitioned tables will DELETE ALL DATA. In this case:
-- 1. First migrate data back to unpartitioned tables
-- 2. Then run this rollback
--
-- This rollback uses "Post_unpartitioned" and "Comment_unpartitioned" as the original
-- table names (matching the forward migration's rename convention).

-- ============================================================================
-- Safety Check: Verify state before proceeding
-- ============================================================================

DO $$
DECLARE
    partitioned_is_primary BOOLEAN := FALSE;
    unpartitioned_exists BOOLEAN := FALSE;
BEGIN
    -- Check if Post_partitioned has been renamed to Post (swap already done)
    SELECT EXISTS(
        SELECT 1 FROM pg_class c
        JOIN pg_namespace n ON c.relnamespace = n.oid
        WHERE c.relname = 'Post' 
        AND c.relkind = 'p'  -- 'p' = partitioned table
    ) INTO partitioned_is_primary;

    -- Check if unpartitioned backup tables exist
    SELECT EXISTS(
        SELECT 1 FROM pg_class 
        WHERE relname = 'Post_unpartitioned'
    ) INTO unpartitioned_exists;

    IF partitioned_is_primary AND NOT unpartitioned_exists THEN
        RAISE EXCEPTION 'UNSAFE ROLLBACK: Post_partitioned is currently the primary table and no backup exists. '
            'Data migration back to unpartitioned table required before rollback. '
            'Create "Post_unpartitioned" and "Comment_unpartitioned" tables and migrate data first.';
    END IF;

    IF partitioned_is_primary THEN
        RAISE NOTICE 'Table swap has occurred. Will restore from *_unpartitioned tables after dropping partitioned tables.';
    ELSE
        RAISE NOTICE 'Table swap has NOT occurred. Safe to drop partitioned staging tables.';
    END IF;
END $$;

-- ============================================================================
-- Step 1: Drop partitioned tables (only if safe)
-- ============================================================================

-- Drop partitioned Comment tables and indexes
DROP TABLE IF EXISTS "Comment_partitioned" CASCADE;

-- Drop partitioned Post tables and indexes  
DROP TABLE IF EXISTS "Post_partitioned" CASCADE;

-- Drop the partition creation function
DROP FUNCTION IF EXISTS create_future_partitions();

-- ============================================================================
-- Step 2: Restore original tables if swap occurred
-- ============================================================================

-- If the old tables were renamed during migration, restore them:
-- These are commented out because they should only run if swap occurred.
-- Uncomment if needed:

-- DO $$
-- BEGIN
--     IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'Post_unpartitioned') THEN
--         ALTER TABLE "Post_unpartitioned" RENAME TO "Post";
--         RAISE NOTICE 'Restored Post from Post_unpartitioned';
--     END IF;
--     
--     IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'Comment_unpartitioned') THEN
--         ALTER TABLE "Comment_unpartitioned" RENAME TO "Comment";
--         RAISE NOTICE 'Restored Comment from Comment_unpartitioned';
--     END IF;
-- END $$;
