/**
 * User Groups Integration Tests
 * 
 * Tests user group management:
 * - Creating groups
 * - Adding/removing members
 * - Admin management
 * - Group deletion
 */

import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { prisma } from '@/lib/prisma';
import { generateSnowflakeId } from '@/lib/snowflake';

describe('User Groups', () => {
  let testUser1Id: string;
  let testUser2Id: string;
  let testUser3Id: string;
  let testGroupId: string;

  beforeAll(async () => {
    // Create test users
    testUser1Id = await generateSnowflakeId();
    testUser2Id = await generateSnowflakeId();
    testUser3Id = await generateSnowflakeId();

    await prisma.user.createMany({
      data: [
        {
          id: testUser1Id,
          username: `testuser1_${Date.now()}`,
          displayName: 'Test User 1',
          isActor: false,
          updatedAt: new Date(),
        },
        {
          id: testUser2Id,
          username: `testuser2_${Date.now()}`,
          displayName: 'Test User 2',
          isActor: false,
          updatedAt: new Date(),
        },
        {
          id: testUser3Id,
          username: `testuser3_${Date.now()}`,
          displayName: 'Test User 3',
          isActor: false,
          updatedAt: new Date(),
        },
      ],
    });
  });

  afterAll(async () => {
    if (!prisma) return;
    // Clean up test data
    await prisma.userGroup.deleteMany({
      where: {
        id: testGroupId,
      },
    });

    await prisma.user.deleteMany({
      where: {
        id: {
          in: [testUser1Id, testUser2Id, testUser3Id],
        },
      },
    });
  });

  it('should create a user group', async () => {
    testGroupId = await generateSnowflakeId();

    const group = await prisma.userGroup.create({
      data: {
        id: testGroupId,
        name: 'Test Trading Group',
        description: 'A group for testing',
        createdById: testUser1Id,
        updatedAt: new Date(),
        UserGroupMember: {
          create: {
            id: await generateSnowflakeId(),
            userId: testUser1Id,
            addedBy: testUser1Id,
          },
        },
        UserGroupAdmin: {
          create: {
            id: await generateSnowflakeId(),
            userId: testUser1Id,
            grantedBy: testUser1Id,
          },
        },
      },
      include: {
        UserGroupMember: true,
        UserGroupAdmin: true,
      },
    });

    expect(group).toBeDefined();
    expect(group.name).toBe('Test Trading Group');
    expect(group.UserGroupMember).toHaveLength(1);
    expect(group.UserGroupAdmin).toHaveLength(1);
  });

  it('should add members to group', async () => {
    // Clean up any existing memberships first to avoid conflicts
    await prisma.userGroupMember.deleteMany({
      where: {
        groupId: testGroupId,
        userId: { in: [testUser2Id, testUser3Id] },
      },
    });

    // Add user 2 using upsert to handle race conditions and ensure idempotency
    await prisma.userGroupMember.upsert({
      where: {
        groupId_userId: {
          groupId: testGroupId,
          userId: testUser2Id,
        },
      },
      create: {
        id: await generateSnowflakeId(),
        groupId: testGroupId,
        userId: testUser2Id,
        addedBy: testUser1Id,
      },
      update: {
        addedBy: testUser1Id,
      },
    });

    // Add user 3 using upsert to handle race conditions and ensure idempotency
    await prisma.userGroupMember.upsert({
      where: {
        groupId_userId: {
          groupId: testGroupId,
          userId: testUser3Id,
        },
      },
      create: {
        id: await generateSnowflakeId(),
        groupId: testGroupId,
        userId: testUser3Id,
        addedBy: testUser1Id,
      },
      update: {
        addedBy: testUser1Id,
      },
    });

    const members = await prisma.userGroupMember.findMany({
      where: { groupId: testGroupId },
    });

    expect(members.length).toBeGreaterThanOrEqual(2);
    expect(members.some(m => m.userId === testUser2Id)).toBe(true);
    expect(members.some(m => m.userId === testUser3Id)).toBe(true);
  });

  it('should grant admin privileges', async () => {
    // Clean up any existing admin relationship first to avoid conflicts
    await prisma.userGroupAdmin.deleteMany({
      where: {
        groupId: testGroupId,
        userId: testUser2Id,
      },
    });

    await prisma.userGroupAdmin.create({
      data: {
        id: await generateSnowflakeId(),
        groupId: testGroupId,
        userId: testUser2Id,
        grantedBy: testUser1Id,
      },
    });

    const admins = await prisma.userGroupAdmin.findMany({
      where: { groupId: testGroupId },
    });

    expect(admins.length).toBeGreaterThanOrEqual(1);
    expect(admins.some(a => a.userId === testUser2Id)).toBe(true);
  });

  it('should revoke admin privileges', async () => {
    // Ensure admin exists first (idempotent)
    await prisma.userGroupAdmin.upsert({
      where: {
        groupId_userId: {
          groupId: testGroupId,
          userId: testUser2Id,
        },
      },
      create: {
        id: await generateSnowflakeId(),
        groupId: testGroupId,
        userId: testUser2Id,
        grantedBy: testUser1Id,
      },
      update: {},
    });

    // Delete using deleteMany to be idempotent
    const deleteResult = await prisma.userGroupAdmin.deleteMany({
      where: {
        groupId: testGroupId,
        userId: testUser2Id,
      },
    });

    expect(deleteResult.count).toBe(1);

    const admins = await prisma.userGroupAdmin.findMany({
      where: { groupId: testGroupId },
    });

    expect(admins.length).toBeGreaterThanOrEqual(1);
    expect(admins.some(a => a.userId === testUser1Id)).toBe(true);
    expect(admins.some(a => a.userId === testUser2Id)).toBe(false);
  });

  it('should remove member from group', async () => {
    // Clean up any existing membership first to avoid conflicts
    await prisma.userGroupMember.deleteMany({
      where: {
        groupId: testGroupId,
        userId: testUser3Id,
      },
    });

    // Wait a bit to ensure cleanup is committed
    await new Promise(resolve => setTimeout(resolve, 50));

    // Verify cleanup worked
    const existing = await prisma.userGroupMember.findUnique({
      where: {
        groupId_userId: {
          groupId: testGroupId,
          userId: testUser3Id,
        },
      },
    });

    if (existing) {
      // Force delete if still exists
      await prisma.userGroupMember.delete({
        where: {
          groupId_userId: {
            groupId: testGroupId,
            userId: testUser3Id,
          },
        },
      });
      await new Promise(resolve => setTimeout(resolve, 50));
    }

    // Ensure the member exists first (idempotent - add if doesn't exist)
    await prisma.userGroupMember.upsert({
      where: {
        groupId_userId: {
          groupId: testGroupId,
          userId: testUser3Id,
        },
      },
      create: {
        id: await generateSnowflakeId(),
        groupId: testGroupId,
        userId: testUser3Id,
        addedBy: testUser1Id,
      },
      update: {},
    });

    // Verify member exists before deletion
    const beforeDelete = await prisma.userGroupMember.findUnique({
      where: {
        groupId_userId: {
          groupId: testGroupId,
          userId: testUser3Id,
        },
      },
    });

    expect(beforeDelete).toBeDefined();

    // Delete the member using deleteMany to be idempotent (won't fail if already deleted)
    const deleteResult = await prisma.userGroupMember.deleteMany({
      where: {
        groupId: testGroupId,
        userId: testUser3Id,
      },
    });

    expect(deleteResult.count).toBe(1);

    // Verify deletion worked
    const afterDelete = await prisma.userGroupMember.findUnique({
      where: {
        groupId_userId: {
          groupId: testGroupId,
          userId: testUser3Id,
        },
      },
    });

    expect(afterDelete).toBeNull();

    const members = await prisma.userGroupMember.findMany({
      where: { groupId: testGroupId },
    });

    expect(members.length).toBeGreaterThanOrEqual(1);
    expect(members.some(m => m.userId === testUser3Id)).toBe(false);
  });

  it('should prevent duplicate members', async () => {
    // Ensure testUser2Id is a member first
    await prisma.userGroupMember.upsert({
      where: {
        groupId_userId: {
          groupId: testGroupId,
          userId: testUser2Id,
        },
      },
      create: {
        id: await generateSnowflakeId(),
        groupId: testGroupId,
        userId: testUser2Id,
        addedBy: testUser1Id,
      },
      update: {},
    });

    // Verify member exists
    const existing = await prisma.userGroupMember.findUnique({
      where: {
        groupId_userId: {
          groupId: testGroupId,
          userId: testUser2Id,
        },
      },
    });

    expect(existing).toBeDefined();

    // Now try to create duplicate - should fail
    await expect(
      prisma.userGroupMember.create({
        data: {
          id: await generateSnowflakeId(),
          groupId: testGroupId,
          userId: testUser2Id, // Already a member
          addedBy: testUser1Id,
        },
      })
    ).rejects.toThrow();
  });

  it('should find groups for a user', async () => {
    const groups = await prisma.userGroup.findMany({
      where: {
        UserGroupMember: {
          some: {
            userId: testUser1Id,
          },
        },
      },
      include: {
        UserGroupMember: true,
      },
    });

    expect(groups.length).toBeGreaterThan(0);
    expect(groups[0]?.id).toBe(testGroupId);
  });
});

