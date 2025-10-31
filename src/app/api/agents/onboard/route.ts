/**
 * Agent On-Chain Registration API
 *
 * Registers ElizaOS agents to the EIP-8004 Identity Registry on Base Sepolia
 * Agents get NFT token IDs so they can receive reputation updates
 * Server wallet pays gas (testnet strategy)
 */

import { NextRequest } from 'next/server'
import { createWalletClient, createPublicClient, http, parseEther, decodeEventLog, type Address } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { baseSepolia } from 'viem/chains'
import { errorResponse, successResponse, authenticate } from '@/lib/api/auth-middleware'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

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
 * Generate deterministic wallet address for agent
 * Uses agentId to create a stable address per agent
 */
function generateAgentWalletAddress(agentId: string): Address {
  // Use a deterministic approach: hash agentId and derive address
  // For MVP, we'll use a simple pattern: server wallet + agentId hash
  // In production, agents could have their own wallets
  const crypto = require('crypto')
  const hash = crypto.createHash('sha256').update(`babylon-agent-${agentId}`).digest('hex')
  // Use first 40 chars as address (Ethereum addresses are 20 bytes = 40 hex chars)
  // Prepend 0x and pad/truncate to 40 chars
  const address = '0x' + hash.slice(0, 40)
  return address as Address
}

/**
 * POST /api/agents/onboard
 * Register an agent to the on-chain identity system
 */
export async function POST(request: NextRequest) {
  try {
    // Authenticate agent
    const user = await authenticate(request)
    if (!user.isAgent || !user.userId) {
      return errorResponse('Only agents can use this endpoint', 403)
    }

    const agentId = user.userId

    // Parse request body
    const body: AgentOnboardRequest = await request.json()
    const { agentName, endpoint } = body

    // Generate deterministic wallet address for this agent
    const agentWalletAddress = generateAgentWalletAddress(agentId)

    // Check if agent exists in database (use upsert to avoid race conditions)
    let dbUser = await prisma.user.upsert({
      where: {
        username: agentId, // Use username as unique identifier for agents
      },
      update: {
        // Update fields if user exists but data changed
        displayName: agentName || agentId,
        walletAddress: agentWalletAddress.toLowerCase(),
        bio: `Autonomous AI agent: ${agentId}`,
      },
      create: {
        username: agentId,
        displayName: agentName || agentId,
        walletAddress: agentWalletAddress.toLowerCase(),
        virtualBalance: 10000, // Start with 10k points
        totalDeposited: 10000,
        bio: `Autonomous AI agent: ${agentId}`,
      },
    })

    // Create clients
    const publicClient = createPublicClient({
      chain: baseSepolia,
      transport: http(process.env.NEXT_PUBLIC_RPC_URL),
    })

    // Check database first - if already registered, return cached token ID
    if (dbUser.onChainRegistered && dbUser.nftTokenId) {
      // Check if initial reputation was already awarded by checking if registrationTxHash exists
      // (reputation is awarded on-chain, not tracked in balance transactions)
      return successResponse({
        message: 'Agent already registered on-chain',
        tokenId: dbUser.nftTokenId,
        walletAddress: agentWalletAddress,
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

    console.log('Registering agent on-chain:', {
      agentId,
      wallet: agentWalletAddress,
      name,
      endpoint: agentEndpoint,
    })

    // IMPORTANT: For MVP, we register using server wallet but track agent ownership
    // The NFT will be minted to server wallet, but we track tokenId -> agentId mapping in database
    // In production, agents could have their own wallets and sign transactions
    
    // Generate unique endpoint per agent to avoid conflicts
    const uniqueEndpoint = `${agentEndpoint}?agentId=${agentId}`
    
    // Call registerAgent on Identity Registry (server wallet is msg.sender)
    const txHash = await walletClient.writeContract({
      address: IDENTITY_REGISTRY,
      abi: IDENTITY_REGISTRY_ABI,
      functionName: 'registerAgent',
      args: [name, uniqueEndpoint, capabilitiesHash, metadataURI],
    })

    console.log('Agent registration transaction sent:', txHash)

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
      } catch (e) {
        // Skip logs we can't decode
      }
    }

    // If we couldn't get tokenId from events, query it
    if (!tokenId) {
      // Query token ID for server wallet (since server wallet called registerAgent)
      // Note: This gets the most recent token ID for server wallet
      // For MVP, we assume one registration per transaction
      const serverWalletAddress = account.address
      try {
        const queriedTokenId = await publicClient.readContract({
          address: IDENTITY_REGISTRY,
          abi: IDENTITY_REGISTRY_ABI,
          functionName: 'getTokenId',
          args: [serverWalletAddress],
        })
        tokenId = Number(queriedTokenId)
      } catch (error) {
        console.error('Failed to query token ID, using event log value:', error)
        // Token ID should have been extracted from events above
      }
    }

    if (!tokenId) {
      throw new Error('Failed to determine token ID from transaction')
    }

    console.log('Agent registered with token ID:', tokenId)

    // Set initial reputation to 70 (by recording 10 bets with 7 wins = 70% accuracy)
    // Only set if not already set (check by looking for registration tx hash)
    if (!dbUser.registrationTxHash) {
      try {
        console.log('Setting initial reputation to 70 for agent...')
        
        // Record 10 bets total
        for (let i = 0; i < 10; i++) {
            await walletClient.writeContract({
              address: REPUTATION_SYSTEM,
              abi: REPUTATION_SYSTEM_ABI,
              functionName: 'recordBet',
              args: [BigInt(tokenId), parseEther('100')],
            })
        }

        // Record 7 wins to achieve 70% accuracy (7/10 = 70%)
        for (let i = 0; i < 7; i++) {
              const winTxHash = await walletClient.writeContract({
                address: REPUTATION_SYSTEM,
                abi: REPUTATION_SYSTEM_ABI,
                functionName: 'recordWin',
                args: [BigInt(tokenId), parseEther('100')],
              })
          
          // Wait for first few transactions
          if (i < 2) {
            await publicClient.waitForTransactionReceipt({
              hash: winTxHash,
              confirmations: 1,
            })
          }
        }

        // Wait for remaining transactions
        await new Promise(resolve => setTimeout(resolve, 2000))

        console.log('Initial reputation set to 70 for agent (7 wins out of 10 bets)')
      } catch (error) {
        console.error('Failed to set initial reputation for agent:', error)
        // Don't fail registration if reputation setup fails
      }
    } else {
      console.log('Initial reputation already set for agent')
    }

    // Update database
    dbUser = await prisma.user.update({
      where: { id: dbUser.id },
      data: {
        onChainRegistered: true,
        nftTokenId: tokenId,
        registrationTxHash: txHash,
        walletAddress: agentWalletAddress.toLowerCase(),
        username: agentId,
        displayName: name,
      },
    })

    return successResponse({
      message: 'Successfully registered agent on-chain',
      tokenId,
      walletAddress: agentWalletAddress,
      agentId,
      txHash,
      blockNumber: Number(receipt.blockNumber),
      gasUsed: Number(receipt.gasUsed),
    })
  } catch (error) {
    console.error('Agent registration error:', error)
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
        walletAddress: true,
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

    // Check on-chain status if we have a wallet address
    if (dbUser.walletAddress) {

      // For agents, we registered using server wallet, so check differently
      // We'll track by tokenId in database instead
      const isRegistered = dbUser.onChainRegistered && dbUser.nftTokenId !== null

      return successResponse({
        isRegistered,
        tokenId: dbUser.nftTokenId,
        walletAddress: dbUser.walletAddress,
        txHash: dbUser.registrationTxHash,
        agentId,
      })
    }

    return successResponse({
      isRegistered: false,
      agentId,
    })
  } catch (error) {
    console.error('Agent status check error:', error)
    return errorResponse(
      error instanceof Error ? error.message : 'Failed to check agent registration status',
      500
    )
  }
}

