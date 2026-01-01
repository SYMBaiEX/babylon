/**
 * NFT Revalidation Cron Job
 *
 * @route POST /api/cron/nft-revalidate
 * @access Cron only (via CRON_SECRET)
 *
 * @description
 * Periodically revalidates NFT ownership for all members in NFT-gated chats.
 * This ensures users who have sold or transferred their NFTs are automatically
 * removed from gated chats.
 *
 * Recommended schedule: Every 5-15 minutes
 * Vercel cron: "* /5 * * * *" or similar
 */

import { NFTVerificationService } from '@babylon/api';
import {
  and,
  asSystem,
  chatParticipants,
  chats,
  db,
  eq,
  groupMembers,
  inArray,
  users,
} from '@babylon/db';
import { logger } from '@babylon/shared';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

// Maximum time for a single run (Vercel function timeout - 10s buffer)
const MAX_RUN_TIME_MS = 50_000;
// Max users to check per chat per run (avoid overloading RPC)
const MAX_USERS_PER_CHAT = 20;
// Max chats to process per run
const MAX_CHATS_PER_RUN = 5;

/**
 * POST /api/cron/nft-revalidate
 * Revalidate NFT access for all NFT-gated chats
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const startTime = Date.now();

  // Verify cron secret (Vercel cron protection)
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  logger.info('Starting NFT revalidation cron job', {}, 'nft-revalidate');

  try {
    // Get all NFT-gated chats
    const nftGatedChats = await db
      .select({
        id: chats.id,
        groupId: chats.groupId,
        requiredNftContractAddress: chats.requiredNftContractAddress,
        requiredNftTokenId: chats.requiredNftTokenId,
        requiredNftChainId: chats.requiredNftChainId,
      })
      .from(chats)
      .where(eq(chats.nftGated, true))
      .limit(MAX_CHATS_PER_RUN);

    if (nftGatedChats.length === 0) {
      logger.info('No NFT-gated chats found', {}, 'nft-revalidate');
      return NextResponse.json({
        success: true,
        message: 'No NFT-gated chats to process',
      });
    }

    const results = {
      chatsProcessed: 0,
      usersChecked: 0,
      usersRemoved: 0,
      errors: 0,
    };

    for (const chat of nftGatedChats) {
      // Check if we're running out of time
      if (Date.now() - startTime > MAX_RUN_TIME_MS) {
        logger.warn(
          'NFT revalidation timed out',
          { processed: results.chatsProcessed },
          'nft-revalidate'
        );
        break;
      }

      if (!chat.requiredNftContractAddress) {
        continue;
      }

      try {
        const chatResult = await revalidateChatAccess(
          chat.id,
          chat.groupId,
          chat.requiredNftContractAddress,
          chat.requiredNftTokenId,
          chat.requiredNftChainId
        );

        results.chatsProcessed++;
        results.usersChecked += chatResult.checked;
        results.usersRemoved += chatResult.removed;
        results.errors += chatResult.errors;
      } catch (error) {
        logger.error(
          'Error processing chat for NFT revalidation',
          {
            chatId: chat.id,
            error: error instanceof Error ? error.message : String(error),
          },
          'nft-revalidate'
        );
        results.errors++;
      }
    }

    logger.info(
      'NFT revalidation cron job completed',
      {
        duration: Date.now() - startTime,
        ...results,
      },
      'nft-revalidate'
    );

    return NextResponse.json({
      success: true,
      results,
    });
  } catch (error) {
    logger.error(
      'NFT revalidation cron job failed',
      { error: error instanceof Error ? error.message : String(error) },
      'nft-revalidate'
    );
    return NextResponse.json(
      {
        error: 'NFT revalidation failed',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

/**
 * Revalidate NFT access for a single chat
 */
async function revalidateChatAccess(
  chatId: string,
  groupId: string | null,
  contractAddress: string,
  tokenId: number | null,
  chainId: number | null
): Promise<{ checked: number; removed: number; errors: number }> {
  const results = { checked: 0, removed: 0, errors: 0 };

  // Get participants with wallet addresses
  const participants = await asSystem(async (database) => {
    const participantList = await database
      .select({
        participantId: chatParticipants.id,
        userId: chatParticipants.userId,
      })
      .from(chatParticipants)
      .where(eq(chatParticipants.chatId, chatId))
      .limit(MAX_USERS_PER_CHAT);

    if (participantList.length === 0) return [];

    const userIds = participantList.map((p) => p.userId);
    const usersList = await database
      .select({
        id: users.id,
        walletAddress: users.walletAddress,
      })
      .from(users)
      .where(inArray(users.id, userIds));

    const usersMap = new Map(usersList.map((u) => [u.id, u]));

    return participantList.map((p) => ({
      userId: p.userId,
      walletAddress: usersMap.get(p.userId)?.walletAddress ?? null,
    }));
  }, 'nft-revalidate-cron');

  for (const participant of participants) {
    results.checked++;

    // Skip users without wallet - they can't own NFTs
    if (!participant.walletAddress) {
      // Remove user without wallet from NFT-gated chat
      try {
        await removeUserFromChat(
          chatId,
          groupId,
          participant.userId,
          'No wallet connected'
        );
        results.removed++;
      } catch {
        results.errors++;
      }
      continue;
    }

    try {
      // Check NFT ownership (uses cache, so generally fast)
      const verification = await NFTVerificationService.verifyChatAccess(
        participant.walletAddress,
        contractAddress,
        tokenId,
        chainId ?? undefined
      );

      if (!verification.canAccess) {
        // Invalidate cache and recheck to be sure
        await NFTVerificationService.invalidateOwnershipCache(
          participant.walletAddress,
          contractAddress,
          chainId ?? undefined
        );

        const freshCheck = await NFTVerificationService.verifyChatAccess(
          participant.walletAddress,
          contractAddress,
          tokenId,
          chainId ?? undefined
        );

        if (!freshCheck.canAccess) {
          await removeUserFromChat(
            chatId,
            groupId,
            participant.userId,
            freshCheck.reason ?? 'No longer owns required NFT'
          );
          results.removed++;

          logger.info(
            'User removed from NFT-gated chat',
            {
              chatId,
              userId: participant.userId,
              reason: freshCheck.reason,
            },
            'nft-revalidate'
          );
        }
      }
    } catch (error) {
      // Log but don't fail the whole job for one user
      logger.warn(
        'Error checking NFT ownership for user',
        {
          chatId,
          userId: participant.userId,
          error: error instanceof Error ? error.message : String(error),
        },
        'nft-revalidate'
      );
      results.errors++;
    }
  }

  return results;
}

/**
 * Helper to remove a user from an NFT-gated chat
 */
async function removeUserFromChat(
  chatId: string,
  groupId: string | null,
  userId: string,
  reason: string
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .delete(chatParticipants)
      .where(
        and(
          eq(chatParticipants.chatId, chatId),
          eq(chatParticipants.userId, userId)
        )
      );

    if (groupId) {
      await tx
        .update(groupMembers)
        .set({
          isActive: false,
          kickedAt: new Date(),
          kickReason: reason,
        })
        .where(
          and(
            eq(groupMembers.groupId, groupId),
            eq(groupMembers.userId, userId),
            eq(groupMembers.isActive, true)
          )
        );
    }
  });
}
