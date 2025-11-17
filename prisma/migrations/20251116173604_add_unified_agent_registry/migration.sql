-- Unified Agent Registry Migration
-- Based on: src/types/agent-registry.types.ts
-- Architecture: ERC-8004 + Agent0 SDK + A2A Protocol

-- CreateEnum: AgentType
CREATE TYPE "AgentType" AS ENUM ('USER_CONTROLLED', 'NPC', 'EXTERNAL');

-- CreateEnum: AgentStatus
CREATE TYPE "AgentStatus" AS ENUM ('REGISTERED', 'INITIALIZED', 'ACTIVE', 'PAUSED', 'TERMINATED');

-- CreateTable: AgentRegistry
CREATE TABLE "AgentRegistry" (
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

-- CreateTable: AgentCapability
CREATE TABLE "AgentCapability" (
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

-- CreateTable: ExternalAgentConnection
CREATE TABLE "ExternalAgentConnection" (
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

-- CreateIndex
CREATE UNIQUE INDEX "AgentRegistry_agentId_key" ON "AgentRegistry"("agentId");
CREATE UNIQUE INDEX "AgentRegistry_userId_key" ON "AgentRegistry"("userId");
CREATE UNIQUE INDEX "AgentRegistry_actorId_key" ON "AgentRegistry"("actorId");
CREATE UNIQUE INDEX "AgentRegistry_runtimeInstanceId_key" ON "AgentRegistry"("runtimeInstanceId");
CREATE INDEX "AgentRegistry_type_status_idx" ON "AgentRegistry"("type", "status");
CREATE INDEX "AgentRegistry_trustLevel_idx" ON "AgentRegistry"("trustLevel");
CREATE INDEX "AgentRegistry_userId_idx" ON "AgentRegistry"("userId");
CREATE INDEX "AgentRegistry_actorId_idx" ON "AgentRegistry"("actorId");
CREATE INDEX "AgentRegistry_status_lastActiveAt_idx" ON "AgentRegistry"("status", "lastActiveAt");
CREATE INDEX "AgentRegistry_type_trustLevel_idx" ON "AgentRegistry"("type", "trustLevel");

-- CreateIndex
CREATE UNIQUE INDEX "AgentCapability_agentRegistryId_key" ON "AgentCapability"("agentRegistryId");
CREATE INDEX "AgentCapability_agentRegistryId_idx" ON "AgentCapability"("agentRegistryId");

-- CreateIndex
CREATE UNIQUE INDEX "ExternalAgentConnection_agentRegistryId_key" ON "ExternalAgentConnection"("agentRegistryId");
CREATE UNIQUE INDEX "ExternalAgentConnection_externalId_key" ON "ExternalAgentConnection"("externalId");
CREATE INDEX "ExternalAgentConnection_agentRegistryId_idx" ON "ExternalAgentConnection"("agentRegistryId");
CREATE INDEX "ExternalAgentConnection_externalId_idx" ON "ExternalAgentConnection"("externalId");
CREATE INDEX "ExternalAgentConnection_protocol_idx" ON "ExternalAgentConnection"("protocol");

-- AddForeignKey
ALTER TABLE "AgentRegistry" ADD CONSTRAINT "AgentRegistry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AgentRegistry" ADD CONSTRAINT "AgentRegistry_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "Actor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentCapability" ADD CONSTRAINT "AgentCapability_agentRegistryId_fkey" FOREIGN KEY ("agentRegistryId") REFERENCES "AgentRegistry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalAgentConnection" ADD CONSTRAINT "ExternalAgentConnection_agentRegistryId_fkey" FOREIGN KEY ("agentRegistryId") REFERENCES "AgentRegistry"("id") ON DELETE CASCADE ON UPDATE CASCADE;
