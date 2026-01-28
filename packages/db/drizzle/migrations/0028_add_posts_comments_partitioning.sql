-- Migration: Add range partitioning to Posts and Comments tables
-- Purpose: Optimize query performance for 400k+ users by partitioning large tables by month
-- 
-- IMPORTANT: This migration requires careful execution:
-- 1. Should be run during a maintenance window
-- 2. Data migration may take significant time depending on table size
-- 3. Test in staging environment first
--
-- Rollback: See 0028_rollback_posts_comments_partitioning.sql

-- ============================================================================
-- Step 1: Create partitioned Post table
-- ============================================================================

-- Create the new partitioned table structure
CREATE TABLE IF NOT EXISTS "Post_partitioned" (
    id text NOT NULL,
    content text NOT NULL,
    "authorId" text NOT NULL,
    "gameId" text,
    "dayNumber" integer,
    timestamp timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "articleTitle" text,
    "articleContent" text,
    "originalPostId" text,
    "commentOnPostId" text,
    hashtags text[],
    "editedAt" timestamp,
    "deletedAt" timestamp,
    "articleImageUrl" text,
    "lastActivityAt" timestamp DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id, timestamp)
) PARTITION BY RANGE (timestamp);

-- Create partitions for historical and future data
-- Historical partitions (covering existing data)
CREATE TABLE IF NOT EXISTS "Post_2024_01" PARTITION OF "Post_partitioned"
    FOR VALUES FROM ('2024-01-01') TO ('2024-02-01');
CREATE TABLE IF NOT EXISTS "Post_2024_02" PARTITION OF "Post_partitioned"
    FOR VALUES FROM ('2024-02-01') TO ('2024-03-01');
CREATE TABLE IF NOT EXISTS "Post_2024_03" PARTITION OF "Post_partitioned"
    FOR VALUES FROM ('2024-03-01') TO ('2024-04-01');
CREATE TABLE IF NOT EXISTS "Post_2024_04" PARTITION OF "Post_partitioned"
    FOR VALUES FROM ('2024-04-01') TO ('2024-05-01');
CREATE TABLE IF NOT EXISTS "Post_2024_05" PARTITION OF "Post_partitioned"
    FOR VALUES FROM ('2024-05-01') TO ('2024-06-01');
CREATE TABLE IF NOT EXISTS "Post_2024_06" PARTITION OF "Post_partitioned"
    FOR VALUES FROM ('2024-06-01') TO ('2024-07-01');
CREATE TABLE IF NOT EXISTS "Post_2024_07" PARTITION OF "Post_partitioned"
    FOR VALUES FROM ('2024-07-01') TO ('2024-08-01');
CREATE TABLE IF NOT EXISTS "Post_2024_08" PARTITION OF "Post_partitioned"
    FOR VALUES FROM ('2024-08-01') TO ('2024-09-01');
CREATE TABLE IF NOT EXISTS "Post_2024_09" PARTITION OF "Post_partitioned"
    FOR VALUES FROM ('2024-09-01') TO ('2024-10-01');
CREATE TABLE IF NOT EXISTS "Post_2024_10" PARTITION OF "Post_partitioned"
    FOR VALUES FROM ('2024-10-01') TO ('2024-11-01');
CREATE TABLE IF NOT EXISTS "Post_2024_11" PARTITION OF "Post_partitioned"
    FOR VALUES FROM ('2024-11-01') TO ('2024-12-01');
CREATE TABLE IF NOT EXISTS "Post_2024_12" PARTITION OF "Post_partitioned"
    FOR VALUES FROM ('2024-12-01') TO ('2025-01-01');

-- 2025 partitions
CREATE TABLE IF NOT EXISTS "Post_2025_01" PARTITION OF "Post_partitioned"
    FOR VALUES FROM ('2025-01-01') TO ('2025-02-01');
CREATE TABLE IF NOT EXISTS "Post_2025_02" PARTITION OF "Post_partitioned"
    FOR VALUES FROM ('2025-02-01') TO ('2025-03-01');
CREATE TABLE IF NOT EXISTS "Post_2025_03" PARTITION OF "Post_partitioned"
    FOR VALUES FROM ('2025-03-01') TO ('2025-04-01');
