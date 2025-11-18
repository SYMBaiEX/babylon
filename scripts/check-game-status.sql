-- Check all games and their status
-- This helps debug why the cron might not be finding the running game

-- Check all games
SELECT 
  id,
  "isRunning",
  "isContinuous",
  "currentDay",
  "startedAt",
  "pausedAt",
  "lastTickAt",
  "updatedAt",
  "createdAt"
FROM "Game"
ORDER BY "createdAt" DESC;

-- Check specifically for continuous games
SELECT 
  id,
  "isRunning",
  "isContinuous",
  "currentDay",
  "startedAt",
  "pausedAt",
  "lastTickAt",
  "updatedAt"
FROM "Game"
WHERE "isContinuous" = true;

-- Check if there are multiple continuous games (should only be one)
SELECT COUNT(*) as continuous_game_count
FROM "Game"
WHERE "isContinuous" = true;

-- Check the exact values (useful for debugging type issues)
SELECT 
  id,
  "isRunning"::text as is_running_text,
  "isRunning"::boolean as is_running_bool,
  CASE WHEN "isRunning" THEN 'true' ELSE 'false' END as is_running_case,
  "isContinuous"::text as is_continuous_text,
  "isContinuous"::boolean as is_continuous_bool
FROM "Game"
WHERE "isContinuous" = true;

