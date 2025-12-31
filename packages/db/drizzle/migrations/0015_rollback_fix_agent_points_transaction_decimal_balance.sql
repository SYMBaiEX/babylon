-- Rollback: Revert AgentPointsTransaction balanceBefore/balanceAfter to integer
-- Warning: This may cause data loss if decimal values have been stored

ALTER TABLE "AgentPointsTransaction" 
  ALTER COLUMN "balanceBefore" SET DATA TYPE integer USING "balanceBefore"::integer;

ALTER TABLE "AgentPointsTransaction" 
  ALTER COLUMN "balanceAfter" SET DATA TYPE integer USING "balanceAfter"::integer;
