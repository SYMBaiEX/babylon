#!/usr/bin/env bun
/**
 * Wait for Hardhat Node and Deploy Contracts
 * 
 * This script:
 * 1. Waits for Hardhat node to be ready
 * 2. Deploys contracts once Hardhat is ready
 * 3. Funds the deployer wallet for backend-signed transactions
 * 4. Keeps running to monitor Hardhat (used during dev startup)
 */

import { $ } from 'bun'
import { loadDeployment } from '@babylon/contracts'

const HARDHAT_RPC_URL = 'http://localhost:8545'

// Deployer wallet used for backend-signed transactions (from .env BABYLON_GAME_WALLET_ADDRESS)
const DEPLOYER_WALLET = '0x748D2E8439c81bFD56756B5d4983EE4565b1E62C'

// Hardhat default account #0 address (has 10000 ETH)
const HARDHAT_ACCOUNT_0 = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'

// Amount to fund (100 ETH in wei)
const FUNDING_AMOUNT = '0x56bc75e2d63100000' // 100 ETH

/**
 * Check if a contract is deployed at the given address using direct JSON-RPC
 * This is more reliable than using cast which can have issues with hardhat
 */
async function isContractDeployed(address: string): Promise<boolean> {
  const response = await fetch(HARDHAT_RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'eth_getCode',
      params: [address, 'latest'],
      id: 1,
    }),
  }).catch(() => null)

  if (!response) return false

  const data = await response.json().catch(() => null) as { result?: string } | null
  const code = data?.result ?? '0x'
  
  // Contract is deployed if code is not empty
  return code !== '0x' && code !== '0x0' && code.length > 2
}

/**
 * Get the balance of an address
 */
async function getBalance(address: string): Promise<bigint> {
  const response = await fetch(HARDHAT_RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'eth_getBalance',
      params: [address, 'latest'],
      id: 1,
    }),
  }).catch(() => null)

  if (!response) return 0n

  const data = await response.json().catch(() => null) as { result?: string } | null
  return BigInt(data?.result ?? '0x0')
}

/**
 * Fund the deployer wallet from Hardhat account #0
 * This is needed for backend-signed transactions on localnet
 */
async function fundDeployerWallet(): Promise<void> {
  // Check if deployer already has enough ETH (at least 10 ETH)
  const balance = await getBalance(DEPLOYER_WALLET)
  const minBalance = BigInt('10000000000000000000') // 10 ETH
  
  if (balance >= minBalance) {
    console.info(`✅ Deployer wallet already funded (${(Number(balance) / 1e18).toFixed(2)} ETH)`)
    return
  }

  console.info('💰 Funding deployer wallet...')
  
  // Use hardhat_impersonateAccount and eth_sendTransaction for simplicity
  // First impersonate the Hardhat account #0
  await fetch(HARDHAT_RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'hardhat_impersonateAccount',
      params: [HARDHAT_ACCOUNT_0],
      id: 1,
    }),
  })

  // Send the transaction
  const txResponse = await fetch(HARDHAT_RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'eth_sendTransaction',
      params: [{
        from: HARDHAT_ACCOUNT_0,
        to: DEPLOYER_WALLET,
        value: FUNDING_AMOUNT,
        gas: '0x5208', // 21000
      }],
      id: 1,
    }),
  })

  const txData = await txResponse.json() as { result?: string; error?: { message: string } }
  
  if (txData.error) {
    console.error('❌ Failed to fund deployer wallet:', txData.error.message)
    return
  }

  // Stop impersonating
  await fetch(HARDHAT_RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'hardhat_stopImpersonatingAccount',
      params: [HARDHAT_ACCOUNT_0],
      id: 1,
    }),
  })

  console.info(`✅ Deployer wallet funded with 100 ETH (tx: ${txData.result?.slice(0, 10)}...)`)
}

/**
 * Wait for Hardhat node to be ready
 */
async function waitForHardhat(): Promise<boolean> {
  console.info('Waiting for Hardhat node to be ready...', undefined, 'Script')
  
  for (let attempts = 0; attempts < 30; attempts++) {
    const response = await fetch(HARDHAT_RPC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'eth_blockNumber',
        params: [],
        id: 1,
      }),
    }).catch(() => null)

    if (response?.ok) {
      console.info('✅ Hardhat node is ready', undefined, 'Script')
      return true
    }

    if (attempts === 0) {
      console.info('Waiting for Hardhat node to start...', undefined, 'Script')
    }
    await new Promise(resolve => setTimeout(resolve, 1000))
  }

  return false
}

async function main() {
  // Wait for Hardhat to be ready
  const hardhatReady = await waitForHardhat()
  if (!hardhatReady) {
    console.error('❌ Hardhat node failed to start within 30 seconds', undefined, 'Script')
    process.exit(1)
  }
  
  // Check if contracts are already deployed on-chain
  const deployment = await loadDeployment('localnet')
  if (deployment?.contracts.diamond) {
    const deployed = await isContractDeployed(deployment.contracts.diamond)
    if (deployed) {
      console.info('✅ Contracts already deployed', undefined, 'Script')
      // Fund deployer wallet (may have been reset if Hardhat restarted)
      await fundDeployerWallet()
      console.info('Contract deployment monitor running...', undefined, 'Script')
      // Keep the process running to maintain concurrently
      await new Promise(() => {}) // Never resolves
      return
    }
    console.info('Contracts not found on-chain, deploying...', undefined, 'Script')
  }
  
  // Deploy contracts
  console.info('Deploying contracts to Hardhat...', undefined, 'Script')
  await $`bun run deploy:local`
  console.info('✅ Contracts deployed successfully', undefined, 'Script')
  
  // Fund deployer wallet for backend-signed transactions
  await fundDeployerWallet()
  
  console.info('Contract deployment monitor running...', undefined, 'Script')
  
  // Keep the process running to maintain concurrently
  await new Promise(() => {}) // Never resolves
}

main().catch((error) => {
  console.error('Failed to deploy contracts', error, 'Script')
  process.exit(1)
})