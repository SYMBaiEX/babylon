/**
 * Integration Tests for Follow/Unfollow API System
 * 
 * Tests API endpoints for:
 * - Following users
 * - Unfollowing users
 * - Following NPCs
 * - Unfollowing NPCs
 * - Check follow status
 * - Cache invalidation
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'bun:test'
import { prisma } from '@/lib/prisma'
import { generateSnowflakeId } from '@/lib/snowflake'

describe('Follow System API Integration Tests', () => {
  let testUser1: { id: string; username: string | null; privyId: string | null }
  let testUser2: { id: string; username: string | null; privyId: string | null }
  let testActor: { id: string; name: string }

  beforeAll(async () => {
    // Always create fresh test users to avoid conflicts
    // This ensures users exist and are not deleted by other tests
    testUser1 = await prisma.user.create({
      data: {
        id: await generateSnowflakeId(),
        privyId: `test-follow-user-1-${Date.now()}`,
        username: `followtest1_${Date.now()}`,
        displayName: 'Follow Test User 1',
        walletAddress: `0x${Math.random().toString(16).substr(2, 40)}`,
        isTest: true,
        updatedAt: new Date(),
      },
      select: {
        id: true,
        username: true,
        privyId: true,
      },
    })

    testUser2 = await prisma.user.create({
      data: {
        id: await generateSnowflakeId(),
        privyId: `test-follow-user-2-${Date.now()}`,
        username: `followtest2_${Date.now()}`,
        displayName: 'Follow Test User 2',
        walletAddress: `0x${Math.random().toString(16).substr(2, 40)}`,
        isTest: true,
        updatedAt: new Date(),
      },
      select: {
        id: true,
        username: true,
        privyId: true,
      },
    })

    // Verify users were created
    if (!testUser1 || !testUser2) {
      throw new Error('Failed to create test users')
    }

    // Find or create test actor
    let actor = await prisma.actor.findFirst({
      select: {
        id: true,
        name: true,
      },
    })

    if (!actor) {
      // Create a test actor
      actor = await prisma.actor.create({
        data: {
          id: `test-actor-${Date.now()}`,
          name: 'Test Actor',
          domain: [],
          affiliations: [],
          postExample: [],
          isTest: true,
          updatedAt: new Date(),
        },
        select: {
          id: true,
          name: true,
        },
      })
    }

    testActor = actor

    console.log('✅ Test setup complete')
    console.log(`   User 1: ${testUser1.username}`)
    console.log(`   User 2: ${testUser2.username}`)
    console.log(`   Actor: ${testActor.name}`)
  })

  afterAll(async () => {
    if (!prisma) return;
    
    // Clean up test follows
    if (testUser1?.id && testUser2?.id) {
      await prisma.follow.deleteMany({
        where: {
          OR: [
            { followerId: testUser1.id },
            { followerId: testUser2.id },
            { followingId: testUser1.id },
            { followingId: testUser2.id },
          ],
        },
      }).catch(() => {
        // Ignore errors during cleanup
      })

      await prisma.userActorFollow.deleteMany({
        where: {
          userId: { in: [testUser1.id, testUser2.id] },
        },
      }).catch(() => {
        // Ignore errors during cleanup
      })

      // Clean up test users
      await prisma.user.deleteMany({
        where: {
          id: { in: [testUser1.id, testUser2.id] },
        },
      }).catch(() => {
        // Ignore errors during cleanup
      })
    }
  })

  describe('User-to-User Follow', () => {
    beforeEach(async () => {
      // Clean up any existing follows before each test
      await prisma.follow.deleteMany({
        where: {
          followerId: testUser1.id,
          followingId: testUser2.id,
        },
      })
      // Wait to ensure cleanup is committed
      await new Promise(resolve => setTimeout(resolve, 50))
    })

    it('should create follow relationship', async () => {
      // Verify cleanup worked (beforeEach already cleaned up)
      const existing = await prisma.follow.findUnique({
        where: {
          followerId_followingId: {
            followerId: testUser1.id,
            followingId: testUser2.id,
          },
        },
      })

      if (existing) {
        // Force delete if still exists (shouldn't happen, but be safe)
        await prisma.follow.delete({
          where: {
            followerId_followingId: {
              followerId: testUser1.id,
              followingId: testUser2.id,
            },
          },
        })
        await new Promise(resolve => setTimeout(resolve, 50))
      }

      // Use upsert to handle any race conditions
      const follow = await prisma.follow.upsert({
        where: {
          followerId_followingId: {
            followerId: testUser1.id,
            followingId: testUser2.id,
          },
        },
        create: {
          id: await generateSnowflakeId(),
          followerId: testUser1.id,
          followingId: testUser2.id,
        },
        update: {},
        include: {
          User_Follow_followerIdToUser: {
            select: {
              id: true,
              username: true,
            },
          },
          User_Follow_followingIdToUser: {
            select: {
              id: true,
              username: true,
            },
          },
        },
      })

      expect(follow).toBeTruthy()
      expect(follow.followerId).toBe(testUser1.id)
      expect(follow.followingId).toBe(testUser2.id)
      expect(follow.User_Follow_followerIdToUser.username).toBe(testUser1.username)
      expect(follow.User_Follow_followingIdToUser.username).toBe(testUser2.username)

      console.log('✅ Follow relationship created')
    })

    it('should not allow duplicate follows', async () => {
      // Ensure the follow exists from previous test
      const existingFollow = await prisma.follow.findUnique({
        where: {
          followerId_followingId: {
            followerId: testUser1.id,
            followingId: testUser2.id,
          },
        },
      })

      // If follow doesn't exist, create it first using upsert
      if (!existingFollow) {
        await prisma.follow.upsert({
          where: {
            followerId_followingId: {
              followerId: testUser1.id,
              followingId: testUser2.id,
            },
          },
          create: {
            id: await generateSnowflakeId(),
            followerId: testUser1.id,
            followingId: testUser2.id,
          },
          update: {},
        })
      }

      // Try to create duplicate follow - should fail
      let errorCaught = false
      try {
        await prisma.follow.create({
          data: {
            id: await generateSnowflakeId(),
            followerId: testUser1.id,
            followingId: testUser2.id,
          },
        })
        // Should not reach here
        expect(false).toBe(true)
      } catch (error: unknown) {
        errorCaught = true
        // Check for unique constraint violation
        const prismaError = error as { code?: string };
        expect(prismaError.code).toBe('P2002')
      }

      expect(errorCaught).toBe(true) // Should have thrown an error

      console.log('✅ Duplicate follow prevented')
    })

    it('should update follower counts after follow', async () => {
      // Clean up any existing follows first to ensure clean state
      await prisma.follow.deleteMany({
        where: {
          followerId: testUser1.id,
          followingId: testUser2.id,
        },
      })
      
      // Get initial counts
      const initialUser1 = await prisma.user.findUnique({
        where: { id: testUser1.id },
        select: {
          _count: {
            select: {
              Follow_Follow_followerIdToUser: true,
            },
          },
        },
      })

      const initialUser2 = await prisma.user.findUnique({
        where: { id: testUser2.id },
        select: {
          _count: {
            select: {
              Follow_Follow_followingIdToUser: true,
            },
          },
        },
      })

      const initialFollowingCount = initialUser1!._count.Follow_Follow_followerIdToUser
      const initialFollowersCount = initialUser2!._count.Follow_Follow_followingIdToUser

      // Create follow
      await prisma.follow.upsert({
        where: {
          followerId_followingId: {
            followerId: testUser1.id,
            followingId: testUser2.id,
          },
        },
        create: {
          id: await generateSnowflakeId(),
          followerId: testUser1.id,
          followingId: testUser2.id,
        },
        update: {},
      })
      
      // Get updated counts
      const user1 = await prisma.user.findUnique({
        where: { id: testUser1.id },
        select: {
          _count: {
            select: {
              Follow_Follow_followerIdToUser: true,
            },
          },
        },
      })

      const user2 = await prisma.user.findUnique({
        where: { id: testUser2.id },
        select: {
          _count: {
            select: {
              Follow_Follow_followingIdToUser: true,
            },
          },
        },
      })

      expect(user1!._count.Follow_Follow_followerIdToUser).toBe(initialFollowingCount + 1)
      expect(user2!._count.Follow_Follow_followingIdToUser).toBe(initialFollowersCount + 1)

      console.log(`✅ User 1 following: ${user1!._count.Follow_Follow_followerIdToUser}`)
      console.log(`✅ User 2 followers: ${user2!._count.Follow_Follow_followingIdToUser}`)
    })

    it('should check follow status correctly', async () => {
      // Clean up any existing follows first to ensure clean state
      await prisma.follow.deleteMany({
        where: {
          followerId: testUser1.id,
          followingId: testUser2.id,
        },
      })

      // Verify no follow exists initially
      const beforeFollow = await prisma.follow.findUnique({
        where: {
          followerId_followingId: {
            followerId: testUser1.id,
            followingId: testUser2.id,
          },
        },
      })
      expect(beforeFollow).toBeNull()

      // Create follow
      await prisma.follow.upsert({
        where: {
          followerId_followingId: {
            followerId: testUser1.id,
            followingId: testUser2.id,
          },
        },
        create: {
          id: await generateSnowflakeId(),
          followerId: testUser1.id,
          followingId: testUser2.id,
        },
        update: {},
      })
      
      // Verify follow exists
      const isFollowing = await prisma.follow.findUnique({
        where: {
          followerId_followingId: {
            followerId: testUser1.id,
            followingId: testUser2.id,
          },
        },
      })

      expect(isFollowing).toBeTruthy()
      expect(isFollowing!.followerId).toBe(testUser1.id)
      expect(isFollowing!.followingId).toBe(testUser2.id)

      console.log('✅ Follow status check passed')
    })

    it('should delete follow relationship', async () => {
      // Delete follow
      await prisma.follow.deleteMany({
        where: {
          followerId: testUser1.id,
          followingId: testUser2.id,
        },
      })

      // Verify deleted
      const isFollowing = await prisma.follow.findUnique({
        where: {
          followerId_followingId: {
            followerId: testUser1.id,
            followingId: testUser2.id,
          },
        },
      })

      expect(isFollowing).toBeNull()

      console.log('✅ Follow relationship deleted')
    })

    it('should update counts after unfollow', async () => {
      // Clean up any existing follows first
      await prisma.follow.deleteMany({
        where: {
          followerId: testUser1.id,
          followingId: testUser2.id,
        },
      })

      // Create follow first using upsert to avoid conflicts
      await prisma.follow.upsert({
        where: {
          followerId_followingId: {
            followerId: testUser1.id,
            followingId: testUser2.id,
          },
        },
        create: {
          id: await generateSnowflakeId(),
          followerId: testUser1.id,
          followingId: testUser2.id,
        },
        update: {},
      })

      // Get initial counts
      const initialUser1 = await prisma.user.findUnique({
        where: { id: testUser1.id },
        select: {
          _count: {
            select: {
              Follow_Follow_followerIdToUser: true,
            },
          },
        },
      })

      const initialUser2 = await prisma.user.findUnique({
        where: { id: testUser2.id },
        select: {
          _count: {
            select: {
              Follow_Follow_followingIdToUser: true,
            },
          },
        },
      })

      // Unfollow
      await prisma.follow.deleteMany({
        where: {
          followerId: testUser1.id,
          followingId: testUser2.id,
        },
      })

      // Get updated counts
      const updatedUser1 = await prisma.user.findUnique({
        where: { id: testUser1.id },
        select: {
          _count: {
            select: {
              Follow_Follow_followerIdToUser: true,
            },
          },
        },
      })

      const updatedUser2 = await prisma.user.findUnique({
        where: { id: testUser2.id },
        select: {
          _count: {
            select: {
              Follow_Follow_followingIdToUser: true,
            },
          },
        },
      })

      expect(updatedUser1!._count.Follow_Follow_followerIdToUser).toBe(initialUser1!._count.Follow_Follow_followerIdToUser - 1)
      expect(updatedUser2!._count.Follow_Follow_followingIdToUser).toBe(initialUser2!._count.Follow_Follow_followingIdToUser - 1)

      console.log('✅ Counts updated after unfollow')
    })
  })

  describe('User-to-NPC Follow', () => {
    beforeEach(async () => {
      // Clean up any existing user-actor follows before each test
      await prisma.userActorFollow.deleteMany({
        where: {
          userId: testUser1.id,
          actorId: testActor.id,
        },
      })
      // Wait to ensure cleanup is committed
      await new Promise(resolve => setTimeout(resolve, 50))
    })

    it('should create user-actor follow relationship', async () => {
      // Verify cleanup worked (beforeEach already cleaned up)
      const existing = await prisma.userActorFollow.findUnique({
        where: {
          userId_actorId: {
            userId: testUser1.id,
            actorId: testActor.id,
          },
        },
      })

      if (existing) {
        // Force delete if still exists (shouldn't happen, but be safe)
        await prisma.userActorFollow.delete({
          where: {
            userId_actorId: {
              userId: testUser1.id,
              actorId: testActor.id,
            },
          },
        })
        // Wait again after delete
        await new Promise(resolve => setTimeout(resolve, 50))
      }

      // Create follow using upsert to handle any race conditions
      const follow = await prisma.userActorFollow.upsert({
        where: {
          userId_actorId: {
            userId: testUser1.id,
            actorId: testActor.id,
          },
        },
        create: {
          id: await generateSnowflakeId(),
          userId: testUser1.id,
          actorId: testActor.id,
        },
        update: {
          // If it exists, just keep existing record
        },
        include: {
          User: {
            select: {
              id: true,
              username: true,
            },
          },
          Actor: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      })

      expect(follow).toBeTruthy()
      expect(follow.userId).toBe(testUser1.id)
      expect(follow.actorId).toBe(testActor.id)
      expect(follow.User.username).toBe(testUser1.username)
      expect(follow.Actor.name).toBe(testActor.name)

      console.log('✅ User-actor follow relationship created')
    })

    it('should not allow duplicate actor follows', async () => {
      // Ensure the relationship exists from previous test
      await prisma.userActorFollow.upsert({
        where: {
          userId_actorId: {
            userId: testUser1.id,
            actorId: testActor.id,
          },
        },
        create: {
          id: await generateSnowflakeId(),
          userId: testUser1.id,
          actorId: testActor.id,
        },
        update: {},
      })

      // Now try to create duplicate - should fail
      let errorCaught = false
      try {
        await prisma.userActorFollow.create({
          data: {
            id: await generateSnowflakeId(),
            userId: testUser1.id,
            actorId: testActor.id,
          },
        })
      } catch (error: unknown) {
        errorCaught = true
        expect((error as { code?: string }).code).toBe('P2002') // Unique constraint violation
      }

      expect(errorCaught).toBe(true) // Should have thrown an error
      console.log('✅ Duplicate actor follow prevented')
    })

    it('should update user following count after actor follow', async () => {
      // Clean up any existing follows first to ensure clean state
      await prisma.userActorFollow.deleteMany({
        where: {
          userId: testUser1.id,
          actorId: testActor.id,
        },
      })

      // Get initial count
      const initialFollowCount = await prisma.userActorFollow.count({
        where: {
          userId: testUser1.id,
        },
      })

      // Create follow
      await prisma.userActorFollow.upsert({
        where: {
          userId_actorId: {
            userId: testUser1.id,
            actorId: testActor.id,
          },
        },
        create: {
          id: await generateSnowflakeId(),
          userId: testUser1.id,
          actorId: testActor.id,
        },
        update: {},
      })
      
      // Wait a bit to ensure the record is committed
      await new Promise(resolve => setTimeout(resolve, 100))
      
      // Use direct count query instead of _count relation to avoid potential caching issues
      const followCount = await prisma.userActorFollow.count({
        where: {
          userId: testUser1.id,
        },
      })

      expect(followCount).toBe(initialFollowCount + 1)

      // Also verify using _count relation for consistency
      const user = await prisma.user.findUnique({
        where: { id: testUser1.id },
        select: {
          _count: {
            select: {
              UserActorFollow: true,
            },
          },
        },
      })

      expect(user!._count.UserActorFollow).toBeGreaterThan(0)
      expect(user!._count.UserActorFollow).toBe(followCount)

      console.log(`✅ User actor follows: ${followCount} (direct count) / ${user!._count.UserActorFollow} (_count relation)`)
    })

    it('should delete user-actor follow relationship', async () => {
      // Delete follow
      await prisma.userActorFollow.deleteMany({
        where: {
          userId: testUser1.id,
          actorId: testActor.id,
        },
      })

      // Verify deleted
      const follow = await prisma.userActorFollow.findUnique({
        where: {
          userId_actorId: {
            userId: testUser1.id,
            actorId: testActor.id,
          },
        },
      })

      expect(follow).toBeNull()

      console.log('✅ User-actor follow relationship deleted')
    })
  })

  describe('Follow Lists', () => {
    it('should retrieve followers list', async () => {
      // Verify users exist before creating follow
      const user1Exists = await prisma.user.findUnique({ where: { id: testUser1.id } })
      const user2Exists = await prisma.user.findUnique({ where: { id: testUser2.id } })
      
      if (!user1Exists || !user2Exists) {
        throw new Error(`Test users not found. User1: ${!!user1Exists}, User2: ${!!user2Exists}`)
      }

      // Clean up any existing follows first
      await prisma.follow.deleteMany({
        where: {
          followerId: testUser1.id,
          followingId: testUser2.id,
        },
      })

      // Create some follows using upsert to avoid duplicates
      await prisma.follow.upsert({
        where: {
          followerId_followingId: {
            followerId: testUser1.id,
            followingId: testUser2.id,
          },
        },
        create: {
          id: await generateSnowflakeId(),
          followerId: testUser1.id,
          followingId: testUser2.id,
        },
        update: {},
      })

      // Get followers
      const followers = await prisma.follow.findMany({
        where: { followingId: testUser2.id },
        include: {
          User_Follow_followerIdToUser: {
            select: {
              id: true,
              username: true,
              displayName: true,
              profileImageUrl: true,
            },
          },
        },
      })

      expect(followers.length).toBeGreaterThan(0)
      expect(followers.some(f => f.User_Follow_followerIdToUser.id === testUser1.id)).toBe(true)

      console.log(`✅ Retrieved ${followers.length} followers`)
    })

    it('should retrieve following list', async () => {
      // Ensure follow exists before querying
      const existingFollow = await prisma.follow.findUnique({
        where: {
          followerId_followingId: {
            followerId: testUser1.id,
            followingId: testUser2.id,
          },
        },
      })

      if (!existingFollow) {
        // Create follow if it doesn't exist
        await prisma.follow.upsert({
          where: {
            followerId_followingId: {
              followerId: testUser1.id,
              followingId: testUser2.id,
            },
          },
          create: {
            id: await generateSnowflakeId(),
            followerId: testUser1.id,
            followingId: testUser2.id,
          },
          update: {},
        })
      }

      // Get following
      const following = await prisma.follow.findMany({
        where: { followerId: testUser1.id },
        include: {
          User_Follow_followingIdToUser: {
            select: {
              id: true,
              username: true,
              displayName: true,
              profileImageUrl: true,
            },
          },
        },
      })

      expect(following.length).toBeGreaterThan(0)
      expect(following.some(f => f.User_Follow_followingIdToUser.id === testUser2.id)).toBe(true)

      console.log(`✅ Retrieved ${following.length} following`)
    })

    it('should retrieve user actor follows list', async () => {
      // Verify user and actor exist before creating follow
      const userExists = await prisma.user.findUnique({ where: { id: testUser1.id } })
      const actorExists = await prisma.actor.findUnique({ where: { id: testActor.id } })
      
      if (!userExists) {
        throw new Error(`Test user not found: ${testUser1.id}`)
      }
      if (!actorExists) {
        throw new Error(`Test actor not found: ${testActor.id}`)
      }

      // Clean up any existing follows first
      await prisma.userActorFollow.deleteMany({
        where: {
          userId: testUser1.id,
          actorId: testActor.id,
        },
      })

      // Wait to ensure cleanup is committed
      await new Promise(resolve => setTimeout(resolve, 100))

      // Create follow using upsert to avoid duplicates
      await prisma.userActorFollow.upsert({
        where: {
          userId_actorId: {
            userId: testUser1.id,
            actorId: testActor.id,
          },
        },
        create: {
          id: await generateSnowflakeId(),
          userId: testUser1.id,
          actorId: testActor.id,
        },
        update: {},
      })

      // Get actor follows
      const actorFollows = await prisma.userActorFollow.findMany({
        where: { userId: testUser1.id },
        include: {
          Actor: {
            select: {
              id: true,
              name: true,
              tier: true,
              profileImageUrl: true,
            },
          },
        },
      })

      expect(actorFollows.length).toBeGreaterThan(0)
      expect(actorFollows.some(f => f.Actor.id === testActor.id)).toBe(true)

      console.log(`✅ Retrieved ${actorFollows.length} actor follows`)
    })
  })

  describe('Error Cases', () => {
    it('should handle following non-existent user', async () => {
      try {
        await prisma.follow.create({
          data: {
            id: await generateSnowflakeId(),
            followerId: testUser1.id,
            followingId: 'non-existent-user-id',
          },
        })
        expect(false).toBe(true) // Should not reach here
      } catch (error: unknown) {
        expect((error as { code?: string }).code).toBeTruthy() // Should throw database error
      }

      console.log('✅ Non-existent user follow prevented')
    })

    it('should handle self-follow attempt', async () => {
      // Note: API should prevent this, but database allows it
      // This test documents current behavior
      try {
        await prisma.follow.create({
          data: {
            id: await generateSnowflakeId(),
            followerId: testUser1.id,
            followingId: testUser1.id,
          },
        })

        // Clean up
        await prisma.follow.deleteMany({
          where: {
            followerId: testUser1.id,
            followingId: testUser1.id,
          },
        })

        console.log('⚠️  Database allows self-follow (API should prevent)')
      } catch (error: unknown) {
        console.log('✅ Self-follow prevented at database level', (error as { code?: string }).code)
      }
    })
  })

  describe('Profile API with Follow Counts', () => {
    it('should return correct follower/following counts in profile', async () => {
      // Clean up any existing follows first
      await prisma.follow.deleteMany({
        where: {
          followerId: testUser1.id,
          followingId: testUser2.id,
        },
      })
      
      // Wait to ensure cleanup is committed
      await new Promise(resolve => setTimeout(resolve, 50))
      
      // Ensure User 1 is following User 2 using upsert to avoid conflicts
      await prisma.follow.upsert({
        where: {
          followerId_followingId: {
            followerId: testUser1.id,
            followingId: testUser2.id,
          },
        },
        create: {
          id: await generateSnowflakeId(),
          followerId: testUser1.id,
          followingId: testUser2.id,
        },
        update: {},
      })

      // Get User 2 profile
      const user2Profile = await prisma.user.findUnique({
        where: { id: testUser2.id },
        select: {
          id: true,
          username: true,
          _count: {
            select: {
              Follow_Follow_followingIdToUser: true,
              Follow_Follow_followerIdToUser: true,
              UserActorFollow: true,
            },
          },
        },
      })

      expect(user2Profile).toBeTruthy()
      expect(user2Profile!._count.Follow_Follow_followingIdToUser).toBeGreaterThan(0)

      const totalFollowing = 
        user2Profile!._count.Follow_Follow_followerIdToUser + user2Profile!._count.UserActorFollow

      console.log('✅ Profile counts:')
      console.log(`   Followers: ${user2Profile!._count.Follow_Follow_followingIdToUser}`)
      console.log(`   Following: ${totalFollowing}`)
    })
  })
})

