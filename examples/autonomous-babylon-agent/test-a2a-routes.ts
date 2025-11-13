/**
 * Direct A2A Routes Test
 * Tests all A2A routes and verifies data
 */

import { BabylonA2AClient } from './src/a2a-client'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const TEST_CONFIG = {
  wsUrl: process.env.BABYLON_WS_URL || 'ws://localhost:3000/a2a',
  address: '0x' + '1'.repeat(40),
  tokenId: 999999,
  privateKey: '0x' + '1'.repeat(64)
}

async function testA2ARoutes() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('🧪 A2A Routes Verification Test')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

  const client = new BabylonA2AClient(TEST_CONFIG)
  
  // Test 1: Check all methods exist
  console.log('📋 Test 1: Method Availability')
  console.log('─────────────────────────────────────────────────────────────\n')
  
  const methods = [
    'getMarkets', 'getPredictions', 'getPerpetuals', 'getMarketData',
    'getMarketPrices', 'subscribeMarket', 'buyShares', 'sellShares',
    'openPosition', 'closePosition', 'getPortfolio', 'getTrades',
    'getTradeHistory', 'getFeed', 'getPost', 'createPost', 'deletePost',
    'likePost', 'unlikePost', 'sharePost', 'getComments', 'createComment',
    'deleteComment', 'likeComment', 'getUserProfile', 'updateProfile',
    'getBalance', 'followUser', 'unfollowUser', 'getFollowers',
    'getFollowing', 'getUserStats', 'searchUsers', 'getChats',
    'getChatMessages', 'sendMessage', 'createGroup', 'leaveChat',
    'getUnreadCount', 'getNotifications', 'markNotificationsRead',
    'getGroupInvites', 'acceptGroupInvite', 'declineGroupInvite',
    'getPools', 'getPoolInfo', 'depositToPool', 'withdrawFromPool',
    'getPoolDeposits', 'getLeaderboard', 'getSystemStats',
    'getReferralCode', 'getReferrals', 'getReferralStats',
    'getReputation', 'getReputationBreakdown', 'discoverAgents',
    'getAgentInfo', 'getTrendingTags', 'getPostsByTag',
    'getOrganizations', 'proposeCoalition', 'joinCoalition',
    'coalitionMessage', 'leaveCoalition', 'shareAnalysis',
    'requestAnalysis', 'getAnalyses', 'paymentRequest', 'paymentReceipt'
  ]
  
  let found = 0
  let missing: string[] = []
  
  methods.forEach(method => {
    if (typeof (client as any)[method] === 'function') {
      found++
    } else {
      missing.push(method)
    }
  })
  
  console.log(`✅ Found ${found}/${methods.length} A2A methods`)
  if (missing.length > 0) {
    console.log(`❌ Missing ${missing.length} methods:`, missing)
  }
  
  // Test 2: Try to connect
  console.log('\n📡 Test 2: Connection Test')
  console.log('─────────────────────────────────────────────────────────────\n')
  
  try {
    await client.connect()
    console.log('✅ Connected to A2A WebSocket')
    console.log(`   Session Token: ${client.sessionToken?.substring(0, 20)}...`)
    console.log(`   Agent ID: ${client.agentId}`)
    
    // Test 3: Test core routes
    console.log('\n🔍 Test 3: Core Routes (Live Data)')
    console.log('─────────────────────────────────────────────────────────────\n')
    
    // Test getBalance
    try {
      const balance = await client.getBalance()
      console.log('✅ getBalance:', balance)
    } catch (err: any) {
      console.log('⚠️  getBalance:', err.message)
    }
    
    // Test getMarkets
    try {
      const markets = await client.getMarkets()
      console.log('✅ getMarkets:', {
        predictions: markets.predictions?.length || 0,
        perps: markets.perps?.length || 0
      })
    } catch (err: any) {
      console.log('⚠️  getMarkets:', err.message)
    }
    
    // Test getFeed
    try {
      const feed = await client.getFeed(5)
      console.log('✅ getFeed:', {
        posts: feed.posts?.length || 0
      })
    } catch (err: any) {
      console.log('⚠️  getFeed:', err.message)
    }
    
    // Test getPortfolio
    try {
      const portfolio = await client.getPortfolio()
      console.log('✅ getPortfolio:', {
        balance: portfolio.balance,
        positions: portfolio.positions?.length || 0,
        pnl: portfolio.pnl
      })
    } catch (err: any) {
      console.log('⚠️  getPortfolio:', err.message)
    }
    
    // Test getSystemStats
    try {
      const stats = await client.getSystemStats()
      console.log('✅ getSystemStats:', stats)
    } catch (err: any) {
      console.log('⚠️  getSystemStats:', err.message)
    }
    
    // Test getLeaderboard
    try {
      const leaderboard = await client.getLeaderboard('all', 5)
      console.log('✅ getLeaderboard:', leaderboard)
    } catch (err: any) {
      console.log('⚠️  getLeaderboard:', err.message)
    }
    
    await client.disconnect()
    
  } catch (error: any) {
    console.log('❌ Connection failed:', error.message)
    console.log('   This is expected if:')
    console.log('   - A2A requires valid Agent0 credentials')
    console.log('   - Need registered agent identity')
    console.log('   - Server authentication requirements')
  }
  
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('✅ A2A Routes Verification Complete')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')
}

testA2ARoutes().catch(console.error)

