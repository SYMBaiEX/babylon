-- DropIndex
DROP INDEX "ActorRelationship_lastInteraction_idx";

-- DropIndex
DROP INDEX "NPCInteraction_actor1Id_actor2Id_timestamp_idx";

-- DropIndex
DROP INDEX "NPCInteraction_timestamp_idx";

-- AlterTable
ALTER TABLE "trained_models" ADD COLUMN     "benchmarkCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "huggingFaceRepo" TEXT,
ADD COLUMN     "lastBenchmarked" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "GenerationLock" (
    "id" TEXT NOT NULL DEFAULT 'game-tick-lock',
    "lockedBy" TEXT NOT NULL,
    "lockedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "operation" TEXT NOT NULL DEFAULT 'game-tick',

    CONSTRAINT "GenerationLock_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GenerationLock_expiresAt_idx" ON "GenerationLock"("expiresAt");

-- CreateIndex
CREATE INDEX "ActorRelationship_lastInteraction_idx" ON "ActorRelationship"("lastInteraction");

-- CreateIndex
CREATE INDEX "NPCInteraction_actor1Id_actor2Id_timestamp_idx" ON "NPCInteraction"("actor1Id", "actor2Id", "timestamp");

-- CreateIndex
CREATE INDEX "NPCInteraction_timestamp_idx" ON "NPCInteraction"("timestamp");

-- CreateIndex
CREATE INDEX "NPCInteraction_interactionType_idx" ON "NPCInteraction"("interactionType");

-- CreateIndex
CREATE INDEX "trained_models_lastBenchmarked_idx" ON "trained_models"("lastBenchmarked");
