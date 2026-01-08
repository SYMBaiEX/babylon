-- Migration: Add UserAgentTeamChat table for Agent Command Center
-- Each user has exactly ONE team chat containing all their agents

CREATE TABLE IF NOT EXISTS "UserAgentTeamChat" (
  "id" text PRIMARY KEY NOT NULL,
  "userId" text NOT NULL UNIQUE,
  "groupId" text NOT NULL,
  "chatId" text NOT NULL,
  "createdAt" timestamp DEFAULT now() NOT NULL,
  "updatedAt" timestamp NOT NULL
);

-- Indexes for efficient lookups
CREATE INDEX IF NOT EXISTS "UserAgentTeamChat_userId_idx" ON "UserAgentTeamChat" ("userId");
CREATE INDEX IF NOT EXISTS "UserAgentTeamChat_groupId_idx" ON "UserAgentTeamChat" ("groupId");
CREATE INDEX IF NOT EXISTS "UserAgentTeamChat_chatId_idx" ON "UserAgentTeamChat" ("chatId");

-- Add foreign key constraints (optional, depends on your FK strategy)
-- Note: Drizzle manages these at the ORM level, but explicit FKs are good for data integrity
-- ALTER TABLE "UserAgentTeamChat" ADD CONSTRAINT "UserAgentTeamChat_groupId_fkey" 
--   FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE;
-- ALTER TABLE "UserAgentTeamChat" ADD CONSTRAINT "UserAgentTeamChat_chatId_fkey" 
--   FOREIGN KEY ("chatId") REFERENCES "Chat"("id") ON DELETE CASCADE;

