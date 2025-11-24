#!/usr/bin/env bun
/**
 * Wait for Hardhat Node and Deploy Contracts
 * 
 * This script:
 * 1. Waits for Hardhat node to be ready
 * 2. Deploys contracts once Hardhat is ready
 * 3. Keeps running to monitor Hardhat (used during dev startup)
 */

import { $ } from 'bun'
import { logger } from '../src/lib/logger'
import { loadDeployment } from '../src/lib/deployment/validation'

const HARDHAT_RPC_URL = 'http://localhost:8545'

async function main() {
  logger.info('Waiting for Hardhat node to be ready...', undefined, 'Script')
  
  // Wait up to 30 seconds for Hardhat to start
  let attempts = 0
  while (attempts < 30) {
    try {
      await $`cast block-number --rpc-url ${HARDHAT_RPC_URL}`.quiet()
      logger.info('✅ Hardhat node is ready', undefined, 'Script')
      break
    } catch {
      if (attempts === 0) {
        logger.info('Waiting for Hardhat node to start...', undefined, 'Script')
      }
      await new Promise(resolve => setTimeout(resolve, 1000))
      attempts++
    }
  }
  
  if (attempts === 30) {
    logger.error('❌ Hardhat node failed to start within 30 seconds', undefined, 'Script')
    process.exit(1)
  }
  
  // Check if contracts are already deployed
  const deployment = await loadDeployment('localnet')
  if (deployment?.contracts.diamond) {
    // Verify contract is still deployed
    const code = await $`cast code ${deployment.contracts.diamond} --rpc-url ${HARDHAT_RPC_URL}`.quiet().text().catch(() => '0x')
    if (code.trim() !== '0x' && code.trim() !== '0x0') {
      logger.info('✅ Contracts already deployed', undefined, 'Script')
      logger.info('Contract deployment monitor running...', undefined, 'Script')
      // Keep the process running to maintain concurrently
      await new Promise(() => {}) // Never resolves
      return
    }
  }
  
  // Deploy contracts
  logger.info('Deploying contracts to Hardhat...', undefined, 'Script')
  await $`bun run deploy:local`
  logger.info('✅ Contracts deployed successfully', undefined, 'Script')
  logger.info('Contract deployment monitor running...', undefined, 'Script')
  
  // Keep the process running to maintain concurrently
  await new Promise(() => {}) // Never resolves
}

main().catch((error) => {
  logger.error('Failed to deploy contracts', error, 'Script')
  process.exit(1)
})


