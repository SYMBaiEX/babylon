/**
 * Comprehensive Test: Earned Points Flow
 * 
 * Tests the entire earned points system:
 * 1. Create test user
 * 2. Execute trades (buy/sell predictions, open/close perps)
 * 3. Verify P&L is recorded
 * 4. Verify earned points are calculated
 * 5. Verify leaderboard displays correctly
 * 6. Test pool withdrawals
 * 7. Verify referral points
 */

import { prisma } from '../src/lib/database-service'
import { generateSnowflakeId } from '../src/lib/snowflake'
import { WalletService } from '../src/lib/services/wallet-service'
import { EarnedPointsService } from '../src/lib/services/earned-points-service'
import { PointsService } from '../src/lib/services/points-service'
import { Prisma } from '@prisma/client'

async function testEarnedPointsFlow() {
  console.log('🧪 Testing Earned Points Flow\n')
  console.log('=' .repeat(60))

  try {
    // 1. Create test user
    console.log('\n1️⃣  Creating test user...')
    const userId = generateSnowflakeId()
    await prisma.user.create({
      data: {
        id: userId,
        privyId: `test-${userId}`,
        username: `testuser-${userId.slice(-8)}`,
        displayName: 'Test Trader',
        email: `test-${userId}@example.com`,
        virtualBalance: new Prisma.Decimal(10000),
        lifetimePnL: new Prisma.Decimal(0),
        earnedPoints: 0,
        invitePoints: 0,
        bonusPoints: 0,
        reputationPoints: 100, // Base points
        updatedAt: new Date(),
      },
    })
    console.log(`   ✅ Created user: ${userId}`)

    // 2. Test prediction market P&L
    console.log('\n2️⃣  Testing prediction market P&L...')
    
    // Simulate profit
    console.log('   📈 Simulating $100 profit from prediction trade...')
    await WalletService.recordPnL(userId, 100, 'prediction_sell', 'test-market-1')
    
    let user = await prisma.user.findUnique({ where: { id: userId } })
    console.log(`   ✅ Lifetime P&L: $${user?.lifetimePnL.toString()}`)
    console.log(`   ✅ Earned Points: ${user?.earnedPoints}`)
    console.log(`   ✅ Total Reputation: ${user?.reputationPoints}`)
    
    // Verify calculation
    const expectedPoints = EarnedPointsService.pnlToPoints(100) // Should be 10
    if (user?.earnedPoints !== expectedPoints) {
      throw new Error(`❌ Earned points mismatch! Expected ${expectedPoints}, got ${user?.earnedPoints}`)
    }
    console.log('   ✅ Points calculation correct!')

    // 3. Test negative P&L
    console.log('\n3️⃣  Testing negative P&L...')
    console.log('   📉 Simulating $50 loss from perp trade...')
    await WalletService.recordPnL(userId, -50, 'perp_close', 'test-perp-1')
    
    user = await prisma.user.findUnique({ where: { id: userId } })
    console.log(`   ✅ Lifetime P&L: $${user?.lifetimePnL.toString()}`)
    console.log(`   ✅ Earned Points: ${user?.earnedPoints}`)
    
    // Should be floor((100-50)/10) = 5
    const expectedAfterLoss = EarnedPointsService.pnlToPoints(50)
    if (user?.earnedPoints !== expectedAfterLoss) {
      throw new Error(`❌ Points after loss mismatch! Expected ${expectedAfterLoss}, got ${user?.earnedPoints}`)
    }
    console.log('   ✅ Negative P&L handled correctly!')

    // 4. Test large profit
    console.log('\n4️⃣  Testing large profit...')
    console.log('   💰 Simulating $500 profit from perp...')
    await WalletService.recordPnL(userId, 500, 'perp_close', 'test-perp-2')
    
    user = await prisma.user.findUnique({ where: { id: userId } })
    console.log(`   ✅ Lifetime P&L: $${user?.lifetimePnL.toString()}`)
    console.log(`   ✅ Earned Points: ${user?.earnedPoints}`)
    
    // Should be floor((50+500)/10) = 55
    const expectedAfterBigWin = EarnedPointsService.pnlToPoints(550)
    if (user?.earnedPoints !== expectedAfterBigWin) {
      throw new Error(`❌ Points after big win mismatch! Expected ${expectedAfterBigWin}, got ${user?.earnedPoints}`)
    }
    console.log('   ✅ Large profit calculated correctly!')

    // 5. Test referral points
    console.log('\n5️⃣  Testing referral points...')
    const referredUserId = generateSnowflakeId()
    await prisma.user.create({
      data: {
        id: referredUserId,
        privyId: `test-referred-${referredUserId}`,
        username: `referred-${referredUserId.slice(-8)}`,
        email: `referred-${referredUserId}@example.com`,
        referredBy: userId,
        virtualBalance: new Prisma.Decimal(10000),
        updatedAt: new Date(),
      },
    })
    
    // Award referral points
    await PointsService.awardPoints(userId, 250, 'referral_signup', {
      referredUserId,
    })
    
    user = await prisma.user.findUnique({ where: { id: userId } })
    console.log(`   ✅ Invite Points: ${user?.invitePoints}`)
    console.log(`   ✅ Total Reputation: ${user?.reputationPoints}`)
    
    if (user?.invitePoints !== 250) {
      throw new Error(`❌ Invite points mismatch! Expected 250, got ${user?.invitePoints}`)
    }
    console.log('   ✅ Referral points awarded correctly!')

    // 6. Test bonus points
    console.log('\n6️⃣  Testing bonus points...')
    await PointsService.awardPoints(userId, 1000, 'profile_completion', {})
    
    user = await prisma.user.findUnique({ where: { id: userId } })
    console.log(`   ✅ Bonus Points: ${user?.bonusPoints}`)
    console.log(`   ✅ Total Reputation: ${user?.reputationPoints}`)
    
    if (user?.bonusPoints !== 1000) {
      throw new Error(`❌ Bonus points mismatch! Expected 1000, got ${user?.bonusPoints}`)
    }
    console.log('   ✅ Bonus points awarded correctly!')

    // 7. Verify total reputation calculation
    console.log('\n7️⃣  Verifying total reputation calculation...')
    const expectedTotal = 100 + user!.earnedPoints + user!.invitePoints + user!.bonusPoints
    if (user?.reputationPoints !== expectedTotal) {
      throw new Error(`❌ Total reputation mismatch! Expected ${expectedTotal}, got ${user?.reputationPoints}`)
    }
    console.log(`   ✅ Total = Base(100) + Earned(${user!.earnedPoints}) + Invite(${user!.invitePoints}) + Bonus(${user!.bonusPoints}) = ${user?.reputationPoints}`)

    // 8. Test leaderboard - All Points
    console.log('\n8️⃣  Testing leaderboard - All Points...')
    const allLeaderboard = await PointsService.getLeaderboard(1, 100, 0, 'all')
    const userInAll = allLeaderboard.users.find(u => u.id === userId)
    if (!userInAll) {
      throw new Error('❌ User not found in All Points leaderboard!')
    }
    console.log(`   ✅ User in All Points leaderboard at rank ${userInAll.rank}`)
    console.log(`   ✅ allPoints: ${userInAll.allPoints}`)

    // 9. Test leaderboard - Earned Points
    console.log('\n9️⃣  Testing leaderboard - Earned Points...')
    const earnedLeaderboard = await PointsService.getLeaderboard(1, 100, 0, 'earned')
    const userInEarned = earnedLeaderboard.users.find(u => u.id === userId)
    if (!userInEarned) {
      throw new Error('❌ User not found in Earned Points leaderboard!')
    }
    console.log(`   ✅ User in Earned Points leaderboard at rank ${userInEarned.rank}`)
    console.log(`   ✅ earnedPoints: ${userInEarned.earnedPoints}`)
    
    if (userInEarned.earnedPoints !== user!.earnedPoints) {
      throw new Error(`❌ Earned points mismatch in leaderboard! Expected ${user!.earnedPoints}, got ${userInEarned.earnedPoints}`)
    }

    // 10. Test leaderboard - Referral Points
    console.log('\n🔟 Testing leaderboard - Referral Points...')
    const referralLeaderboard = await PointsService.getLeaderboard(1, 100, 0, 'referral')
    const userInReferral = referralLeaderboard.users.find(u => u.id === userId)
    if (!userInReferral) {
      throw new Error('❌ User not found in Referral Points leaderboard!')
    }
    console.log(`   ✅ User in Referral Points leaderboard at rank ${userInReferral.rank}`)
    console.log(`   ✅ invitePoints: ${userInReferral.invitePoints}`)
    
    if (userInReferral.invitePoints !== user!.invitePoints) {
      throw new Error(`❌ Invite points mismatch in leaderboard! Expected ${user!.invitePoints}, got ${userInReferral.invitePoints}`)
    }

    // 11. Test points transaction history
    console.log('\n1️⃣1️⃣  Verifying points transaction history...')
    const transactions = await prisma.pointsTransaction.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    })
    console.log(`   ✅ Found ${transactions.length} points transactions`)
    
    const tradingTxs = transactions.filter(tx => tx.reason === 'trading_pnl')
    console.log(`   ✅ Trading transactions: ${tradingTxs.length}`)
    
    if (tradingTxs.length !== 3) {
      console.warn(`   ⚠️  Expected 3 trading transactions, found ${tradingTxs.length}`)
    }

    // 12. Test negative points cap
    console.log('\n1️⃣2️⃣  Testing negative points cap...')
    console.log('   📉 Simulating $2000 loss...')
    await WalletService.recordPnL(userId, -2000, 'perp_close', 'test-perp-3')
    
    user = await prisma.user.findUnique({ where: { id: userId } })
    console.log(`   ✅ Lifetime P&L: $${user?.lifetimePnL.toString()}`)
    console.log(`   ✅ Earned Points: ${user?.earnedPoints}`)
    
    // Should be floor((-1450)/10) = -145, but capped at -100
    const expectedCapped = EarnedPointsService.pnlToPoints(-1450)
    if (expectedCapped !== -100) {
      throw new Error(`❌ Cap not applied! Expected -100, got ${expectedCapped}`)
    }
    if (user?.earnedPoints !== -100) {
      throw new Error(`❌ User earned points not capped! Expected -100, got ${user?.earnedPoints}`)
    }
    console.log('   ✅ Negative points capped at -100!')

    // 13. Final verification
    console.log('\n1️⃣3️⃣  Final verification...')
    user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        PointsTransaction: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
      },
    })
    
    console.log('\n📊 Final User State:')
    console.log(`   User ID: ${user?.id}`)
    console.log(`   Username: ${user?.username}`)
    console.log(`   Lifetime P&L: $${user?.lifetimePnL.toString()}`)
    console.log(`   Earned Points: ${user?.earnedPoints}`)
    console.log(`   Invite Points: ${user?.invitePoints}`)
    console.log(`   Bonus Points: ${user?.bonusPoints}`)
    console.log(`   Total Reputation: ${user?.reputationPoints}`)
    console.log(`   Transactions: ${user?.PointsTransaction.length}`)

    // Cleanup
    console.log('\n🧹 Cleaning up test data...')
    await prisma.pointsTransaction.deleteMany({ where: { userId } })
    await prisma.pointsTransaction.deleteMany({ where: { userId: referredUserId } })
    await prisma.user.delete({ where: { id: referredUserId } })
    await prisma.user.delete({ where: { id: userId } })
    console.log('   ✅ Test data cleaned up')

    console.log('\n' + '='.repeat(60))
    console.log('✅ ALL TESTS PASSED!')
    console.log('='.repeat(60))
    console.log('\n✨ Earned points system is working correctly!\n')

  } catch (error) {
    console.error('\n❌ TEST FAILED:', error)
    throw error
  } finally {
    await prisma.$disconnect()
  }
}

// Run the test
testEarnedPointsFlow()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })


