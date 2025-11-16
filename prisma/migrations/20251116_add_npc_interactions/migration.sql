-- Add NPCInteraction table for tracking all NPC-to-NPC interactions
CREATE TABLE IF NOT EXISTS "NPCInteraction" (
    "id" TEXT NOT NULL,
    "actor1Id" TEXT NOT NULL,
    "actor2Id" TEXT NOT NULL,
    "interactionType" TEXT NOT NULL,
    "sentiment" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "context" TEXT NOT NULL,
    "metadata" JSONB,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NPCInteraction_pkey" PRIMARY KEY ("id")
);

-- Add indexes for efficient querying
CREATE INDEX IF NOT EXISTS "NPCInteraction_actor1Id_actor2Id_timestamp_idx" ON "NPCInteraction"("actor1Id", "actor2Id", "timestamp" DESC);
CREATE INDEX IF NOT EXISTS "NPCInteraction_timestamp_idx" ON "NPCInteraction"("timestamp" DESC);
CREATE INDEX IF NOT EXISTS "NPCInteraction_actor1Id_idx" ON "NPCInteraction"("actor1Id");
CREATE INDEX IF NOT EXISTS "NPCInteraction_actor2Id_idx" ON "NPCInteraction"("actor2Id");

-- Add foreign keys
ALTER TABLE "NPCInteraction" ADD CONSTRAINT "NPCInteraction_actor1Id_fkey" FOREIGN KEY ("actor1Id") REFERENCES "Actor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "NPCInteraction" ADD CONSTRAINT "NPCInteraction_actor2Id_fkey" FOREIGN KEY ("actor2Id") REFERENCES "Actor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Update ActorRelationship to support dynamic evolution
-- Add evolution tracking fields if they don't exist
ALTER TABLE "ActorRelationship" ADD COLUMN IF NOT EXISTS "lastInteraction" TIMESTAMP(3);
ALTER TABLE "ActorRelationship" ADD COLUMN IF NOT EXISTS "interactionCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ActorRelationship" ADD COLUMN IF NOT EXISTS "evolutionCount" INTEGER NOT NULL DEFAULT 0;

-- Add index for relationship queries
CREATE INDEX IF NOT EXISTS "ActorRelationship_lastInteraction_idx" ON "ActorRelationship"("lastInteraction" DESC);

-- Simplify ActorRelationship - make history the main field (it's just text description)
-- History field already exists, so we're good


