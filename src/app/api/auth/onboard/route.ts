/**
 * On-Chain Registration API Route
 *
 * Registers users to the ERC-8004 Identity Registry on Ethereum Sepolia
 * Awards 1,000 initial reputation points
 * Stores NFT token ID in user profile
 */

import type { NextRequest } from 'next/server'
import { createWalletClient, createPublicClient, http, parseEther, decodeEventLog, type Address } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { sepolia } from 'viem/chains'
import { authenticate } from '@/lib/api/auth-middleware'
import { asUser } from '@/lib/db/context'
import { withErrorHandling, successResponse } from '@/lib/errors/error-handler'
import { BusinessLogicError, ValidationError, InternalServerError } from '@/lib/errors'
import { OnChainRegistrationSchema } from '@/lib/validation/schemas/user'
import { Prisma } from '@prisma/client'
import { PointsService } from '@/lib/services/points-service'
import { logger } from '@/lib/logger'
import { notifyNewAccount } from '@/lib/services/notification-service'
import { Agent0Client } from '@/agents/agent0/Agent0Client'
import type { AgentCapabilities } from '@/a2a/types'

// Contract addresses (Ethereum Sepolia)
const IDENTITY_REGISTRY = (process.env.NEXT_PUBLIC_IDENTITY_REGISTRY_ADDRESS || process.env.NEXT_PUBLIC_IDENTITY_REGISTRY_SEPOLIA) as Address
const REPUTATION_SYSTEM = (process.env.NEXT_PUBLIC_REPUTATION_SYSTEM_ADDRESS || process.env.NEXT_PUBLIC_REPUTATION_SYSTEM_SEPOLIA) as Address

