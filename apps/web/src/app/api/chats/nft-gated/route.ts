/**
 * NFT-Gated Chats Discovery API
 *
 * @route GET /api/chats/nft-gated - List available NFT-gated chats
 * @access Authenticated
 *
 * @description
 * Returns a list of NFT-gated chats that the user could potentially join.
 * Shows which chats the user has access to based on their NFT holdings.
 */

import {
  authenticate,
  NFTVerificationService,
  successResponse,
  withErrorHandling,
} from '@babylon/api';
import {
  and,
  asc,
  chatParticipants,
  chats,
  db,
  desc,
  eq,
  inArray,
  sql,
  users,
} from '@babylon/db';
import { logger } from '@babylon/shared';
import type { NextRequest } from 'next/server';

// Pagination constants
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

/**
 * GET /api/chats/nft-gated
 * List NFT-gated chats the user can potentially join
 */
export const GET = withErrorHandling(async (request: NextRequest) => {
  const user = await authenticate(request);

  // Parse pagination parameters from query string
  const { searchParams } = new URL(request.url);
  const limitParam = searchParams.get('limit');
  const offsetParam = searchParams.get('offset');

  // Validate and apply pagination with sensible defaults and hard max
  let limit = DEFAULT_LIMIT;
  let offset = 0;

  if (limitParam) {
    const parsedLimit = parseInt(limitParam, 10);
    if (!isNaN(parsedLimit) && parsedLimit > 0) {
      limit = Math.min(parsedLimit, MAX_LIMIT);
    }
  }

  if (offsetParam) {
    const parsedOffset = parseInt(offsetParam, 10);
    if (!isNaN(parsedOffset) && parsedOffset >= 0) {
      offset = parsedOffset;
    }
  }

  // Get user's wallet address
  const [userData] = await db
    .select({ walletAddress: users.walletAddress })
    .from(users)
    .where(eq(users.id, user.userId))
    .limit(1);

  // Get total count of NFT-gated chats for pagination metadata
  const [totalCountResult] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(chats)
    .where(eq(chats.nftGated, true));
  const totalCount = totalCountResult?.count ?? 0;

  // Get paginated NFT-gated chats ordered by createdAt (newest first)
  const nftGatedChats = await db
    .select({
      id: chats.id,
      name: chats.name,
      description: chats.description,
      requiredNftContractAddress: chats.requiredNftContractAddress,
      requiredNftTokenId: chats.requiredNftTokenId,
      requiredNftChainId: chats.requiredNftChainId,
      createdAt: chats.createdAt,
    })
    .from(chats)
    .where(eq(chats.nftGated, true))
    .orderBy(desc(chats.createdAt), asc(chats.id))
    .limit(limit)
    .offset(offset);

  if (nftGatedChats.length === 0) {
    return successResponse({
      chats: [],
      hasWallet: !!userData?.walletAddress,
      pagination: {
        total: totalCount,
        limit,
        offset,
        hasMore: false,
      },
    });
  }

  // Get user's current memberships
  const userMemberships = await db
    .select({ chatId: chatParticipants.chatId })
    .from(chatParticipants)
    .where(
      and(
        eq(chatParticipants.userId, user.userId),
        inArray(
          chatParticipants.chatId,
          nftGatedChats.map((c) => c.id)
        )
      )
    );
  const memberOfSet = new Set(userMemberships.map((m) => m.chatId));

  // Get member counts for all chats in a single query using GROUP BY
  const chatIds = nftGatedChats.map((c) => c.id);
  const memberCountMap = new Map<string, number>();

  if (chatIds.length > 0) {
    const memberCountsResult = await db
      .select({
        chatId: chatParticipants.chatId,
        count: sql<number>`count(*)::int`,
      })
      .from(chatParticipants)
      .where(inArray(chatParticipants.chatId, chatIds))
      .groupBy(chatParticipants.chatId);

    for (const row of memberCountsResult) {
      memberCountMap.set(row.chatId, row.count);
    }
  }

  // Check NFT access for each chat if user has wallet
  // Process in batches to avoid overwhelming RPC endpoints
  const BATCH_SIZE = 5;
  const chatResults: Array<{
    id: string;
    name: string | null;
    description: string | null;
    memberCount: number;
    nftRequirement: {
      contractAddress: string | null;
      tokenId: number | null;
      chainId: number | null;
    };
    isMember: boolean;
    hasAccess: boolean;
    ownedTokenIds: number[];
    createdAt: Date;
  }> = [];

  for (let i = 0; i < nftGatedChats.length; i += BATCH_SIZE) {
    const batch = nftGatedChats.slice(i, i + BATCH_SIZE);

    const batchResults = await Promise.all(
      batch.map(async (chat) => {
        const isMember = memberOfSet.has(chat.id);
        let hasAccess = false;
        let tokenIds: number[] = [];

        if (userData?.walletAddress && chat.requiredNftContractAddress) {
          try {
            const verification = await NFTVerificationService.verifyChatAccess(
              userData.walletAddress,
              chat.requiredNftContractAddress,
              chat.requiredNftTokenId ?? null,
              chat.requiredNftChainId ?? undefined
            );
            hasAccess = verification.canAccess;

            // Get owned token IDs if has access
            if (hasAccess && chat.requiredNftTokenId === null) {
              tokenIds = await NFTVerificationService.getUserTokenIds(
                userData.walletAddress,
                chat.requiredNftContractAddress,
                chat.requiredNftChainId ?? undefined
              ).catch(() => []);
            } else if (hasAccess && chat.requiredNftTokenId !== null) {
              tokenIds = [chat.requiredNftTokenId];
            }
          } catch (error) {
            logger.warn(
              'Error checking NFT access for chat',
              {
                chatId: chat.id,
                error: error instanceof Error ? error.message : String(error),
              },
              'GET /api/chats/nft-gated'
            );
          }
        }

        return {
          id: chat.id,
          name: chat.name,
          description: chat.description,
          memberCount: memberCountMap.get(chat.id) ?? 0,
          nftRequirement: {
            contractAddress: chat.requiredNftContractAddress,
            tokenId: chat.requiredNftTokenId,
            chainId: chat.requiredNftChainId,
          },
          isMember,
          hasAccess,
          ownedTokenIds: tokenIds,
          createdAt: chat.createdAt,
        };
      })
    );

    chatResults.push(...batchResults);
  }

  // Sort: accessible non-member chats first, then by member count
  chatResults.sort((a, b) => {
    // Chats user can join but hasn't joined yet come first
    const aCanJoin = a.hasAccess && !a.isMember;
    const bCanJoin = b.hasAccess && !b.isMember;
    if (aCanJoin && !bCanJoin) return -1;
    if (!aCanJoin && bCanJoin) return 1;

    // Then member chats
    if (a.isMember && !b.isMember) return -1;
    if (!a.isMember && b.isMember) return 1;

    // Then by member count
    return b.memberCount - a.memberCount;
  });

  return successResponse({
    chats: chatResults,
    hasWallet: !!userData?.walletAddress,
    walletAddress: userData?.walletAddress ?? null,
    pagination: {
      total: totalCount,
      limit,
      offset,
      hasMore: offset + nftGatedChats.length < totalCount,
    },
  });
});
