/**
 * User Groups API
 * 
 * @route GET /api/user-groups - Get user groups
 * @route POST /api/user-groups - Create user group
 * @access Authenticated
 * 
 * @description
 * Manages user-created groups. GET returns all groups the user is a member or admin of.
 * POST creates a new group with optional initial members. Users can only add other users
 * (not NPCs) to groups.
 * 
 * @openapi
 * /api/user-groups:
 *   get:
 *     tags:
 *       - User Groups
 *     summary: Get user groups
 *     description: Returns all groups the authenticated user is a member or admin of
 *     security:
 *       - PrivyAuth: []
 *     responses:
 *       200:
 *         description: Groups retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 groups:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       name:
 *                         type: string
 *                       description:
 *                         type: string
 *                       members:
 *                         type: array
 *                       admins:
 *                         type: array
 *       401:
 *         description: Unauthorized
 *   post:
 *     tags:
 *       - User Groups
 *     summary: Create user group
 *     description: Creates a new user group with optional initial members
 *     security:
 *       - PrivyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *             properties:
 *               name:
 *                 type: string
 *                 minLength: 1
 *                 maxLength: 100
 *               description:
 *                 type: string
 *                 maxLength: 500
 *               memberIds:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       201:
 *         description: Group created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 group:
 *                   type: object
 *       400:
 *         description: Invalid input
 *       401:
 *         description: Unauthorized
 * 
 * @example
 * ```typescript
 * // Get groups
 * const { groups } = await fetch('/api/user-groups', {
 *   headers: { 'Authorization': `Bearer ${token}` }
 * }).then(r => r.json());
 * 
 * // Create group
 * await fetch('/api/user-groups', {
 *   method: 'POST',
 *   headers: { 'Authorization': `Bearer ${token}` },
 *   body: JSON.stringify({
 *     name: 'My Group',
 *     description: 'Group description',
 *     memberIds: ['user-id-1', 'user-id-2']
 *   })
 * });
 * ```
 */

import type { NextRequest} from 'next/server';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { authenticate } from '@/lib/api/auth-middleware';
import { generateSnowflakeId } from '@/lib/snowflake';
import { withErrorHandling } from '@/lib/errors/error-handler';
import { z } from 'zod';

const createGroupSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  memberIds: z.array(z.string()).optional().default([]),
});

/**
 * GET /api/user-groups
 * Get all groups the authenticated user is in (as member or admin)
 */
export const GET = withErrorHandling(async (request: NextRequest) => {
  const user = await authenticate(request);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Get groups where user is a member
  const memberGroups = await prisma.userGroup.findMany({
    where: {
      UserGroupMember: {
        some: {
          userId: user.userId,
        },
      },
    },
    include: {
      UserGroupMember: {
        select: {
          userId: true,
          joinedAt: true,
        },
      },
      UserGroupAdmin: {
        select: {
          userId: true,
        },
      },
    },
    orderBy: {
      createdAt: 'desc',
    },
  });

  // Format response
  const groups = memberGroups.map(group => ({
    id: group.id,
    name: group.name,
    description: group.description,
    createdById: group.createdById,
    createdAt: group.createdAt,
    memberCount: group.UserGroupMember.length,
    isAdmin: group.UserGroupAdmin.some(admin => admin.userId === user.userId),
  }));

  return NextResponse.json({ 
    success: true,
    data: groups 
  });
});

/**
 * POST /api/user-groups
 * Create a new user group
 */
export const POST = withErrorHandling(async (request: NextRequest) => {
  const user = await authenticate(request);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const validatedData = createGroupSchema.parse(body);

  // Validate that all memberIds are real users (not NPCs)
  if (validatedData.memberIds.length > 0) {
    const users = await prisma.user.findMany({
      where: {
        id: {
          in: validatedData.memberIds,
        },
        isActor: false, // Ensure they're not NPCs
      },
      select: {
        id: true,
      },
    });

    if (users.length !== validatedData.memberIds.length) {
      return NextResponse.json(
        { error: 'Some user IDs are invalid or refer to NPCs' },
        { status: 400 }
      );
    }
  }

  // Create the group
  const groupId = await generateSnowflakeId();
  const memberIdVal = await generateSnowflakeId();
  const adminIdVal = await generateSnowflakeId();
  
  const group = await prisma.userGroup.create({
    data: {
      id: groupId,
      name: validatedData.name,
      description: validatedData.description,
      createdById: user.userId,
      updatedAt: new Date(),
      // Add creator as member and admin
      UserGroupMember: {
        create: {
          id: memberIdVal,
          userId: user.userId,
          addedBy: user.userId,
        },
      },
      UserGroupAdmin: {
        create: {
          id: adminIdVal,
          userId: user.userId,
          grantedBy: user.userId,
        },
      },
    },
    include: {
      UserGroupMember: true,
      UserGroupAdmin: true,
    },
  });

  // Add initial members if provided
  if (validatedData.memberIds.length > 0) {
    const filteredIds = validatedData.memberIds.filter(id => id !== user.userId);
    const memberData = await Promise.all(
      filteredIds.map(async (memberId) => ({
        id: await generateSnowflakeId(),
        groupId: groupId,
        userId: memberId,
        addedBy: user.userId,
      }))
    );

    await prisma.userGroupMember.createMany({
      data: memberData,
    });
  }

  // Create a Chat for this group
  const chatId = await generateSnowflakeId();
  const creatorChatParticipantId = await generateSnowflakeId();
  const otherChatParticipantIds = await Promise.all(
    validatedData.memberIds
      .filter(id => id !== user.userId)
      .map(async () => await generateSnowflakeId())
  );
  
  await prisma.chat.create({
    data: {
      id: chatId,
      name: validatedData.name,
      isGroup: true,
      updatedAt: new Date(),
      ChatParticipant: {
        create: [
          {
            id: creatorChatParticipantId,
            userId: user.userId,
          },
          ...validatedData.memberIds
            .filter(id => id !== user.userId)
            .map((memberId, idx) => ({
              id: otherChatParticipantIds[idx]!,
              userId: memberId,
            })),
        ],
      },
    },
  });

  return NextResponse.json({
    success: true,
    data: {
      id: group.id,
      name: group.name,
      description: group.description,
      chatId,
      createdAt: group.createdAt,
    },
  }, { status: 201 });
});

