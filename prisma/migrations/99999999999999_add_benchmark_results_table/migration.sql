-- CreateTable
CREATE TABLE IF NOT EXISTS "benchmark_results" (
    "id" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "benchmarkId" TEXT NOT NULL,
    "benchmarkPath" TEXT NOT NULL,
    "runAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    -- Performance Metrics
    "totalPnl" DOUBLE PRECISION NOT NULL,
    "predictionAccuracy" DOUBLE PRECISION NOT NULL,
    "perpWinRate" DOUBLE PRECISION NOT NULL,
    "optimalityScore" DOUBLE PRECISION NOT NULL,
    
    -- Detailed Metrics (JSON)
    "detailedMetrics" JSONB NOT NULL,
    
    -- Comparison to Baseline
    "baselinePnlDelta" DOUBLE PRECISION,
    "baselineAccuracyDelta" DOUBLE PRECISION,
    "improved" BOOLEAN,
    
    -- Metadata
    "duration" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "benchmark_results_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "benchmark_results_modelId_idx" ON "benchmark_results"("modelId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "benchmark_results_benchmarkId_idx" ON "benchmark_results"("benchmarkId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "benchmark_results_runAt_idx" ON "benchmark_results"("runAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "benchmark_results_optimalityScore_idx" ON "benchmark_results"("optimalityScore");

-- AddForeignKey (optional, for referential integrity)
-- ALTER TABLE "benchmark_results" ADD CONSTRAINT "benchmark_results_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "trained_models"("modelId") ON DELETE CASCADE ON UPDATE CASCADE;



