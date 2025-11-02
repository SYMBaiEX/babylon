/**
 * On-Chain Registration API Route
 *
 * Registers users to the ERC-8004 Identity Registry on Base Sepolia
 * Awards 1,000 initial reputation points
 * Stores NFT token ID in user profile
 */

import type { NextRequest } from 'next/server'
import { createWalletClient, createPublicClient, http, parseEther, decodeEventLog, type Address } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { baseSepolia } from 'viem/chains'
import { authenticate, errorResponse, successResponse } from '@/lib/api/auth-middleware'
import { PrismaClient, Prisma } from '@prisma/client'
import { PointsService } from '@/lib/services/points-service'
import { logger } from '@/lib/logger'

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
    type: 'function',
    name: 'ownerOf',
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    outputs: [{ name: '', type: 'address' }],
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

interface RegistrationRequest {
  walletAddress: string
  username: string
  bio?: string
  endpoint?: string
  referralCode?: string // Referral code from URL param
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
    const { walletAddress, username, bio, endpoint, referralCode } = body

    if (!walletAddress || !username) {
      return errorResponse('Wallet address and username are required', 400)
    }

    // Validate wallet address format
    if (!/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) {
      return errorResponse('Invalid wallet address format', 400)
    }

    // Check if referral code is valid (if provided)
    // Referral code is now the username (without @)
    let referrerId: string | null = null
    if (referralCode) {
      // First, try to find user by username (new system - username is referral code)
      const referrer = await prisma.user.findUnique({
        where: { username: referralCode },
        select: { id: true },
      })

      if (referrer) {
        referrerId = referrer.id
        logger.info(
          `Valid referral code (username) found: ${referralCode} from user ${referrerId}`,
          { referralCode, referrerId },
          'POST /api/auth/onboard'
        )
      } else {
        // Fallback: Try old referral code system for backward compatibility
        const referral = await prisma.referral.findUnique({
          where: { referralCode },
          include: { referrer: true },
        })

        if (referral && referral.status === 'pending') {
          referrerId = referral.referrerId
          logger.info(
            `Valid referral code (legacy) found: ${referralCode} from user ${referrerId}`,
            { referralCode, referrerId },
            'POST /api/auth/onboard'
          )
        }
      }
    }

    // Check if user exists in database, create if not exists
    // First try by ID (Privy user ID)
    let dbUser = await prisma.user.findUnique({
      where: { id: user.userId },
    })

