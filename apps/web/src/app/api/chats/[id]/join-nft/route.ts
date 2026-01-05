/**
 * Join NFT-Gated Chat API
 *
 * @route POST /api/chats/[id]/join-nft - Join an NFT-gated chat
 * @access Authenticated
 *
 * @description
 * Allows users to join an NFT-gated chat if they hold the required NFT.
 * Verifies NFT ownership before adding the user as a participant.
 */

import {
  authenticate,
  BusinessLogicError,
  NFTVerificationService,
  NotFoundError,
  successResponse,
  withErrorHandling,
} from '@babylon/api';
import {
  and,
  chatParticipants,
  chats,
  db,
  eq,
  groupMembers,
  users,
} from '@babylon/db';
import { generateSnowflakeId, logger } from '@babylon/shared';
import type { NextRequest } from 'next/server';

/**
 * POST /api/chats/[id]/join-nft
 * Join an NFT-gated chat by verifying NFT ownership
 */
export const POST = withErrorHandling(
  async (
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
  ) => {
    const user = await authenticate(request);
    const { id: chatId } = await context.params;

    if (!chatId) {
      throw new BusinessLogicError('Chat ID is required', 'CHAT_ID_REQUIRED');
    }

    // Get the chat
    const chat = await db.query.chats.findFirst({
      where: eq(chats.id, chatId),
    });

    if (!chat) {
      throw new NotFoundError('Chat', chatId);
    }

    if (!chat.nftGated || !chat.requiredNftContractAddress) {
      throw new BusinessLogicError(
        'This chat is not NFT-gated',
        'NOT_NFT_GATED'
      );
    }

    // Check if user is already a participant
    const existingParticipant = await db.query.chatParticipants.findFirst({
      where: and(
        eq(chatParticipants.chatId, chatId),
        eq(chatParticipants.userId, user.userId)
      ),
    });

    if (existingParticipant) {
      return successResponse({
        success: true,
        message: 'Already a member of this chat',
        alreadyMember: true,
      });
    }

    // Get user's wallet address
    const [userData] = await db
      .select({ walletAddress: users.walletAddress })
      .from(users)
      .where(eq(users.id, user.userId))
      .limit(1);

    if (!userData?.walletAddress) {
      throw new BusinessLogicError(
        'You need to connect a wallet to join NFT-gated chats',
        'WALLET_REQUIRED'
      );
    }

    // Invalidate cache and verify NFT ownership with fresh check
    await NFTVerificationService.invalidateOwnershipCache(
      userData.walletAddress,
      chat.requiredNftContractAddress,
      chat.requiredNftChainId ?? undefined
    );

    const verification = await NFTVerificationService.verifyChatAccess(
      userData.walletAddress,
      chat.requiredNftContractAddress,
      chat.requiredNftTokenId ?? null,
      chat.requiredNftChainId ?? undefined
    );

    if (!verification.canAccess) {
      throw new BusinessLogicError(
        verification.reason ??
          'You do not own the required NFT to join this chat',
        'NFT_REQUIRED'
      );
    }

    // Add user to chat using transaction for atomicity
    const now = new Date();
    const participantId = await generateSnowflakeId();

    try {
      await db.transaction(async (tx) => {
        // Add to chat participants
        await tx.insert(chatParticipants).values({
          id: participantId,
          chatId,
          userId: user.userId,
          joinedAt: now,
          isActive: true,
        });

        // If there's a linked group, add to group members
        if (chat.groupId) {
          const memberId = await generateSnowflakeId();
          // Check for existing inactive membership and reactivate
          const existingMember = await tx.query.groupMembers.findFirst({
            where: and(
              eq(groupMembers.groupId, chat.groupId),
              eq(groupMembers.userId, user.userId)
            ),
          });

          if (existingMember) {
            // Reactivate existing membership
            await tx
              .update(groupMembers)
              .set({
                isActive: true,
                joinedAt: now,
                kickedAt: null,
                kickReason: null,
              })
              .where(eq(groupMembers.id, existingMember.id));
          } else {
            // Create new membership
            await tx.insert(groupMembers).values({
              id: memberId,
              groupId: chat.groupId,
              userId: user.userId,
              role: 'member',
              addedBy: user.userId,
              joinedAt: now,
              isActive: true,
            });
          }
        }
      });
    } catch (error) {
      // Handle race condition - if user was already added by concurrent request
      if (
        error instanceof Error &&
        error.message.includes('unique constraint')
      ) {
        return successResponse({
          success: true,
          message: 'Already a member of this chat',
          alreadyMember: true,
        });
      }
      throw error;
    }

    logger.info(
      'User joined NFT-gated chat',
      {
        userId: user.userId,
        chatId,
        contractAddress: chat.requiredNftContractAddress,
      },
      'POST /api/chats/[id]/join-nft'
    );

    return successResponse({
      success: true,
      message: 'Successfully joined the chat',
      chat: {
        id: chat.id,
        name: chat.name,
        nftGated: true,
        contractAddress: chat.requiredNftContractAddress,
        tokenId: chat.requiredNftTokenId,
        chainId: chat.requiredNftChainId,
      },
    });
  }
);
