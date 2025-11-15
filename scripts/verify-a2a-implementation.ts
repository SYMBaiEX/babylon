/**
 * Verification script to ensure all A2A methods are properly implemented
 */

import { A2AMethod } from '../src/types/a2a'
import { HttpA2AClient } from '../src/lib/a2a/client/http-a2a-client'

// Methods that don't need implementation (using HTTP headers)
const SKIP_METHODS = ['a2a.handshake', 'a2a.authenticate']

// Get all enum values
const enumMethods = Object.values(A2AMethod).filter(m => !SKIP_METHODS.includes(m))

// Create a dummy client to check methods exist
const dummyClient = new HttpA2AClient({
  endpoint: 'http://localhost:3000/api/a2a',
  agentId: 'test'
})

// Map enum method names to client method names
const methodNameMap: Record<string, string> = {
  'a2a.discover': 'discoverAgents',
  'a2a.getInfo': 'getAgentInfo',
  'a2a.getMarketData': 'getMarketData',
  'a2a.getMarketPrices': 'getMarketPrices',
  'a2a.subscribeMarket': 'subscribeMarket',
  'a2a.getPredictions': 'getPredictions',
  'a2a.getPerpetuals': 'getPerpetuals',
  'a2a.buyShares': 'buyShares',
  'a2a.sellShares': 'sellShares',
  'a2a.openPosition': 'openPosition',
  'a2a.closePosition': 'closePosition',
  'a2a.getPositions': 'getPositions',
  'a2a.getFeed': 'getFeed',
  'a2a.getPost': 'getPost',
  'a2a.createPost': 'createPost',
  'a2a.deletePost': 'deletePost',
  'a2a.likePost': 'likePost',
  'a2a.unlikePost': 'unlikePost',
  'a2a.sharePost': 'sharePost',
  'a2a.getComments': 'getComments',
  'a2a.createComment': 'createComment',
  'a2a.deleteComment': 'deleteComment',
  'a2a.likeComment': 'likeComment',
  'a2a.getUserProfile': 'getUserProfile',
  'a2a.updateProfile': 'updateProfile',
  'a2a.getBalance': 'getBalance',
  'a2a.getUserWallet': 'getUserWallet',
  'a2a.followUser': 'followUser',
  'a2a.unfollowUser': 'unfollowUser',
  'a2a.getFollowers': 'getFollowers',
  'a2a.getFollowing': 'getFollowing',
  'a2a.searchUsers': 'searchUsers',
  'a2a.getTrades': 'getTrades',
  'a2a.getTradeHistory': 'getTradeHistory',
  'a2a.getChats': 'getChats',
  'a2a.getChatMessages': 'getChatMessages',
  'a2a.sendMessage': 'sendMessage',
  'a2a.createGroup': 'createGroup',
  'a2a.leaveChat': 'leaveChat',
  'a2a.getUnreadCount': 'getUnreadCount',
  'a2a.getNotifications': 'getNotifications',
  'a2a.markNotificationsRead': 'markNotificationsRead',
  'a2a.getGroupInvites': 'getGroupInvites',
  'a2a.acceptGroupInvite': 'acceptGroupInvite',
  'a2a.declineGroupInvite': 'declineGroupInvite',
  'a2a.getLeaderboard': 'getLeaderboard',
  'a2a.getUserStats': 'getUserStats',
  'a2a.getSystemStats': 'getSystemStats',
  'a2a.getReferrals': 'getReferrals',
  'a2a.getReferralStats': 'getReferralStats',
  'a2a.getReferralCode': 'getReferralCode',
  'a2a.getReputation': 'getReputation',
  'a2a.getReputationBreakdown': 'getReputationBreakdown',
  'a2a.getTrendingTags': 'getTrendingTags',
  'a2a.getPostsByTag': 'getPostsByTag',
  'a2a.getOrganizations': 'getOrganizations',
  'a2a.paymentRequest': 'paymentRequest',
  'a2a.paymentReceipt': 'paymentReceipt',
  'a2a.blockUser': 'blockUser',
  'a2a.unblockUser': 'unblockUser',
  'a2a.muteUser': 'muteUser',
  'a2a.unmuteUser': 'unmuteUser',
  'a2a.reportUser': 'reportUser',
  'a2a.reportPost': 'reportPost',
  'a2a.getBlocks': 'getBlocks',
  'a2a.getMutes': 'getMutes',
  'a2a.checkBlockStatus': 'checkBlockStatus',
  'a2a.checkMuteStatus': 'checkMuteStatus',
  'a2a.transferPoints': 'transferPoints',
  'a2a.favoriteProfile': 'favoriteProfile',
  'a2a.unfavoriteProfile': 'unfavoriteProfile',
  'a2a.getFavorites': 'getFavorites',
  'a2a.getFavoritePosts': 'getFavoritePosts',
}

const missingMethods: string[] = []
const extraMethods: string[] = []

// Check all enum methods have client implementations
for (const enumMethod of enumMethods) {
  const clientMethodName = methodNameMap[enumMethod]
  if (!clientMethodName) {
    console.error(`❌ No client method mapping for ${enumMethod}`)
    missingMethods.push(enumMethod)
    continue
  }
  
  const clientMethod = (dummyClient as unknown as Record<string, unknown>)[clientMethodName]
  if (typeof clientMethod !== 'function') {
    console.error(`❌ Client method ${clientMethodName} not found for ${enumMethod}`)
    missingMethods.push(enumMethod)
  }
}

// Check all client methods are in enum
const clientMethods = Object.getOwnPropertyNames(Object.getPrototypeOf(dummyClient))
  .filter(name => name !== 'constructor' && name !== 'request' && name !== 'sendRequest' && name !== 'isConnected' && name !== 'close')
  .filter(name => typeof (dummyClient as unknown as Record<string, unknown>)[name] === 'function')

for (const clientMethod of clientMethods) {
  const enumMethod = Object.entries(methodNameMap).find(([_, value]) => value === clientMethod)?.[0]
  if (!enumMethod && !['proposeCoalition', 'joinCoalition', 'leaveCoalition', 'sendCoalitionMessage', 'shareAnalysis', 'requestAnalysis', 'getAnalyses'].includes(clientMethod)) {
    // These are legacy methods, skip them
    extraMethods.push(clientMethod)
  }
}

console.log(`\n📊 A2A Implementation Verification`)
console.log(`=====================================`)
console.log(`Enum methods (excluding HANDSHAKE/AUTHENTICATE): ${enumMethods.length}`)
console.log(`Client methods checked: ${clientMethods.length}`)
console.log(`Missing methods: ${missingMethods.length}`)
console.log(`Extra methods (legacy): ${extraMethods.length}`)

if (missingMethods.length > 0) {
  console.error(`\n❌ Missing client methods:`)
  missingMethods.forEach(m => console.error(`   - ${m}`))
  process.exit(1)
}

if (extraMethods.length > 0) {
  console.log(`\n⚠️  Extra client methods (legacy, can be ignored):`)
  extraMethods.forEach(m => console.log(`   - ${m}`))
}

console.log(`\n✅ All A2A methods are properly implemented!`)
process.exit(0)

