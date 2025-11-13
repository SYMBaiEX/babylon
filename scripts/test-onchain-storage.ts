#!/usr/bin/env bun
/**
 * Test On-Chain Storage Implementation
 * 
 * Tests the price storage and question resolution on-chain functionality
 */

import { createPublicClient, createWalletClient, http, type Address } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { baseSepolia } from 'viem/chains'
import { keccak256, encodePacked } from 'viem'
import { logger } from '../src/lib/logger'
import { PRICE_STORAGE_FACET_ABI, PREDICTION_MARKET_ABI } from '../src/lib/web3/abis'
import { prisma } from '../src/lib/prisma'

const ANVIL_RPC_URL = 'http://localhost:8545'
const ANVIL_PRIVATE_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'

async function main() {
  logger.info('Testing On-Chain Storage Implementation', undefined, 'Test')

  const diamondAddress = process.env.NEXT_PUBLIC_DIAMOND_ADDRESS as Address
  const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL || ANVIL_RPC_URL
  const deployerPrivateKey = (process.env.DEPLOYER_PRIVATE_KEY || ANVIL_PRIVATE_KEY) as `0x${string}`

  if (!diamondAddress) {
    logger.error('NEXT_PUBLIC_DIAMOND_ADDRESS not set', undefined, 'Test')
    process.exit(1)
  }

  const publicClient = createPublicClient({
    chain: rpcUrl.includes('localhost') 
      ? { id: 31337, name: 'Local', nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 }, rpcUrls: { default: { http: [rpcUrl] } } }
      : baseSepolia,
    transport: http(rpcUrl),
  })

  const account = privateKeyToAccount(deployerPrivateKey)
  const walletClient = createWalletClient({
    account,
    chain: rpcUrl.includes('localhost')
      ? { id: 31337, name: 'Local', nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 }, rpcUrls: { default: { http: [rpcUrl] } } }
      : baseSepolia,
    transport: http(rpcUrl),
  })

  logger.info(`Using Diamond: ${diamondAddress}`, undefined, 'Test')
  logger.info(`Using RPC: ${rpcUrl}`, undefined, 'Test')

  // Test 1: Check PriceStorageFacet is available
  logger.info('\n=== Test 1: Check PriceStorageFacet ===', undefined, 'Test')
  try {
    // Use cast to verify function exists first
    const { $ } = await import('bun')
    const result = await $`cast call ${diamondAddress} "getGlobalTickCounter()" --rpc-url ${rpcUrl}`.quiet()
    const tickCounter = BigInt(result.stdout.toString().trim())
    logger.info(`✅ PriceStorageFacet accessible. Current tick: ${tickCounter}`, undefined, 'Test')
  } catch (error) {
    logger.error('❌ PriceStorageFacet not accessible. Make sure it\'s added to Diamond.', error, 'Test')
    logger.info('Run: bun run scripts/add-price-storage-facet.ts', undefined, 'Test')
    // Don't exit - continue with other tests
  }

  // Test 2: Update prices on-chain
  logger.info('\n=== Test 2: Update Prices On-Chain ===', undefined, 'Test')
  try {
    // Get a test organization
    const org = await prisma.organization.findFirst({
      where: { type: 'company' },
      select: { id: true, currentPrice: true },
    })

    if (!org) {
      logger.warn('No organizations found, skipping price update test', undefined, 'Test')
    } else {
      // Derive market ID
      const ticker = org.id.toUpperCase().replace(/-/g, '') + 'PERP'
      const marketId = keccak256(encodePacked(['string'], [ticker])) as `0x${string}`
      
      // Get current tick using cast
      const { $ } = await import('bun')
      const tickResult = await $`cast call ${diamondAddress} "getGlobalTickCounter()" --rpc-url ${rpcUrl}`.quiet()
      const currentTick = BigInt(tickResult.stdout.toString().trim())

      // Convert price to Chainlink format (8 decimals)
      const priceInChainlink = BigInt(Math.round((org.currentPrice || 100) * 1e8))

      logger.info(`Updating price for ${org.id}`, undefined, 'Test')
      logger.info(`Market ID: ${marketId}`, undefined, 'Test')
      logger.info(`Price: ${org.currentPrice} -> ${priceInChainlink.toString()} (8 decimals)`, undefined, 'Test')
      logger.info(`Tick: ${currentTick.toString()}`, undefined, 'Test')

      const txHash = await walletClient.writeContract({
        address: diamondAddress,
        abi: PRICE_STORAGE_FACET_ABI,
        functionName: 'updatePrices',
        args: [[marketId], currentTick, [priceInChainlink]],
      })

      logger.info(`✅ Price update transaction sent: ${txHash}`, undefined, 'Test')

      const receipt = await publicClient.waitForTransactionReceipt({
        hash: txHash,
        confirmations: 1,
      })

      if (receipt.status === 'success') {
        logger.info('✅ Price successfully updated on-chain!', undefined, 'Test')

        // Verify price was stored using cast
        const priceResult = await $`cast call ${diamondAddress} "getLatestPrice(bytes32)" ${marketId} --rpc-url ${rpcUrl}`.quiet()
        const priceParts = priceResult.stdout.toString().trim().split('\n')
        if (priceParts.length >= 3) {
          const storedPrice = BigInt(priceParts[0].trim())
          const timestamp = BigInt(priceParts[1].trim())
          const tick = BigInt(priceParts[2].trim())
          logger.info(`✅ Verified: Price on-chain = ${storedPrice.toString()} (${Number(storedPrice) / 1e8})`, undefined, 'Test')
          logger.info(`   Timestamp: ${new Date(Number(timestamp) * 1000).toISOString()}`, undefined, 'Test')
          logger.info(`   Tick: ${tick.toString()}`, undefined, 'Test')
        }
      } else {
        logger.error('❌ Price update transaction failed', undefined, 'Test')
      }
    }
  } catch (error) {
    logger.error('❌ Price update test failed', error, 'Test')
  }

  // Test 3: Check question resolution
  logger.info('\n=== Test 3: Check Question Resolution ===', undefined, 'Test')
  try {
    const resolvedQuestion = await prisma.question.findFirst({
      where: { status: 'resolved' },
      include: { Market: true },
    })

    if (!resolvedQuestion) {
      logger.info('No resolved questions found', undefined, 'Test')
    } else {
      logger.info(`Found resolved question: ${resolvedQuestion.questionNumber}`, undefined, 'Test')
      logger.info(`  Text: ${resolvedQuestion.text}`, undefined, 'Test')
      logger.info(`  Outcome: ${resolvedQuestion.outcome}`, undefined, 'Test')
      
      if (resolvedQuestion.Market?.onChainMarketId) {
        logger.info(`  On-chain Market ID: ${resolvedQuestion.Market.onChainMarketId}`, undefined, 'Test')
        logger.info(`  On-chain Resolved: ${resolvedQuestion.Market.onChainResolved}`, undefined, 'Test')
        
        if (resolvedQuestion.Market.onChainResolved) {
          logger.info(`  ✅ Question is resolved on-chain!`, undefined, 'Test')
        } else {
          logger.warn(`  ⚠️ Question not resolved on-chain yet`, undefined, 'Test')
        }
      } else {
        logger.warn(`  ⚠️ Market has no onChainMarketId`, undefined, 'Test')
      }
    }
  } catch (error) {
    logger.error('❌ Question resolution check failed', error, 'Test')
  }

  logger.info('\n=== Test Complete ===', undefined, 'Test')
}

main().catch((error) => {
  logger.error('Test script failed:', error, 'Test')
  process.exit(1)
})