CREATE TABLE IF NOT EXISTS "Post_2025_04" PARTITION OF "Post_partitioned"
    FOR VALUES FROM ('2025-04-01') TO ('2025-05-01');
CREATE TABLE IF NOT EXISTS "Post_2025_05" PARTITION OF "Post_partitioned"
    FOR VALUES FROM ('2025-05-01') TO ('2025-06-01');
CREATE TABLE IF NOT EXISTS "Post_2025_06" PARTITION OF "Post_partitioned"
    FOR VALUES FROM ('2025-06-01') TO ('2025-07-01');
CREATE TABLE IF NOT EXISTS "Post_2025_07" PARTITION OF "Post_partitioned"
    FOR VALUES FROM ('2025-07-01') TO ('2025-08-01');
CREATE TABLE IF NOT EXISTS "Post_2025_08" PARTITION OF "Post_partitioned"
    FOR VALUES FROM ('2025-08-01') TO ('2025-09-01');
CREATE TABLE IF NOT EXISTS "Post_2025_09" PARTITION OF "Post_partitioned"
    FOR VALUES FROM ('2025-09-01') TO ('2025-10-01');
CREATE TABLE IF NOT EXISTS "Post_2025_10" PARTITION OF "Post_partitioned"
    FOR VALUES FROM ('2025-10-01') TO ('2025-11-01');
CREATE TABLE IF NOT EXISTS "Post_2025_11" PARTITION OF "Post_partitioned"
    FOR VALUES FROM ('2025-11-01') TO ('2025-12-01');
CREATE TABLE IF NOT EXISTS "Post_2025_12" PARTITION OF "Post_partitioned"
    FOR VALUES FROM ('2025-12-01') TO ('2026-01-01');

-- 2026 partitions (current year + future)
CREATE TABLE IF NOT EXISTS "Post_2026_01" PARTITION OF "Post_partitioned"
    FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');
CREATE TABLE IF NOT EXISTS "Post_2026_02" PARTITION OF "Post_partitioned"
    FOR VALUES FROM ('2026-02-01') TO ('2026-03-01');
CREATE TABLE IF NOT EXISTS "Post_2026_03" PARTITION OF "Post_partitioned"
    FOR VALUES FROM ('2026-03-01') TO ('2026-04-01');
CREATE TABLE IF NOT EXISTS "Post_2026_04" PARTITION OF "Post_partitioned"
    FOR VALUES FROM ('2026-04-01') TO ('2026-05-01');
CREATE TABLE IF NOT EXISTS "Post_2026_05" PARTITION OF "Post_partitioned"
    FOR VALUES FROM ('2026-05-01') TO ('2026-06-01');
CREATE TABLE IF NOT EXISTS "Post_2026_06" PARTITION OF "Post_partitioned"
    FOR VALUES FROM ('2026-06-01') TO ('2026-07-01');
CREATE TABLE IF NOT EXISTS "Post_2026_07" PARTITION OF "Post_partitioned"
    FOR VALUES FROM ('2026-07-01') TO ('2026-08-01');
CREATE TABLE IF NOT EXISTS "Post_2026_08" PARTITION OF "Post_partitioned"
    FOR VALUES FROM ('2026-08-01') TO ('2026-09-01');
CREATE TABLE IF NOT EXISTS "Post_2026_09" PARTITION OF "Post_partitioned"
    FOR VALUES FROM ('2026-09-01') TO ('2026-10-01');
CREATE TABLE IF NOT EXISTS "Post_2026_10" PARTITION OF "Post_partitioned"
    FOR VALUES FROM ('2026-10-01') TO ('2026-11-01');
CREATE TABLE IF NOT EXISTS "Post_2026_11" PARTITION OF "Post_partitioned"
    FOR VALUES FROM ('2026-11-01') TO ('2026-12-01');
CREATE TABLE IF NOT EXISTS "Post_2026_12" PARTITION OF "Post_partitioned"
    FOR VALUES FROM ('2026-12-01') TO ('2027-01-01');

-- Default partition for any data outside defined ranges
CREATE TABLE IF NOT EXISTS "Post_default" PARTITION OF "Post_partitioned" DEFAULT;

-- ============================================================================
-- Step 2: Create indexes on partitioned Post table
-- ============================================================================

-- These indexes will be created on each partition automatically
CREATE INDEX IF NOT EXISTS "Post_partitioned_authorId_idx" ON "Post_partitioned" ("authorId");
CREATE INDEX IF NOT EXISTS "Post_partitioned_timestamp_idx" ON "Post_partitioned" (timestamp DESC);
CREATE INDEX IF NOT EXISTS "Post_partitioned_authorId_timestamp_idx" ON "Post_partitioned" ("authorId", timestamp DESC);
CREATE INDEX IF NOT EXISTS "Post_partitioned_gameId_idx" ON "Post_partitioned" ("gameId") WHERE "gameId" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "Post_partitioned_originalPostId_idx" ON "Post_partitioned" ("originalPostId") WHERE "originalPostId" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "Post_partitioned_deletedAt_idx" ON "Post_partitioned" ("deletedAt") WHERE "deletedAt" IS NULL;

-- ============================================================================
-- Step 3: Create partitioned Comment table
-- ============================================================================

CREATE TABLE IF NOT EXISTS "Comment_partitioned" (
    id text NOT NULL,
    content text NOT NULL,
    "postId" text NOT NULL,
    "authorId" text NOT NULL,
    "parentCommentId" text,
    "createdAt" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" timestamp,
    PRIMARY KEY (id, "createdAt")
) PARTITION BY RANGE ("createdAt");

-- Create Comment partitions (similar to Post)
-- 2024 partitions
CREATE TABLE IF NOT EXISTS "Comment_2024_01" PARTITION OF "Comment_partitioned"
    FOR VALUES FROM ('2024-01-01') TO ('2024-02-01');
CREATE TABLE IF NOT EXISTS "Comment_2024_02" PARTITION OF "Comment_partitioned"
    FOR VALUES FROM ('2024-02-01') TO ('2024-03-01');
CREATE TABLE IF NOT EXISTS "Comment_2024_03" PARTITION OF "Comment_partitioned"
    FOR VALUES FROM ('2024-03-01') TO ('2024-04-01');
CREATE TABLE IF NOT EXISTS "Comment_2024_04" PARTITION OF "Comment_partitioned"
    FOR VALUES FROM ('2024-04-01') TO ('2024-05-01');
CREATE TABLE IF NOT EXISTS "Comment_2024_05" PARTITION OF "Comment_partitioned"
    FOR VALUES FROM ('2024-05-01') TO ('2024-06-01');
CREATE TABLE IF NOT EXISTS "Comment_2024_06" PARTITION OF "Comment_partitioned"
    FOR VALUES FROM ('2024-06-01') TO ('2024-07-01');
CREATE TABLE IF NOT EXISTS "Comment_2024_07" PARTITION OF "Comment_partitioned"
    FOR VALUES FROM ('2024-07-01') TO ('2024-08-01');
CREATE TABLE IF NOT EXISTS "Comment_2024_08" PARTITION OF "Comment_partitioned"
    FOR VALUES FROM ('2024-08-01') TO ('2024-09-01');
CREATE TABLE IF NOT EXISTS "Comment_2024_09" PARTITION OF "Comment_partitioned"
    FOR VALUES FROM ('2024-09-01') TO ('2024-10-01');
CREATE TABLE IF NOT EXISTS "Comment_2024_10" PARTITION OF "Comment_partitioned"
    FOR VALUES FROM ('2024-10-01') TO ('2024-11-01');
CREATE TABLE IF NOT EXISTS "Comment_2024_11" PARTITION OF "Comment_partitioned"
    FOR VALUES FROM ('2024-11-01') TO ('2024-12-01');
CREATE TABLE IF NOT EXISTS "Comment_2024_12" PARTITION OF "Comment_partitioned"
    FOR VALUES FROM ('2024-12-01') TO ('2025-01-01');

-- 2025 partitions
CREATE TABLE IF NOT EXISTS "Comment_2025_01" PARTITION OF "Comment_partitioned"
    FOR VALUES FROM ('2025-01-01') TO ('2025-02-01');
