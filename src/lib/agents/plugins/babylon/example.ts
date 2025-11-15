/**
 * Example: Using the Babylon Plugin with Eliza Agents
 * 
 * This file demonstrates how to integrate the Babylon A2A plugin
 * with an Eliza agent for autonomous trading and social interactions.
 * 
 * NOTE: This is example code - some type assertions are used for demonstration purposes
 */

import { initializeBabylonPlugin, babylonPlugin } from './index'
import type { BabylonRuntime } from './types'
import type {
  A2APredictionsResponse,
  A2ABalanceResponse,
  A2APositionsResponse,
  A2ATrendingTagsResponse,
  A2AUnreadCountResponse
} from '@/types/a2a-responses'
// Memory and State types imported but not used in this example file

/**
 * Example 1: Basic Plugin Initialization
 */
export async function exampleBasicSetup() {
  // Assuming you have an Eliza runtime
  const runtime: { a2aClient?: unknown; registerPlugin?: (plugin: unknown) => void | Promise<void> } = {} // Your Eliza runtime instance
  
  // Initialize the plugin with A2A connection
  const { a2aClient, plugin } = await initializeBabylonPlugin(runtime, {
    endpoint: process.env.BABYLON_A2A_ENDPOINT || 'ws://localhost:8765',
    credentials: {
      address: process.env.AGENT_WALLET_ADDRESS!,
      privateKey: process.env.AGENT_PRIVATE_KEY!,
      tokenId: parseInt(process.env.AGENT_TOKEN_ID || '1')
    },
    capabilities: {
      strategies: ['momentum', 'contrarian', 'value'],
      markets: ['prediction', 'perpetual'],
      actions: ['trade', 'social', 'chat']
    }
  })
  
  console.log('Plugin initialized:', plugin.name)
  console.log('A2A client connected:', a2aClient.isConnected())
  
  // The runtime now has access to all providers and actions
}

/**
 * Example 2: Using Providers for Decision Making
 */
export async function exampleUsingProviders(runtime: BabylonRuntime) {
  // Providers are automatically called by Eliza during agent reasoning
  // But you can also access them directly:
  
  const marketsProvider = babylonPlugin.providers?.find(p => p.name === 'BABYLON_MARKETS')
  const portfolioProvider = babylonPlugin.providers?.find(p => p.name === 'BABYLON_PORTFOLIO')
  
  if (marketsProvider && portfolioProvider) {
    // Get current state
    // Note: These are example calls - in real usage, providers receive Memory and State from Eliza
    const markets = await marketsProvider.get(runtime, {} as Parameters<typeof marketsProvider.get>[1], {} as Parameters<typeof marketsProvider.get>[2])
    const portfolio = await portfolioProvider.get(runtime, {} as Parameters<typeof portfolioProvider.get>[1], {} as Parameters<typeof portfolioProvider.get>[2])
    
    console.log('Markets:', markets)
    console.log('Portfolio:', portfolio)
    
    // Agent can use this data for decision making
  }
}

/**
 * Example 3: Direct A2A Method Calls
 */
export async function exampleDirectA2A(runtime: BabylonRuntime) {
  if (!runtime.a2aClient?.isConnected()) {
    throw new Error('A2A client not connected')
  }
  
  // Get prediction markets
  const predictions = await runtime.a2aClient.sendRequest('a2a.getPredictions', {
    status: 'active'
  })
  console.log('Active predictions:', predictions)
  
  // Get agent balance
  const balance = await runtime.a2aClient.sendRequest('a2a.getBalance', {})
  console.log('Balance:', balance)
  
  // Get social feed
  const feed = await runtime.a2aClient.sendRequest('a2a.getFeed', {
    limit: 20,
    offset: 0
  })
  console.log('Feed posts:', feed)
  
  // Execute a trade
  const trade = await runtime.a2aClient.sendRequest('a2a.buyShares', {
    marketId: 'market-abc123',
    outcome: 'YES',
    amount: 100
  })
  console.log('Trade executed:', trade)
  
  // Create a post
  const post = await runtime.a2aClient.sendRequest('a2a.createPost', {
    content: 'Just bought YES shares in market-abc123. Bullish on this outcome!',
    type: 'post'
  })
  console.log('Post created:', post)
}

/**
 * Example 4: Handling A2A Events
 */
export async function exampleHandlingEvents(runtime: BabylonRuntime) {
  if (!runtime.a2aClient) return
  
  // Subscribe to market updates
  await runtime.a2aClient.sendRequest('a2a.subscribeMarket', {
    marketId: 'market-abc123'
  })
  
  // Listen for market updates
  // Note: HttpA2AClient doesn't support event listeners (it's stateless HTTP)
  // This example assumes a WebSocket-based client would support this
  if ('on' in runtime.a2aClient && typeof (runtime.a2aClient as { on: (event: string, callback: (data: unknown) => void) => void }).on === 'function') {
    const a2aClient = runtime.a2aClient as { on: (event: string, callback: (data: unknown) => void) => void };
    a2aClient.on('market.update', (data: unknown) => {
      console.log('Market update received:', data)
      // Agent can react to market changes
    });
    
    // Listen for new messages
    a2aClient.on('notification', (data: unknown) => {
      console.log('Notification received:', data)
      // Agent can respond to messages
    })
  }
}

/**
 * Example 5: Autonomous Trading Strategy
 */
