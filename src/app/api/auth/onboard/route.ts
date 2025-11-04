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
import { authenticate } from '@/lib/api/auth-middleware'
import { withErrorHandling, successResponse } from '@/lib/errors/error-handler'
import { BusinessLogicError, ValidationError, InternalServerError } from '@/lib/errors'
import { OnChainRegistrationSchema } from '@/lib/validation/schemas/user'
import { prisma } from '@/lib/database-service'
import { Prisma } from '@prisma/client'
import { PointsService } from '@/lib/services/points-service'
import { logger } from '@/lib/logger'
import { notifyNewAccount } from '@/lib/services/notification-service'
import { Agent0Client } from '@/agents/agent0/Agent0Client'
import type { AgentCapabilities } from '@/a2a/types'

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

/**
 * POST /api/auth/onboard
 * Register a user to the on-chain identity system
 */
export const POST = withErrorHandling(async (request: NextRequest) => {
  // Authenticate user (both regular users and agents)
  const user = await authenticate(request)

  // Parse and validate request body
  const body = await request.json()
  const { walletAddress, username, displayName, bio, profileImageUrl, coverImageUrl, endpoint, referralCode } = OnChainRegistrationSchema.parse(body)

  // For agents, walletAddress is optional (they use server wallet)
  // For regular users, walletAddress is required
  if (!user.isAgent && !walletAddress) {
    throw new BusinessLogicError('Wallet address is required for non-agent users', 'WALLET_REQUIRED');
  }

  // Generate random username if not provided
  const finalUsername = username || `user_${Math.random().toString(36).substring(2, 10)}_${Date.now().toString(36).substring(2, 6)}`

  // Validate wallet address format
  if (walletAddress && !/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) {
    throw new ValidationError('Invalid wallet address format', ['walletAddress'], [{ field: 'walletAddress', message: 'Must be a valid Ethereum address (0x...)' }]);
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
    // For agents, use username as unique identifier; for users, use ID
    let dbUser: { id: string; username: string | null; walletAddress: string | null; onChainRegistered: boolean; nftTokenId: number | null } | null = null
    
    if (user.isAgent) {
      // Agents are identified by username (agentId)
      dbUser = await prisma.user.findUnique({
        where: { username: user.userId },
        select: {
          id: true,
          username: true,
          walletAddress: true,
          onChainRegistered: true,
          nftTokenId: true,
        },
      })

      if (!dbUser) {
        // Create agent user
        dbUser = await prisma.user.create({
          data: {
            username: user.userId,
            displayName: displayName || username || user.userId,
            bio: bio || `Autonomous AI agent: ${user.userId}`,
            profileImageUrl: profileImageUrl,
            coverImageUrl: coverImageUrl,
            isActor: false,
            virtualBalance: 10000, // Agents start with 10k
            totalDeposited: 10000,
          },
          select: {
            id: true,
            username: true,
            walletAddress: true,
            onChainRegistered: true,
            nftTokenId: true,
          },
        })
      }
    } else {
      // Regular users identified by ID (Privy user ID)
      dbUser = await prisma.user.findUnique({
        where: { id: user.userId },
        select: {
          id: true,
          username: true,
          walletAddress: true,
          onChainRegistered: true,
          nftTokenId: true,
        },
      })

      if (!dbUser) {
        // User doesn't exist yet - create them
        dbUser = await prisma.user.create({
          data: {
            id: user.userId,
            walletAddress: walletAddress!.toLowerCase(),
            username: finalUsername,
            displayName: displayName || finalUsername,
            bio: bio || '',
            profileImageUrl: profileImageUrl,
            coverImageUrl: coverImageUrl,
            isActor: false,
            virtualBalance: 0, // Will be set to 1000 after registration
            totalDeposited: 0,
            referredBy: referrerId,
          },
          select: {
            id: true,
            username: true,
            walletAddress: true,
            onChainRegistered: true,
            nftTokenId: true,
          },
        })
      } else {
        // Update existing user with latest info if needed
        // Need to fetch full user to get displayName and bio
        const fullUser = await prisma.user.findUnique({
          where: { id: dbUser.id },
        })
        
        dbUser = await prisma.user.update({
          where: { id: dbUser.id },
          data: {
            walletAddress: walletAddress!.toLowerCase(),
            username: finalUsername || dbUser.username,
            displayName: displayName || finalUsername || fullUser?.displayName,
            bio: bio || fullUser?.bio,
            profileImageUrl: profileImageUrl || fullUser?.profileImageUrl,
            coverImageUrl: coverImageUrl || fullUser?.coverImageUrl,
          },
          select: {
            id: true,
            username: true,
            walletAddress: true,
            onChainRegistered: true,
            nftTokenId: true,
          },
        })
      }
    }

    // Create clients
    const publicClient = createPublicClient({
      chain: baseSepolia,
      transport: http(process.env.NEXT_PUBLIC_RPC_URL),
    })

    // For agents, we check registration by tokenId in database
    // For regular users, we check by wallet address on-chain
    let isRegistered = false
    let tokenId: number | null = dbUser.nftTokenId

    if (user.isAgent) {
      // Agents: check database registration status
      isRegistered = dbUser.onChainRegistered && dbUser.nftTokenId !== null
    } else {
      // Regular users: check on-chain registration
      isRegistered = await publicClient.readContract({
        address: IDENTITY_REGISTRY,
        abi: IDENTITY_REGISTRY_ABI,
        functionName: 'isRegistered',
        args: [walletAddress! as Address],
      })
      
      if (isRegistered && !tokenId) {
        // Get existing token ID
        tokenId = Number(await publicClient.readContract({
          address: IDENTITY_REGISTRY,
          abi: IDENTITY_REGISTRY_ABI,
          functionName: 'getTokenId',
          args: [walletAddress! as Address],
        }))
      }
    }

    if (isRegistered && tokenId) {
      // Already registered - update database if needed
      if (!dbUser.onChainRegistered) {
        await prisma.user.update({
          where: { id: dbUser.id },
          data: {
            onChainRegistered: true,
            nftTokenId: tokenId,
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
    throw new InternalServerError('Server wallet not configured for gas payments', { missing: 'DEPLOYER_PRIVATE_KEY' });
  }

    const account = privateKeyToAccount(DEPLOYER_PRIVATE_KEY)
    const walletClient = createWalletClient({
      account,
      chain: baseSepolia,
      transport: http(process.env.NEXT_PUBLIC_RPC_URL),
    })

    // Prepare registration parameters
    const name = username || (user.isAgent ? user.userId : finalUsername)
    let registrationAddress: Address
    let agentEndpoint: string

    if (user.isAgent) {
      // Agents: use server wallet address, unique endpoint per agent
      registrationAddress = account.address
      agentEndpoint = endpoint || `https://babylon.game/agent/${user.userId}`
      const uniqueEndpoint = `${agentEndpoint}?agentId=${user.userId}`
      agentEndpoint = uniqueEndpoint
    } else {
      // Regular users: use their wallet address
      registrationAddress = walletAddress! as Address
      agentEndpoint = endpoint || `https://babylon.game/agent/${walletAddress!.toLowerCase()}`
    }

    const capabilitiesHash = '0x0000000000000000000000000000000000000000000000000000000000000001' as `0x${string}` // Basic capabilities
    const metadataURI = JSON.stringify({
      name,
      bio: bio || '',
      type: user.isAgent ? 'elizaos-agent' : 'user',
      registered: new Date().toISOString(),
    })

    logger.info('Registering on-chain:', {
      isAgent: user.isAgent,
      address: registrationAddress,
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
    throw new BusinessLogicError('Blockchain registration transaction failed', 'REGISTRATION_TX_FAILED', { txHash, receipt: receipt.status });
  }

    // Get the token ID from the event logs
    // Reset tokenId to null if not already set from database
    if (!tokenId) {
      tokenId = null
    }
    
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
    if (user.isAgent) {
      // For agents, tokenId MUST come from events (server wallet owns multiple NFTs)
      throw new InternalServerError('Failed to extract token ID from AgentRegistered event', { txHash, userId: user.userId });
    } else {
        // For regular users, query by wallet address
        const queriedTokenId = await publicClient.readContract({
          address: IDENTITY_REGISTRY,
          abi: IDENTITY_REGISTRY_ABI,
          functionName: 'getTokenId',
          args: [walletAddress! as Address],
        })
        tokenId = Number(queriedTokenId)
      }
    }

    logger.info('Registered with token ID:', tokenId, 'POST /api/auth/onboard')

    // Set initial reputation to 70 (by recording 10 bets with 7 wins = 70% accuracy)
    // This gives trustScore ≈ 7000 (70 out of 100)
    // Note: We already waited for transaction confirmation above, but we need to verify token exists
    try {
      logger.info('Setting initial reputation to 70...', undefined, 'POST /api/auth/onboard')
      
      // Wait a bit for state to sync after registration
      await new Promise(resolve => setTimeout(resolve, 1000))

      // Verify token exists before attempting reputation calls
      // Use isRegistered instead of ownerOf to avoid reverts
      const verifyAddress = user.isAgent ? account.address : (walletAddress! as Address)
      const isRegistered = await publicClient.readContract({
        address: IDENTITY_REGISTRY,
        abi: IDENTITY_REGISTRY_ABI,
        functionName: 'isRegistered',
        args: [verifyAddress],
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

    // Update database with ERC-8004 registration
    await prisma.user.update({
      where: { id: dbUser.id },
      data: {
        onChainRegistered: true,
        nftTokenId: tokenId,
        registrationTxHash: txHash,
        username: user.isAgent ? user.userId : (username || dbUser.username),
        displayName: username || dbUser.username || user.userId,
        bio: bio || (user.isAgent ? `Autonomous AI agent: ${user.userId}` : undefined),
      },
    })

    // Register with Agent0 SDK and publish to IPFS (if enabled)
    let agent0MetadataCID: string | null = null
    if (process.env.AGENT0_ENABLED === 'true' && !user.isAgent) {
      // Only register regular users with Agent0 (agents are handled in /api/agents/onboard)
      try {
        logger.info('Registering user with Agent0 SDK...', { userId: dbUser.id, tokenId }, 'UserOnboard')

        const userWalletAddress = walletAddress!.toLowerCase()
        
        // Create user metadata (Agent0 SDK will publish to IPFS)
        const userMetadata = {
          name: username || dbUser.username || user.userId,
          description: bio || `Babylon player`,
          version: '1.0.0',
          type: 'user',
          endpoints: {
            api: `https://babylon.game/api/users/${dbUser.id}`,
          },
          capabilities: {
            strategies: [],  // Users don't have automated strategies
            markets: ['prediction', 'perpetuals'],
            actions: ['trade', 'post', 'chat'],
            version: '1.0.0'
          } as AgentCapabilities,
          babylon: {
            agentId: dbUser.id,
            tokenId,
            walletAddress: userWalletAddress,
            registrationTxHash: txHash
          }
        }
        
        // Register with Agent0 SDK (handles IPFS publishing internally)
        try {
          const agent0Client = new Agent0Client({
            network: (process.env.AGENT0_NETWORK as 'sepolia' | 'mainnet') || 'sepolia',
            rpcUrl: process.env.BASE_SEPOLIA_RPC_URL || process.env.BASE_RPC_URL || '',
            privateKey: DEPLOYER_PRIVATE_KEY
          })
          
          const agent0Result = await agent0Client.registerAgent({
            name: username || dbUser.username || user.userId,
            description: bio || 'Babylon player',
            walletAddress: userWalletAddress,
            capabilities: userMetadata.capabilities
          })
          
          // Extract metadata CID from Agent0 result
          agent0MetadataCID = agent0Result.metadataCID || null
          
          logger.info(`User registered with Agent0 SDK`, { 
            userId: dbUser.id, 
            tokenId: agent0Result.tokenId,
            metadataCID: agent0MetadataCID
          }, 'UserOnboard')
          
          // Update database with Agent0 metadata
          // TODO: Add agent0MetadataCID and agent0LastSync fields to Prisma schema
          await prisma.user.update({
            where: { id: dbUser.id },
            data: {
              // Metadata will be stored when schema is updated
            },
          })
        } catch (agent0Error) {
          // Log but don't fail - Agent0 SDK might not be installed yet
          logger.warn(
            'Agent0 SDK registration failed (SDK may not be installed). Metadata published to IPFS.',
            { error: agent0Error instanceof Error ? agent0Error.message : String(agent0Error), userId: dbUser.id },
            'UserOnboard'
          )
          
          // Still store IPFS CID
          // TODO: Add agent0MetadataCID field to Prisma schema
          await prisma.user.update({
            where: { id: dbUser.id },
            data: {
              // Metadata will be stored when schema is updated
            },
          })
        }
      } catch (error) {
        // Don't fail registration if Agent0/IPFS fails
        logger.warn(
          'Failed to register user with Agent0/IPFS (non-critical)',
          { error: error instanceof Error ? error.message : String(error), userId: dbUser.id },
          'UserOnboard'
        )
      }
    }

    // Award 1,000 virtual balance points to user (only if not already awarded)
    // Skip for agents - they already have 10k points
    if (!user.isAgent) {
      try {
        // Check if welcome bonus was already awarded
        const existingBonus = await prisma.balanceTransaction.findFirst({
          where: {
            userId: dbUser.id,
            description: 'Welcome bonus - initial signup',
          },
        })

        if (!existingBonus) {
          // Fetch current balance
          const userWithBalance = await prisma.user.findUnique({
            where: { id: dbUser.id },
            select: { virtualBalance: true },
          })
          
          const balanceBefore = userWithBalance?.virtualBalance || new Prisma.Decimal(0)
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

        // Send welcome notification to new user
        try {
          await notifyNewAccount(dbUser.id)
          logger.info('Welcome notification sent to new user', { userId: dbUser.id }, 'POST /api/auth/onboard')
        } catch (notificationError) {
          const notificationErrorMessage = notificationError instanceof Error ? notificationError.message : String(notificationError);
          logger.error('Error sending welcome notification (non-critical):', { error: notificationErrorMessage }, 'POST /api/auth/onboard')
          // Don't fail registration if notification fails
        }

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

              // Auto-follow: Referrer follows the new user (they invited them!)
              try {
                const existingFollow = await prisma.follow.findUnique({
                  where: {
                    followerId_followingId: {
                      followerId: referrerId,
                      followingId: dbUser.id,
                    },
                  },
                })

                if (!existingFollow) {
                  await prisma.follow.create({
                    data: {
                      followerId: referrerId,
                      followingId: dbUser.id,
                    },
                  })

                  logger.info(
                    `Referrer ${referrerId} auto-followed new user ${dbUser.id}`,
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
    }

  logger.info('On-chain registration completed', {
    userId: user.userId,
    tokenId,
    isAgent: user.isAgent,
    pointsAwarded: user.isAgent ? 0 : 1000
  }, 'POST /api/auth/onboard');

  return successResponse({
    message: `Successfully registered ${user.isAgent ? 'agent' : 'user'} on-chain`,
    tokenId,
    walletAddress: user.isAgent ? undefined : walletAddress,
    agentId: user.isAgent ? user.userId : undefined,
    txHash,
    blockNumber: Number(receipt.blockNumber),
    gasUsed: Number(receipt.gasUsed),
    pointsAwarded: user.isAgent ? 0 : 1000, // Agents don't get welcome bonus
  });
});

/**
 * GET /api/auth/onboard
 * Check registration status
 */
export const GET = withErrorHandling(async (request: NextRequest) => {
  const user = await authenticate(request)

  // Check database
  let dbUser: { walletAddress: string | null; onChainRegistered: boolean; nftTokenId: number | null; registrationTxHash: string | null } | null = null

  if (user.isAgent) {
      // Agents: find by username
      dbUser = await prisma.user.findFirst({
        where: { username: user.userId },
        select: {
          walletAddress: true,
          onChainRegistered: true,
          nftTokenId: true,
          registrationTxHash: true,
        },
      })
    } else {
      // Regular users: find by ID
      dbUser = await prisma.user.findFirst({
        where: { id: user.userId },
        select: {
          walletAddress: true,
          onChainRegistered: true,
          nftTokenId: true,
          registrationTxHash: true,
        },
      })
    }

    if (!dbUser) {
      return successResponse({
        isRegistered: false,
        tokenId: null,
        walletAddress: null,
        txHash: null,
        dbRegistered: false,
      })
    }

    // For agents, check database status only
    // For regular users, also check on-chain status
    let isRegistered = dbUser.onChainRegistered && dbUser.nftTokenId !== null
    let tokenId: number | null = dbUser.nftTokenId

    if (!user.isAgent && dbUser.walletAddress) {
      // Check on-chain status for regular users
      const publicClient = createPublicClient({
        chain: baseSepolia,
        transport: http(process.env.NEXT_PUBLIC_RPC_URL),
      })

      const onChainRegistered = await publicClient.readContract({
        address: IDENTITY_REGISTRY,
        abi: IDENTITY_REGISTRY_ABI,
        functionName: 'isRegistered',
        args: [dbUser.walletAddress as Address],
      })

      if (onChainRegistered && !tokenId) {
        const queriedTokenId = await publicClient.readContract({
          address: IDENTITY_REGISTRY,
          abi: IDENTITY_REGISTRY_ABI,
          functionName: 'getTokenId',
          args: [dbUser.walletAddress as Address],
        })
        tokenId = Number(queriedTokenId)
      }

      isRegistered = onChainRegistered
    }

  logger.info('Registration status checked', { userId: user.userId, isRegistered }, 'GET /api/auth/onboard');

  return successResponse({
    isRegistered,
    tokenId,
    walletAddress: dbUser.walletAddress,
    txHash: dbUser.registrationTxHash,
    dbRegistered: dbUser.onChainRegistered,
  });
});