CREATE TABLE IF NOT EXISTS "Comment_2025_02" PARTITION OF "Comment_partitioned"
    FOR VALUES FROM ('2025-02-01') TO ('2025-03-01');
CREATE TABLE IF NOT EXISTS "Comment_2025_03" PARTITION OF "Comment_partitioned"
    FOR VALUES FROM ('2025-03-01') TO ('2025-04-01');
CREATE TABLE IF NOT EXISTS "Comment_2025_04" PARTITION OF "Comment_partitioned"
    FOR VALUES FROM ('2025-04-01') TO ('2025-05-01');
CREATE TABLE IF NOT EXISTS "Comment_2025_05" PARTITION OF "Comment_partitioned"
    FOR VALUES FROM ('2025-05-01') TO ('2025-06-01');
CREATE TABLE IF NOT EXISTS "Comment_2025_06" PARTITION OF "Comment_partitioned"
    FOR VALUES FROM ('2025-06-01') TO ('2025-07-01');
CREATE TABLE IF NOT EXISTS "Comment_2025_07" PARTITION OF "Comment_partitioned"
    FOR VALUES FROM ('2025-07-01') TO ('2025-08-01');
CREATE TABLE IF NOT EXISTS "Comment_2025_08" PARTITION OF "Comment_partitioned"
    FOR VALUES FROM ('2025-08-01') TO ('2025-09-01');
CREATE TABLE IF NOT EXISTS "Comment_2025_09" PARTITION OF "Comment_partitioned"
    FOR VALUES FROM ('2025-09-01') TO ('2025-10-01');
CREATE TABLE IF NOT EXISTS "Comment_2025_10" PARTITION OF "Comment_partitioned"
    FOR VALUES FROM ('2025-10-01') TO ('2025-11-01');
CREATE TABLE IF NOT EXISTS "Comment_2025_11" PARTITION OF "Comment_partitioned"
    FOR VALUES FROM ('2025-11-01') TO ('2025-12-01');
CREATE TABLE IF NOT EXISTS "Comment_2025_12" PARTITION OF "Comment_partitioned"
    FOR VALUES FROM ('2025-12-01') TO ('2026-01-01');

-- 2026 partitions
CREATE TABLE IF NOT EXISTS "Comment_2026_01" PARTITION OF "Comment_partitioned"
    FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');
CREATE TABLE IF NOT EXISTS "Comment_2026_02" PARTITION OF "Comment_partitioned"
    FOR VALUES FROM ('2026-02-01') TO ('2026-03-01');
CREATE TABLE IF NOT EXISTS "Comment_2026_03" PARTITION OF "Comment_partitioned"
    FOR VALUES FROM ('2026-03-01') TO ('2026-04-01');
CREATE TABLE IF NOT EXISTS "Comment_2026_04" PARTITION OF "Comment_partitioned"
    FOR VALUES FROM ('2026-04-01') TO ('2026-05-01');
CREATE TABLE IF NOT EXISTS "Comment_2026_05" PARTITION OF "Comment_partitioned"
    FOR VALUES FROM ('2026-05-01') TO ('2026-06-01');
CREATE TABLE IF NOT EXISTS "Comment_2026_06" PARTITION OF "Comment_partitioned"
    FOR VALUES FROM ('2026-06-01') TO ('2026-07-01');
CREATE TABLE IF NOT EXISTS "Comment_2026_07" PARTITION OF "Comment_partitioned"
    FOR VALUES FROM ('2026-07-01') TO ('2026-08-01');
CREATE TABLE IF NOT EXISTS "Comment_2026_08" PARTITION OF "Comment_partitioned"
    FOR VALUES FROM ('2026-08-01') TO ('2026-09-01');
CREATE TABLE IF NOT EXISTS "Comment_2026_09" PARTITION OF "Comment_partitioned"
    FOR VALUES FROM ('2026-09-01') TO ('2026-10-01');
CREATE TABLE IF NOT EXISTS "Comment_2026_10" PARTITION OF "Comment_partitioned"
    FOR VALUES FROM ('2026-10-01') TO ('2026-11-01');
