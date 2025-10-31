#!/usr/bin/env bun
/**
 * Smart Contract Deployment Script
 * Deploys ERC-8004 registries and prediction market contracts to Base
 */

import { execSync } from 'child_process'
import { writeFileSync, readFileSync } from 'fs'
import { join } from 'path'

interface DeploymentConfig {
  network: 'base-sepolia' | 'base'
  rpcUrl: string
  privateKey?: string
  etherscanApiKey?: string
}

interface DeploymentResult {
  network: string
  chainId: number
  contracts: {
    identityRegistry: string
    reputationSystem: string
    diamond: string
    predictionMarketFacet: string
    oracleFacet: string
    diamondCutFacet: string
    diamondLoupeFacet: string
  }
  deployer: string
  timestamp: string
  blockNumber: number
}

class ContractDeployer {
  private config: DeploymentConfig

  constructor(config: DeploymentConfig) {
    this.config = config
  }

  /**
   * Deploy all contracts
   */
  async deploy(): Promise<DeploymentResult> {
    console.log('\n🚀 Starting contract deployment to', this.config.network)
    console.log('=' .repeat(60))

    // 1. Compile contracts
    console.log('\n📦 Compiling contracts...')
    this.compile()

    // 2. Deploy Identity Registry
    console.log('\n1️⃣  Deploying ERC-8004 Identity Registry...')
    const identityRegistry = await this.deployContract('IdentityRegistry')
    console.log('✅ Identity Registry:', identityRegistry)

    // 3. Deploy Reputation System
    console.log('\n2️⃣  Deploying ERC-8004 Reputation System...')
    const reputationSystem = await this.deployContract(
      'ReputationSystem',
      [identityRegistry]
    )
    console.log('✅ Reputation System:', reputationSystem)

    // 4. Deploy Diamond Facets
    console.log('\n3️⃣  Deploying Diamond Facets...')
    const diamondCutFacet = await this.deployContract('DiamondCutFacet')
    const diamondLoupeFacet = await this.deployContract('DiamondLoupeFacet')
    const predictionMarketFacet = await this.deployContract('PredictionMarketFacet')
    const oracleFacet = await this.deployContract('OracleFacet')

    console.log('✅ DiamondCutFacet:', diamondCutFacet)
    console.log('✅ DiamondLoupeFacet:', diamondLoupeFacet)
    console.log('✅ PredictionMarketFacet:', predictionMarketFacet)
    console.log('✅ OracleFacet:', oracleFacet)

    // 5. Deploy Diamond with initial facets
    console.log('\n4️⃣  Deploying Diamond Proxy...')
    const diamond = await this.deployDiamond(
      diamondCutFacet,
      diamondLoupeFacet,
      predictionMarketFacet,
      oracleFacet
    )
    console.log('✅ Diamond Proxy:', diamond)

    // 6. Verify contracts (if on testnet/mainnet)
    if (this.config.etherscanApiKey) {
      console.log('\n5️⃣  Verifying contracts on block explorer...')
      await this.verifyContracts({
        identityRegistry,
        reputationSystem,
        diamond,
        predictionMarketFacet,
        oracleFacet,
        diamondCutFacet,
        diamondLoupeFacet
      })
    }

    // 7. Save deployment info
    const result: DeploymentResult = {
      network: this.config.network,
      chainId: this.config.network === 'base-sepolia' ? 84532 : 8453,
      contracts: {
        identityRegistry,
        reputationSystem,
        diamond,
        predictionMarketFacet,
        oracleFacet,
        diamondCutFacet,
        diamondLoupeFacet
      },
      deployer: await this.getDeployerAddress(),
      timestamp: new Date().toISOString(),
      blockNumber: await this.getCurrentBlockNumber()
    }

    this.saveDeployment(result)

    console.log('\n✨ Deployment complete!')
    console.log('=' .repeat(60))
    console.log('\n📝 Deployment saved to: deployments/' + this.config.network + '.json')

    return result
  }

  /**
   * Compile contracts with forge
   */
  private compile(): void {
    try {
      execSync('forge build', { stdio: 'inherit' })
    } catch (error) {
      console.error('❌ Compilation failed:', error)
      process.exit(1)
    }
  }

