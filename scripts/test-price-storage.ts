#!/usr/bin/env bun
/**
 * Simple test for price storage on-chain
 */

import { $ } from 'bun'
import { logger } from '../src/lib/logger'
import { prisma } from '../src/lib/prisma'
import { keccak256, encodePacked } from 'viem'

const DIAMOND = process.env.NEXT_PUBLIC_DIAMOND_ADDRESS || '0xdc64a140aa3e981100a9beca4e685f962f0cf6c9'
const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || 'http://localhost:8545'
const PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY || '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'

async function main() {
  logger.info('Testing Price Storage On-Chain', undefined, 'Test')
  logger.info(`Diamond: ${DIAMOND}`, undefined, 'Test')

  // Get current tick
  const tickResult = await $`cast call ${DIAMOND} "getGlobalTickCounter()" --rpc-url ${RPC_URL}`.quiet()
  const currentTick = tickResult.stdout.toString().trim()
  logger.info(`Current tick: ${currentTick}`, undefined, 'Test')

  // Get test organization
  const org = await prisma.organization.findFirst({
    where: { type: 'company' },
    select: { id: true, currentPrice: true },
  })

  if (!org) {
    logger.error('No organizations found', undefined, 'Test')
    process.exit(1)
  }

  logger.info(`Testing with organization: ${org.id}`, undefined, 'Test')
  logger.info(`Current price: ${org.currentPrice}`, undefined, 'Test')

  // Derive market ID
  const ticker = org.id.toUpperCase().replace(/-/g, '') + 'PERP'
  const marketId = keccak256(encodePacked(['string'], [ticker]))
  logger.info(`Market ID: ${marketId}`, undefined, 'Test')

  // Convert price to Chainlink format (8 decimals)
  const priceInChainlink = Math.round((org.currentPrice || 100) * 1e8)
  logger.info(`Price (8 decimals): ${priceInChainlink}`, undefined, 'Test')

  // Update price on-chain
  logger.info('\nUpdating price on-chain...', undefined, 'Test')
  try {
    const txResult = await $`cast send ${DIAMOND} "updatePrices(bytes32[],uint256,uint256[])" "[${marketId}]" "${currentTick}" "[${priceInChainlink}]" --rpc-url ${RPC_URL} --private-key ${PRIVATE_KEY} --legacy`.quiet()
    logger.info('✅ Price update transaction sent', undefined, 'Test')
    
    // Extract tx hash
    const txHashMatch = txResult.stdout.toString().match(/transactionHash\s+(0x[a-fA-F0-9]{64})/)
    if (txHashMatch) {
      logger.info(`Transaction hash: ${txHashMatch[1]}`, undefined, 'Test')
    }

    // Wait a bit for block to be mined
    await Bun.sleep(2000)

    // Verify price
    logger.info('\nVerifying price on-chain...', undefined, 'Test')
    const verifyResult = await $`cast call ${DIAMOND} "getLatestPrice(bytes32)" ${marketId} --rpc-url ${RPC_URL}`.quiet()
    const priceData = verifyResult.stdout.toString().trim().split('\n')
    
    if (priceData.length >= 3) {
      const storedPrice = BigInt(priceData[0].trim())
      const timestamp = BigInt(priceData[1].trim())
      const tick = BigInt(priceData[2].trim())
      
      logger.info(`✅ Price verified on-chain:`, undefined, 'Test')
      logger.info(`   Price: ${Number(storedPrice) / 1e8}`, undefined, 'Test')
      logger.info(`   Timestamp: ${new Date(Number(timestamp) * 1000).toISOString()}`, undefined, 'Test')
      logger.info(`   Tick: ${tick.toString()}`, undefined, 'Test')
    } else {
      logger.warn('Could not parse price data', undefined, 'Test')
    }
  } catch (error) {
    logger.error('Failed to update price', error, 'Test')
    process.exit(1)
  }

  logger.info('\n✅ Test complete!', undefined, 'Test')
}

main().catch((error) => {
  logger.error('Test failed:', error, 'Test')
  process.exit(1)
})

