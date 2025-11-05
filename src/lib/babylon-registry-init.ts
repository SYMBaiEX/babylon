/**
 * Babylon Game Registration
 * 
 * Registers Babylon as a discoverable entity in ERC-8004 + Agent0 registry.
 * Called on server startup to ensure Babylon is discoverable by agents.
 */

import { Agent0Client } from '@/agents/agent0/Agent0Client'
import type { AgentMetadata } from '@/agents/agent0/IPFSPublisher'
import { logger } from '@/lib/logger'
import { prisma } from '@/lib/database-service'

export interface BabylonRegistrationResult {
  tokenId: number
  metadataCID: string
  registeredAt: string
}

/**
 * Register Babylon game in ERC-8004 + Agent0 registry
 */
export async function registerBabylonGame(): Promise<BabylonRegistrationResult | null> {
  if (process.env.BABYLON_REGISTRY_REGISTERED === 'true') {
    logger.info('Babylon already registered, skipping registration...', undefined, 'BabylonRegistry')
    
    const config = await prisma.gameConfig.findUnique({
      where: { key: 'agent0_registration' }
    })
    
    if (config?.value) {
      const value = config.value as Record<string, unknown>
      return {
        tokenId: Number(value.tokenId),
        metadataCID: String(value.metadataCID || ''),
        registeredAt: String(value.registeredAt || new Date().toISOString())
      }
    }
    
    return null
  }
  
  if (process.env.AGENT0_ENABLED !== 'true') {
    logger.info('Agent0 integration disabled, skipping Babylon registration', undefined, 'BabylonRegistry')
    return null
  }
  
  const gameWalletAddress = process.env.BABYLON_GAME_WALLET_ADDRESS
  const gamePrivateKey = process.env.BABYLON_GAME_PRIVATE_KEY
  const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || process.env.VERCEL_URL || 'http://localhost:3000'
  
  if (!gameWalletAddress || !gamePrivateKey) {
    logger.warn(
      'BABYLON_GAME_WALLET_ADDRESS or BABYLON_GAME_PRIVATE_KEY not configured, skipping registration',
      undefined,
      'BabylonRegistry'
    )
    return null
  }
  
  const babylonCard: AgentMetadata = {
      name: 'Babylon Prediction Markets',
      type: 'game-platform',
      description: 'Real-time prediction market game with autonomous AI agents',
      version: '1.0.0',
      
      endpoints: {
        a2a: process.env.NEXT_PUBLIC_A2A_ENDPOINT || `${apiBaseUrl.replace('http', 'ws')}/ws/a2a`,
        mcp: process.env.NEXT_PUBLIC_MCP_ENDPOINT || `${apiBaseUrl}/mcp`,
        api: `${apiBaseUrl}/api`,
        docs: `${apiBaseUrl}/docs`,
        websocket: `${apiBaseUrl}/ws`
      },
      
      capabilities: {
        strategies: [],
        markets: ['prediction', 'perpetuals'],
        actions: [
          'query_markets',
          'get_market_data',
          'place_bet',
          'close_position',
          'get_balance',
          'get_positions',
          'query_feed',
          'post_comment',
          'join_chat'
        ],
        protocols: ['a2a', 'mcp', 'rest'],
        socialFeatures: true,
        realtime: true,
        authentication: ['privy', 'agent-secret', 'wallet-signature']
      },
      
      metadata: {
        network: process.env.AGENT0_NETWORK || 'sepolia',
        startingBalance: 1000,
        categories: ['crypto', 'politics', 'sports', 'tech', 'entertainment'],
        updateFrequency: '60s',
        maxLeverage: 100
      },
      
      mcp: {
        tools: [
          {
            name: 'get_markets',
            description: 'Get all active prediction markets',
            inputSchema: {
              type: 'object',
              properties: {
                type: {
                  type: 'string',
                  enum: ['prediction', 'perpetuals', 'all'],
                  description: 'Market type to filter'
                }
              }
            }
          },
          {
            name: 'place_bet',
            description: 'Place a bet on a prediction market',
            inputSchema: {
              type: 'object',
              properties: {
                marketId: { type: 'string' },
                side: { type: 'string', enum: ['YES', 'NO'] },
                amount: { type: 'number' }
              },
              required: ['marketId', 'side', 'amount']
            }
          },
          {
            name: 'get_balance',
            description: "Get agent's current balance and P&L",
            inputSchema: {
              type: 'object',
              properties: {}
            }
          },
          {
            name: 'get_positions',
            description: 'Get all open positions',
            inputSchema: {
              type: 'object',
              properties: {}
            }
          },
          {
            name: 'close_position',
            description: 'Close an open position',
            inputSchema: {
              type: 'object',
              properties: {
                positionId: { type: 'string' }
              },
              required: ['positionId']
            }
          }
        ]
      }
    }

    // 2. Register with Agent0 SDK (which handles IPFS publishing internally)
    logger.info('Registering Babylon with Agent0 SDK...', undefined, 'BabylonRegistry')

    // Use Ethereum Sepolia RPC (where contracts are deployed)
    const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL || process.env.SEPOLIA_RPC_URL || 'https://ethereum-sepolia-rpc.publicnode.com'

    // Configure IPFS - use Pinata if available, otherwise use public IPFS node
    const ipfsConfig = process.env.PINATA_JWT
      ? { ipfsProvider: 'pinata' as const, pinataJwt: process.env.PINATA_JWT }
      : { ipfsProvider: 'node' as const, ipfsNodeUrl: process.env.IPFS_NODE_URL || 'https://ipfs.io' }

    const agent0Client = new Agent0Client({
      network: (process.env.AGENT0_NETWORK as 'sepolia' | 'mainnet') || 'sepolia',
      rpcUrl,
      privateKey: gamePrivateKey,
      ...ipfsConfig
    })

    // Note: This will throw an error until Agent0 SDK is properly installed
    // The error message will guide users to install the SDK
    let result: { tokenId: number; txHash: string; metadataCID?: string }

    try {
      result = await agent0Client.registerAgent({
        name: babylonCard.name,
        description: babylonCard.description,
        walletAddress: gameWalletAddress,
        mcpEndpoint: babylonCard.endpoints.mcp,
        a2aEndpoint: babylonCard.endpoints.a2a,
        capabilities: {
          strategies: babylonCard.capabilities.strategies || [],
          markets: babylonCard.capabilities.markets,
          actions: babylonCard.capabilities.actions,
          version: '1.0.0',
          x402Support: false // Babylon doesn't require ERC-402 payment for access
        }
      })
    } catch (error) {
      // If Agent0 SDK is not available, registration failed
      logger.error(
        'Agent0 SDK registration failed. Check SDK installation and configuration.',
        error,
        'BabylonRegistry'
      )
      throw error
    }

  const metadataCID = result.metadataCID || ''
  
  logger.info(`✅ Babylon registered in Agent0 registry!`, undefined, 'BabylonRegistry')
  logger.info(`   Token ID: ${result.tokenId}`, undefined, 'BabylonRegistry')
  logger.info(`   Metadata CID: ${metadataCID}`, undefined, 'BabylonRegistry')

  await prisma.gameConfig.upsert({
    where: { key: 'agent0_registration' },
    create: {
      key: 'agent0_registration',
      value: {
        registered: true,
        tokenId: result.tokenId,
        metadataCID,
        txHash: result.txHash,
        registeredAt: new Date().toISOString()
      }
    },
    update: {
      value: {
        registered: true,
        tokenId: result.tokenId,
        metadataCID,
        txHash: result.txHash,
        registeredAt: new Date().toISOString()
      }
    }
  })
  
  return {
    tokenId: result.tokenId,
    metadataCID,
    registeredAt: new Date().toISOString()
  }
}