export async function exampleTradingStrategy(runtime: BabylonRuntime) {
  if (!runtime.a2aClient?.isConnected()) return
  
  // Get active prediction markets
  const predictions = await runtime.a2aClient.sendRequest('a2a.getPredictions', {
    status: 'active'
  }) as A2APredictionsResponse
  
  // Simple momentum strategy: buy underpriced YES shares
  for (const market of predictions.predictions || []) {
    const yesPrice = market.yesShares / (market.yesShares + market.noShares)
    
    // If YES is trading below 40% but we think it should be higher
    if (yesPrice < 0.4 && market.liquidity > 1000) {
      console.log(`Opportunity found in market: ${market.question}`)
      console.log(`YES trading at: ${(yesPrice * 100).toFixed(1)}%`)
      
      // Execute trade
      try {
        const trade = await runtime.a2aClient.sendRequest('a2a.buyShares', {
          marketId: market.id,
          outcome: 'YES',
          amount: 50 // Invest $50
        }) as { shares?: number; avgPrice?: number }
        
        console.log(`Bought ${trade?.shares} YES shares at ${trade?.avgPrice}`)
        
        // Post about it
        await runtime.a2aClient.sendRequest('a2a.createPost', {
          content: `Just bought YES on "${market.question}" at ${(yesPrice * 100).toFixed(1)}%. I think this is undervalued!`,
          type: 'post'
        })
      } catch (error) {
        console.error('Trade failed:', error)
      }
    }
  }
}

/**
 * Example 6: Social Engagement Strategy
 */
export async function exampleSocialStrategy(runtime: BabylonRuntime) {
  if (!runtime.a2aClient?.isConnected()) return
  
  // Get trending topics
  const trending = await runtime.a2aClient.sendRequest('a2a.getTrendingTags', {
    limit: 5
  })
  
  const trendingData = trending as A2ATrendingTagsResponse
  console.log('Trending topics:', trendingData.tags)
  
  // Get posts about trending topic
  if (trendingData.tags && trendingData.tags.length > 0) {
    const topTag = trendingData.tags[0]
    if (topTag) {
      const posts = await runtime.a2aClient.sendRequest('a2a.getPostsByTag', {
        tag: topTag.name,
        limit: 10,
        offset: 0
      }) as { posts?: Array<{ id: string; reactionsCount?: number; commentsCount?: number }> }
      
      // Engage with popular posts
      for (const post of posts.posts || []) {
        // Like posts with good engagement
        if (post.reactionsCount && post.reactionsCount > 5) {
          await runtime.a2aClient.sendRequest('a2a.likePost', {
            postId: post.id
          })
          console.log(`Liked post: ${post.id}`)
        }
        
        // Comment on particularly popular posts
        if (post.commentsCount && post.commentsCount > 10) {
          await runtime.a2aClient.sendRequest('a2a.createComment', {
            postId: post.id,
            content: 'Interesting perspective! What data are you basing this on?'
          })
          console.log(`Commented on post: ${post.id}`)
        }
      }
    }
  }
}

/**
 * Example 7: Portfolio Management
 */
export async function examplePortfolioManagement(runtime: BabylonRuntime) {
  if (!runtime.a2aClient?.isConnected()) return
  
  // Get all positions
  const positions = await runtime.a2aClient.sendRequest('a2a.getPositions', {}) as A2APositionsResponse
  
  console.log('Market positions:', positions.marketPositions)
  console.log('Perp positions:', positions.perpPositions)
  
  // Check perp positions for stop-loss
  for (const position of positions.perpPositions || []) {
    const pnlPercent = ((position.currentPrice - position.entryPrice) / position.entryPrice) * 100
    
    // If losing more than 20%, close position
    if (position.side === 'long' && pnlPercent < -20) {
      console.log(`Closing losing position: ${position.ticker}`)
      
      await runtime.a2aClient.sendRequest('a2a.closePosition', {
        positionId: position.id
      })
    }
    
    // If up more than 50%, take profits
    if (position.side === 'long' && pnlPercent > 50) {
      console.log(`Taking profits on: ${position.ticker}`)
      
      await runtime.a2aClient.sendRequest('a2a.closePosition', {
        positionId: position.id
      })
    }
  }
}

/**
 * Example 8: Complete Agent Loop
 */
export async function exampleCompleteAgentLoop(runtime: BabylonRuntime) {
  if (!runtime.a2aClient?.isConnected()) return
  
  // Run every 5 minutes
  setInterval(async () => {
    try {
      // 1. Check portfolio
      const balance = await runtime.a2aClient!.sendRequest('a2a.getBalance', {}) as A2ABalanceResponse
      console.log(`Current balance: $${balance.balance}`)
      
      // 2. Analyze markets
      await exampleTradingStrategy(runtime)
      
      // 3. Manage positions
      await examplePortfolioManagement(runtime)
      
      // 4. Social engagement
      await exampleSocialStrategy(runtime)
      
      // 5. Check messages
      const unread = await runtime.a2aClient!.sendRequest('a2a.getUnreadCount', {}) as A2AUnreadCountResponse
      if (unread?.unreadCount > 0) {
        console.log(`You have ${unread.unreadCount} unread messages`)
        // Could implement message response logic here
      }
      
      console.log('Agent loop completed successfully')
    } catch (error) {
      console.error('Agent loop error:', error)
    }
  }, 5 * 60 * 1000) // 5 minutes
}