    if (!dbUser) {
      // User doesn't exist yet - create them
      // Use userId from auth (Privy user ID) as the database ID
      dbUser = await prisma.user.create({
        data: {
          id: user.userId,
          walletAddress: walletAddress.toLowerCase(),
          username: username,
          displayName: username || `user_${user.userId.slice(0, 8)}`,
          bio: bio || '',
          isActor: false,
          virtualBalance: 0, // Will be set to 1000 after registration
          totalDeposited: 0,
          referredBy: referrerId, // Track who referred this user
        },
      })
    } else {
      // Update existing user with latest info if needed
      dbUser = await prisma.user.update({
        where: { id: dbUser.id },
        data: {
          walletAddress: walletAddress.toLowerCase(),
          username: username || dbUser.username,
          displayName: username || dbUser.displayName,
          bio: bio || dbUser.bio,
        },
      })
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
        functionName: 'getTokenId',
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

      // Check if points were already awarded
      const hasWelcomeBonus = await prisma.balanceTransaction.findFirst({
        where: {
          userId: dbUser.id,
          description: 'Welcome bonus - initial signup',
        },
      })

      return successResponse({
        message: 'Already registered on-chain',
        tokenId: Number(tokenId),
        walletAddress,
        txHash: null,
        pointsAwarded: hasWelcomeBonus ? 1000 : 0,
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

    logger.info('Registering agent on-chain:', {
      wallet: walletAddress,
      name,
      endpoint: agentEndpoint,
    }, 'POST /api/auth/onboard')

    // Call registerAgent on Identity Registry
    const txHash = await walletClient.writeContract({
      address: IDENTITY_REGISTRY,
      abi: IDENTITY_REGISTRY_ABI,
      functionName: 'registerAgent',
      args: [name, agentEndpoint, capabilitiesHash, metadataURI],
    })

    logger.info('Registration transaction sent:', txHash, 'POST /api/auth/onboard')

    // Wait for transaction confirmation (wait for more confirmations to ensure state is synced)
    const receipt = await publicClient.waitForTransactionReceipt({
      hash: txHash,
      confirmations: 2, // Wait for 2 confirmations to ensure state is synced
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
      } catch {
        // Skip logs we can't decode
      }
    }

    // If we couldn't get tokenId from events, query it
    if (!tokenId) {
      const queriedTokenId = await publicClient.readContract({
        address: IDENTITY_REGISTRY,
        abi: IDENTITY_REGISTRY_ABI,
        functionName: 'getTokenId',
        args: [walletAddress as Address],
      })
      tokenId = Number(queriedTokenId)
    }

    logger.info('Agent registered with token ID:', tokenId, 'POST /api/auth/onboard')

    // Set initial reputation to 70 (by recording 10 bets with 7 wins = 70% accuracy)
    // This gives trustScore ≈ 7000 (70 out of 100)
    // Note: We already waited for transaction confirmation above, but we need to verify token exists
    try {
      logger.info('Setting initial reputation to 70...', undefined, 'POST /api/auth/onboard')
      
      // Wait a bit for state to sync after registration
      await new Promise(resolve => setTimeout(resolve, 1000))

      // Verify token exists before attempting reputation calls
      // Use isRegistered instead of ownerOf to avoid reverts
      const isRegistered = await publicClient.readContract({
        address: IDENTITY_REGISTRY,
        abi: IDENTITY_REGISTRY_ABI,
        functionName: 'isRegistered',
        args: [walletAddress as Address],
      })

      if (!isRegistered) {
        logger.warn('Token not registered yet, skipping reputation setup', undefined, 'POST /api/auth/onboard')
        throw new Error('Token not registered - cannot set reputation')
      }

      // Also verify ownerOf works (will revert if token doesn't exist)
      try {
        const owner = await publicClient.readContract({
          address: IDENTITY_REGISTRY,
          abi: IDENTITY_REGISTRY_ABI,
          functionName: 'ownerOf',
          args: [BigInt(tokenId)],
        }) as Address

        if (!owner || owner === '0x0000000000000000000000000000000000000000') {
          throw new Error('Token owner is zero address')
        }

        logger.info('Token verified in registry, owner:', owner, 'POST /api/auth/onboard')
      } catch {
        logger.warn('Could not verify token owner, but isRegistered=true, proceeding anyway', undefined, 'POST /api/auth/onboard')
      }

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
        
        // Wait for each transaction (except batch the last ones)
        if (i < 2) {
          await publicClient.waitForTransactionReceipt({
            hash: winTxHash,
            confirmations: 1,
          })
        }
      }

      // Wait for remaining transactions
      await new Promise(resolve => setTimeout(resolve, 2000))

      logger.info('Initial reputation set to 70 (7 wins out of 10 bets)', undefined, 'POST /api/auth/onboard')
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Failed to set initial reputation:', { error: errorMessage }, 'POST /api/auth/onboard')
      // Don't fail registration if reputation setup fails
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

    // Award 1,000 virtual balance points to user (only if not already awarded)
    try {
      // Check if welcome bonus was already awarded
      const existingBonus = await prisma.balanceTransaction.findFirst({
        where: {
          userId: dbUser.id,
          description: 'Welcome bonus - initial signup',
        },
      })

      if (!existingBonus) {
        const balanceBefore = dbUser.virtualBalance
        const amountDecimal = new Prisma.Decimal(1000)
        const balanceAfter = balanceBefore.plus(amountDecimal)

        // Create transaction record
        await prisma.balanceTransaction.create({
          data: {
            userId: dbUser.id,
            type: 'deposit',
            amount: amountDecimal,
            balanceBefore,
            balanceAfter,
            description: 'Welcome bonus - initial signup',
          },
        })

        // Update user balance
        await prisma.user.update({
          where: { id: dbUser.id },
          data: {
            virtualBalance: { increment: 1000 },
            totalDeposited: { increment: 1000 },
          },
        })

        logger.info('Successfully awarded 1,000 points to user', undefined, 'POST /api/auth/onboard')

        // Award referral bonus to referrer if applicable
        if (referrerId && referralCode) {
          try {
            // Award points to referrer
            const referralResult = await PointsService.awardReferralSignup(referrerId, dbUser.id)
            
            if (referralResult.success) {
              // Create or update referral record
              // For username-based referrals, the record might not exist yet
              const existingReferral = await prisma.referral.findUnique({
                where: { referralCode },
              })

              if (existingReferral) {
                // Update existing referral
                await prisma.referral.update({
                  where: { referralCode },
                  data: {
                    status: 'completed',
                    referredUserId: dbUser.id,
                    completedAt: new Date(),
                    pointsAwarded: true,
                  },
                })
              } else {
                // Create new referral record for username-based referrals
                await prisma.referral.create({
                  data: {
                    referrerId,
                    referralCode,
                    referredUserId: dbUser.id,
                    status: 'completed',
                    completedAt: new Date(),
                    pointsAwarded: true,
                  },
                })
              }

              // Auto-follow: New user follows the referrer
              try {
                const existingFollow = await prisma.follow.findUnique({
                  where: {
                    followerId_followingId: {
                      followerId: dbUser.id,
                      followingId: referrerId,
                    },
                  },
                })

                if (!existingFollow) {
                  await prisma.follow.create({
                    data: {
                      followerId: dbUser.id,
                      followingId: referrerId,
                    },
                  })

                  logger.info(
                    `New user ${dbUser.id} auto-followed referrer ${referrerId}`,
                    { referrerId, referredUserId: dbUser.id },
                    'POST /api/auth/onboard'
                  )
                }
              } catch (followError) {
                const followErrorMessage = followError instanceof Error ? followError.message : String(followError);
                logger.error('Error creating auto-follow (non-critical):', { error: followErrorMessage }, 'POST /api/auth/onboard')
                // Don't fail registration if auto-follow fails
              }

              logger.info(
                `Awarded ${referralResult.pointsAwarded} referral points to user ${referrerId}`,
                { referrerId, referredUserId: dbUser.id, points: referralResult.pointsAwarded },
                'POST /api/auth/onboard'
              )
            }
          } catch (referralError) {
            const referralErrorMessage = referralError instanceof Error ? referralError.message : String(referralError);
            logger.error('Error awarding referral points (non-critical):', { error: referralErrorMessage }, 'POST /api/auth/onboard')
            // Don't fail registration if referral points award fails
          }
        }
      } else {
        logger.info('Welcome bonus already awarded to user', undefined, 'POST /api/auth/onboard')
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Error awarding points (non-critical):', { error: errorMessage }, 'POST /api/auth/onboard')
      // Don't fail registration if points award fails
    }

    return successResponse({
      message: 'Successfully registered on-chain',
      tokenId,
      walletAddress,
      txHash,
      blockNumber: Number(receipt.blockNumber),
      gasUsed: Number(receipt.gasUsed),
      pointsAwarded: 1000,
    })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('Registration error:', { error: errorMessage }, 'POST /api/auth/onboard')
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
        functionName: 'getTokenId',
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
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('Status check error:', { error: errorMessage }, 'GET /api/auth/onboard')
    return errorResponse(
      error instanceof Error ? error.message : 'Failed to check registration status',
      500
    )
  }
}