CREATE TABLE IF NOT EXISTS "Comment_2026_11" PARTITION OF "Comment_partitioned"
    FOR VALUES FROM ('2026-11-01') TO ('2026-12-01');
CREATE TABLE IF NOT EXISTS "Comment_2026_12" PARTITION OF "Comment_partitioned"
    FOR VALUES FROM ('2026-12-01') TO ('2027-01-01');

-- Default partition
CREATE TABLE IF NOT EXISTS "Comment_default" PARTITION OF "Comment_partitioned" DEFAULT;

-- ============================================================================
-- Step 4: Create indexes on partitioned Comment table
-- ============================================================================

CREATE INDEX IF NOT EXISTS "Comment_partitioned_postId_idx" ON "Comment_partitioned" ("postId");
CREATE INDEX IF NOT EXISTS "Comment_partitioned_authorId_idx" ON "Comment_partitioned" ("authorId");
CREATE INDEX IF NOT EXISTS "Comment_partitioned_createdAt_idx" ON "Comment_partitioned" ("createdAt" DESC);
CREATE INDEX IF NOT EXISTS "Comment_partitioned_postId_createdAt_idx" ON "Comment_partitioned" ("postId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "Comment_partitioned_parentCommentId_idx" ON "Comment_partitioned" ("parentCommentId") WHERE "parentCommentId" IS NOT NULL;

-- ============================================================================
-- Step 5: Create function to auto-create future partitions
-- ============================================================================

CREATE OR REPLACE FUNCTION create_future_partitions()
RETURNS void AS $$
DECLARE
    partition_date DATE;
    partition_name TEXT;
    start_date TEXT;
    end_date TEXT;
BEGIN
    -- Create partitions for the next 3 months if they don't exist
    FOR i IN 0..2 LOOP
        partition_date := DATE_TRUNC('month', CURRENT_DATE + (i || ' months')::INTERVAL);
        
        -- Post partitions
        partition_name := 'Post_' || TO_CHAR(partition_date, 'YYYY_MM');
        start_date := TO_CHAR(partition_date, 'YYYY-MM-DD');
        end_date := TO_CHAR(partition_date + '1 month'::INTERVAL, 'YYYY-MM-DD');
        
        EXECUTE format(
            'CREATE TABLE IF NOT EXISTS %I PARTITION OF "Post_partitioned" FOR VALUES FROM (%L) TO (%L)',
            partition_name, start_date, end_date
        );
        
        -- Comment partitions
        partition_name := 'Comment_' || TO_CHAR(partition_date, 'YYYY_MM');
        
        EXECUTE format(
            'CREATE TABLE IF NOT EXISTS %I PARTITION OF "Comment_partitioned" FOR VALUES FROM (%L) TO (%L)',
            partition_name, start_date, end_date
        );
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- Step 6: Data migration (run separately in production)
-- ============================================================================

-- NOTE: This section should be run in batches during a maintenance window.
-- The actual data migration is commented out and should be run manually.
-- 
-- For production deployment:
-- 1. Create the partitioned tables first (Steps 1-5 above)
-- 2. Run data migration in batches:
--    INSERT INTO "Post_partitioned" SELECT * FROM "Post" WHERE timestamp >= '2024-01-01' AND timestamp < '2024-02-01';
--    -- Repeat for each month's data
-- 3. Once all data is migrated and verified:
--    ALTER TABLE "Post" RENAME TO "Post_old";
--    ALTER TABLE "Post_partitioned" RENAME TO "Post";
-- 4. Update foreign key references
-- 5. Drop old tables after verification period

-- ============================================================================
-- Step 7: Create views for backward compatibility during migration
-- ============================================================================

-- These views allow application code to work with both old and new tables
-- during the migration period

-- IMPORTANT: The actual table swap should be done manually after data migration
-- DO NOT run the following in production without proper testing:
--
-- BEGIN;
-- ALTER TABLE "Post" RENAME TO "Post_unpartitioned";
-- ALTER TABLE "Post_partitioned" RENAME TO "Post";
-- -- Update any foreign key constraints
-- COMMIT;
