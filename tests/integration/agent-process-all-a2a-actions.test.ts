/**
 * Comprehensive Test: Agent Processing All A2A Actions
 * 
 * This test verifies that ElizaOS agents can successfully process
 * all A2A actions via the runtime, ensuring agents can actually
 * do everything users can do.
 * 
 * Tests:
 * 1. Agent creation and runtime setup
 * 2. A2A client connection
 * 3. Processing actions via runtime.executeAction()
 * 4. Processing actions via AutonomousCoordinator
 * 5. All A2A methods accessible and working
 */

import { describe, it, beforeAll, afterAll, expect } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { agentRuntimeManager } from '@/lib/agents/runtime/AgentRuntimeManager'
import { autonomousCoordinator } from '@/lib/agents/autonomous/AutonomousCoordinator'
import { generateSnowflakeId } from '@/lib/snowflake'
import type { BabylonRuntime } from '@/lib/agents/plugins/babylon/types'
import type { HandlerCallback } from '@elizaos/core'

const createTestState = () =>
  ({
    values: new Map(),
    data: {},
    text: ''
  }) as any

const SERVER_URL = process.env.BABYLON_API_URL || 'http://localhost:3000'

const TEST_AGENT_ID = 'test-agent-process-actions'
const TEST_AGENT_ADDRESS = '0x' + '2'.repeat(40)

