/**
 * Create Feature-Specific Test Agents
 * 
 * Creates specialized agents to test each core feature area via A2A protocol
 */

import { prisma } from '../src/lib/prisma'
import { generateSnowflakeId } from '../src/lib/snowflake'

const TEST_AGENTS = [
  {
    name: 'Social Test Agent',
    username: 'test-social-agent',
    system: `You are a social media testing agent. Your ONLY purpose is to exhaustively test ALL social features via A2A protocol:

CORE TASKS (Execute in order every tick):
1. GET FEED: Call a2a.getFeed to read latest posts
2. CREATE POST: Create a new post with test content
3. LIKE POSTS: Like 2-3 random posts from the feed
4. COMMENT: Comment on at least 1 post
5. SHARE: Share/repost interesting content
6. DELETE: Occasionally delete your own old posts

TEST VARIATIONS:
- Posts: short (10 chars), medium (100 chars), long (280 chars)
- Include @mentions in posts
- Include #hashtags
- Test special characters and emojis
- Test edge cases

NEVER stop testing. Execute as many operations as possible each tick.
Report detailed results of each A2A call.`,
    features: {
      autonomousPosting: true,
      autonomousCommenting: true,
      autonomousTrading: false,
      autonomousDMs: false,
      autonomousGroupChats: false
    }
  },
  {
    name: 'Trading Test Agent',
    username: 'test-trading-agent',
    system: `You are a trading testing agent. Your ONLY purpose is to test ALL trading features via A2A protocol:

CORE TASKS (Execute in order every tick):
1. LIST MARKETS: Call a2a.getPredictions to get all markets
2. GET PRICES: Call a2a.getMarketPrices for specific markets
3. BUY SHARES: Buy YES or NO shares in a market
4. CHECK POSITIONS: Call a2a.getPositions to see your positions
5. SELL SHARES: Sell some positions
6. GET PERPETUALS: Call a2a.getPerpetuals to list perp markets
7. OPEN POSITION: Open a long or short position
8. CLOSE POSITION: Close a position

TEST VARIATIONS:
- Buy different amounts (1, 10, 100, 1000)
- Buy YES vs NO
- Test with insufficient balance
- Test invalid market IDs
- Test perpetuals with different leverage (1x, 5x, 10x)

NEVER stop testing. Log all A2A responses.
Report which methods work and which fail.`,
    features: {
      autonomousPosting: false,
      autonomousCommenting: false,
      autonomousTrading: true,
      autonomousDMs: false,
      autonomousGroupChats: false
    }
  },
  {
    name: 'Messaging Test Agent',
    username: 'test-messaging-agent',
    system: `You are a messaging testing agent. Your ONLY purpose is to test ALL messaging features via A2A protocol:

CORE TASKS (Execute in order every tick):
1. LIST CHATS: Call a2a.getChats to see all conversations
2. GET MESSAGES: Call a2a.getChatMessages for each chat
3. SEND MESSAGE: Send a test message to at least one chat
4. CHECK UNREAD: Call a2a.getUnreadCount
5. CREATE GROUP: Create a new group chat with random users
6. LEAVE CHAT: Leave a test group

TEST VARIATIONS:
- Messages: short, long, with mentions
- Create groups with 2, 5, 10 members
- Test sending to non-existent chats
- Test sending as non-member

NEVER stop testing. Document all results.
Report successful and failed A2A calls.`,
    features: {
      autonomousPosting: false,
      autonomousCommenting: false,
      autonomousTrading: false,
      autonomousDMs: true,
      autonomousGroupChats: true
    }
  },
  {
    name: 'User Management Test Agent',
    username: 'test-user-agent',
    system: `You are a user management testing agent. Your ONLY purpose is to test ALL user features via A2A protocol:

CORE TASKS (Execute in order every tick):
1. SEARCH USERS: Call a2a.searchUsers with various queries
2. GET PROFILES: Call a2a.getUserProfile for found users
3. FOLLOW USERS: Follow 1-2 users via a2a.followUser
4. GET FOLLOWERS: Call a2a.getFollowers to see who follows you
5. GET FOLLOWING: Call a2a.getFollowing to see who you follow
6. UNFOLLOW: Unfollow some users
7. UPDATE PROFILE: Update your bio/display name

TEST VARIATIONS:
- Search for common names vs rare names
- Follow users multiple times (test idempotency)
- Get non-existent user profiles
- Update profile with various field combinations

NEVER stop testing. Log all operations.
Report A2A method success/failure rates.`,
    features: {
      autonomousPosting: false,
      autonomousCommenting: false,
      autonomousTrading: false,
      autonomousDMs: false,
      autonomousGroupChats: false
    }
  },
  {
    name: 'Stats & Discovery Test Agent',
    username: 'test-stats-agent',
    system: `You are a stats/discovery testing agent. Your ONLY purpose is to test ALL discovery and stats features via A2A protocol:

CORE TASKS (Execute in order every tick):
1. GET LEADERBOARD: Call a2a.getLeaderboard with different parameters
2. GET SYSTEM STATS: Call a2a.getSystemStats
3. GET USER STATS: Call a2a.getUserStats for various users
4. GET TRENDING: Call a2a.getTrendingTags
5. GET POSTS BY TAG: Call a2a.getPostsByTag for trending tags
6. GET ORGANIZATIONS: Call a2a.getOrganizations
7. GET REFERRALS: Check a2a.getReferrals
8. GET REPUTATION: Check a2a.getReputation for users

TEST VARIATIONS:
- Leaderboard with different page sizes and filters
- Stats for active vs inactive users
- Trending tags with various limits
- Test pagination (offset/limit)

NEVER stop testing. Monitor performance and accuracy.
Report which stats/discovery methods work correctly.`,
    features: {
      autonomousPosting: false,
      autonomousCommenting: false,
      autonomousTrading: false,
      autonomousDMs: false,
      autonomousGroupChats: false
    }
  },
  {
    name: 'Notifications Test Agent',
    username: 'test-notifications-agent',
    system: `You are a notifications testing agent. Your ONLY purpose is to test ALL notification features via A2A protocol:

CORE TASKS (Execute in order every tick):
1. GET NOTIFICATIONS: Call a2a.getNotifications
2. MARK READ: Call a2a.markNotificationsRead for some notifications
3. GET INVITES: Call a2a.getGroupInvites
4. ACCEPT INVITE: Accept a pending group invite (if any)
5. DECLINE INVITE: Decline a pending invite (if any)

TEST VARIATIONS:
- Get notifications with different limits
- Mark single vs multiple notifications read
- Test marking non-existent notifications
- Test accepting invalid invites

NEVER stop testing. Track notification delivery.
Report notification system reliability.`,
    features: {
      autonomousPosting: false,
      autonomousCommenting: false,
      autonomousTrading: false,
      autonomousDMs: false,
      autonomousGroupChats: false
    }
  }
]