  /**
   * Deploy a single contract
   */
  private async deployContract(
    contractName: string,
    constructorArgs: string[] = []
  ): Promise<string> {
    try {
      const args = constructorArgs.join(' ')
      const cmd = `forge create --rpc-url ${this.config.rpcUrl} \
        --private-key ${this.config.privateKey || '$DEPLOYER_PRIVATE_KEY'} \
        contracts/**/${contractName}.sol:${contractName} \
        ${args ? `--constructor-args ${args}` : ''} \
        --json`

      const output = execSync(cmd, { encoding: 'utf-8' })
      const result = JSON.parse(output)
      return result.deployedTo
    } catch (error) {
      console.error(`❌ Failed to deploy ${contractName}:`, error)
      throw error
    }
  }

  /**
   * Deploy Diamond proxy with initial facets
   */
  private async deployDiamond(
    cutFacet: string,
    loupeFacet: string,
    marketFacet: string,
    oracleFacet: string
  ): Promise<string> {
    // Diamond requires diamond cut initialization
    // This is a simplified version - you'll need to encode the facet cuts properly
    return await this.deployContract('Diamond', [cutFacet, loupeFacet])
  }

  /**
   * Verify contracts on block explorer
   */
  private async verifyContracts(contracts: Record<string, string>): Promise<void> {
    for (const [name, address] of Object.entries(contracts)) {
      try {
        console.log(`  Verifying ${name}...`)
        execSync(
          `forge verify-contract ${address} \
          contracts/**/*.sol:${name} \
          --chain-id ${this.config.network === 'base-sepolia' ? '84532' : '8453'} \
          --etherscan-api-key ${this.config.etherscanApiKey} \
          --watch`,
          { stdio: 'inherit' }
        )
        console.log(`  ✅ ${name} verified`)
      } catch (error) {
        console.warn(`  ⚠️  ${name} verification failed (may already be verified)`)
      }
    }
  }

  /**
   * Get deployer address
   */
  private async getDeployerAddress(): Promise<string> {
    try {
      const cmd = `cast wallet address --private-key ${this.config.privateKey || '$DEPLOYER_PRIVATE_KEY'}`
      return execSync(cmd, { encoding: 'utf-8' }).trim()
    } catch {
      return 'unknown'
    }
  }

  /**
   * Get current block number
   */
  private async getCurrentBlockNumber(): Promise<number> {
    try {
      const cmd = `cast block-number --rpc-url ${this.config.rpcUrl}`
      return parseInt(execSync(cmd, { encoding: 'utf-8' }).trim())
    } catch {
      return 0
    }
  }

  /**
   * Save deployment info to file
   */
  private saveDeployment(result: DeploymentResult): void {
    const deploymentsDir = join(process.cwd(), 'deployments')
    const filepath = join(deploymentsDir, `${this.config.network}.json`)

    try {
      // Create directory if it doesn't exist
      execSync(`mkdir -p ${deploymentsDir}`)
      writeFileSync(filepath, JSON.stringify(result, null, 2))
    } catch (error) {
      console.error('❌ Failed to save deployment:', error)
    }
  }
}

/**
 * Main deployment function
 */
async function main() {
  const network = (process.env.NETWORK || 'base-sepolia') as 'base-sepolia' | 'base'

  const config: DeploymentConfig = {
    network,
    rpcUrl: network === 'base-sepolia'
      ? (process.env.BASE_SEPOLIA_RPC_URL || 'https://sepolia.base.org')
      : (process.env.BASE_RPC_URL || 'https://mainnet.base.org'),
    privateKey: process.env.DEPLOYER_PRIVATE_KEY,
    etherscanApiKey: network === 'base-sepolia'
      ? process.env.BASE_SEPOLIA_ETHERSCAN_API_KEY
      : process.env.BASE_ETHERSCAN_API_KEY
  }

  if (!config.privateKey) {
    console.error('❌ Error: DEPLOYER_PRIVATE_KEY environment variable required')
    console.log('\nUsage:')
    console.log('  DEPLOYER_PRIVATE_KEY=0x... bun run scripts/deploy-contracts.ts')
    console.log('  NETWORK=base-sepolia DEPLOYER_PRIVATE_KEY=0x... bun run scripts/deploy-contracts.ts')
    process.exit(1)
  }

  const deployer = new ContractDeployer(config)
  await deployer.deploy()
}

// Run deployment
main().catch((error) => {
  console.error('❌ Deployment failed:', error)
  process.exit(1)
})
