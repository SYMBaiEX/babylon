#!/usr/bin/env bun
/**
 * Check blockchain environment variables configuration
 * Helps verify that the correct contract addresses are set
 */

import { config } from 'dotenv'

config()

const DEPLOYMENT_FILE = './deployments/base-sepolia/latest.json'

interface DeploymentInfo {
  chainId: number
  network: string
  contracts: {
    diamond: string
    identityRegistry: string
    reputationSystem: string
  }
}

async function checkEnvBlockchain() {
  console.log('🔍 Checking blockchain environment variables...\n')

  // Read deployment info
  let deployment: DeploymentInfo | null = null
  try {
    const deploymentData = await Bun.file(DEPLOYMENT_FILE).text()
    deployment = JSON.parse(deploymentData)
    console.log('✅ Found deployment file:', DEPLOYMENT_FILE)
    console.log(`   Network: ${deployment?.network} (Chain ID: ${deployment?.chainId})\n`)
  } catch (error) {
    console.log('⚠️  No deployment file found at:', DEPLOYMENT_FILE)
    console.log('   Run deployment first or manually set environment variables\n')
  }

  // Check current environment variables
  const requiredVars = [
    'NEXT_PUBLIC_RPC_URL',
    'NEXT_PUBLIC_CHAIN_ID',
    'NEXT_PUBLIC_IDENTITY_REGISTRY_BASE_SEPOLIA',
    'NEXT_PUBLIC_REPUTATION_SYSTEM_BASE_SEPOLIA',
    'NEXT_PUBLIC_DIAMOND_BASE_SEPOLIA',
    'DEPLOYER_PRIVATE_KEY',
  ]

  console.log('📋 Environment Variable Status:\n')

  const issues: string[] = []
  
  for (const varName of requiredVars) {
    const value = process.env[varName]
    const isSet = Boolean(value && value !== '0x...' && value !== '0x0000000000000000000000000000000000000000')
    
    if (isSet) {
      if (varName === 'DEPLOYER_PRIVATE_KEY') {
        console.log(`   ✅ ${varName}: [REDACTED]`)
      } else {
        console.log(`   ✅ ${varName}: ${value}`)
      }
    } else {
      console.log(`   ❌ ${varName}: NOT SET`)
      issues.push(varName)
    }
  }

  // Compare with deployment if available
  if (deployment) {
    console.log('\n🔄 Comparing with deployment file:\n')
    
    const envChainId = process.env.NEXT_PUBLIC_CHAIN_ID
    if (envChainId && parseInt(envChainId) !== deployment.chainId) {
      console.log(`   ⚠️  CHAIN ID MISMATCH!`)
      console.log(`      Environment: ${envChainId}`)
      console.log(`      Deployment: ${deployment.chainId}`)
      issues.push('CHAIN_ID_MISMATCH')
    } else {
      console.log(`   ✅ Chain ID matches: ${deployment.chainId}`)
    }

    const envIdentityRegistry = process.env.NEXT_PUBLIC_IDENTITY_REGISTRY_BASE_SEPOLIA
    if (envIdentityRegistry && envIdentityRegistry.toLowerCase() !== deployment.contracts.identityRegistry.toLowerCase()) {
      console.log(`   ⚠️  IDENTITY REGISTRY MISMATCH!`)
      console.log(`      Environment: ${envIdentityRegistry}`)
      console.log(`      Deployment: ${deployment.contracts.identityRegistry}`)
      issues.push('IDENTITY_REGISTRY_MISMATCH')
    } else if (envIdentityRegistry) {
      console.log(`   ✅ Identity Registry matches`)
    }

    const envReputationSystem = process.env.NEXT_PUBLIC_REPUTATION_SYSTEM_BASE_SEPOLIA
    if (envReputationSystem && envReputationSystem.toLowerCase() !== deployment.contracts.reputationSystem.toLowerCase()) {
      console.log(`   ⚠️  REPUTATION SYSTEM MISMATCH!`)
      console.log(`      Environment: ${envReputationSystem}`)
      console.log(`      Deployment: ${deployment.contracts.reputationSystem}`)
      issues.push('REPUTATION_SYSTEM_MISMATCH')
    } else if (envReputationSystem) {
      console.log(`   ✅ Reputation System matches`)
    }

    const envDiamond = process.env.NEXT_PUBLIC_DIAMOND_BASE_SEPOLIA
    if (envDiamond && envDiamond.toLowerCase() !== deployment.contracts.diamond.toLowerCase()) {
      console.log(`   ⚠️  DIAMOND MISMATCH!`)
      console.log(`      Environment: ${envDiamond}`)
      console.log(`      Deployment: ${deployment.contracts.diamond}`)
      issues.push('DIAMOND_MISMATCH')
    } else if (envDiamond) {
      console.log(`   ✅ Diamond matches`)
    }
  }

  // Provide recommendations
  if (issues.length > 0) {
    console.log('\n\n❌ Issues detected!\n')
    console.log('To fix, add these to your .env.local file:\n')
    console.log('# Base Sepolia Blockchain Configuration')
    console.log('NEXT_PUBLIC_RPC_URL=https://sepolia.base.org')
    console.log('NEXT_PUBLIC_CHAIN_ID=84532')
    
    if (deployment) {
      console.log(`NEXT_PUBLIC_IDENTITY_REGISTRY_BASE_SEPOLIA=${deployment.contracts.identityRegistry}`)
      console.log(`NEXT_PUBLIC_REPUTATION_SYSTEM_BASE_SEPOLIA=${deployment.contracts.reputationSystem}`)
      console.log(`NEXT_PUBLIC_DIAMOND_BASE_SEPOLIA=${deployment.contracts.diamond}`)
    } else {
      console.log('NEXT_PUBLIC_IDENTITY_REGISTRY_BASE_SEPOLIA=0x...')
      console.log('NEXT_PUBLIC_REPUTATION_SYSTEM_BASE_SEPOLIA=0x...')
      console.log('NEXT_PUBLIC_DIAMOND_BASE_SEPOLIA=0x...')
    }
    console.log('DEPLOYER_PRIVATE_KEY=0x...')
    console.log('')
    process.exit(1)
  } else {
    console.log('\n\n✅ All blockchain environment variables are correctly configured!\n')
    process.exit(0)
  }
}

checkEnvBlockchain().catch((error) => {
  console.error('Error:', error)
  process.exit(1)
})