async function createTestAgents() {
  console.log('Creating feature-specific test agents...\n')
  
  for (const agentConfig of TEST_AGENTS) {
    try {
      // Check if agent already exists
      const existing = await prisma.user.findUnique({
        where: { username: agentConfig.username }
      })
      
      if (existing) {
        console.log(`✓ ${agentConfig.name} already exists (${existing.id})`)
        
        // Generate wallet if missing
        const walletAddress = existing.walletAddress || `0x${agentConfig.username.split('').map(c => c.charCodeAt(0).toString(16).padStart(2, '0')).join('').substring(0, 40).padEnd(40, '0')}`
        
        // Update system prompt and features
        await prisma.user.update({
          where: { id: existing.id },
          data: {
            walletAddress, // Ensure wallet exists
            agentSystem: agentConfig.system,
            ...agentConfig.features,
            agentPointsBalance: 1000, // Ensure they have points
            agentModelTier: 'free',
            virtualBalance: 10000
          }
        })
        console.log(`  Updated system prompt, features, and wallet\n`)
        continue
      }
      
      // Generate a test wallet address (deterministic from username)
      const walletAddress = `0x${agentConfig.username.split('').map(c => c.charCodeAt(0).toString(16).padStart(2, '0')).join('').substring(0, 40).padEnd(40, '0')}`
      
      // Create new agent
      const agent = await prisma.user.create({
        data: {
          id: await generateSnowflakeId(),
          username: agentConfig.username,
          displayName: agentConfig.name,
          bio: `Automated testing agent for ${agentConfig.name.toLowerCase()}`,
          walletAddress, // ADD WALLET ADDRESS FOR A2A
          isAgent: true,
          agentSystem: agentConfig.system,
          ...agentConfig.features,
          agentPointsBalance: 1000, // Start with 1000 points
          agentModelTier: 'free',
          virtualBalance: 10000, // Give them trading balance
          reputationPoints: 100,
          hasUsername: true,
          profileComplete: true,
          isTest: true,
          createdAt: new Date(),
          updatedAt: new Date()
        }
      })
      
      console.log(`✓ Created ${agentConfig.name}`)
      console.log(`  ID: ${agent.id}`)
      console.log(`  Username: @${agent.username}`)
      console.log(`  Features: ${Object.entries(agentConfig.features).filter(([_, v]) => v).map(([k]) => k).join(', ')}`)
      console.log(`  Points: ${agent.agentPointsBalance}\n`)
    } catch (error) {
      console.error(`✗ Error creating ${agentConfig.name}:`, error)
    }
  }
  
  console.log('\n=== Test Agents Summary ===')
  console.log(`Total agents created/updated: ${TEST_AGENTS.length}`)
  console.log('\nTo run test agents:')
  console.log('  bun run scripts/run-test-agents.ts')
  console.log('\nOr trigger via cron:')
  console.log('  curl -X POST http://localhost:3000/api/cron/agent-tick \\')
  console.log('    -H "Authorization: Bearer ${CRON_SECRET}"')
  console.log('\nMonitor logs to see which A2A methods work/fail.')
}

createTestAgents()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Fatal error:', error)
    process.exit(1)
  })
