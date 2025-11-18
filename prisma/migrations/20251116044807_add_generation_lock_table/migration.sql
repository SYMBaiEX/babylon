-- DropIndex
DROP INDEX IF EXISTS "ActorRelationship_lastInteraction_idx";

-- DropIndex
DROP INDEX IF EXISTS "NPCInteraction_actor1Id_actor2Id_timestamp_idx";

-- DropIndex
DROP INDEX IF EXISTS "NPCInteraction_timestamp_idx";

-- AlterTable
ALTER TABLE "trained_models" ADD COLUMN IF NOT EXISTS "benchmarkCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "trained_models" ADD COLUMN IF NOT EXISTS "huggingFaceRepo" TEXT;
ALTER TABLE "trained_models" ADD COLUMN IF NOT EXISTS "lastBenchmarked" TIMESTAMP(3);

-- CreateTable
CREATE TABLE IF NOT EXISTS "GenerationLock" (
    "id" TEXT NOT NULL DEFAULT 'game-tick-lock',
    "lockedBy" TEXT NOT NULL,
    "lockedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "operation" TEXT NOT NULL DEFAULT 'game-tick',

    CONSTRAINT "GenerationLock_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "GenerationLock_expiresAt_idx" ON "GenerationLock"("expiresAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ActorRelationship_lastInteraction_idx" ON "ActorRelationship"("lastInteraction");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "NPCInteraction_actor1Id_actor2Id_timestamp_idx" ON "NPCInteraction"("actor1Id", "actor2Id", "timestamp");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "NPCInteraction_timestamp_idx" ON "NPCInteraction"("timestamp");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "NPCInteraction_interactionType_idx" ON "NPCInteraction"("interactionType");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "trained_models_lastBenchmarked_idx" ON "trained_models"("lastBenchmarked");