// Server wallet for paying gas (testnet only!)
const DEPLOYER_PRIVATE_KEY = (process.env.DEPLOYER_PRIVATE_KEY?.startsWith('0x') 
  ? process.env.DEPLOYER_PRIVATE_KEY 
  : `0x${process.env.DEPLOYER_PRIVATE_KEY}`) as `0x${string}`

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

  // Check if referral code is valid (if provided) with RLS
  // Referral code is now the username (without @)
  let referrerId: string | null = null
    if (referralCode) {
      // First, try to find user by username (new system - username is referral code)
      const referrer = await asUser(user, async (db) => {
        return await db.user.findUnique({
          where: { username: referralCode },
          select: { id: true },
        })
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
        const referral = await asUser(user, async (db) => {
          return await db.referral.findUnique({
            where: { referralCode },
            include: { referrer: true },
          })
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

    // Check if user exists in database, create if not exists with RLS
    // For agents, use username as unique identifier; for users, use ID
    let dbUser: { id: string; username: string | null; walletAddress: string | null; onChainRegistered: boolean; nftTokenId: number | null } | null = null
    
    if (user.isAgent) {
      // Agents are identified by username (agentId)
      dbUser = await asUser(user, async (db) => {
        const existing = await db.user.findUnique({
          where: { username: user.userId },
          select: {
            id: true,
            username: true,
            walletAddress: true,
            onChainRegistered: true,
            nftTokenId: true,
          },
        })

        if (!existing) {
          // Create agent user
          return await db.user.create({
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
        return existing
      })
    } else {
      // Regular users identified by ID (Privy user ID)
      dbUser = await asUser(user, async (db) => {
        const existing = await db.user.findUnique({
          where: { id: user.userId },
          select: {
            id: true,
            username: true,
            walletAddress: true,
            onChainRegistered: true,
            nftTokenId: true,
          },
        })

        if (!existing) {
          // User doesn't exist yet - create them
          return await db.user.create({
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
          const fullUser = await db.user.findUnique({
            where: { id: existing.id },
          })
          
          return await db.user.update({
            where: { id: existing.id },
            data: {
              walletAddress: walletAddress!.toLowerCase(),
              username: finalUsername || existing.username,
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
      })
    }

    // Check database registration status FIRST (most reliable and fastest)
    let isRegistered = dbUser.onChainRegistered && dbUser.nftTokenId !== null
    let tokenId: number | null = dbUser.nftTokenId

    if (isRegistered) {
      logger.info('User already registered (database check)', { 
        userId: dbUser.id, 
        tokenId,
        onChainRegistered: dbUser.onChainRegistered 
      }, 'POST /api/auth/onboard')
    } else if (!user.isAgent && walletAddress) {
      // For regular users only: verify on-chain if database says not registered
      // This catches cases where registration happened outside our app
      const publicClient = createPublicClient({
        chain: sepolia,
        transport: http(process.env.NEXT_PUBLIC_RPC_URL || process.env.SEPOLIA_RPC_URL),
      })
      
      try {
        const onChainRegistered = await publicClient.readContract({
          address: IDENTITY_REGISTRY,
          abi: IDENTITY_REGISTRY_ABI,
          functionName: 'isRegistered',
          args: [walletAddress! as Address],
        })
        
        if (onChainRegistered) {
          // Registered on-chain but not in database - sync it
          tokenId = Number(await publicClient.readContract({
            address: IDENTITY_REGISTRY,
            abi: IDENTITY_REGISTRY_ABI,
            functionName: 'getTokenId',
            args: [walletAddress! as Address],
          }))
          isRegistered = true
          logger.info('Found existing on-chain registration, syncing to database', { 
            walletAddress, 
            tokenId 
          }, 'POST /api/auth/onboard')
        }
      } catch (error) {
        // RPC error - rely on database
        logger.warn('Failed to check on-chain registration, using database', { 
          error, 
          walletAddress 
        }, 'POST /api/auth/onboard')
      }
    }

    if (isRegistered && tokenId) {
      // Already registered - update database if needed with RLS
      if (!dbUser.onChainRegistered) {
        await asUser(user, async (db) => {
          return await db.user.update({
            where: { id: dbUser.id },
            data: {
              onChainRegistered: true,
              nftTokenId: tokenId,
            },
          })
        })
      }

      // Check if points were already awarded with RLS
      const hasWelcomeBonus = await asUser(user, async (db) => {
        return await db.balanceTransaction.findFirst({
          where: {
            userId: dbUser.id,
            description: 'Welcome bonus - initial signup',
          },
        })
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
      chain: sepolia,
      transport: http(process.env.NEXT_PUBLIC_RPC_URL || process.env.SEPOLIA_RPC_URL),
    })

    // Create public client for reading contract state
    const publicClient = createPublicClient({
      chain: sepolia,
      transport: http(process.env.NEXT_PUBLIC_RPC_URL || process.env.SEPOLIA_RPC_URL),
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
    let txHash: `0x${string}`
    try {
      txHash = await walletClient.writeContract({
        address: IDENTITY_REGISTRY,
        abi: IDENTITY_REGISTRY_ABI,
        functionName: 'registerAgent',
        args: [name, agentEndpoint, capabilitiesHash, metadataURI],
      })
      logger.info('Registration transaction sent:', txHash, 'POST /api/auth/onboard')
    } catch (error: unknown) {
      // Handle "Already registered" error gracefully
      const errorMessage = error instanceof Error ? error.message : String(error)
      if (errorMessage.includes('Already registered')) {
        logger.info('User already registered on-chain, fetching existing token ID', { address: registrationAddress }, 'POST /api/auth/onboard')
        
        // Get existing token ID
        const existingTokenId = await publicClient.readContract({
          address: IDENTITY_REGISTRY,
          abi: IDENTITY_REGISTRY_ABI,
          functionName: 'getTokenId',
          args: [registrationAddress],
        })
        tokenId = Number(existingTokenId)
        
        // Update database with existing registration
        await asUser(user, async (db) => {
          await db.user.update({
            where: { id: dbUser.id },
            data: {
              onChainRegistered: true,
              nftTokenId: tokenId,
            },
          })
        })
        
        // Check if welcome bonus was already awarded
        const hasWelcomeBonus = await asUser(user, async (db) => {
          return await db.balanceTransaction.findFirst({
            where: {
              userId: dbUser.id,
              description: 'Welcome bonus - initial signup',
            },
          })
        })
        
        return successResponse({
          message: 'Already registered on-chain',
          tokenId: Number(tokenId),
          walletAddress: !user.isAgent ? walletAddress : undefined,
          txHash: null,
          pointsAwarded: hasWelcomeBonus ? 1000 : 0,
        })
      }
      // Re-throw if it's a different error
      throw error
    }

    // Wait for transaction confirmation (wait for more confirmations to ensure state is synced)
    const receipt = await publicClient.waitForTransactionReceipt({
      hash: txHash,
      confirmations: 2, // Wait for 2 confirmations to ensure state is synced
    })

  if (receipt.status !== 'success') {
    throw new BusinessLogicError('Blockchain registration transaction failed', 'REGISTRATION_TX_FAILED', { txHash, receipt: receipt.status });
  }

    // Filter logs by contract address first to avoid decoding Transfer events
    const contractLogs = receipt.logs.filter(log => log.address.toLowerCase() === IDENTITY_REGISTRY.toLowerCase())
    
    const agentRegisteredLog = contractLogs.find(log => {
      try {
        const decodedLog = decodeEventLog({
          abi: IDENTITY_REGISTRY_ABI,
          data: log.data,
          topics: log.topics,
        })
        return decodedLog.eventName === 'AgentRegistered'
      } catch {
        return false
      }
    })

    if (!agentRegisteredLog) {
      throw new BusinessLogicError('AgentRegistered event not found in transaction receipt', 'EVENT_NOT_FOUND', { txHash, logs: receipt.logs.length });
    }

    const decodedLog = decodeEventLog({
      abi: IDENTITY_REGISTRY_ABI,
      data: agentRegisteredLog.data,
      topics: agentRegisteredLog.topics,
    })
    tokenId = Number(decodedLog.args.tokenId)

    logger.info('Registered with token ID:', tokenId, 'POST /api/auth/onboard')
    logger.info('Setting initial reputation to 70...', undefined, 'POST /api/auth/onboard')

    for (let i = 0; i < 10; i++) {
      await walletClient.writeContract({
        address: REPUTATION_SYSTEM,
        abi: REPUTATION_SYSTEM_ABI,
        functionName: 'recordBet',
        args: [BigInt(tokenId), parseEther('100')],
      })
    }

    for (let i = 0; i < 7; i++) {
      const winTxHash = await walletClient.writeContract({
        address: REPUTATION_SYSTEM,
        abi: REPUTATION_SYSTEM_ABI,
        functionName: 'recordWin',
        args: [BigInt(tokenId), parseEther('100')],
      })
      await publicClient.waitForTransactionReceipt({
        hash: winTxHash,
        confirmations: 1,
      })
    }

    logger.info('Initial reputation set to 70 (7 wins out of 10 bets)', undefined, 'POST /api/auth/onboard')

    // Update database with ERC-8004 registration with RLS
    await asUser(user, async (db) => {
      return await db.user.update({
        where: { id: dbUser.id },
        data: {
          onChainRegistered: true,
          nftTokenId: tokenId,
          registrationTxHash: txHash,
          registrationBlockNumber: Number(receipt.blockNumber),
          registrationGasUsed: Number(receipt.gasUsed),
          registrationTimestamp: new Date(),
          username: user.isAgent ? user.userId : (username || dbUser.username),
          displayName: username || dbUser.username || user.userId,
          bio: bio || (user.isAgent ? `Autonomous AI agent: ${user.userId}` : undefined),
          profileComplete: true, // Mark profile as complete after onboarding
          hasUsername: true,
          hasBio: bio ? true : false,
          hasProfileImage: profileImageUrl ? true : false,
        },
      })
    })

    // Register with Agent0 SDK if enabled
    if (process.env.AGENT0_ENABLED === 'true') {
      const userWalletAddress = walletAddress!.toLowerCase()

      logger.info('Registering user with Agent0 SDK...', { userId: dbUser.id }, 'UserOnboard')

      // Use Ethereum Sepolia RPC (where Agent0 contracts are deployed)
      const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL || process.env.SEPOLIA_RPC_URL || 'https://ethereum-sepolia-rpc.publicnode.com'

      // Configure IPFS - use Pinata if available, otherwise use public IPFS node
      const ipfsConfig = process.env.PINATA_JWT
        ? { ipfsProvider: 'pinata' as const, pinataJwt: process.env.PINATA_JWT }
        : { ipfsProvider: 'node' as const, ipfsNodeUrl: process.env.IPFS_NODE_URL || 'https://ipfs.io' }

      const agent0Client = new Agent0Client({
        network: (process.env.AGENT0_NETWORK as 'sepolia' | 'mainnet') || 'sepolia',
        rpcUrl,
        privateKey: DEPLOYER_PRIVATE_KEY,
        ...ipfsConfig
      })

      const agent0Result = await agent0Client.registerAgent({
        name: username || dbUser.username || user.userId,
        description: bio || 'Babylon player',
        walletAddress: userWalletAddress,
        capabilities: {
          strategies: [],
          markets: ['prediction', 'perpetuals', 'pools'],
          actions: [
            // Trading
            'trade',
            'buy_prediction',
            'sell_prediction',
            'open_perp_position',
            'close_perp_position',
            'get_positions',
            'get_balance',
            // Liquidity Pools
            'deposit_pool',
            'withdraw_pool',
            'get_pools',
            'get_pool_deposits',
            // Social
            'post',
            'reply',
            'like',
            'share',
            'comment',
            'follow',
            'unfollow',
            'chat',
            // Discovery
            'search_users',
            'get_profile',
            'query_feed',
            // Referrals
            'get_referral_code',
            'get_referrals'
          ],
          version: '1.0.0',
          platform: 'babylon', // Identify as Babylon user
          userType: 'player' // User type
        } as AgentCapabilities
      })

      const agent0MetadataCID = agent0Result.metadataCID

      // Store Agent0 registration info in database
      await asUser(user, async (db) => {
        await db.user.update({
          where: { id: dbUser.id },
          data: {
            agent0TokenId: agent0Result.tokenId,
            agent0MetadataCID: agent0MetadataCID,
            agent0RegisteredAt: new Date(),
          },
        })
      })

      logger.info(`✅ User registered with Agent0 SDK`, {
        userId: dbUser.id,
        tokenId: agent0Result.tokenId,
        metadataCID: agent0MetadataCID
      }, 'UserOnboard')
    } else {
      logger.info('Agent0 integration disabled, skipping user registration', { userId: dbUser.id }, 'UserOnboard')
    }

    // Award welcome bonus with RLS
    await asUser(user, async (db) => {
      const userWithBalance = await db.user.findUniqueOrThrow({
        where: { id: dbUser.id },
        select: { virtualBalance: true },
      })
      
      const balanceBefore = userWithBalance.virtualBalance
      const amountDecimal = new Prisma.Decimal(1000)
      const balanceAfter = balanceBefore.plus(amountDecimal)

      await db.balanceTransaction.create({
        data: {
          userId: dbUser.id,
          type: 'deposit',
          amount: amountDecimal,
          balanceBefore,
          balanceAfter,
          description: 'Welcome bonus - initial signup',
        },
      })

      await db.user.update({
        where: { id: dbUser.id },
        data: {
          virtualBalance: { increment: 1000 },
          totalDeposited: { increment: 1000 },
        },
      })
    })

    logger.info('Successfully awarded 1,000 points to user', undefined, 'POST /api/auth/onboard')

    await notifyNewAccount(dbUser.id)
    logger.info('Welcome notification sent to new user', { userId: dbUser.id }, 'POST /api/auth/onboard')

    if (referrerId && referralCode) {
      const referralResult = await PointsService.awardReferralSignup(referrerId, dbUser.id)

      // Update referral and follow with RLS
      await asUser(user, async (db) => {
        await db.referral.upsert({
          where: { referralCode },
          update: {
            status: 'completed',
            referredUserId: dbUser.id,
            completedAt: new Date(),
            pointsAwarded: true,
          },
          create: {
            referrerId,
            referralCode,
            referredUserId: dbUser.id,
            status: 'completed',
            completedAt: new Date(),
            pointsAwarded: true,
          },
        })

        await db.follow.upsert({
          where: {
            followerId_followingId: {
              followerId: referrerId,
              followingId: dbUser.id,
            },
          },
          update: {},
          create: {
            followerId: referrerId,
            followingId: dbUser.id,
          },
        })
      })

      logger.info(
        `Referrer ${referrerId} auto-followed new user ${dbUser.id}`,
        { referrerId, referredUserId: dbUser.id },
        'POST /api/auth/onboard'
      )

      logger.info(
        `Awarded ${referralResult.pointsAwarded} referral points to user ${referrerId}`,
        { referrerId, referredUserId: dbUser.id, points: referralResult.pointsAwarded },
        'POST /api/auth/onboard'
      )
    }

  logger.info('On-chain registration completed', {
    userId: user.userId,
    tokenId,
    isAgent: user.isAgent,
    pointsAwarded: 1000
  }, 'POST /api/auth/onboard');

  return successResponse({
    message: `Successfully registered ${user.isAgent ? 'agent' : 'user'} on-chain`,
    tokenId,
    walletAddress: user.isAgent ? undefined : walletAddress,
    agentId: user.isAgent ? user.userId : undefined,
    txHash,
    blockNumber: Number(receipt.blockNumber),
    gasUsed: Number(receipt.gasUsed),
    pointsAwarded: 1000,
  });
});

/**
 * GET /api/auth/onboard
 * Check registration status
 */
export const GET = withErrorHandling(async (request: NextRequest) => {
  const user = await authenticate(request)

  // Check database with RLS
  let dbUser: { walletAddress: string | null; onChainRegistered: boolean; nftTokenId: number | null; registrationTxHash: string | null } | null = null

  if (user.isAgent) {
      // Agents: find by username
      dbUser = await asUser(user, async (db) => {
        return await db.user.findFirst({
          where: { username: user.userId },
          select: {
            walletAddress: true,
            onChainRegistered: true,
            nftTokenId: true,
            registrationTxHash: true,
          },
        })
      })
    } else {
      // Regular users: find by ID
      dbUser = await asUser(user, async (db) => {
        return await db.user.findFirst({
          where: { id: user.userId },
          select: {
            walletAddress: true,
            onChainRegistered: true,
            nftTokenId: true,
            registrationTxHash: true,
          },
        })
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
        chain: sepolia,
        transport: http(process.env.NEXT_PUBLIC_RPC_URL || process.env.SEPOLIA_RPC_URL),
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
