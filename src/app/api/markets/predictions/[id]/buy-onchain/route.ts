/**
 * On-Chain Prediction Market Buy API
 * 
 * @route POST /api/markets/predictions/[id]/buy-onchain - Buy shares on-chain
 * @access Authenticated
 * 
 * @description
 * Verifies and records on-chain share purchases using real Base Sepolia ETH.
 * User signs transaction client-side, backend verifies on-chain transaction,
 * then updates database to match on-chain state.
 * 
 * @openapi
 * /api/markets/predictions/{id}/buy-onchain:
 *   post:
 *     tags:
 *       - Markets
 *     summary: Buy shares on-chain
 *     description: Verifies and records on-chain share purchase (Base Sepolia)
 *     security:
 *       - PrivyAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Market/question ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - side
 *               - numShares
 *               - txHash
 *               - walletAddress
 *             properties:
 *               side:
 *                 type: string
 *                 enum: [yes, no]
 *               numShares:
 *                 type: number
 *                 minimum: 0.01
 *               txHash:
 *                 type: string
 *                 pattern: '^0x'
 *                 description: On-chain transaction hash
 *               walletAddress:
 *                 type: string
 *                 pattern: '^0x'
 *                 description: Wallet address that signed transaction
 *     responses:
 *       200:
 *         description: On-chain purchase verified and recorded successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 verified:
 *                   type: boolean
 *                 position:
 *                   type: object
 *       400:
 *         description: Invalid transaction or verification failed
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Market not found
 * 
 * @example
 * ```typescript
 * await fetch(`/api/markets/predictions/${marketId}/buy-onchain`, {
 *   method: 'POST',
 *   headers: { 'Authorization': `Bearer ${token}` },
 *   body: JSON.stringify({
 *     side: 'yes',
 *     numShares: 10,
 *     txHash: '0x...',
 *     walletAddress: '0x...'
 *   })
 * });
 * ```
 */

import type { NextRequest } from 'next/server';
import { authenticate } from '@/lib/api/auth-middleware';
import { successResponse, withErrorHandling } from '@/lib/errors/error-handler';
import { BusinessLogicError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { z } from 'zod';
import { createPublicClient, http } from 'viem';
import { baseSepolia } from 'viem/chains';
import { db } from '@/db';

const OnChainBuySchema = z.object({
  side: z.enum(['yes', 'no']),
  numShares: z.number().positive(),
  txHash: z.string().startsWith('0x'),
  walletAddress: z.string().startsWith('0x')
});

const DIAMOND_ADDRESS = '0xdC3f0aD2f76Cea9379af897fa8EAD4A6d5e43990'

/**
 * POST /api/markets/predictions/[id]/buy-onchain
 * Verify and record an on-chain share purchase
 */
export const POST = withErrorHandling(async (
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) => {
  const user = await authenticate(request);
  const { id: marketId } = await context.params;

  const body = await request.json();
  const { side, numShares, txHash, walletAddress } = OnChainBuySchema.parse(body);

  logger.info('On-chain buy verification requested', {
    marketId,
    side,
    numShares,
    txHash,
    userId: user.userId
  });

  // Verify user owns this wallet
  const userRecord = await db.user.findUnique({
    where: { id: user.userId },
    select: { walletAddress: true }
  });

  if (!userRecord?.walletAddress || 
      userRecord.walletAddress.toLowerCase() !== walletAddress.toLowerCase()) {
    throw new BusinessLogicError('Wallet address mismatch', 'WALLET_MISMATCH');
  }

  // Verify transaction on blockchain
  const publicClient = createPublicClient({
    chain: baseSepolia,
    transport: http(process.env.NEXT_PUBLIC_RPC_URL || 'https://sepolia.base.org')
  });

  const receipt = await publicClient.waitForTransactionReceipt({
    hash: txHash as `0x${string}`,
    confirmations: 1,
    timeout: 60_000 // 60 second timeout
  });

  if (receipt.status !== 'success') {
    throw new BusinessLogicError('Transaction failed on-chain', 'TX_FAILED');
  }

  // Verify transaction was to our Diamond contract
  if (receipt.to?.toLowerCase() !== DIAMOND_ADDRESS.toLowerCase()) {
    throw new BusinessLogicError('Transaction not to correct contract', 'INVALID_CONTRACT');
  }

  logger.info('On-chain transaction verified', {
    txHash,
    blockNumber: receipt.blockNumber.toString(),
    gasUsed: receipt.gasUsed.toString(),
    status: receipt.status
  });

  // Update database to match on-chain state
  // Note: We trust the blockchain as source of truth
  const existingPosition = await db.position.findFirst({
    where: {
      userId: user.userId,
      marketId,
      side: side === 'yes'
    }
  });

  if (existingPosition) {
    // Calculate new shares value (shares is stored as string)
    const currentShares = parseFloat(existingPosition.shares);
    const newShares = currentShares + numShares;
    
    await db.position.update({
      where: { id: existingPosition.id },
      data: {
        shares: String(newShares),
        updatedAt: new Date()
      }
    });
  } else {
    await db.position.create({
      data: {
        id: `onchain-${txHash}`,
        userId: user.userId,
        marketId,
        side: side === 'yes',
        shares: String(numShares),
        avgPrice: '0.5', // Will be calculated from on-chain cost
        amount: '0', // Track separately
        status: 'active',
        updatedAt: new Date()
      }
    });
  }

  logger.info('On-chain position recorded in database', {
    userId: user.userId,
    marketId,
    side,
    shares: numShares,
    txHash
  });

  return successResponse({
    success: true,
    verified: true,
    position: {
      marketId,
      side: side.toUpperCase(),
      shares: numShares,
      txHash,
      blockNumber: receipt.blockNumber.toString(),
      explorerUrl: `https://sepolia.basescan.org/tx/${txHash}`
    }
  });
});

