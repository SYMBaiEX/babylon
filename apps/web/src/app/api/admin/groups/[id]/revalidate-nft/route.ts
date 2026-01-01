/**
 * Admin NFT Revalidation API
 *
 * @route POST /api/admin/groups/[id]/revalidate-nft - Revalidate NFT access for all members
 * @access Admin
 *
 * @description
 * Triggers a revalidation of NFT ownership for all members in an NFT-gated chat.
 * Members who no longer own the required NFT will be removed from the chat.
 */

import {
  getClientIp,
  logAdminView,
  NFTVerificationService,
  requireAdmin,
  successResponse,
  withErrorHandling,
} from '@babylon/api';
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

/**
 * POST /api/admin/groups/[id]/revalidate-nft
 * Revalidate NFT access for all members of an NFT-gated chat
 * Removes members who no longer own the required NFT
 */
export const POST = withErrorHandling(
  async (
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
  ) => {
    const admin = await requireAdmin(request);
    const { id: chatId } = await context.params;

    logAdminView({
      adminId: admin.userId,
      ipAddress: getClientIp(request.headers) ?? undefined,
      resourceType: 'nft-groups',
      resourceId: chatId,
      metadata: { action: 'revalidate_nft_access' },
    });

    // Get the chat and verify it's NFT-gated
    const chat = await db.query.chats.findFirst({
      where: eq(chats.id, chatId),
    });

    if (!chat) {
      return successResponse({ error: 'Chat not found' }, 404);
    }

    if (!chat.nftGated || !chat.requiredNftContractAddress) {
      return successResponse({ error: 'Chat is not NFT-gated' }, 400);
    }

    // Get all participants with their wallet addresses
    const participants = await asSystem(async (database) => {
      const participantList = await database
        .select({
          participantId: chatParticipants.id,
          userId: chatParticipants.userId,
        })
        .from(chatParticipants)
        .where(eq(chatParticipants.chatId, chatId));

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
        participantId: p.participantId,
        userId: p.userId,
        walletAddress: usersMap.get(p.userId)?.walletAddress ?? null,
      }));
    }, 'admin-revalidate-nft');

    // Check each participant's NFT ownership
    const results = {
      total: participants.length,
      validated: 0,
      removed: 0,
      noWallet: 0,
      errors: 0,
      removedUsers: [] as string[],
    };

    for (const participant of participants) {
      // Skip admin user (don't remove the owner)
      if (participant.userId === admin.userId) {
        results.validated++;
        continue;
      }

      if (!participant.walletAddress) {
        // No wallet - remove from chat
        await removeUserFromChat(
          chatId,
          chat.groupId,
          participant.userId,
          'No wallet connected'
        );
        results.noWallet++;
        results.removedUsers.push(participant.userId);
        continue;
      }

      try {
        // Invalidate cache first to ensure fresh check
        await NFTVerificationService.invalidateOwnershipCache(
          participant.walletAddress,
          chat.requiredNftContractAddress,
          chat.requiredNftChainId ?? undefined
        );

        // Check NFT ownership
        const verification = await NFTVerificationService.verifyChatAccess(
          participant.walletAddress,
          chat.requiredNftContractAddress,
          chat.requiredNftTokenId ?? null,
          chat.requiredNftChainId ?? undefined
        );

        if (!verification.canAccess) {
          // Remove user from chat
          await removeUserFromChat(
            chatId,
            chat.groupId,
            participant.userId,
            verification.reason ?? 'No longer owns required NFT'
          );
          results.removed++;
          results.removedUsers.push(participant.userId);
        } else {
          results.validated++;
        }
      } catch (error) {
        logger.error(
          'Error validating NFT ownership',
          {
            userId: participant.userId,
            chatId,
            error: error instanceof Error ? error.message : String(error),
          },
          'POST /api/admin/groups/[id]/revalidate-nft'
        );
        results.errors++;
      }
    }

    logger.info(
      'NFT revalidation completed',
      {
        adminId: admin.userId,
        chatId,
        results,
      },
      'POST /api/admin/groups/[id]/revalidate-nft'
    );

    return successResponse({
      revalidation: {
        chatId,
        contractAddress: chat.requiredNftContractAddress,
        total: results.total,
        stillValid: results.validated,
        removed: results.removed,
        noWallet: results.noWallet,
        errors: results.errors,
        removedUserIds: results.removedUsers,
      },
    });
  }
);

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
    // Remove from chat participants
    await tx
      .delete(chatParticipants)
      .where(
        and(
          eq(chatParticipants.chatId, chatId),
          eq(chatParticipants.userId, userId)
        )
      );

    // If there's a linked group, update group membership
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
