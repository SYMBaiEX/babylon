-- Unified Agent Registry Migration
-- Based on: src/types/agent-registry.types.ts
-- Architecture: ERC-8004 + Agent0 SDK + A2A Protocol
--
-- Note: This migration is idempotent and safe to run multiple times.
-- PostgreSQL does not support IF NOT EXISTS for CREATE TYPE (enums) or ADD CONSTRAINT,
-- so we use DO blocks with exception handling for those operations.

-- CreateEnum: AgentType (idempotent)
DO $$ BEGIN
    CREATE TYPE "AgentType" AS ENUM ('USER_CONTROLLED', 'NPC', 'EXTERNAL');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- CreateEnum: AgentStatus (idempotent)
DO $$ BEGIN
    CREATE TYPE "AgentStatus" AS ENUM ('REGISTERED', 'INITIALIZED', 'ACTIVE', 'PAUSED', 'TERMINATED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- CreateTable: AgentRegistry (idempotent)
CREATE TABLE IF NOT EXISTS "AgentRegistry" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "type" "AgentType" NOT NULL,
    "status" "AgentStatus" NOT NULL DEFAULT 'REGISTERED',
    "trustLevel" INTEGER NOT NULL DEFAULT 0,
    "userId" TEXT,
    "actorId" TEXT,
    "name" TEXT NOT NULL,
    "systemPrompt" TEXT NOT NULL,
    "discoveryCardVersion" TEXT,
    "discoveryEndpointA2a" TEXT,
    "discoveryEndpointMcp" TEXT,
    "discoveryEndpointRpc" TEXT,
    "discoveryAuthRequired" BOOLEAN NOT NULL DEFAULT false,
    "discoveryAuthMethods" TEXT[],
    "discoveryRateLimit" INTEGER,
    "discoveryCostPerAction" DOUBLE PRECISION,
    "onChainTokenId" INTEGER,
    "onChainTxHash" TEXT,
    "onChainServerWallet" TEXT,
    "onChainReputationScore" INTEGER DEFAULT 0,
    "onChainChainId" INTEGER,
    "onChainIdentityRegistry" TEXT,
    "onChainReputationSystem" TEXT,
    "agent0TokenId" TEXT,
    "agent0MetadataCID" TEXT,
    "agent0SubgraphOwner" TEXT,
    "agent0SubgraphMetadataURI" TEXT,
    "agent0SubgraphTimestamp" INTEGER,
    "agent0DiscoveryEndpoint" TEXT,
    "runtimeInstanceId" TEXT,
    "registeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastActiveAt" TIMESTAMP(3),
    "terminatedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentRegistry_pkey" PRIMARY KEY ("id")
);

-- CreateTable: AgentCapability (idempotent)
CREATE TABLE IF NOT EXISTS "AgentCapability" (
    "id" TEXT NOT NULL,
    "agentRegistryId" TEXT NOT NULL,
    "strategies" TEXT[],
    "markets" TEXT[],
    "actions" TEXT[],
    "version" TEXT NOT NULL DEFAULT '1.0.0',
    "x402Support" BOOLEAN NOT NULL DEFAULT false,
    "platform" TEXT,
    "userType" TEXT,
    "gameNetworkChainId" INTEGER,
    "gameNetworkRpcUrl" TEXT,
    "gameNetworkExplorerUrl" TEXT,
    "skills" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "domains" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "a2aEndpoint" TEXT,
    "mcpEndpoint" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentCapability_pkey" PRIMARY KEY ("id")
);

-- CreateTable: ExternalAgentConnection (idempotent)
CREATE TABLE IF NOT EXISTS "ExternalAgentConnection" (
    "id" TEXT NOT NULL,
    "agentRegistryId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "protocol" TEXT NOT NULL,
    "authType" TEXT,
    "authCredentials" TEXT,
    "agentCardJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExternalAgentConnection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex (idempotent)
CREATE UNIQUE INDEX IF NOT EXISTS "AgentRegistry_agentId_key" ON "AgentRegistry"("agentId");
CREATE UNIQUE INDEX IF NOT EXISTS "AgentRegistry_userId_key" ON "AgentRegistry"("userId");
CREATE UNIQUE INDEX IF NOT EXISTS "AgentRegistry_actorId_key" ON "AgentRegistry"("actorId");
CREATE UNIQUE INDEX IF NOT EXISTS "AgentRegistry_runtimeInstanceId_key" ON "AgentRegistry"("runtimeInstanceId");
CREATE INDEX IF NOT EXISTS "AgentRegistry_type_status_idx" ON "AgentRegistry"("type", "status");
CREATE INDEX IF NOT EXISTS "AgentRegistry_trustLevel_idx" ON "AgentRegistry"("trustLevel");
CREATE INDEX IF NOT EXISTS "AgentRegistry_userId_idx" ON "AgentRegistry"("userId");
CREATE INDEX IF NOT EXISTS "AgentRegistry_actorId_idx" ON "AgentRegistry"("actorId");
CREATE INDEX IF NOT EXISTS "AgentRegistry_status_lastActiveAt_idx" ON "AgentRegistry"("status", "lastActiveAt");
CREATE INDEX IF NOT EXISTS "AgentRegistry_type_trustLevel_idx" ON "AgentRegistry"("type", "trustLevel");

-- CreateIndex (idempotent)
CREATE UNIQUE INDEX IF NOT EXISTS "AgentCapability_agentRegistryId_key" ON "AgentCapability"("agentRegistryId");
CREATE INDEX IF NOT EXISTS "AgentCapability_agentRegistryId_idx" ON "AgentCapability"("agentRegistryId");

-- CreateIndex (idempotent)
CREATE UNIQUE INDEX IF NOT EXISTS "ExternalAgentConnection_agentRegistryId_key" ON "ExternalAgentConnection"("agentRegistryId");
CREATE UNIQUE INDEX IF NOT EXISTS "ExternalAgentConnection_externalId_key" ON "ExternalAgentConnection"("externalId");
CREATE INDEX IF NOT EXISTS "ExternalAgentConnection_agentRegistryId_idx" ON "ExternalAgentConnection"("agentRegistryId");
CREATE INDEX IF NOT EXISTS "ExternalAgentConnection_externalId_idx" ON "ExternalAgentConnection"("externalId");
CREATE INDEX IF NOT EXISTS "ExternalAgentConnection_protocol_idx" ON "ExternalAgentConnection"("protocol");

-- AddForeignKey (idempotent)
DO $$ BEGIN
    ALTER TABLE "AgentRegistry" ADD CONSTRAINT "AgentRegistry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "AgentRegistry" ADD CONSTRAINT "AgentRegistry_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "Actor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- AddForeignKey (idempotent)
DO $$ BEGIN
    ALTER TABLE "AgentCapability" ADD CONSTRAINT "AgentCapability_agentRegistryId_fkey" FOREIGN KEY ("agentRegistryId") REFERENCES "AgentRegistry"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- AddForeignKey (idempotent)
DO $$ BEGIN
    ALTER TABLE "ExternalAgentConnection" ADD CONSTRAINT "ExternalAgentConnection_agentRegistryId_fkey" FOREIGN KEY ("agentRegistryId") REFERENCES "AgentRegistry"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;
