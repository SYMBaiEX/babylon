#!/usr/bin/env bun
/**
 * Add PriceStorageFacet to existing Diamond
 * 
 * This script adds the PriceStorageFacet to an already-deployed Diamond contract.
 * Useful for upgrading existing deployments.
 */

import { $ } from 'bun'
import { createPublicClient, createWalletClient, http, type Address } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { baseSepolia } from 'viem/chains'
import { logger } from '../src/lib/logger'

const DIAMOND_CUT_ABI = [
  {
    type: 'function',
    name: 'diamondCut',
    inputs: [
      {
        name: '_diamondCut',
        type: 'tuple[]',
        components: [
          { name: 'facetAddress', type: 'address' },
          { name: 'action', type: 'uint8' },
          { name: 'functionSelectors', type: 'bytes4[]' },
        ],
      },
      { name: '_init', type: 'address' },
      { name: '_calldata', type: 'bytes' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
] as const

const FACET_CUT_ACTION = {
  Add: 0,
  Replace: 1,
  Remove: 2,
} as const

async function main() {
  const diamondAddress = process.env.NEXT_PUBLIC_DIAMOND_ADDRESS as Address
  const deployerPrivateKey = process.env.DEPLOYER_PRIVATE_KEY as `0x${string}`
  const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL || 'http://localhost:8545'

  if (!diamondAddress) {
    logger.error('NEXT_PUBLIC_DIAMOND_ADDRESS not set', undefined, 'Script')
    process.exit(1)
  }

  if (!deployerPrivateKey) {
    logger.error('DEPLOYER_PRIVATE_KEY not set', undefined, 'Script')
    process.exit(1)
  }

  logger.info('Adding PriceStorageFacet to Diamond...', undefined, 'Script')
  logger.info(`Diamond: ${diamondAddress}`, undefined, 'Script')

  // 1. Compile contracts
  logger.info('Compiling contracts...', undefined, 'Script')
  try {
    await $`forge build`.quiet()
    logger.info('✅ Contracts compiled', undefined, 'Script')
  } catch (error) {
    logger.error('❌ Compilation failed', error, 'Script')
    process.exit(1)
  }

  // 2. Deploy PriceStorageFacet
  logger.info('Deploying PriceStorageFacet...', undefined, 'Script')
  let facetAddress: string
  try {
    const output = await $`forge create contracts/core/PriceStorageFacet.sol:PriceStorageFacet \
      --rpc-url ${rpcUrl} \
      --private-key ${deployerPrivateKey} \
      --legacy`.text()
    
    const match = output.match(/Deployed to:\s*(0x[a-fA-F0-9]{40})/)
    if (!match) {
      throw new Error('Failed to parse facet address from output')
    }
    facetAddress = match[1]
    logger.info(`✅ PriceStorageFacet deployed: ${facetAddress}`, undefined, 'Script')
  } catch (error) {
    logger.error('❌ Deployment failed', error, 'Script')
    process.exit(1)
  }

  // 3. Get function selectors
  logger.info('Getting function selectors...', undefined, 'Script')
  const selectors = [
    '0x3a4b66f1', // updatePrices
    '0x5c60da1b', // updatePrice
    '0x8f283970', // submitPriceBatch
    '0x893d20e8', // getLatestPrice
    '0x4e71d92d', // getPriceAtTick
    '0x8da5cb5b', // getGlobalTickCounter
    '0x3f4ba83a', // incrementTickCounter
    '0x8456cb59', // setAuthorizedUpdater
    '0x5c60da1b', // getAuthorizedUpdater
  ]

  // Get actual selectors from contract
  try {
    const selectorOutput = await $`cast sig-event "updatePrices(bytes32[],uint256,uint256[])"`.text()
    logger.info('Using function selectors from contract', undefined, 'Script')
  } catch (error) {
    logger.warn('Could not get selectors, using hardcoded values', undefined, 'Script')
  }

  // 4. Add facet to Diamond
  logger.info('Adding facet to Diamond...', undefined, 'Script')
  try {
    const publicClient = createPublicClient({
      chain: rpcUrl.includes('localhost') ? { id: 31337, name: 'Local', nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 }, rpcUrls: { default: { http: [rpcUrl] } } } : baseSepolia,
      transport: http(rpcUrl),
    })

    const account = privateKeyToAccount(deployerPrivateKey)
    const walletClient = createWalletClient({
      account,
      chain: rpcUrl.includes('localhost') ? { id: 31337, name: 'Local', nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 }, rpcUrls: { default: { http: [rpcUrl] } } } : baseSepolia,
      transport: http(rpcUrl),
    })

    // Get actual selectors using cast
    const functionNames = [
      'updatePrices(bytes32[],uint256,uint256[])',
      'updatePrice(bytes32,uint256,uint256)',
      'submitPriceBatch(bytes32,uint256,uint256,bytes32)',
      'getLatestPrice(bytes32)',
      'getPriceAtTick(bytes32,uint256)',
      'getGlobalTickCounter()',
      'incrementTickCounter()',
      'setAuthorizedUpdater(bytes32,address)',
      'getAuthorizedUpdater(bytes32)',
    ]

    const actualSelectors: `0x${string}`[] = []
    for (const funcName of functionNames) {
      try {
        const sig = await $`cast sig ${funcName}`.text()
        actualSelectors.push(sig.trim() as `0x${string}`)
      } catch (error) {
        logger.warn(`Failed to get selector for ${funcName}`, undefined, 'Script')
      }
    }

    const diamondCut = [
      {
        facetAddress: facetAddress as Address,
        action: FACET_CUT_ACTION.Add,
        functionSelectors: actualSelectors,
      },
    ]

    const txHash = await walletClient.writeContract({
      address: diamondAddress,
      abi: DIAMOND_CUT_ABI,
      functionName: 'diamondCut',
      args: [diamondCut, '0x0000000000000000000000000000000000000000' as Address, '0x' as `0x${string}`],
    })

    logger.info(`✅ DiamondCut transaction sent: ${txHash}`, undefined, 'Script')

    // Wait for confirmation
    const receipt = await publicClient.waitForTransactionReceipt({
      hash: txHash,
      confirmations: 1,
    })

    if (receipt.status === 'success') {
      logger.info('✅ PriceStorageFacet successfully added to Diamond!', undefined, 'Script')
      
      // Set authorized updater
      logger.info('Setting authorized updater...', undefined, 'Script')
      const PRICE_STORAGE_ABI = [
        {
          type: 'function',
          name: 'setAuthorizedUpdater',
          inputs: [
            { name: '_marketId', type: 'bytes32' },
            { name: '_updater', type: 'address' },
          ],
          outputs: [],
          stateMutability: 'nonpayable',
        },
      ] as const

      const setUpdaterTx = await walletClient.writeContract({
        address: diamondAddress,
        abi: PRICE_STORAGE_ABI,
        functionName: 'setAuthorizedUpdater',
        args: ['0x0000000000000000000000000000000000000000000000000000000000000000' as `0x${string}`, account.address],
      })

      await publicClient.waitForTransactionReceipt({
        hash: setUpdaterTx,
        confirmations: 1,
      })

      logger.info(`✅ Authorized updater set to: ${account.address}`, undefined, 'Script')
    } else {
      logger.error('❌ DiamondCut transaction failed', undefined, 'Script')
      process.exit(1)
    }
  } catch (error) {
    logger.error('❌ Failed to add facet', error, 'Script')
    process.exit(1)
  }

  logger.info('✅ PriceStorageFacet addition complete!', undefined, 'Script')
}

main().catch((error) => {
  logger.error('Script failed:', error, 'Script')
  process.exit(1)
})

