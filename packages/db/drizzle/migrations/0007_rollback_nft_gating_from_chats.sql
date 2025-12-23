-- Rollback migration: Remove NFT gating columns from Chat table
-- This migration reverses the changes made in 0006_add_nft_gating_to_chats.sql

DO $$
BEGIN
    -- Drop indexes first
    DROP INDEX IF EXISTS "Chat_requiredNftContractAddress_idx";
    DROP INDEX IF EXISTS "Chat_nftGated_idx";

    -- Remove columns if they exist
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'Chat' AND column_name = 'nftGated'
    ) THEN
        ALTER TABLE "Chat" DROP COLUMN "nftGated";
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'Chat' AND column_name = 'requiredNftChainId'
    ) THEN
        ALTER TABLE "Chat" DROP COLUMN "requiredNftChainId";
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'Chat' AND column_name = 'requiredNftTokenId'
    ) THEN
        ALTER TABLE "Chat" DROP COLUMN "requiredNftTokenId";
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'Chat' AND column_name = 'requiredNftContractAddress'
    ) THEN
        ALTER TABLE "Chat" DROP COLUMN "requiredNftContractAddress";
    END IF;
END $$;

