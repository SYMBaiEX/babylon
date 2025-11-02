/**
 * Agent On-Chain Registration API
 *
 * Registers ElizaOS agents to the EIP-8004 Identity Registry on Base Sepolia
 * Server wallet registers agents and tracks tokenId -> agentId mapping in database
 * Initial reputation (70%) is set via on-chain transactions
 */

import type { NextRequest } from 'next/server'
import { createWalletClient, createPublicClient, http, parseEther, decodeEventLog, type Address, type Hash } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { baseSepolia } from 'viem/chains'
import { errorResponse, successResponse, authenticate } from '@/lib/api/auth-middleware'
import { prisma } from '@/lib/database-service'
import { logger } from '@/lib/logger'

// Contract addresses
const IDENTITY_REGISTRY = process.env.NEXT_PUBLIC_IDENTITY_REGISTRY_BASE_SEPOLIA as Address
const REPUTATION_SYSTEM = process.env.NEXT_PUBLIC_REPUTATION_SYSTEM_BASE_SEPOLIA as Address

// Server wallet for paying gas (testnet only!)
const DEPLOYER_PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY as `0x${string}`

// Identity Registry ABI (minimal for registration)
const IDENTITY_REGISTRY_ABI = [
  {
    type: 'function',
    name: 'registerAgent',
    inputs: [
      { name: 'name', type: 'string' },
      { name: 'endpoint', type: 'string' },
      { name: 'capabilitiesHash', type: 'bytes32' },
      { name: 'metadataURI', type: 'string' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'isRegistered',
    inputs: [{ name: '_address', type: 'address' }],
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getTokenId',
    inputs: [{ name: '_address', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'event',
    name: 'AgentRegistered',
    inputs: [
      { name: 'tokenId', type: 'uint256', indexed: true },
      { name: 'owner', type: 'address', indexed: true },
      { name: 'name', type: 'string', indexed: false },
      { name: 'endpoint', type: 'string', indexed: false },
    ],
  },
] as const

// Reputation System ABI (for initial reputation)
const REPUTATION_SYSTEM_ABI = [
  {
    type: 'function',
    name: 'recordBet',
    inputs: [
      { name: '_tokenId', type: 'uint256' },
      { name: '_amount', type: 'uint256' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'recordWin',
    inputs: [
      { name: '_tokenId', type: 'uint256' },
      { name: '_profit', type: 'uint256' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
] as const

interface AgentOnboardRequest {
  agentName?: string
  endpoint?: string
}

/**
 * POST /api/agents/onboard
 * Register an agent to the on-chain identity system
 */
export async function POST(request: NextRequest) {
  try {
    // Validate contract addresses are configured
    if (!IDENTITY_REGISTRY || !REPUTATION_SYSTEM) {
      logger.error('Contract addresses not configured', { 
        identityRegistry: !!IDENTITY_REGISTRY, 
        reputationSystem: !!REPUTATION_SYSTEM 
      }, 'AgentOnboard')
      return errorResponse('On-chain registration not available - contracts not configured', 500)
    }

    // Authenticate agent
    const user = await authenticate(request)
    if (!user.isAgent || !user.userId) {
      return errorResponse('Only agents can use this endpoint', 403)
    }

    const agentId = user.userId

    // Parse request body
    const body: AgentOnboardRequest = await request.json()
    const { agentName, endpoint } = body

    // Check if agent exists in database (use upsert to avoid race conditions)
    // Note: Agents don't have wallet addresses - they're registered via server wallet
    const dbUser = await prisma.user.upsert({
      where: {
        username: agentId, // Use username as unique identifier for agents
      },
      update: {
        // Update fields if user exists but data changed
        displayName: agentName || agentId,
        bio: `Autonomous AI agent: ${agentId}`,
      },
      create: {
        username: agentId,
        displayName: agentName || agentId,
        virtualBalance: 10000, // Start with 10k points
        totalDeposited: 10000,
        bio: `Autonomous AI agent: ${agentId}`,
      },
      select: {
        id: true,
        username: true,
        displayName: true,
        bio: true,
        onChainRegistered: true,
        nftTokenId: true,
        registrationTxHash: true,
      },
    })

    // Create clients
    const publicClient = createPublicClient({
      chain: baseSepolia,
      transport: http(process.env.NEXT_PUBLIC_RPC_URL),
    })

    // Check database first - if already registered, return cached token ID
    if (dbUser.onChainRegistered && dbUser.nftTokenId) {
      return successResponse({
        message: 'Agent already registered on-chain',
        tokenId: dbUser.nftTokenId,
        agentId,
        reputationAwarded: !!dbUser.registrationTxHash,
      })
    }

    // Create wallet client for server (to pay gas)
    if (!DEPLOYER_PRIVATE_KEY) {
      return errorResponse('Server wallet not configured', 500)
    }

    const account = privateKeyToAccount(DEPLOYER_PRIVATE_KEY)
    const walletClient = createWalletClient({
      account,
      chain: baseSepolia,
      transport: http(process.env.NEXT_PUBLIC_RPC_URL),
    })

    // Prepare registration parameters
    const name = agentName || agentId
    const agentEndpoint = endpoint || `https://babylon.game/agent/${agentId}`
    const capabilitiesHash = '0x0000000000000000000000000000000000000000000000000000000000000001' as `0x${string}` // Basic capabilities
    const metadataURI = JSON.stringify({
      name,
      agentId,
      type: 'elizaos-agent',
      registered: new Date().toISOString(),
    })

    logger.info('Registering agent on-chain', {
      agentId,
      name,
      endpoint: agentEndpoint,
    })

    // Server wallet registers agent and receives the NFT
    // We track tokenId -> agentId mapping in database
    // Generate unique endpoint per agent to avoid conflicts
    const uniqueEndpoint = `${agentEndpoint}?agentId=${agentId}`
    
    // Call registerAgent on Identity Registry (server wallet is msg.sender)
    const txHash: Hash = await walletClient.writeContract({
      address: IDENTITY_REGISTRY,
      abi: IDENTITY_REGISTRY_ABI,
      functionName: 'registerAgent',
      args: [name, uniqueEndpoint, capabilitiesHash, metadataURI],
    })

    logger.info('Agent registration transaction sent', { txHash }, 'AgentOnboard')

    // Wait for transaction confirmation
    const receipt = await publicClient.waitForTransactionReceipt({
      hash: txHash,
      confirmations: 1,
    })

    if (receipt.status !== 'success') {
      return errorResponse('Agent registration transaction failed', 500)
    }

    // Get the token ID from the event logs
    let tokenId: number | null = null
    for (const log of receipt.logs) {
      try {
        const decodedLog = decodeEventLog({
          abi: IDENTITY_REGISTRY_ABI,
          data: log.data,
          topics: log.topics,
        })

        if (decodedLog.eventName === 'AgentRegistered') {
          tokenId = Number(decodedLog.args.tokenId)
          break
        }
      } catch {
        // Skip logs we can't decode
      }
    }

    // Token ID MUST come from events - we can't query server wallet since it owns multiple agent NFTs
    if (!tokenId) {
      throw new Error('Failed to extract token ID from AgentRegistered event. Transaction succeeded but event parsing failed.')
    }

    logger.info('Agent registered with token ID', { tokenId }, 'AgentOnboard')

    // Set initial reputation to 70 (by recording 10 bets with 7 wins = 70% accuracy)
    // Only set if not already set (check by looking for registration tx hash)
    if (!dbUser.registrationTxHash) {
      try {
        logger.info('Setting initial reputation to 70 for agent', { tokenId }, 'AgentOnboard')
        
        // Record 10 bets with proper nonce management
        // Send bets sequentially to avoid nonce conflicts
        for (let i = 0; i < 10; i++) {
          const betTxHash = await walletClient.writeContract({
            address: REPUTATION_SYSTEM,
            abi: REPUTATION_SYSTEM_ABI,
            functionName: 'recordBet',
            args: [BigInt(tokenId), parseEther('100')],
          })
          // Wait for each bet transaction to confirm before sending next
          await publicClient.waitForTransactionReceipt({
            hash: betTxHash,
            confirmations: 1,
          })
        }

        logger.info('All bet transactions confirmed', { count: 10 }, 'AgentOnboard')

        // Record 7 wins to achieve 70% accuracy (7/10 = 70%)
        // Send wins sequentially to avoid nonce conflicts
        for (let i = 0; i < 7; i++) {
          const winTxHash = await walletClient.writeContract({
            address: REPUTATION_SYSTEM,
            abi: REPUTATION_SYSTEM_ABI,
            functionName: 'recordWin',
            args: [BigInt(tokenId), parseEther('100')],
          })
          // Wait for each win transaction to confirm before sending next
          await publicClient.waitForTransactionReceipt({
            hash: winTxHash,
            confirmations: 1,
          })
        }

        logger.info('All win transactions confirmed', { count: 7 }, 'AgentOnboard')

        logger.info('Initial reputation set to 70 for agent (7 wins out of 10 bets)', { tokenId }, 'AgentOnboard')
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error('Failed to set initial reputation for agent', { error: errorMessage, tokenId }, 'AgentOnboard')
        // Don't fail registration if reputation setup fails
      }
    } else {
      logger.info('Initial reputation already set for agent', { tokenId }, 'AgentOnboard')
    }

    // Update database
    await prisma.user.update({
      where: { id: dbUser.id },
      data: {
        onChainRegistered: true,
        nftTokenId: tokenId,
        registrationTxHash: txHash,
        username: agentId,
        displayName: name,
      },
    })

    return successResponse({
      message: 'Successfully registered agent on-chain',
      tokenId,
      agentId,
      txHash,
      blockNumber: Number(receipt.blockNumber),
      gasUsed: Number(receipt.gasUsed),
    })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('Agent registration error', { error: errorMessage }, 'AgentOnboard')
    return errorResponse(
      error instanceof Error ? error.message : 'Failed to register agent on-chain',
      500
    )
  }
}

/**
 * GET /api/agents/onboard
 * Check agent registration status
 */
export async function GET(request: NextRequest) {
  try {
    const user = await authenticate(request)
    if (!user.isAgent || !user.userId) {
      return errorResponse('Only agents can use this endpoint', 403)
    }

    const agentId = user.userId

    // Check database
    const dbUser = await prisma.user.findFirst({
      where: { username: agentId },
      select: {
        onChainRegistered: true,
        nftTokenId: true,
        registrationTxHash: true,
      },
    })

    if (!dbUser) {
      return successResponse({
        isRegistered: false,
        agentId,
      })
    }

    // Check registration status based on database tracking
    const isRegistered = dbUser.onChainRegistered && dbUser.nftTokenId !== null

    return successResponse({
      isRegistered,
      tokenId: dbUser.nftTokenId,
      txHash: dbUser.registrationTxHash,
      agentId,
    })

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('Agent status check error', { error: errorMessage }, 'AgentOnboard')
    return errorResponse(
      error instanceof Error ? error.message : 'Failed to check agent registration status',
      500
    )
  }
}

