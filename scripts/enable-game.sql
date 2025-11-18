-- Enable the continuous game
-- This sets isRunning to true, clears pausedAt, and sets startedAt if needed

UPDATE "Game"
SET 
  "isRunning" = true,
  "pausedAt" = NULL,
  "startedAt" = COALESCE("startedAt", NOW()),
  "updatedAt" = NOW()
WHERE "isContinuous" = true;

-- Verify the update
SELECT 
  id,
  "isRunning",
  "currentDay",
  "startedAt",
  "pausedAt",
  "lastTickAt",
  "updatedAt"
FROM "Game"
WHERE "isContinuous" = true;

