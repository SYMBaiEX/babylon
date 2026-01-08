-- Rollback: Remove UserAgentTeamChat table

DROP INDEX IF EXISTS "UserAgentTeamChat_chatId_idx";
DROP INDEX IF EXISTS "UserAgentTeamChat_groupId_idx";
DROP INDEX IF EXISTS "UserAgentTeamChat_userId_idx";
DROP TABLE IF EXISTS "UserAgentTeamChat";

