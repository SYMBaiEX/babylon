/**
 * Admin Debug Tool: Test Market P&L Flow
 * 
 * Forces a complete buy/sell cycle to verify P&L and earned points:
 * 1. Get or create test user
 * 2. Fund user wallet
 * 3. Buy prediction market shares
 * 4. Sell shares at profit/loss
 * 5. Verify P&L recorded
 * 6. Verify earned points awarded
 * 7. Check leaderboard presence
 */

import { prisma } from '../src/lib/database-service'
import { generateSnowflakeId } from '../src/lib/snowflake'
import { WalletService } from '../src/lib/services/wallet-service'
import { EarnedPointsService } from '../src/lib/services/earned-points-service'
import { Prisma } from '@prisma/client'

async function adminTestMarketPnL() {
  console.log('🔧 Admin Test: Market P&L Flow\n')
  console.log('=' .repeat(60))

  try {
    // 1. Get or create test user
    console.log('\n1️⃣  Setting up test user...')
    const userId = generateSnowflakeId()
    const user = await prisma.user.create({
      data: {
        id: userId,
        privyId: `admin-test-${userId}`,
        username: `admin-test-${Date.now()}`,
        email: `admin-test-${userId}@example.com`,
        virtualBalance: new Prisma.Decimal(10000),
        lifetimePnL: new Prisma.Decimal(0),
        earnedPoints: 0,
        invitePoints: 0,
        bonusPoints: 0,
        reputationPoints: 100,
        updatedAt: new Date(),
      },
    })
    console.log(`   ✅ User created: ${user.id}`)
    console.log(`   💰 Balance: $${user.virtualBalance}`)
    console.log(`   📊 Initial Reputation: ${user.reputationPoints}`)

    // 2. Simulate prediction market buy
    console.log('\n2️⃣  Simulating prediction market buy...')
    console.log('   📝 User buys 100 YES shares at $0.50 each = $50 cost')
    
    // Debit for purchase
    await WalletService.debit(
      userId,
      50,
      'pred_buy',
      'Bought 100 YES shares - Test Market',
      'test-market-1'
    )
    
    let balance = await WalletService.getBalance(userId)
    console.log(`   ✅ New Balance: $${balance.balance}`)
    console.log(`   💹 Lifetime P&L: $${balance.lifetimePnL} (unchanged - no P&L on buy)`)

    // 3. Simulate prediction market sell at profit
    console.log('\n3️⃣  Simulating prediction market sell at PROFIT...')
    console.log('   📈 User sells 100 shares at $0.75 each = $75 proceeds')
    console.log('   💵 Cost basis: $50, Proceeds: $75, P&L: +$25')
    
    // Credit proceeds
    await WalletService.credit(
      userId,
      75,
      'pred_sell',
      'Sold 100 YES shares - Test Market',
      'test-market-1'
    )
    
    // Record P&L
    const profitPnL = 75 - 50
    await WalletService.recordPnL(userId, profitPnL, 'prediction_sell', 'test-market-1')
    
    balance = await WalletService.getBalance(userId)
    let userAfterProfit = await prisma.user.findUnique({ where: { id: userId } })
    
    console.log(`   ✅ New Balance: $${balance.balance}`)
    console.log(`   💹 Lifetime P&L: $${balance.lifetimePnL}`)
    console.log(`   ⭐ Earned Points: ${userAfterProfit?.earnedPoints}`)
    console.log(`   🏆 Total Reputation: ${userAfterProfit?.reputationPoints}`)
    
    const expectedEarnedAfterProfit = EarnedPointsService.pnlToPoints(25)
    if (userAfterProfit?.earnedPoints !== expectedEarnedAfterProfit) {
      throw new Error(`❌ Earned points incorrect after profit! Expected ${expectedEarnedAfterProfit}, got ${userAfterProfit?.earnedPoints}`)
    }

    // 4. Simulate another trade at loss
    console.log('\n4️⃣  Simulating second trade at LOSS...')
    console.log('   📝 User buys 200 NO shares at $0.60 each = $120 cost')
    
    await WalletService.debit(
      userId,
      120,
      'pred_buy',
      'Bought 200 NO shares - Test Market 2',
      'test-market-2'
    )
    
    console.log('   📉 User sells 200 shares at $0.40 each = $80 proceeds')
    console.log('   💸 Cost basis: $120, Proceeds: $80, P&L: -$40')
    
    await WalletService.credit(
      userId,
      80,
      'pred_sell',
      'Sold 200 NO shares - Test Market 2',
      'test-market-2'
    )
    
    // Record loss P&L
    const lossPnL = 80 - 120
    await WalletService.recordPnL(userId, lossPnL, 'prediction_sell', 'test-market-2')
    
    balance = await WalletService.getBalance(userId)
    let userAfterLoss = await prisma.user.findUnique({ where: { id: userId } })
    
    console.log(`   ✅ New Balance: $${balance.balance}`)
    console.log(`   💹 Lifetime P&L: $${balance.lifetimePnL}`)
    console.log(`   ⭐ Earned Points: ${userAfterLoss?.earnedPoints}`)
    console.log(`   🏆 Total Reputation: ${userAfterLoss?.reputationPoints}`)
    
    // Net P&L should be 25 - 40 = -15
    const expectedNetPnL = 25 + lossPnL
    const expectedEarnedAfterLoss = EarnedPointsService.pnlToPoints(expectedNetPnL)
    if (userAfterLoss?.earnedPoints !== expectedEarnedAfterLoss) {
      throw new Error(`❌ Earned points incorrect after loss! Expected ${expectedEarnedAfterLoss}, got ${userAfterLoss?.earnedPoints}`)
    }

    // 5. Test perp market
    console.log('\n5️⃣  Simulating perp market trade...')
    console.log('   📝 Open 10x long BTC position with $100 margin')
    console.log('   📈 Close at 5% profit = $50 P&L')
    
    await WalletService.recordPnL(userId, 50, 'perp_close', 'test-perp-1')
    
    userAfterLoss = await prisma.user.findUnique({ where: { id: userId } })
    console.log(`   💹 Lifetime P&L: $${userAfterLoss?.lifetimePnL}`)
    console.log(`   ⭐ Earned Points: ${userAfterLoss?.earnedPoints}`)
    
    // Net P&L should be -15 + 50 = 35
    const finalExpectedPnL = expectedNetPnL + 50
    const finalExpectedEarned = EarnedPointsService.pnlToPoints(finalExpectedPnL)
    if (userAfterLoss?.earnedPoints !== finalExpectedEarned) {
      throw new Error(`❌ Earned points incorrect after perp! Expected ${finalExpectedEarned}, got ${userAfterLoss?.earnedPoints}`)
    }

    // 6. Verify points transaction log
    console.log('\n6️⃣  Verifying points transaction log...')
    const txs = await prisma.pointsTransaction.findMany({
      where: { userId, reason: 'trading_pnl' },
      orderBy: { createdAt: 'asc' },
    })
    
    console.log(`   ✅ Found ${txs.length} trading transactions:`)
    txs.forEach((tx, idx) => {
      const meta = tx.metadata ? JSON.parse(tx.metadata as string) : {}
      console.log(`      ${idx + 1}. ${meta.tradeType}: ${tx.amount > 0 ? '+' : ''}${tx.amount} pts (P&L: $${meta.pnl})`)
    })

    // 7. Final state
    console.log('\n7️⃣  Final verification...')
    const finalUser = await prisma.user.findUnique({ where: { id: userId } })
    
    console.log('\n📊 Final State:')
    console.log(`   Lifetime P&L: $${finalUser?.lifetimePnL}`)
    console.log(`   Earned Points: ${finalUser?.earnedPoints}`)
    console.log(`   Total Reputation: ${finalUser?.reputationPoints}`)
    console.log(`   Balance: $${finalUser?.virtualBalance}`)
    
    // Verify formula
    const calculatedEarned = EarnedPointsService.pnlToPoints(Number(finalUser?.lifetimePnL))
    if (finalUser?.earnedPoints !== calculatedEarned) {
      throw new Error(`❌ Formula mismatch! P&L $${finalUser?.lifetimePnL} should give ${calculatedEarned} points, but got ${finalUser?.earnedPoints}`)
    }
    console.log('   ✅ Formula verified: earned points match lifetime P&L!')

    // Cleanup
    console.log('\n🧹 Cleaning up...')
    await prisma.balanceTransaction.deleteMany({ where: { userId } })
    await prisma.pointsTransaction.deleteMany({ where: { userId } })
    await prisma.user.delete({ where: { id: userId } })

    console.log('\n' + '='.repeat(60))
    console.log('✅ MARKET P&L FLOW TEST PASSED!')
    console.log('='.repeat(60))
    console.log('\n✨ Buy/sell P&L tracking working correctly!\n')

  } catch (error) {
    console.error('\n❌ TEST FAILED:', error)
    throw error
  } finally {
    await prisma.$disconnect()
  }
}

// Run the test
adminTestMarketPnL()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })


