/**
 * On-Chain Registration API Route
 *
 * Registers users to the ERC-8004 Identity Registry on Base Sepolia
 * Awards 1,000 initial reputation points
 * Stores NFT token ID in user profile
 */

import { NextRequest } from 'next/server'
import { createWalletClient, createPublicClient, http, parseEther, decodeEventLog, type Address } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { baseSepolia } from 'viem/chains'
import { authenticate, errorResponse, successResponse } from '@/lib/api/auth-middleware'
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
    name: 'tokenOfOwner',
    inputs: [{ name: 'owner', type: 'address' }],
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

// Reputation System ABI (minimal for awarding points)
const REPUTATION_SYSTEM_ABI = [
  {
    type: 'function',
    name: 'recordBet',
    inputs: [
      { name: 'tokenId', type: 'uint256' },
      { name: 'amount', type: 'uint256' },
      { name: 'marketId', type: 'string' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
] as const

interface RegistrationRequest {
  walletAddress: string
  username: string
  bio?: string
  endpoint?: string
}

/**
 * POST /api/auth/onboard
 * Register a user to the on-chain identity system
 */
export async function POST(request: NextRequest) {
  try {
    // Authenticate user
    const user = await authenticate(request)
    if (user.isAgent) {
      return errorResponse('Agents cannot register on-chain', 403)
    }

    // Parse request body
    const body: RegistrationRequest = await request.json()
    const { walletAddress, username, bio, endpoint } = body

    if (!walletAddress || !username) {
      return errorResponse('Wallet address and username are required', 400)
    }

    // Validate wallet address format
    if (!/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) {
      return errorResponse('Invalid wallet address format', 400)
    }

    // Check if user exists in database
    let dbUser = await prisma.user.findUnique({
      where: { walletAddress: walletAddress.toLowerCase() },
    })

    if (!dbUser) {
      return errorResponse('User not found. Please complete signup first.', 404)
    }

    // Create clients
    const publicClient = createPublicClient({
      chain: baseSepolia,
      transport: http(process.env.NEXT_PUBLIC_RPC_URL),
    })

    // Check if already registered on-chain
    const isRegistered = await publicClient.readContract({
      address: IDENTITY_REGISTRY,
      abi: IDENTITY_REGISTRY_ABI,
      functionName: 'isRegistered',
      args: [walletAddress as Address],
    })

    if (isRegistered) {
      // Get existing token ID
      const tokenId = await publicClient.readContract({
        address: IDENTITY_REGISTRY,
        abi: IDENTITY_REGISTRY_ABI,
        functionName: 'tokenOfOwner',
        args: [walletAddress as Address],
      })

      // Update database if not already marked as registered
      if (!dbUser.onChainRegistered) {
        dbUser = await prisma.user.update({
          where: { id: dbUser.id },
          data: {
            onChainRegistered: true,
            nftTokenId: Number(tokenId),
          },
        })
      }

      return successResponse({
        message: 'Already registered on-chain',
        tokenId: Number(tokenId),
        walletAddress,
        txHash: null,
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
    const name = username
    const agentEndpoint = endpoint || `https://babylon.game/agent/${walletAddress.toLowerCase()}`
    const capabilitiesHash = '0x0000000000000000000000000000000000000000000000000000000000000001' as `0x${string}` // Basic capabilities
    const metadataURI = JSON.stringify({
      name: username,
      bio: bio || '',
      image: dbUser.profileImageUrl || '',
      registered: new Date().toISOString(),
    })

    console.log('Registering agent on-chain:', {
      wallet: walletAddress,
      name,
      endpoint: agentEndpoint,
    })

    // Call registerAgent on Identity Registry
    const txHash = await walletClient.writeContract({
      address: IDENTITY_REGISTRY,
      abi: IDENTITY_REGISTRY_ABI,
      functionName: 'registerAgent',
      args: [name, agentEndpoint, capabilitiesHash, metadataURI],
    })

    console.log('Registration transaction sent:', txHash)

    // Wait for transaction confirmation
    const receipt = await publicClient.waitForTransactionReceipt({
      hash: txHash,
      confirmations: 1,
    })

    if (receipt.status !== 'success') {
      return errorResponse('Registration transaction failed', 500)
    }

    // Get the token ID from the event logs
    let tokenId: number | null = null
    for (const log of receipt.logs) {
      try {
        // Try to decode as AgentRegistered event
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
      const queriedTokenId = await publicClient.readContract({
        address: IDENTITY_REGISTRY,
        abi: IDENTITY_REGISTRY_ABI,
        functionName: 'tokenOfOwner',
        args: [walletAddress as Address],
      })
      tokenId = Number(queriedTokenId)
    }

    console.log('Agent registered with token ID:', tokenId)

    // Award initial 1,000 reputation points by recording a "welcome" bet
    try {
      const awardTxHash = await walletClient.writeContract({
        address: REPUTATION_SYSTEM,
        abi: REPUTATION_SYSTEM_ABI,
        functionName: 'recordBet',
        args: [BigInt(tokenId), parseEther('1000'), 'INITIAL_REGISTRATION'],
      })

      console.log('Initial reputation awarded:', awardTxHash)

      await publicClient.waitForTransactionReceipt({
        hash: awardTxHash,
        confirmations: 1,
      })
    } catch (error) {
      console.error('Failed to award initial reputation:', error)
      // Don't fail registration if reputation award fails
    }

    // Update database
    dbUser = await prisma.user.update({
      where: { id: dbUser.id },
      data: {
        onChainRegistered: true,
        nftTokenId: tokenId,
        registrationTxHash: txHash,
        username: username, // Update username if changed
        bio: bio || dbUser.bio, // Update bio if provided
      },
    })

    return successResponse({
      message: 'Successfully registered on-chain',
      tokenId,
      walletAddress,
      txHash,
      blockNumber: Number(receipt.blockNumber),
      gasUsed: Number(receipt.gasUsed),
    })
  } catch (error) {
    console.error('Registration error:', error)
    return errorResponse(
      error instanceof Error ? error.message : 'Failed to register on-chain',
      500
    )
  }
}

/**
 * GET /api/auth/onboard
 * Check registration status
 */
export async function GET(request: NextRequest) {
  try {
    const user = await authenticate(request)
    if (user.isAgent) {
      return errorResponse('Agents cannot check registration status', 403)
    }

    // Check database
    const dbUser = await prisma.user.findFirst({
      where: { id: user.userId },
      select: {
        walletAddress: true,
        onChainRegistered: true,
        nftTokenId: true,
        registrationTxHash: true,
      },
    })

    if (!dbUser || !dbUser.walletAddress) {
      return errorResponse('User not found or no wallet connected', 404)
    }

    // Check on-chain status
    const publicClient = createPublicClient({
      chain: baseSepolia,
      transport: http(process.env.NEXT_PUBLIC_RPC_URL),
    })

    const isRegistered = await publicClient.readContract({
      address: IDENTITY_REGISTRY,
      abi: IDENTITY_REGISTRY_ABI,
      functionName: 'isRegistered',
      args: [dbUser.walletAddress as Address],
    })

    let tokenId: number | null = null
    if (isRegistered) {
      const queriedTokenId = await publicClient.readContract({
        address: IDENTITY_REGISTRY,
        abi: IDENTITY_REGISTRY_ABI,
        functionName: 'tokenOfOwner',
        args: [dbUser.walletAddress as Address],
      })
      tokenId = Number(queriedTokenId)
    }

    return successResponse({
      isRegistered,
      tokenId,
      walletAddress: dbUser.walletAddress,
      txHash: dbUser.registrationTxHash,
      dbRegistered: dbUser.onChainRegistered,
    })
  } catch (error) {
    console.error('Status check error:', error)
    return errorResponse(
      error instanceof Error ? error.message : 'Failed to check registration status',
      500
    )
  }
}
