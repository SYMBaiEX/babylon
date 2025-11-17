-- Adjust defaults for new reputation baseline
ALTER TABLE "AgentPerformanceMetrics"
  ALTER COLUMN "averageFeedbackScore" SET DEFAULT 70,
  ALTER COLUMN "reputationScore" SET DEFAULT 70;
