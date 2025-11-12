/**
 * Comprehensive Test: Leaderboard Tabs
 * 
 * Tests all three leaderboard tabs with different scenarios:
 * 1. Create users with different point distributions
 * 2. Verify "All Points" tab sorting
 * 3. Verify "Earned Points" tab sorting
 * 4. Verify "Referral Points" tab sorting
 * 5. Verify NPCs are excluded from earned/referral
 */

import { prisma } from '../src/lib/database-service'
import { generateSnowflakeId } from '../src/lib/snowflake'
import { PointsService } from '../src/lib/services/points-service'
import { Prisma } from '@prisma/client'

async function testLeaderboardTabs() {
  console.log('🧪 Testing Leaderboard Tabs\n')
  console.log('=' .repeat(60))

  const testUserIds: string[] = []

  try {
    // 1. Create test users with different profiles
    console.log('\n1️⃣  Creating test users with different point profiles...')
    
    // User 1: High earner, low referrals
    const user1Id = generateSnowflakeId()
    testUserIds.push(user1Id)
    await prisma.user.create({
      data: {
        id: user1Id,
        privyId: `test-${user1Id}`,
        username: `high-earner`,
        email: `earner@test.com`,
        virtualBalance: new Prisma.Decimal(10000),
        lifetimePnL: new Prisma.Decimal(5000), // $5000 profit
        earnedPoints: 500, // 500 earned points
        invitePoints: 250, // 1 referral
        bonusPoints: 1000,
        reputationPoints: 100 + 500 + 250 + 1000, // 1850 total
        updatedAt: new Date(),
      },
    })
    console.log(`   ✅ User 1 (High Earner): 500 earned, 250 invite, 1850 total`)

    // User 2: High referrer, low earnings
    const user2Id = generateSnowflakeId()
    testUserIds.push(user2Id)
    await prisma.user.create({
      data: {
        id: user2Id,
        privyId: `test-${user2Id}`,
        username: `high-referrer`,
        email: `referrer@test.com`,
        virtualBalance: new Prisma.Decimal(10000),
        lifetimePnL: new Prisma.Decimal(100), // $100 profit
        earnedPoints: 10, // 10 earned points
        invitePoints: 1250, // 5 referrals (250 each)
        bonusPoints: 2000,
        reputationPoints: 100 + 10 + 1250 + 2000, // 3360 total
        updatedAt: new Date(),
      },
    })
    console.log(`   ✅ User 2 (High Referrer): 10 earned, 1250 invite, 3360 total`)

    // User 3: Balanced
    const user3Id = generateSnowflakeId()
    testUserIds.push(user3Id)
    await prisma.user.create({
      data: {
        id: user3Id,
        privyId: `test-${user3Id}`,
        username: `balanced-user`,
        email: `balanced@test.com`,
        virtualBalance: new Prisma.Decimal(10000),
        lifetimePnL: new Prisma.Decimal(1000), // $1000 profit
        earnedPoints: 100, // 100 earned points
        invitePoints: 500, // 2 referrals
        bonusPoints: 1000,
        reputationPoints: 100 + 100 + 500 + 1000, // 1700 total
        updatedAt: new Date(),
      },
    })
    console.log(`   ✅ User 3 (Balanced): 100 earned, 500 invite, 1700 total`)

    // User 4: Negative earned points
    const user4Id = generateSnowflakeId()
    testUserIds.push(user4Id)
    await prisma.user.create({
      data: {
        id: user4Id,
        privyId: `test-${user4Id}`,
        username: `negative-trader`,
        email: `negative@test.com`,
        virtualBalance: new Prisma.Decimal(10000),
        lifetimePnL: new Prisma.Decimal(-500), // $500 loss
        earnedPoints: -50, // -50 earned points
        invitePoints: 750, // 3 referrals
        bonusPoints: 1000,
        reputationPoints: 100 + (-50) + 750 + 1000, // 1800 total
        updatedAt: new Date(),
      },
    })
    console.log(`   ✅ User 4 (Negative Trader): -50 earned, 750 invite, 1800 total`)

    // 2. Test "All Points" leaderboard
    console.log('\n2️⃣  Testing "All Points" leaderboard...')
    const allLeaderboard = await PointsService.getLeaderboard(1, 100, 0, 'all')
    console.log(`   📊 Found ${allLeaderboard.users.length} users`)
    
    // Find our test users
    const testUsersInAll = allLeaderboard.users.filter(u => 
      testUserIds.includes(u.id)
    ).sort((a, b) => a.rank - b.rank)
    
    console.log(`   🔍 Our test users in All Points:`)
    testUsersInAll.forEach(u => {
      console.log(`      Rank ${u.rank}: ${u.username} - ${u.allPoints} points`)
    })
    
    // Verify sorting (highest total first)
    if (testUsersInAll[0]!.username !== 'high-referrer') {
      throw new Error('❌ All Points sorting incorrect!')
    }
    console.log('   ✅ All Points leaderboard sorted correctly!')

    // 3. Test "Earned Points" leaderboard
    console.log('\n3️⃣  Testing "Earned Points" leaderboard...')
    const earnedLeaderboard = await PointsService.getLeaderboard(1, 100, 0, 'earned')
    console.log(`   📊 Found ${earnedLeaderboard.users.length} users`)
    
    const testUsersInEarned = earnedLeaderboard.users.filter(u => 
      testUserIds.includes(u.id)
    ).sort((a, b) => a.rank - b.rank)
    
    console.log(`   🔍 Our test users in Earned Points:`)
    testUsersInEarned.forEach(u => {
      console.log(`      Rank ${u.rank}: ${u.username} - ${u.earnedPoints} earned pts`)
    })
    
    // Verify sorting (highest earned first)
    if (testUsersInEarned[0]!.username !== 'high-earner') {
      throw new Error('❌ Earned Points sorting incorrect!')
    }
    // Verify negative points are at the end
    if (testUsersInEarned[testUsersInEarned.length - 1]!.earnedPoints >= 0) {
      throw new Error('❌ Negative earned points not sorted to bottom!')
    }
    console.log('   ✅ Earned Points leaderboard sorted correctly!')

    // 4. Test "Referral Points" leaderboard
    console.log('\n4️⃣  Testing "Referral Points" leaderboard...')
    const referralLeaderboard = await PointsService.getLeaderboard(1, 100, 0, 'referral')
    console.log(`   📊 Found ${referralLeaderboard.users.length} users`)
    
    const testUsersInReferral = referralLeaderboard.users.filter(u => 
      testUserIds.includes(u.id)
    ).sort((a, b) => a.rank - b.rank)
    
    console.log(`   🔍 Our test users in Referral Points:`)
    testUsersInReferral.forEach(u => {
      console.log(`      Rank ${u.rank}: ${u.username} - ${u.invitePoints} invite pts`)
    })
    
    // Verify sorting (highest invite first)
    if (testUsersInReferral[0]!.username !== 'high-referrer') {
      throw new Error('❌ Referral Points sorting incorrect!')
    }
    console.log('   ✅ Referral Points leaderboard sorted correctly!')

    // 5. Verify NPCs are excluded from earned/referral
    console.log('\n5️⃣  Verifying NPCs excluded from earned/referral...')
    const hasNpcsInEarned = earnedLeaderboard.users.some(u => u.isActor)
    const hasNpcsInReferral = referralLeaderboard.users.some(u => u.isActor)
    
    if (hasNpcsInEarned) {
      throw new Error('❌ NPCs found in Earned Points leaderboard!')
    }
    if (hasNpcsInReferral) {
      throw new Error('❌ NPCs found in Referral Points leaderboard!')
    }
    console.log('   ✅ NPCs excluded from earned/referral leaderboards!')

    // 6. Verify all required fields are present
    console.log('\n6️⃣  Verifying all required fields present...')
    const sampleUser = allLeaderboard.users[0]
    const requiredFields = [
      'id', 'rank', 'username', 'displayName', 'profileImageUrl',
      'allPoints', 'earnedPoints', 'invitePoints', 'bonusPoints',
      'referralCount', 'balance', 'lifetimePnL', 'isActor'
    ]
    
    for (const field of requiredFields) {
      if (!(field in sampleUser)) {
        throw new Error(`❌ Missing field: ${field}`)
      }
    }
    console.log('   ✅ All required fields present!')

    // 7. Test pagination
    console.log('\n7️⃣  Testing pagination...')
    const page1 = await PointsService.getLeaderboard(1, 10, 0, 'all')
    const page2 = await PointsService.getLeaderboard(2, 10, 0, 'all')
    
    console.log(`   ✅ Page 1: ${page1.users.length} users`)
    console.log(`   ✅ Page 2: ${page2.users.length} users`)
    console.log(`   ✅ Total pages: ${page1.totalPages}`)
    
    if (page1.users.length > 0 && page2.users.length > 0) {
      const ids1 = page1.users.map(u => u.id)
      const ids2 = page2.users.map(u => u.id)
      const overlap = ids1.filter(id => ids2.includes(id))
      
      if (overlap.length > 0) {
        throw new Error('❌ Pages have overlapping users!')
      }
      console.log('   ✅ No overlap between pages!')
    }

    // 8. Test minPoints filtering
    console.log('\n8️⃣  Testing minPoints filtering...')
    const withMinPoints = await PointsService.getLeaderboard(1, 100, 2000, 'all')
    const allUsers = withMinPoints.users.every(u => u.allPoints >= 2000)
    
    if (!allUsers) {
      throw new Error('❌ MinPoints filter not working for "all" type!')
    }
    console.log(`   ✅ MinPoints filter working (found ${withMinPoints.users.length} users with 2000+ points)`)

    // Cleanup
    console.log('\n🧹 Cleaning up test data...')
    for (const testId of testUserIds) {
      await prisma.pointsTransaction.deleteMany({ where: { userId: testId } })
      await prisma.user.delete({ where: { id: testId } })
    }
    console.log('   ✅ Test data cleaned up')

    console.log('\n' + '='.repeat(60))
    console.log('✅ ALL LEADERBOARD TAB TESTS PASSED!')
    console.log('='.repeat(60))
    console.log('\n✨ Leaderboard tabs working perfectly!\n')

  } catch (error) {
    console.error('\n❌ TEST FAILED:', error)
    
    // Cleanup on error
    console.log('\n🧹 Cleaning up...')
    for (const testId of testUserIds) {
      try {
        await prisma.pointsTransaction.deleteMany({ where: { userId: testId } })
        await prisma.user.delete({ where: { id: testId } }).catch(() => {})
      } catch (e) {
        // Ignore cleanup errors
      }
    }
    
    throw error
  } finally {
    await prisma.$disconnect()
  }
}

// Run the test
testLeaderboardTabs()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })


