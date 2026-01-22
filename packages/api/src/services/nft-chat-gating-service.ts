import { and, chatParticipants, chats, db, eq, groupMembers } from '@babylon/db';
import { generateSnowflakeId, logger, ValidationError } from '@babylon/shared';
import { sql } from 'drizzle-orm';
import { AuthorizationError, NotFoundError } from '../errors';
import { isUserAdmin } from '../admin-middleware';
import { hasNftAccess } from './nft-access-service';

export interface NftChatGatingConfig {
  enabled: boolean;
  chatId: string | null;
}

function parseBooleanFlag(value: string | undefined): boolean {
  if (!value) return false;
  return ['true', '1', 'yes', 'on'].includes(value.toLowerCase());
}

export function getNftChatGatingConfig(): NftChatGatingConfig {
  const enabled = parseBooleanFlag(process.env.NFT_CHAT_GATING_ENABLED);
  const chatId = process.env.NFT_CHAT_GATING_CHAT_ID?.trim() || null;
  return { enabled, chatId };
}

function assertChatIdConfigured(config: NftChatGatingConfig): string {
  if (!config.enabled) {
    throw new ValidationError(
      'NFT chat gating is disabled',
      ['NFT_CHAT_GATING_ENABLED'],
      [{ field: 'NFT_CHAT_GATING_ENABLED', message: 'Flag is disabled' }]
    );
  }

  if (!config.chatId) {
    throw new ValidationError(
      'NFT chat gating chat id not configured',
      ['NFT_CHAT_GATING_CHAT_ID'],
      [
        {
          field: 'NFT_CHAT_GATING_CHAT_ID',
          message: 'Must be set when NFT chat gating is enabled',
        },
      ]
    );
  }

  return config.chatId;
}

export function isNftChatGatedChat(chatId: string): boolean {
  const { enabled, chatId: gatedChatId } = getNftChatGatingConfig();
  return enabled && gatedChatId !== null && chatId === gatedChatId;
}

export async function canAccessNftChatGate(
  userId: string,
  chatId: string
): Promise<boolean> {
  if (!isNftChatGatedChat(chatId)) return true;

  const isAdmin = await isUserAdmin(userId);
  if (isAdmin) return true;

  return hasNftAccess(userId);
}

export async function requireNftChatAccess(
  user: { userId: string; isAgent?: boolean },
  chatId: string
): Promise<void> {
  if (!isNftChatGatedChat(chatId)) return;
  if (user.isAgent) return;

  const allowed = await canAccessNftChatGate(user.userId, chatId);
  if (!allowed) {
    throw new AuthorizationError('NFT chat access required', 'chat', 'access', {
      chatId,
    });
  }
}

export async function ensureNftChatMembership(userId: string): Promise<{
  success: true;
  chatId: string;
}> {
  const config = getNftChatGatingConfig();
  const chatId = assertChatIdConfigured(config);

  const isAdmin = await isUserAdmin(userId);
  const allowed = isAdmin ? true : await hasNftAccess(userId);

  if (!allowed) {
    throw new AuthorizationError('NFT chat access required', 'chat', 'join', {
      chatId,
    });
  }

  const [chat] = await db
    .select({ id: chats.id, isGroup: chats.isGroup, groupId: chats.groupId })
    .from(chats)
    .where(eq(chats.id, chatId))
    .limit(1);

  if (!chat) {
    throw new NotFoundError('Chat', chatId);
  }
  if (!chat.isGroup || !chat.groupId) {
    throw new ValidationError(
      'NFT gated chat is not a group chat',
      ['chatId'],
      [
        {
          field: 'chatId',
          message: 'Chat must be a group chat with a linked groupId',
        },
      ]
    );
  }

  const now = new Date();

  await db.transaction(async (tx) => {
    const memberId = await generateSnowflakeId();
    await tx
      .insert(groupMembers)
      .values({
        id: memberId,
        groupId: chat.groupId!,
        userId,
        role: 'member',
        addedBy: 'system',
        joinedAt: now,
        isActive: true,
        messageCount: 0,
        qualityScore: 1.0,
      })
      .onConflictDoUpdate({
        target: [groupMembers.groupId, groupMembers.userId],
        set: {
          isActive: true,
          role: 'member',
          addedBy: 'system',
          joinedAt: now,
          kickedAt: sql`NULL`,
          kickReason: sql`NULL`,
        },
      });

    const participantId = await generateSnowflakeId();
    await tx
      .insert(chatParticipants)
      .values({
        id: participantId,
        chatId,
        userId,
        joinedAt: now,
        isActive: true,
      })
      .onConflictDoUpdate({
        target: [chatParticipants.chatId, chatParticipants.userId],
        set: {
          isActive: true,
          joinedAt: now,
        },
      });
  });

  logger.info(
    'Ensured NFT gated chat membership',
    { userId, chatId },
    'NFTChatGatingService'
  );

  return { success: true, chatId };
}

export async function revokeNftChatMembershipIfNeeded(
  userId: string,
  chatId: string,
  reason: string
): Promise<void> {
  if (!isNftChatGatedChat(chatId)) return;
  const isAdmin = await isUserAdmin(userId);
  if (isAdmin) return;

  const allowed = await hasNftAccess(userId);
  if (allowed) return;

  const [chat] = await db
    .select({ groupId: chats.groupId })
    .from(chats)
    .where(eq(chats.id, chatId))
    .limit(1);

  const groupId = chat?.groupId ?? null;

  await db.transaction(async (tx) => {
    await tx
      .update(chatParticipants)
      .set({ isActive: false })
      .where(
        and(
          eq(chatParticipants.chatId, chatId),
          eq(chatParticipants.userId, userId),
          eq(chatParticipants.isActive, true)
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

