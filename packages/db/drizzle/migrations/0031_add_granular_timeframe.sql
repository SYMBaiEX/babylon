-- Migration: Add granularTimeframe column to TimeframedMarket table
-- This stores the precise market duration key ('15m', '30m', '1h', etc.)
-- instead of inferring it from duration, preventing misclassification at boundaries

-- Add the granularTimeframe column (nullable for backward compatibility with existing markets)
ALTER TABLE "TimeframedMarket" ADD COLUMN IF NOT EXISTS "granularTimeframe" TEXT;

-- Create index for efficient querying by granular timeframe
CREATE INDEX IF NOT EXISTS "TimeframedMarket_granularTimeframe_idx" ON "TimeframedMarket" ("granularTimeframe");

-- Backfill existing markets based on their duration
-- Maps duration to granular timeframe keys using the same logic as inferGranularTimeframe()
UPDATE "TimeframedMarket"
SET "granularTimeframe" = CASE
    -- 15 minute markets (±10% tolerance: 810000ms - 990000ms)
    WHEN EXTRACT(EPOCH FROM ("endTime" - "startTime")) * 1000 BETWEEN 810000 AND 990000 THEN '15m'
    -- 30 minute markets (±10% tolerance: 1620000ms - 1980000ms)
    WHEN EXTRACT(EPOCH FROM ("endTime" - "startTime")) * 1000 BETWEEN 1620000 AND 1980000 THEN '30m'
    -- 1 hour markets (±10% tolerance: 3240000ms - 3960000ms)
    WHEN EXTRACT(EPOCH FROM ("endTime" - "startTime")) * 1000 BETWEEN 3240000 AND 3960000 THEN '1h'
    -- 6 hour markets (±10% tolerance: 19440000ms - 23760000ms)
    WHEN EXTRACT(EPOCH FROM ("endTime" - "startTime")) * 1000 BETWEEN 19440000 AND 23760000 THEN '6h'
    -- 12 hour markets (±10% tolerance: 38880000ms - 47520000ms)
    WHEN EXTRACT(EPOCH FROM ("endTime" - "startTime")) * 1000 BETWEEN 38880000 AND 47520000 THEN '12h'
    -- 1 day markets (±10% tolerance: 77760000ms - 95040000ms)
    WHEN EXTRACT(EPOCH FROM ("endTime" - "startTime")) * 1000 BETWEEN 77760000 AND 95040000 THEN '1d'
    -- 2 day markets (±10% tolerance: 155520000ms - 190080000ms)
    WHEN EXTRACT(EPOCH FROM ("endTime" - "startTime")) * 1000 BETWEEN 155520000 AND 190080000 THEN '2d'
    -- 3 day markets (±10% tolerance: 233280000ms - 285120000ms)
    WHEN EXTRACT(EPOCH FROM ("endTime" - "startTime")) * 1000 BETWEEN 233280000 AND 285120000 THEN '3d'
    -- Fallback: find closest match (default to '1h' for unknown durations)
    ELSE '1h'
END
WHERE "granularTimeframe" IS NULL;
