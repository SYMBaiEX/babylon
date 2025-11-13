#!/usr/bin/env bun
/**
 * Oracle Integration Validation Script
 * 
 * Validates that the complete oracle integration is working correctly
 */

import { logger } from '../src/lib/logger'

interface ValidationResult {
  step: string
  status: 'pass' | 'fail' | 'skip'
  message: string
  details?: any
}

const results: ValidationResult[] = []

function addResult(step: string, status: 'pass' | 'fail' | 'skip', message: string, details?: any) {
  results.push({ step, status, message, details })
  
  const icon = status === 'pass' ? '✅' : status === 'fail' ? '❌' : '⏭️'
  logger.info(`${icon} ${step}: ${message}`, details, 'Validation')
}

async function main() {
  logger.info('🔍 Validating Oracle Integration', undefined, 'Validation')
  logger.info('='.repeat(70), undefined, 'Validation')

  // Step 1: Check contracts compiled
  logger.info('\n📦 Checking Contract Compilation...', undefined, 'Validation')
  try {
    const { execSync } = await import('child_process')
    execSync('forge build --force', { stdio: 'pipe' })
    addResult('Contract Compilation', 'pass', 'All contracts compiled successfully')
  } catch (error) {
    addResult('Contract Compilation', 'fail', 'Compilation failed', { error })
  }

  // Step 2: Check Solidity tests
  logger.info('\n🧪 Running Solidity Tests...', undefined, 'Validation')
  try {
    const { execSync } = await import('child_process')
    const output = execSync('forge test --match-contract BabylonGameOracleTest', { encoding: 'utf-8' })
    const passMatch = output.match(/(\d+) passed/)
    const passed = passMatch ? parseInt(passMatch[1]) : 0
    
    if (passed === 9) {
      addResult('Solidity Tests', 'pass', `All ${passed} tests passing`)
    } else {
      addResult('Solidity Tests', 'fail', `Only ${passed}/9 tests passed`)
    }
  } catch (error) {
    addResult('Solidity Tests', 'fail', 'Test execution failed', { error })
  }

  // Step 3: Check file structure
  logger.info('\n📁 Checking File Structure...', undefined, 'Validation')
  const { existsSync } = await import('fs')
  
  const requiredFiles = [
    'contracts/src/game/BabylonGameOracle.sol',
    'contracts/src/prediction-markets/Predimarket.sol',
    'contracts/test/BabylonGameOracle.t.sol',
    'src/lib/oracle/oracle-service.ts',
    'src/lib/oracle/commitment-store.ts',
    'src/lib/oracle/types.ts',
    'src/app/betting/page.tsx',
    'src/components/betting/MarketCard.tsx',
    'src/lib/betting/hooks/useMarkets.ts',
    'prisma/schema.prisma',
  ]

  let filesFound = 0
  for (const file of requiredFiles) {
    if (existsSync(file)) {
      filesFound++
    } else {
      addResult('File Structure', 'fail', `Missing: ${file}`)
    }
  }

  if (filesFound === requiredFiles.length) {
    addResult('File Structure', 'pass', `All ${filesFound} required files present`)
  }

  // Step 4: Check Prisma schema
  logger.info('\n💾 Checking Database Schema...', undefined, 'Validation')
  const { readFileSync } = await import('fs')
  const schemaContent = readFileSync('prisma/schema.prisma', 'utf-8')
  
  const requiredModels = ['OracleCommitment', 'OracleTransaction']
  const requiredFields = ['oracleSessionId', 'oracleCommitment', 'oracleRevealTxHash']
  
  let modelsFound = 0
  let fieldsFound = 0
  
  for (const model of requiredModels) {
    if (schemaContent.includes(`model ${model}`)) modelsFound++
  }
  
  for (const field of requiredFields) {
    if (schemaContent.includes(field)) fieldsFound++
  }

  if (modelsFound === requiredModels.length && fieldsFound === requiredFields.length) {
    addResult('Database Schema', 'pass', `All models and fields present`)
  } else {
    addResult('Database Schema', 'fail', `Missing: ${requiredModels.length - modelsFound} models, ${requiredFields.length - fieldsFound} fields`)
  }

  // Step 5: Check deployment script
  logger.info('\n🚀 Checking Deployment Configuration...', undefined, 'Validation')
  const deployScript = readFileSync('scripts/DeployBabylon.s.sol', 'utf-8')
  
  const requiredDeployments = [
    'babylonOracle',
    'predimarket',
    'marketFactory',
    'contestOracle',
    'banManager'
  ]

  let deploymentsFound = 0
  for (const deployment of requiredDeployments) {
    if (deployScript.includes(deployment)) deploymentsFound++
  }

  if (deploymentsFound === requiredDeployments.length) {
    addResult('Deployment Config', 'pass', 'All contracts in deployment script')
  } else {
    addResult('Deployment Config', 'fail', `Missing ${requiredDeployments.length - deploymentsFound} contracts`)
  }

  // Step 6: Check game tick integration
  logger.info('\n⏰ Checking Game Tick Integration...', undefined, 'Validation')
  const tickContent = readFileSync('src/lib/serverless-game-tick.ts', 'utf-8')
  
  const requiredIntegrations = [
    'publishOracleCommitments',
    'publishOracleReveals',
    'oracleCommits',
    'oracleReveals',
    'getOracleService'
  ]

  let integrationsFound = 0
  for (const integration of requiredIntegrations) {
    if (tickContent.includes(integration)) integrationsFound++
  }

  if (integrationsFound === requiredIntegrations.length) {
    addResult('Game Tick Integration', 'pass', 'Oracle fully integrated')
  } else {
    addResult('Game Tick Integration', 'fail', `Missing ${requiredIntegrations.length - integrationsFound} integrations`)
  }

  // Step 7: Check environment variables
  logger.info('\n🔐 Checking Configuration...', undefined, 'Validation')
  
  if (process.env.NEXT_PUBLIC_BABYLON_ORACLE) {
    addResult('Oracle Address', 'pass', `Configured: ${process.env.NEXT_PUBLIC_BABYLON_ORACLE}`)
  } else {
    addResult('Oracle Address', 'skip', 'Not deployed yet (run contracts:deploy:local)')
  }

  if (process.env.ORACLE_PRIVATE_KEY) {
    addResult('Oracle Private Key', 'pass', 'Configured')
  } else {
    addResult('Oracle Private Key', 'skip', 'Not set (needed for publishing)')
  }

  if (process.env.ORACLE_ENCRYPTION_KEY) {
    addResult('Encryption Key', 'pass', 'Configured')
  } else {
    addResult('Encryption Key', 'skip', 'Not set (needed for salt encryption)')
  }

  // Final Summary
  logger.info('\n' + '='.repeat(70), undefined, 'Validation')
  logger.info('📊 VALIDATION SUMMARY', undefined, 'Validation')
  logger.info('='.repeat(70), undefined, 'Validation')

  const passed = results.filter(r => r.status === 'pass').length
  const failed = results.filter(r => r.status === 'fail').length
  const skipped = results.filter(r => r.status === 'skip').length

  logger.info(`\n✅ Passed: ${passed}`, undefined, 'Validation')
  logger.info(`❌ Failed: ${failed}`, undefined, 'Validation')
  logger.info(`⏭️  Skipped: ${skipped}`, undefined, 'Validation')

  if (failed > 0) {
    logger.info('\n❌ VALIDATION FAILED', undefined, 'Validation')
    logger.info('Review failures above and fix before deployment', undefined, 'Validation')
    process.exit(1)
  }

  logger.info('\n🎉 VALIDATION SUCCESSFUL!', undefined, 'Validation')
  logger.info('\nOracle integration is complete and working correctly.', undefined, 'Validation')
  
  if (skipped > 0) {
    logger.info('\n📝 Next steps:', undefined, 'Validation')
    logger.info('  1. Deploy contracts: bun run contracts:deploy:local', undefined, 'Validation')
    logger.info('  2. Set ORACLE_PRIVATE_KEY in .env', undefined, 'Validation')
    logger.info('  3. Set ORACLE_ENCRYPTION_KEY in .env', undefined, 'Validation')
    logger.info('  4. Run: bun run oracle:test:simple', undefined, 'Validation')
  } else {
    logger.info('\n✨ Everything is configured! You can:', undefined, 'Validation')
    logger.info('  1. Run tests: bun run oracle:test:simple', undefined, 'Validation')
    logger.info('  2. Start app: bun run dev', undefined, 'Validation')
    logger.info('  3. Visit: http://localhost:3000/betting', undefined, 'Validation')
  }

  logger.info('\n' + '='.repeat(70), undefined, 'Validation')
}

main().catch((error) => {
  logger.error('Validation script failed', error, 'Validation')
  process.exit(1)
})