describe('Agent Process All A2A Actions - Comprehensive E2E', () => {
  let prisma: PrismaClient
  let agentUserId: string
  let runtime: BabylonRuntime
  let testMarketId: string | null = null
  let testPerpTicker: string | null = null
  let createdPostId: string | null = null
  let createdCommentId: string | null = null

  beforeAll(async () => {
    console.log('\n🧪 Setting up comprehensive agent action processing test...\n')
    
    prisma = new PrismaClient()
    
    // Check if server is running
    try {
      const response = await fetch(`${SERVER_URL}/api/health`).catch(() => null)
      if (!response || !response.ok) {
        throw new Error('Server not running or not accessible')
      }
      console.log('✅ Server is running')
    } catch (error) {
      throw new Error(`Server check failed: ${error}. Make sure server is running on ${SERVER_URL}`)
    }

    // Create or get test agent user
    let agent = await prisma.user.findUnique({
      where: { username: TEST_AGENT_ID }
    })

    if (!agent) {
      agentUserId = await generateSnowflakeId()
      agent = await prisma.user.create({
        data: {
          id: agentUserId,
          username: TEST_AGENT_ID,
          displayName: 'E2E Action Processing Agent',
          bio: 'Comprehensive action processing test agent',
          walletAddress: TEST_AGENT_ADDRESS,
          isAgent: true,
          virtualBalance: 10000, // Start with $10k
          reputationPoints: 1000,
          hasUsername: true,
          profileComplete: true,
          autonomousTrading: true,
          autonomousPosting: true,
          autonomousCommenting: true,
          autonomousDMs: true,
          autonomousGroupChats: true,
          updatedAt: new Date()
        }
      })
      console.log(`✅ Created test agent: ${agentUserId}`)
    } else {
      agentUserId = agent.id
      // Ensure agent has balance and permissions
      await prisma.user.update({
        where: { id: agentUserId },
        data: { 
          virtualBalance: 10000,
          autonomousTrading: true,
          autonomousPosting: true,
          autonomousCommenting: true,
          autonomousDMs: true,
          autonomousGroupChats: true
        }
      })
      console.log(`✅ Using existing agent: ${agentUserId}`)
    }

    // Find an active prediction market
    const market = await prisma.market.findFirst({
      where: { resolved: false },
      orderBy: { createdAt: 'desc' }
    })
    if (market) {
      testMarketId = market.id
      console.log(`✅ Found test market: ${testMarketId}`)
    } else {
      console.log('⚠️  No active markets found - some tests will be skipped')
    }

    // Find a perpetual market (organization)
    const org = await prisma.organization.findFirst({
      orderBy: { createdAt: 'desc' }
    })
    if (org) {
      testPerpTicker = org.name.toUpperCase().substring(0, 4)
      console.log(`✅ Found test perpetual: ${testPerpTicker}`)
    } else {
      console.log('⚠️  No perpetual markets found - some tests will be skipped')
    }

    // Get agent runtime
    runtime = await agentRuntimeManager.getRuntime(agentUserId) as BabylonRuntime
    
    // Verify A2A client is connected
    if (!runtime.a2aClient?.isConnected()) {
      throw new Error('A2A client not connected. Make sure BABYLON_A2A_ENDPOINT is set.')
    }
    
    console.log(`✅ Agent runtime initialized with A2A client`)
  }, 60000)

  afterAll(async () => {
    // Cleanup
    if (prisma) {
      if (createdPostId) {
        await prisma.post.delete({ where: { id: createdPostId } }).catch(() => {})
      }
      if (createdCommentId) {
        await prisma.comment.delete({ where: { id: createdCommentId } }).catch(() => {})
      }
      await prisma.$disconnect()
    }
    console.log('\n✅ Test cleanup complete\n')
  })

  describe('Phase 1: Verify A2A Client Connection', () => {
    it('should have A2A client connected', () => {
      expect(runtime.a2aClient).toBeDefined()
      expect(runtime.a2aClient?.isConnected()).toBe(true)
      console.log(`   ✅ A2A client connected`)
    })

    it('should be able to get balance via A2A', async () => {
      const balance = await runtime.a2aClient!.getBalance() as { balance: number }
      expect(balance).toBeDefined()
      expect(typeof balance.balance).toBe('number')
      console.log(`   ✅ Balance: $${balance.balance}`)
    })
  })

  describe('Phase 2: Process Actions via Runtime.executeAction', () => {
    it('should execute BUY_PREDICTION_SHARES action', async () => {
      if (!testMarketId) {
        console.log('   ⏭️  Skipped - no test market')
        return
      }

      // Get action from runtime
      const action = runtime.actions?.find(a => a.name === 'BUY_PREDICTION_SHARES')
      if (!action) {
        throw new Error('BUY_PREDICTION_SHARES action not found')
      }

      const actionResult = await new Promise<{ success: boolean; error?: string }>((resolve) => {
        action.handler(
          runtime,
          {
            content: {
              text: `Buy 50 YES shares in market ${testMarketId}`
            }
          } as any,
          createTestState(),
          createTestState(),
          ((result) => {
            resolve({ success: !result.text?.includes('Error'), error: result.text })
          }) as HandlerCallback
        ).catch((err) => {
          resolve({ success: false, error: err.message })
        })
      })

      expect(actionResult.success).toBe(true)
      console.log(`   ✅ BUY_PREDICTION_SHARES executed`)
    }, 30000)

    it('should execute CREATE_POST action', async () => {
      const action = runtime.actions?.find(a => a.name === 'CREATE_POST')
      if (!action) {
        throw new Error('CREATE_POST action not found')
      }

      const actionResult = await new Promise<{ success: boolean; postId?: string; error?: string }>((resolve) => {
        action.handler(
          runtime,
          {
            content: {
              text: 'Post: This is a test post from the comprehensive action processing test'
            }
          } as any,
          createTestState(),
          createTestState(),
          ((result) => {
            const success = !result.text?.includes('Error') && !result.text?.includes('Failed')
            const postIdMatch = result.text?.match(/Post ID: ([a-zA-Z0-9-]+)/)
            resolve({ 
              success, 
              postId: postIdMatch?.[1] || undefined,
              error: result.text 
            })
          }) as HandlerCallback
        ).catch((err) => {
          resolve({ success: false, error: err.message })
        })
      })

      expect(actionResult.success).toBe(true)
      if (actionResult.postId) {
        createdPostId = actionResult.postId
      }
      console.log(`   ✅ CREATE_POST executed${actionResult.postId ? ` (Post ID: ${actionResult.postId})` : ''}`)
    }, 30000)

    it('should execute COMMENT_ON_POST action', async () => {
      if (!createdPostId) {
        // Try to find any post
        const post = await prisma.post.findFirst({
          where: { deletedAt: null },
          orderBy: { createdAt: 'desc' }
        })
        if (!post) {
          console.log('   ⏭️  Skipped - no post to comment on')
          return
        }
        createdPostId = post.id
      }

      const action = runtime.actions?.find(a => a.name === 'COMMENT_ON_POST')
      if (!action) {
        console.log('   ⏭️  Skipped - COMMENT_ON_POST action not found')
        return
      }

      const actionResult = await new Promise<{ success: boolean; commentId?: string; error?: string }>((resolve) => {
        action.handler(
          runtime,
          {
            content: {
              text: `Comment on post ${createdPostId} with "Great analysis!"`
            }
          } as any,
          {} as any,
          {} as any,
          ((result) => {
            const success = !result.text?.includes('Error') && !result.text?.includes('Failed')
            const commentIdMatch = result.text?.match(/Comment ID: ([a-zA-Z0-9-]+)/)
            resolve({ 
              success, 
              commentId: commentIdMatch?.[1] || undefined,
              error: result.text 
            })
          }) as HandlerCallback
        ).catch((err) => {
          resolve({ success: false, error: err.message })
        })
      })

      expect(actionResult.success).toBe(true)
      if (actionResult.commentId) {
        createdCommentId = actionResult.commentId
      }
      console.log(`   ✅ COMMENT_ON_POST executed${actionResult.commentId ? ` (Comment ID: ${actionResult.commentId})` : ''}`)
    }, 30000)

    it('should execute LIKE_POST action', async () => {
      if (!createdPostId) {
        const post = await prisma.post.findFirst({
          where: { deletedAt: null },
          orderBy: { createdAt: 'desc' }
        })
        if (!post) {
          console.log('   ⏭️  Skipped - no post to like')
          return
        }
        createdPostId = post.id
      }

      const action = runtime.actions?.find(a => a.name === 'LIKE_POST')
      if (!action) {
        console.log('   ⏭️  Skipped - LIKE_POST action not found')
        return
      }

      const actionResult = await new Promise<{ success: boolean; error?: string }>((resolve) => {
        action.handler(
          runtime,
          {
            content: {
              text: `Like post ${createdPostId}`
            }
          } as any,
          {} as any,
          {} as any,
          async (result: { text?: string }) => {
            resolve({ 
              success: !result.text?.includes('Error') && !result.text?.includes('Failed'),
              error: result.text 
            })
            return []
          }
        ).catch((err) => {
          resolve({ success: false, error: err.message })
        })
      })

      expect(actionResult.success).toBe(true)
      console.log(`   ✅ LIKE_POST executed`)
    }, 30000)

    it('should execute SEND_MESSAGE action', async () => {
      // First, try to get or create a chat
      const chat = await prisma.chat.findFirst({
        where: {
          ChatParticipant: {
            some: { userId: agentUserId }
          }
        }
      })

      if (!chat) {
        console.log('   ⏭️  Skipped - no chat available')
        return
      }

      const action = runtime.actions?.find(a => a.name === 'SEND_MESSAGE')
      if (!action) {
        console.log('   ⏭️  Skipped - SEND_MESSAGE action not found')
        return
      }

      const actionResult = await new Promise<{ success: boolean; messageId?: string; error?: string }>((resolve) => {
        action.handler(
          runtime,
          {
            content: {
              text: `Send message to chat ${chat.id}: "Hello from action processing test"`
            }
          } as any,
          {} as any,
          {} as any,
          async (result: { text?: string }) => {
            const success = !result.text?.includes('Error') && !result.text?.includes('Failed')
            const messageIdMatch = result.text?.match(/Message ID: ([a-zA-Z0-9-]+)/)
            resolve({ 
              success, 
              messageId: messageIdMatch?.[1] || undefined,
              error: result.text 
            })
            return []
          }
        ).catch((err) => {
          resolve({ success: false, error: err.message })
        })
      })

      expect(actionResult.success).toBe(true)
      console.log(`   ✅ SEND_MESSAGE executed${actionResult.messageId ? ` (Message ID: ${actionResult.messageId})` : ''}`)
    }, 30000)
  })

  describe('Phase 3: Process Actions via AutonomousCoordinator', () => {
    it('should execute complete autonomous tick', async () => {
      const tickResult = await autonomousCoordinator.executeAutonomousTick(agentUserId, runtime)
      
      expect(tickResult.success).toBe(true)
      expect(tickResult.method).toBe('a2a') // Should use A2A protocol
      expect(tickResult.actionsExecuted).toBeDefined()
      
      console.log(`   ✅ Autonomous tick executed`)
      console.log(`      Method: ${tickResult.method}`)
      console.log(`      Actions: ${JSON.stringify(tickResult.actionsExecuted)}`)
      console.log(`      Duration: ${tickResult.duration}ms`)
    }, 60000)
  })

  describe('Phase 4: Verify All A2A Methods Accessible', () => {
    it('should have access to all trading methods', async () => {
      expect(runtime.a2aClient).toBeDefined()
      
      // Test that methods exist and are callable
      const methods = [
        'getPredictions',
        'getPerpetuals',
        'buyShares',
        'sellShares',
        'openPosition',
        'closePosition',
        'getPositions',
        'getBalance'
      ]
      
      for (const method of methods) {
        expect(typeof (runtime.a2aClient as any)[method]).toBe('function')
      }
      
      console.log(`   ✅ All ${methods.length} trading methods accessible`)
    })

    it('should have access to all social methods', async () => {
      const methods = [
        'getFeed',
        'getPost',
        'createPost',
        'deletePost',
        'likePost',
        'unlikePost',
        'sharePost',
        'getComments',
        'createComment',
        'deleteComment',
        'likeComment'
      ]
      
      for (const method of methods) {
        expect(typeof (runtime.a2aClient as any)[method]).toBe('function')
      }
      
      console.log(`   ✅ All ${methods.length} social methods accessible`)
    })

    it('should have access to all user management methods', async () => {
      const methods = [
        'getUserProfile',
        'updateProfile',
        'followUser',
        'unfollowUser',
        'getFollowers',
        'getFollowing',
        'searchUsers'
      ]
      
      for (const method of methods) {
        expect(typeof (runtime.a2aClient as any)[method]).toBe('function')
      }
      
      console.log(`   ✅ All ${methods.length} user management methods accessible`)
    })

    it('should have access to all messaging methods', async () => {
      const methods = [
        'getChats',
        'getChatMessages',
        'sendMessage',
        'createGroup',
        'leaveChat',
        'getUnreadCount'
      ]
      
      for (const method of methods) {
        expect(typeof (runtime.a2aClient as any)[method]).toBe('function')
      }
      
      console.log(`   ✅ All ${methods.length} messaging methods accessible`)
    })

    it('should have access to all notification methods', async () => {
      const methods = [
        'getNotifications',
        'markNotificationsRead',
        'getGroupInvites',
        'acceptGroupInvite',
        'declineGroupInvite'
      ]
      
      for (const method of methods) {
        expect(typeof (runtime.a2aClient as any)[method]).toBe('function')
      }
      
      console.log(`   ✅ All ${methods.length} notification methods accessible`)
    })

    it('should have access to all stats methods', async () => {
      const methods = [
        'getLeaderboard',
        'getUserStats',
        'getSystemStats',
        'getReferrals',
        'getReferralStats',
        'getReferralCode',
        'getReputation',
        'getReputationBreakdown',
        'getTrendingTags',
        'getPostsByTag',
        'getOrganizations'
      ]
      
      for (const method of methods) {
        expect(typeof (runtime.a2aClient as any)[method]).toBe('function')
      }
      
      console.log(`   ✅ All ${methods.length} stats methods accessible`)
    })
  })

  describe('Phase 5: Process Multiple Actions in Sequence', () => {
    it('should process multiple trading actions', async () => {
      if (!testMarketId) {
        console.log('   ⏭️  Skipped - no test market')
        return
      }

      const actions = [
        { name: 'BUY_PREDICTION_SHARES', text: `Buy 25 YES shares in market ${testMarketId}` },
        { name: 'SELL_PREDICTION_SHARES', text: `Sell 10 shares from position in market ${testMarketId}` }
      ]

      const results: Array<{ name: string; success: boolean }> = []

      for (const actionName of actions) {
        const action = runtime.actions?.find(a => a.name === actionName.name)
        if (!action) {
          results.push({ name: actionName.name, success: false })
          continue
        }

        const result = await new Promise<{ success: boolean }>((resolve) => {
          action.handler(
            runtime,
            {
              content: { text: actionName.text }
            } as any,
            createTestState(),
            createTestState(),
            async (callbackResult: { text?: string }) => {
              resolve({ 
                success: !callbackResult.text?.includes('Error') && 
                         !callbackResult.text?.includes('Failed') &&
                         !callbackResult.text?.includes('not connected')
              })
              return []
            }
          ).catch(() => {
            resolve({ success: false })
          })
        })
        results.push({ name: actionName.name, success: result.success })
      }

      const successCount = results.filter(r => r.success).length
      console.log(`   ✅ Processed ${successCount}/${actions.length} trading actions`)
      
      // At least one should succeed (buy should work)
      expect(successCount).toBeGreaterThan(0)
    }, 60000)

    it('should process multiple social actions', async () => {
      const actions = [
        { name: 'CREATE_POST', text: 'Post: Testing multiple social actions' },
        { name: 'LIKE_POST', text: `Like post ${createdPostId || 'any'}` }
      ]

      const results: Array<{ name: string; success: boolean }> = []

      for (const actionName of actions) {
        const action = runtime.actions?.find(a => a.name === actionName.name)
        if (!action) {
          results.push({ name: actionName.name, success: false })
          continue
        }

        const result = await new Promise<{ success: boolean }>((resolve) => {
          action.handler(
            runtime,
            {
              content: { text: actionName.text }
            } as any,
            createTestState(),
            createTestState(),
            async (callbackResult: { text?: string }) => {
              resolve({ 
                success: !callbackResult.text?.includes('Error') && 
                         !callbackResult.text?.includes('Failed') &&
                         !callbackResult.text?.includes('not connected')
              })
              return []
            }
          ).catch(() => {
            resolve({ success: false })
          })
        })
        results.push({ name: actionName.name, success: result.success })
      }

      const successCount = results.filter(r => r.success).length
      console.log(`   ✅ Processed ${successCount}/${actions.length} social actions`)
      
      expect(successCount).toBeGreaterThan(0)
    }, 60000)
  })

  describe('Phase 6: Debug Action Processing', () => {
    it('should log action execution details', async () => {
      const actionName = 'BUY_PREDICTION_SHARES'
      if (!testMarketId) {
        console.log('   ⏭️  Skipped - no test market')
        return
      }

      console.log(`\n   🔍 Debug: Executing ${actionName}`)
      console.log(`      Market ID: ${testMarketId}`)
      console.log(`      Agent ID: ${agentUserId}`)
      console.log(`      A2A Connected: ${runtime.a2aClient?.isConnected()}`)

      const startTime = Date.now()
      const action = runtime.actions?.find(a => a.name === actionName)
      if (!action) {
        throw new Error(`${actionName} action not found`)
      }

      const actionResult = await new Promise<{ success: boolean; duration: number; error?: string }>((resolve) => {
        action.handler(
          runtime,
          {
            content: {
              text: `Buy 10 YES shares in market ${testMarketId}`
            }
          } as any,
          {} as any,
          {} as any,
          async (result: { text?: string }) => {
            const duration = Date.now() - startTime
            resolve({ 
              success: !result.text?.includes('Error') && !result.text?.includes('Failed'),
              duration,
              error: result.text
            })
            return []
          }
        ).catch((err) => {
          const duration = Date.now() - startTime
          resolve({ 
            success: false,
            duration,
            error: err.message
          })
        })
      })

      console.log(`      Result: ${actionResult.success ? 'SUCCESS' : 'FAILED'}`)
      console.log(`      Duration: ${actionResult.duration}ms`)
      if (actionResult.error) {
        console.log(`      Error: ${actionResult.error}`)
      }

      expect(actionResult.success).toBe(true)
      expect(actionResult.duration).toBeLessThan(30000) // Should complete within 30s
    }, 30000)
  })
})

