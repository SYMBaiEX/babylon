import { describe, it, expect, beforeAll, afterAll } from 'bun:test'
import { PrismaClient } from '@prisma/client'
import { WaitlistService } from '@/lib/services/waitlist-service'

const prisma = new PrismaClient()

describe('Referral System', () => {
  let user1Id: string
  let user2Id: string
  let user3Id: string
  let user1InviteCode: string

  beforeAll(async () => {
    // Clean up any existing test users
    await prisma.user.deleteMany({
      where: {
        username: {
          in: ['referral_test_user1', 'referral_test_user2', 'referral_test_user3']
        }
      }
    })
  })

  afterAll(async () => {
    // Clean up test users
    if (user1Id) await prisma.user.delete({ where: { id: user1Id } }).catch(() => {})
    if (user2Id) await prisma.user.delete({ where: { id: user2Id } }).catch(() => {})
    if (user3Id) await prisma.user.delete({ where: { id: user3Id } }).catch(() => {})
    await prisma.$disconnect()
  })

  it('should create three users and add them to waitlist', async () => {
    // Create User 1 (will be the inviter)
    const user1 = await prisma.user.create({
      data: {
        username: 'referral_test_user1',
        displayName: 'Test User 1',
        bio: 'Test user for referral system',
        privyId: 'test-privy-id-1',
        reputationPoints: 1000, // Base points
        invitePoints: 0,
        earnedPoints: 0,
        bonusPoints: 0,
      }
    })
    user1Id = user1.id

    // Create User 2 (will be invited by User 1)
    const user2 = await prisma.user.create({
      data: {
        username: 'referral_test_user2',
        displayName: 'Test User 2',
        bio: 'Test user for referral system',
        privyId: 'test-privy-id-2',
        reputationPoints: 1000,
        invitePoints: 0,
        earnedPoints: 0,
        bonusPoints: 0,
      }
    })
    user2Id = user2.id

    // Create User 3 (no referral)
    const user3 = await prisma.user.create({
      data: {
        username: 'referral_test_user3',
        displayName: 'Test User 3',
        bio: 'Test user for referral system',
        privyId: 'test-privy-id-3',
        reputationPoints: 1000,
        invitePoints: 0,
        earnedPoints: 0,
        bonusPoints: 0,
      }
    })
    user3Id = user3.id

    expect(user1Id).toBeDefined()
    expect(user2Id).toBeDefined()
    expect(user3Id).toBeDefined()

    // Mark User 1 as waitlisted (no referral)
    const result1 = await WaitlistService.markAsWaitlisted(user1Id)
    expect(result1.success).toBe(true)
    expect(result1.inviteCode).toBeTruthy()
    user1InviteCode = result1.inviteCode

    // Mark User 3 as waitlisted (no referral)
    const result3 = await WaitlistService.markAsWaitlisted(user3Id)
    expect(result3.success).toBe(true)
    expect(result3.inviteCode).toBeTruthy()

    console.log(`✓ Created 3 users and added 2 to waitlist`)
    console.log(`  User 1 invite code: ${user1InviteCode}`)
  })

  it('should have User 1 invite User 2 and reward User 1 with +50 points', async () => {
    // Mark User 2 as waitlisted WITH User 1's referral code
    const result = await WaitlistService.markAsWaitlisted(user2Id, user1InviteCode)
    
    expect(result.success).toBe(true)
    expect(result.referrerRewarded).toBe(true)
    expect(result.inviteCode).toBeTruthy()

    // Verify User 1 got the points
    const user1After = await prisma.user.findUnique({
      where: { id: user1Id },
      select: {
        reputationPoints: true,
        invitePoints: true,
        referralCount: true,
      }
    })

    expect(user1After).toBeDefined()
    expect(user1After!.invitePoints).toBe(50) // +50 from referral
    expect(user1After!.reputationPoints).toBe(1050) // 1000 base + 50 from referral
    expect(user1After!.referralCount).toBe(1)

    // Verify User 2 is marked as referred by User 1
    const user2After = await prisma.user.findUnique({
      where: { id: user2Id },
      select: {
        referredBy: true,
      }
    })

    expect(user2After!.referredBy).toBe(user1Id)

    console.log(`✓ User 1 successfully referred User 2`)
    console.log(`  User 1 points: ${user1After!.reputationPoints} (invite points: ${user1After!.invitePoints})`)
  })

  it('should rank User 1 at the top of the leaderboard', async () => {
    // Get leaderboard positions
    const user1Position = await WaitlistService.getWaitlistPosition(user1Id)
    const user2Position = await WaitlistService.getWaitlistPosition(user2Id)
    const user3Position = await WaitlistService.getWaitlistPosition(user3Id)

    expect(user1Position).toBeDefined()
    expect(user2Position).toBeDefined()
    expect(user3Position).toBeDefined()

    console.log('\nLeaderboard Rankings:')
    console.log(`  User 1 (inviter): Rank #${user1Position!.leaderboardRank}, ${user1Position!.invitePoints} invite points`)
    console.log(`  User 2 (invited): Rank #${user2Position!.leaderboardRank}, ${user2Position!.invitePoints} invite points`)
    console.log(`  User 3 (no ref):  Rank #${user3Position!.leaderboardRank}, ${user3Position!.invitePoints} invite points`)

    // User 1 should be ranked #1 (has 50 invite points)
    expect(user1Position!.leaderboardRank).toBe(1)
    expect(user1Position!.invitePoints).toBe(50)

    // User 2 and User 3 should be ranked lower (both have 0 invite points)
    // Their ranking depends on who joined first
    expect(user2Position!.leaderboardRank).toBeGreaterThan(1)
    expect(user3Position!.leaderboardRank).toBeGreaterThan(1)
    expect(user2Position!.invitePoints).toBe(0)
    expect(user3Position!.invitePoints).toBe(0)

    console.log(`\n✅ User 1 is correctly ranked #1 on the leaderboard!`)
  })

  it('should fetch the leaderboard and show User 1 at the top', async () => {
    const leaderboard = await prisma.user.findMany({
      where: {
        isWaitlistActive: true,
      },
      orderBy: [
        { invitePoints: 'desc' },
        { waitlistJoinedAt: 'asc' },
      ],
      select: {
        id: true,
        username: true,
        displayName: true,
        invitePoints: true,
        reputationPoints: true,
        referralCount: true,
      },
      take: 10,
    })

    expect(leaderboard.length).toBeGreaterThanOrEqual(3)
    
    // User 1 should be first
    expect(leaderboard[0].id).toBe(user1Id)
    expect(leaderboard[0].invitePoints).toBe(50)
    expect(leaderboard[0].referralCount).toBe(1)

    console.log('\nTop 3 Leaderboard:')
    leaderboard.slice(0, 3).forEach((user, idx) => {
      console.log(`  ${idx + 1}. ${user.displayName}: ${user.invitePoints} invite points, ${user.referralCount} referrals`)
    })
  })

  it('should prevent self-referral', async () => {
    // Try to have a user refer themselves
    const user1 = await prisma.user.findUnique({
      where: { id: user1Id },
      select: { referralCode: true }
    })

    // Create a temp user
    const tempUser = await prisma.user.create({
      data: {
        username: 'temp_self_ref_test',
        displayName: 'Temp User',
        bio: 'Test',
        privyId: 'test-privy-id-temp',
        reputationPoints: 1000,
      }
    })

    // Generate their own code
    const tempResult = await WaitlistService.markAsWaitlisted(tempUser.id)
    expect(tempResult.success).toBe(true)

    // Try to use their own code (should fail)
    const selfRefResult = await WaitlistService.markAsWaitlisted(tempUser.id, tempResult.inviteCode)
    expect(selfRefResult.referrerRewarded).toBeUndefined() // or false

    // Clean up
    await prisma.user.delete({ where: { id: tempUser.id } })

    console.log(`✓ Self-referral is correctly blocked`)
  })

  it('should prevent double-referral', async () => {
    // User 2 is already referred by User 1
    // Try to have User 3 refer User 2 (should fail)
    
    const user3 = await prisma.user.findUnique({
      where: { id: user3Id },
      select: { referralCode: true }
    })

    const user3Code = user3!.referralCode!

    // Create a new temp user and have them referred by User 3
    const tempUser = await prisma.user.create({
      data: {
        username: 'temp_double_ref_test',
        displayName: 'Temp User 2',
        bio: 'Test',
        privyId: 'test-privy-id-temp2',
        reputationPoints: 1000,
      }
    })

    // Mark with User 3's code
    const firstRef = await WaitlistService.markAsWaitlisted(tempUser.id, user3Code)
    expect(firstRef.success).toBe(true)
    expect(firstRef.referrerRewarded).toBe(true)

    // Try to mark again with User 1's code (should fail/be ignored)
    const secondRef = await WaitlistService.markAsWaitlisted(tempUser.id, user1InviteCode)
    expect(secondRef.success).toBe(true)
    expect(secondRef.referrerRewarded).toBeUndefined() // Already referred

    // Verify the user is still only referred by User 3
    const tempUserCheck = await prisma.user.findUnique({
      where: { id: tempUser.id },
      select: { referredBy: true }
    })
    expect(tempUserCheck!.referredBy).toBe(user3Id) // Still User 3, not changed to User 1

    // Clean up
    await prisma.user.delete({ where: { id: tempUser.id } })

    console.log(`✓ Double-referral is correctly blocked`)
  })
})

