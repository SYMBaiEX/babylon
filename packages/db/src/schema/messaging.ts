import { relations } from 'drizzle-orm';
import {
  boolean,
  doublePrecision,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
} from 'drizzle-orm/pg-core';

// Chat
export const chats = pgTable(
  'Chat',
  {
    id: text('id').primaryKey(),
    name: text('name'),
    description: text('description'),
    isGroup: boolean('isGroup').notNull().default(false),
    createdBy: text('createdBy'),
    gameId: text('gameId'),
    dayNumber: integer('dayNumber'),
    relatedQuestion: integer('relatedQuestion'),
    createdAt: timestamp('createdAt', { mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updatedAt', { mode: 'date' }).notNull(),
    groupId: text('groupId'), // Link to unified Group table
  },
  (table) => [
    index('Chat_gameId_dayNumber_idx').on(table.gameId, table.dayNumber),
    index('Chat_groupId_idx').on(table.groupId),
    index('Chat_isGroup_idx').on(table.isGroup),
    index('Chat_createdBy_idx').on(table.createdBy),
    index('Chat_relatedQuestion_idx').on(table.relatedQuestion),
  ]
);

// ChatParticipant
// Low-level messaging access. For group chats, use GroupMember for role/quality tracking.
// Note: messageCount, qualityScore, kickedAt, kickReason fields are legacy for group chats.
// New group chats should track these in GroupMember instead.
export const chatParticipants = pgTable(
  'ChatParticipant',
  {
    id: text('id').primaryKey(),
    chatId: text('chatId').notNull(),
    userId: text('userId').notNull(),
    joinedAt: timestamp('joinedAt', { mode: 'date' }).notNull().defaultNow(),
    invitedBy: text('invitedBy'),
    isActive: boolean('isActive').notNull().default(true),
    // Legacy fields for group chats - use GroupMember.* instead for new code
    lastMessageAt: timestamp('lastMessageAt', { mode: 'date' }),
    messageCount: integer('messageCount').notNull().default(0),
    qualityScore: doublePrecision('qualityScore').notNull().default(1.0),
    kickedAt: timestamp('kickedAt', { mode: 'date' }),
    kickReason: text('kickReason'),
    addedBy: text('addedBy'),
  },
  (table) => [
    unique('ChatParticipant_chatId_userId_key').on(table.chatId, table.userId),
    index('ChatParticipant_chatId_idx').on(table.chatId),
    index('ChatParticipant_userId_idx').on(table.userId),
    index('ChatParticipant_chatId_isActive_idx').on(
      table.chatId,
      table.isActive
    ),
    index('ChatParticipant_lastMessageAt_idx').on(table.lastMessageAt),
    index('ChatParticipant_userId_isActive_idx').on(
      table.userId,
      table.isActive
    ),
  ]
);

// Message
export const messages = pgTable(
  'Message',
  {
    id: text('id').primaryKey(),
    chatId: text('chatId').notNull(),
    senderId: text('senderId').notNull(),
    content: text('content').notNull(),
    createdAt: timestamp('createdAt', { mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    index('Message_chatId_createdAt_idx').on(table.chatId, table.createdAt),
    index('Message_senderId_idx').on(table.senderId),
  ]
);

// DMAcceptance
export const dmAcceptances = pgTable(
  'DMAcceptance',
  {
    id: text('id').primaryKey(),
    chatId: text('chatId').notNull().unique(),
    userId: text('userId').notNull(),
    otherUserId: text('otherUserId').notNull(),
    status: text('status').notNull().default('pending'),
    createdAt: timestamp('createdAt', { mode: 'date' }).notNull().defaultNow(),
    acceptedAt: timestamp('acceptedAt', { mode: 'date' }),
    rejectedAt: timestamp('rejectedAt', { mode: 'date' }),
  },
  (table) => [
    index('DMAcceptance_status_createdAt_idx').on(
      table.status,
      table.createdAt
    ),
    index('DMAcceptance_userId_status_idx').on(table.userId, table.status),
  ]
);

// Notification
export const notifications = pgTable(
  'Notification',
  {
    id: text('id').primaryKey(),
    userId: text('userId').notNull(),
    type: text('type').notNull(),
    actorId: text('actorId'),
    postId: text('postId'),
    commentId: text('commentId'),
    chatId: text('chatId'),
    message: text('message').notNull(),
    read: boolean('read').notNull().default(false),
    createdAt: timestamp('createdAt', { mode: 'date' }).notNull().defaultNow(),
    title: text('title').notNull(),
    groupId: text('groupId'),
    inviteId: text('inviteId'),
  },
  (table) => [
    index('Notification_chatId_idx').on(table.chatId),
    index('Notification_groupId_idx').on(table.groupId),
    index('Notification_inviteId_idx').on(table.inviteId),
    index('Notification_read_idx').on(table.read),
    index('Notification_userId_createdAt_idx').on(
      table.userId,
      table.createdAt
    ),
    index('Notification_userId_read_createdAt_idx').on(
      table.userId,
      table.read,
      table.createdAt
    ),
    index('Notification_userId_type_read_idx').on(
      table.userId,
      table.type,
      table.read
    ),
  ]
);

// ============================================================================
// UNIFIED GROUP SYSTEM
// ============================================================================

/**
 * Group - unified table for all group types
 * Supports: user-created groups, NPC-managed groups, agent-created groups
 *
 * Relationship: Chat.groupId → Group.id (one Chat per Group)
 */
export const groups = pgTable(
  'Group',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    description: text('description'),
    // 'user' = user-created group
    // 'npc' = NPC-managed group (has quality tracking, kick mechanics)
    // 'agent' = agent-created group
    type: text('type').notNull(),
    ownerId: text('ownerId').notNull(), // user/NPC/agent who controls it
    createdById: text('createdById').notNull(),
    createdAt: timestamp('createdAt', { mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updatedAt', { mode: 'date' }).notNull(),
  },
  (table) => [
    index('Group_type_idx').on(table.type),
    index('Group_ownerId_idx').on(table.ownerId),
    index('Group_createdById_idx').on(table.createdById),
    index('Group_createdAt_idx').on(table.createdAt),
  ]
);

/**
 * GroupMember - unified membership table with roles and quality tracking
 */
export const groupMembers = pgTable(
  'GroupMember',
  {
    id: text('id').primaryKey(),
    groupId: text('groupId').notNull(),
    userId: text('userId').notNull(),
    // 'owner' = creator/controller of the group
    // 'admin' = can manage members
    // 'member' = regular participant
    role: text('role').notNull().default('member'),
    joinedAt: timestamp('joinedAt', { mode: 'date' }).notNull().defaultNow(),
    addedBy: text('addedBy'),
    isActive: boolean('isActive').notNull().default(true),
    // Quality tracking (used for NPC groups' kick mechanics)
    lastMessageAt: timestamp('lastMessageAt', { mode: 'date' }),
    messageCount: integer('messageCount').notNull().default(0),
    qualityScore: doublePrecision('qualityScore').notNull().default(1.0),
    // Kick tracking
    kickedAt: timestamp('kickedAt', { mode: 'date' }),
    kickReason: text('kickReason'),
  },
  (table) => [
    unique('GroupMember_groupId_userId_key').on(table.groupId, table.userId),
    index('GroupMember_groupId_idx').on(table.groupId),
    index('GroupMember_userId_idx').on(table.userId),
    index('GroupMember_groupId_isActive_idx').on(table.groupId, table.isActive),
    index('GroupMember_userId_isActive_idx').on(table.userId, table.isActive),
    index('GroupMember_lastMessageAt_idx').on(table.lastMessageAt),
    index('GroupMember_role_idx').on(table.role),
  ]
);

/**
 * GroupInvite - unified invite system
 */
export const groupInvites = pgTable(
  'GroupInvite',
  {
    id: text('id').primaryKey(),
    groupId: text('groupId').notNull(),
    invitedUserId: text('invitedUserId').notNull(),
    invitedBy: text('invitedBy').notNull(),
    // 'pending' | 'accepted' | 'declined'
    status: text('status').notNull().default('pending'),
    message: text('message'),
    invitedAt: timestamp('invitedAt', { mode: 'date' }).notNull().defaultNow(),
    respondedAt: timestamp('respondedAt', { mode: 'date' }),
  },
  (table) => [
    unique('GroupInvite_groupId_invitedUserId_key').on(
      table.groupId,
      table.invitedUserId
    ),
    index('GroupInvite_groupId_idx').on(table.groupId),
    index('GroupInvite_invitedUserId_status_idx').on(
      table.invitedUserId,
      table.status
    ),
    index('GroupInvite_status_idx').on(table.status),
  ]
);

// ============================================================================
// RELATIONS
// ============================================================================

export const chatsRelations = relations(chats, ({ one, many }) => ({
  ChatParticipant: many(chatParticipants),
  Message: many(messages),
  group: one(groups, {
    fields: [chats.groupId],
    references: [groups.id],
  }),
}));

export const chatParticipantsRelations = relations(
  chatParticipants,
  ({ one }) => ({
    chat: one(chats, {
      fields: [chatParticipants.chatId],
      references: [chats.id],
    }),
  })
);

export const messagesRelations = relations(messages, ({ one }) => ({
  chat: one(chats, {
    fields: [messages.chatId],
    references: [chats.id],
  }),
}));

export const groupsRelations = relations(groups, ({ many }) => ({
  chats: many(chats),
  members: many(groupMembers),
  invites: many(groupInvites),
}));

export const groupMembersRelations = relations(groupMembers, ({ one }) => ({
  group: one(groups, {
    fields: [groupMembers.groupId],
    references: [groups.id],
  }),
}));

export const groupInvitesRelations = relations(groupInvites, ({ one }) => ({
  group: one(groups, {
    fields: [groupInvites.groupId],
    references: [groups.id],
  }),
}));

// ============================================================================
// TYPE EXPORTS
// ============================================================================

export type Chat = typeof chats.$inferSelect;
export type NewChat = typeof chats.$inferInsert;
export type ChatParticipant = typeof chatParticipants.$inferSelect;
export type NewChatParticipant = typeof chatParticipants.$inferInsert;
export type Message = typeof messages.$inferSelect;
export type NewMessage = typeof messages.$inferInsert;
export type DMAcceptance = typeof dmAcceptances.$inferSelect;
export type NewDMAcceptance = typeof dmAcceptances.$inferInsert;
export type Notification = typeof notifications.$inferSelect;
export type NewNotification = typeof notifications.$inferInsert;

// Unified Group types
export type Group = typeof groups.$inferSelect;
export type NewGroup = typeof groups.$inferInsert;
export type GroupMember = typeof groupMembers.$inferSelect;
export type NewGroupMember = typeof groupMembers.$inferInsert;
export type GroupInvite = typeof groupInvites.$inferSelect;
export type NewGroupInvite = typeof groupInvites.$inferInsert;

// Type enums (for type safety)
export type GroupType = 'user' | 'npc' | 'agent';
export type GroupMemberRole = 'owner' | 'admin' | 'member';
export type GroupInviteStatus = 'pending' | 'accepted' | 'declined';
