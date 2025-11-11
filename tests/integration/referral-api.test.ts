import { describe, it, expect, beforeAll, afterAll } from 'bun:test'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const API_BASE = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

describe('Referral System - API Endpoints', () => {
  let user1Id: string
  let user2Id: string
  let user1InviteCode: string

  beforeAll(async () => {
    // Clean up any existing test users
    await prisma.user.deleteMany({
      where: {
        username: {
          in: ['api_test_user1', 'api_test_user2']
        }
      }
    })
  })

  afterAll(async () => {
    // Clean up test users
    if (user1Id) await prisma.user.delete({ where: { id: user1Id } }).catch(() => {})
    if (user2Id) await prisma.user.delete({ where: { id: user2Id } }).catch(() => {})
    await prisma.$disconnect()
  })

  it('should create users and mark as waitlisted via API', async () => {
    // Create User 1
    const user1 = await prisma.user.create({
      data: {
        username: 'api_test_user1',
        displayName: 'API Test User 1',
        bio: 'Test user',
        privyId: 'api-test-privy-1',
        reputationPoints: 1000,
      }
    })
    user1Id = user1.id

    // Create User 2
    const user2 = await prisma.user.create({
      data: {
        username: 'api_test_user2',
        displayName: 'API Test User 2',
        bio: 'Test user',
        privyId: 'api-test-privy-2',
        reputationPoints: 1000,
      }
    })
    user2Id = user2.id

    console.log('✓ Created test users')

    // Mark User 1 as waitlisted via API
    const response1 = await fetch(`${API_BASE}/api/waitlist/mark`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: user1Id })
    })

    expect(response1.ok).toBe(true)
    const data1 = await response1.json()
    
    console.log('\n📋 API Response (User 1):')
    console.log(`  Success: ${data1.success !== false}`)
    console.log(`  Invite Code: ${data1.inviteCode}`)
    console.log(`  Waitlist Position: ${data1.waitlistPosition}`)

    expect(data1.inviteCode).toBeTruthy()
    user1InviteCode = data1.inviteCode

    // Verify in database
    const user1Check = await prisma.user.findUnique({
      where: { id: user1Id },
      select: {
        referralCode: true,
        isWaitlistActive: true,
        waitlistPosition: true,
      }
    })

    expect(user1Check!.referralCode).toBe(user1InviteCode)
    expect(user1Check!.isWaitlistActive).toBe(true)
    expect(user1Check!.waitlistPosition).toBeGreaterThan(0)

    console.log('✅ User 1 waitlisted via API - verified in database')
  })

  it('should reward referrer when referred user joins via API', async () => {
    // Get User 1's BEFORE state
    const user1Before = await prisma.user.findUnique({
      where: { id: user1Id },
      select: {
        reputationPoints: true,
        invitePoints: true,
        referralCount: true,
      }
    })

    console.log('\n📊 BEFORE (User 1):')
    console.log(`  Reputation: ${user1Before!.reputationPoints}`)
    console.log(`  Invite Points: ${user1Before!.invitePoints}`)
    console.log(`  Referral Count: ${user1Before!.referralCount}`)

    // Mark User 2 as waitlisted WITH referral code via API
    const response2 = await fetch(`${API_BASE}/api/waitlist/mark`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: user2Id,
        referralCode: user1InviteCode
      })
    })

    expect(response2.ok).toBe(true)
    const data2 = await response2.json()

    console.log('\n📋 API Response (User 2 with referral):')
    console.log(`  Success: ${data2.success !== false}`)
    console.log(`  Referrer Rewarded: ${data2.referrerRewarded}`)

    expect(data2.referrerRewarded).toBe(true)

    // Wait a moment for database to update
    await new Promise(resolve => setTimeout(resolve, 100))

    // Get User 1's AFTER state from database
    const user1After = await prisma.user.findUnique({
      where: { id: user1Id },
      select: {
        reputationPoints: true,
        invitePoints: true,
        referralCount: true,
      }
    })

    console.log('\n📊 AFTER (User 1):')
    console.log(`  Reputation: ${user1After!.reputationPoints}`)
    console.log(`  Invite Points: ${user1After!.invitePoints}`)
    console.log(`  Referral Count: ${user1After!.referralCount}`)

    console.log('\n📈 CHANGES:')
    console.log(`  Reputation: +${user1After!.reputationPoints - user1Before!.reputationPoints}`)
    console.log(`  Invite Points: +${user1After!.invitePoints - user1Before!.invitePoints}`)
    console.log(`  Referral Count: +${user1After!.referralCount - user1Before!.referralCount}`)

    // Verify the points were added
    expect(user1After!.reputationPoints).toBe(user1Before!.reputationPoints + 50)
    expect(user1After!.invitePoints).toBe(user1Before!.invitePoints + 50)
    expect(user1After!.referralCount).toBe(user1Before!.referralCount + 1)

    // Verify PointsTransaction exists
    const transaction = await prisma.pointsTransaction.findFirst({
      where: {
        userId: user1Id,
        reason: 'referral',
        amount: 50,
      },
      orderBy: { createdAt: 'desc' }
    })

    console.log('\n💰 PointsTransaction:')
    console.log(`  Found: ${transaction ? 'YES' : 'NO'}`)
    if (transaction) {
      console.log(`  ${transaction.pointsBefore} → ${transaction.pointsAfter}`)
    }

    expect(transaction).toBeDefined()
    expect(transaction!.pointsAfter).toBe(user1After!.reputationPoints)

    console.log('\n✅ API-driven referral reward confirmed in database!')
  })

  it('should return correct leaderboard via API', async () => {
    const response = await fetch(`${API_BASE}/api/waitlist/leaderboard?limit=10`)
    
    expect(response.ok).toBe(true)
    const data = await response.json()

    console.log('\n🏆 Leaderboard API Response:')
    console.log(`  Total users returned: ${data.leaderboard?.length || 0}`)

    expect(data.leaderboard).toBeDefined()
    expect(Array.isArray(data.leaderboard)).toBe(true)

    // Find our test users in the leaderboard
    const user1InLeaderboard = data.leaderboard.find((u: any) => u.id === user1Id)
    
    if (user1InLeaderboard) {
      console.log(`\n  User 1 in leaderboard:`)
      console.log(`    Rank: #${user1InLeaderboard.rank}`)
      console.log(`    Invite Points: ${user1InLeaderboard.invitePoints}`)
      console.log(`    Referrals: ${user1InLeaderboard.referralCount}`)

      expect(user1InLeaderboard.invitePoints).toBe(50)
      expect(user1InLeaderboard.referralCount).toBe(1)
    }

    console.log('\n✅ Leaderboard API working correctly!')
  })

  it('should return correct position via API', async () => {
    const response = await fetch(`${API_BASE}/api/waitlist/position?userId=${user1Id}`)
    
    expect(response.ok).toBe(true)
    const data = await response.json()

    console.log('\n📍 Position API Response (User 1):')
    console.log(`  Position: #${data.position}`)
    console.log(`  Leaderboard Rank: #${data.leaderboardRank}`)
    console.log(`  Invite Code: ${data.inviteCode}`)
    console.log(`  Points: ${data.points}`)
    console.log(`  Invite Points: ${data.pointsBreakdown?.invite}`)
    console.log(`  Referral Count: ${data.referralCount}`)

    expect(data.position).toBeDefined()
    expect(data.inviteCode).toBe(user1InviteCode)
    expect(data.pointsBreakdown?.invite).toBe(50)
    expect(data.referralCount).toBe(1)

    console.log('\n✅ Position API working correctly!')
  })
})
