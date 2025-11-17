-- Add intel-specific feedback aggregates to AgentPerformanceMetrics
ALTER TABLE "AgentPerformanceMetrics"
ADD COLUMN "intelFeedbackCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "averageIntelScore" DOUBLE PRECISION NOT NULL DEFAULT 50;
