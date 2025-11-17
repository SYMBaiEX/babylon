-- AlterTable
ALTER TABLE "ActorRelationship" ADD COLUMN     "evolutionCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "interactionCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lastInteraction" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "AgentPerformanceMetrics" ALTER COLUMN "averageFeedbackScore" SET DEFAULT 50,
ALTER COLUMN "reputationScore" SET DEFAULT 50;

-- AlterTable
ALTER TABLE "Chat" ADD COLUMN     "createdBy" TEXT,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "npcAdminId" TEXT,
ADD COLUMN     "relatedQuestion" INTEGER;

-- AlterTable
ALTER TABLE "ChatParticipant" ADD COLUMN     "addedBy" TEXT,
ADD COLUMN     "invitedBy" TEXT,
ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "kickReason" TEXT,
ADD COLUMN     "kickedAt" TIMESTAMP(3),
ADD COLUMN     "lastMessageAt" TIMESTAMP(3),
ADD COLUMN     "messageCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "qualityScore" DOUBLE PRECISION NOT NULL DEFAULT 1.0;

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "ticker" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "a2aEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "appealCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "appealReviewedAt" TIMESTAMP(3),
ADD COLUMN     "appealStakeAmount" DECIMAL(18,2),
ADD COLUMN     "appealStakeTxHash" TEXT,
ADD COLUMN     "appealStaked" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "appealStatus" TEXT,
ADD COLUMN     "appealSubmittedAt" TIMESTAMP(3),
ADD COLUMN     "falsePositiveHistory" JSONB,
ADD COLUMN     "isCSAM" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isScammer" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "trained_models" ADD COLUMN     "benchmarkCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "huggingFaceRepo" TEXT,
ADD COLUMN     "lastBenchmarked" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "NPCInteraction" (
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

-- CreateTable
CREATE TABLE "ChatAdmin" (
    "id" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "grantedBy" TEXT NOT NULL,

    CONSTRAINT "ChatAdmin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatInvite" (
    "id" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "invitedUserId" TEXT NOT NULL,
    "invitedBy" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "message" TEXT,
    "invitedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondedAt" TIMESTAMP(3),

    CONSTRAINT "ChatInvite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PredictionPriceHistory" (
    "id" TEXT NOT NULL,
    "marketId" TEXT NOT NULL,
    "yesPrice" DOUBLE PRECISION NOT NULL,
    "noPrice" DOUBLE PRECISION NOT NULL,
    "yesShares" DECIMAL(24,8) NOT NULL,
    "noShares" DECIMAL(24,8) NOT NULL,
    "liquidity" DECIMAL(24,8) NOT NULL,
    "eventType" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PredictionPriceHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "benchmark_results" (
    "id" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "benchmarkId" TEXT NOT NULL,
    "benchmarkPath" TEXT NOT NULL,
    "runAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "totalPnl" DOUBLE PRECISION NOT NULL,
    "predictionAccuracy" DOUBLE PRECISION NOT NULL,
    "perpWinRate" DOUBLE PRECISION NOT NULL,
    "optimalityScore" DOUBLE PRECISION NOT NULL,
    "detailedMetrics" JSONB NOT NULL,
    "baselinePnlDelta" DOUBLE PRECISION,
    "baselineAccuracyDelta" DOUBLE PRECISION,
    "improved" BOOLEAN,
    "duration" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "benchmark_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModerationEscrow" (
    "id" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "amountUSD" DECIMAL(18,2) NOT NULL,
    "amountWei" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "reason" TEXT,
    "paymentRequestId" TEXT,
    "paymentTxHash" TEXT,
    "refundTxHash" TEXT,
    "refundedBy" TEXT,
    "refundedAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ModerationEscrow_pkey" PRIMARY KEY ("id")
);

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
CREATE INDEX "NPCInteraction_actor1Id_actor2Id_timestamp_idx" ON "NPCInteraction"("actor1Id", "actor2Id", "timestamp");

-- CreateIndex
CREATE INDEX "NPCInteraction_timestamp_idx" ON "NPCInteraction"("timestamp");

-- CreateIndex
CREATE INDEX "NPCInteraction_actor1Id_idx" ON "NPCInteraction"("actor1Id");

-- CreateIndex
CREATE INDEX "NPCInteraction_actor2Id_idx" ON "NPCInteraction"("actor2Id");

-- CreateIndex
CREATE INDEX "NPCInteraction_interactionType_idx" ON "NPCInteraction"("interactionType");

-- CreateIndex
CREATE INDEX "ChatAdmin_chatId_idx" ON "ChatAdmin"("chatId");

-- CreateIndex
CREATE INDEX "ChatAdmin_userId_idx" ON "ChatAdmin"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ChatAdmin_chatId_userId_key" ON "ChatAdmin"("chatId", "userId");

-- CreateIndex
CREATE INDEX "ChatInvite_chatId_idx" ON "ChatInvite"("chatId");

-- CreateIndex
CREATE INDEX "ChatInvite_invitedUserId_status_idx" ON "ChatInvite"("invitedUserId", "status");

-- CreateIndex
CREATE INDEX "ChatInvite_status_idx" ON "ChatInvite"("status");

-- CreateIndex
CREATE UNIQUE INDEX "ChatInvite_chatId_invitedUserId_key" ON "ChatInvite"("chatId", "invitedUserId");

-- CreateIndex
CREATE INDEX "PredictionPriceHistory_marketId_createdAt_idx" ON "PredictionPriceHistory"("marketId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "benchmark_results_modelId_idx" ON "benchmark_results"("modelId");

-- CreateIndex
CREATE INDEX "benchmark_results_benchmarkId_idx" ON "benchmark_results"("benchmarkId");

-- CreateIndex
CREATE INDEX "benchmark_results_runAt_idx" ON "benchmark_results"("runAt");

-- CreateIndex
CREATE INDEX "benchmark_results_optimalityScore_idx" ON "benchmark_results"("optimalityScore");

-- CreateIndex
CREATE UNIQUE INDEX "ModerationEscrow_paymentRequestId_key" ON "ModerationEscrow"("paymentRequestId");

-- CreateIndex
CREATE UNIQUE INDEX "ModerationEscrow_paymentTxHash_key" ON "ModerationEscrow"("paymentTxHash");

-- CreateIndex
CREATE UNIQUE INDEX "ModerationEscrow_refundTxHash_key" ON "ModerationEscrow"("refundTxHash");

-- CreateIndex
CREATE INDEX "ModerationEscrow_recipientId_createdAt_idx" ON "ModerationEscrow"("recipientId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "ModerationEscrow_adminId_idx" ON "ModerationEscrow"("adminId");

-- CreateIndex
CREATE INDEX "ModerationEscrow_status_idx" ON "ModerationEscrow"("status");

-- CreateIndex
CREATE INDEX "ModerationEscrow_paymentRequestId_idx" ON "ModerationEscrow"("paymentRequestId");

-- CreateIndex
CREATE INDEX "ModerationEscrow_paymentTxHash_idx" ON "ModerationEscrow"("paymentTxHash");

-- CreateIndex
CREATE INDEX "ModerationEscrow_createdAt_idx" ON "ModerationEscrow"("createdAt" DESC);

-- CreateIndex
CREATE INDEX "GenerationLock_expiresAt_idx" ON "GenerationLock"("expiresAt");

-- CreateIndex
CREATE INDEX "ActorRelationship_lastInteraction_idx" ON "ActorRelationship"("lastInteraction");

-- CreateIndex
CREATE INDEX "Chat_createdBy_idx" ON "Chat"("createdBy");

-- CreateIndex
CREATE INDEX "Chat_npcAdminId_idx" ON "Chat"("npcAdminId");

-- CreateIndex
CREATE INDEX "Chat_relatedQuestion_idx" ON "Chat"("relatedQuestion");

-- CreateIndex
CREATE INDEX "ChatParticipant_chatId_isActive_idx" ON "ChatParticipant"("chatId", "isActive");

-- CreateIndex
CREATE INDEX "ChatParticipant_lastMessageAt_idx" ON "ChatParticipant"("lastMessageAt");

-- CreateIndex
CREATE INDEX "ChatParticipant_userId_isActive_idx" ON "ChatParticipant"("userId", "isActive");

-- CreateIndex
CREATE INDEX "Organization_ticker_idx" ON "Organization"("ticker");

-- CreateIndex
CREATE INDEX "User_isScammer_idx" ON "User"("isScammer");

-- CreateIndex
CREATE INDEX "User_isCSAM_idx" ON "User"("isCSAM");

-- CreateIndex
CREATE INDEX "trained_models_lastBenchmarked_idx" ON "trained_models"("lastBenchmarked");

-- AddForeignKey
ALTER TABLE "NPCInteraction" ADD CONSTRAINT "NPCInteraction_actor1Id_fkey" FOREIGN KEY ("actor1Id") REFERENCES "Actor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NPCInteraction" ADD CONSTRAINT "NPCInteraction_actor2Id_fkey" FOREIGN KEY ("actor2Id") REFERENCES "Actor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatAdmin" ADD CONSTRAINT "ChatAdmin_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "Chat"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PredictionPriceHistory" ADD CONSTRAINT "PredictionPriceHistory_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "Market"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModerationEscrow" ADD CONSTRAINT "ModerationEscrow_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModerationEscrow" ADD CONSTRAINT "ModerationEscrow_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModerationEscrow" ADD CONSTRAINT "ModerationEscrow_refundedBy_fkey" FOREIGN KEY ("refundedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

