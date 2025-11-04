/**
 * Manual Babylon Game Registration Script
 * 
 * Registers Babylon as a discoverable entity in ERC-8004 + Agent0 registry.
 * Run this if automatic registration fails or needs to be redone.
 * 
 * Usage: bun run scripts/register-babylon-game.ts
 */

import { registerBabylonGame } from '../src/lib/babylon-registry-init'
import { logger } from '../src/lib/logger'

async function main() {
  console.log('🚀 Registering Babylon game in Agent0 registry...\n')
  
  try {
    const result = await registerBabylonGame()
    
    if (result) {
      console.log('\n✅ Babylon registration successful!')
      console.log(`   Token ID: ${result.tokenId}`)
      console.log(`   Metadata CID: ${result.metadataCID}`)
      console.log(`   Registered at: ${result.registeredAt}`)
      console.log(`\n   IPFS Gateway URL: https://ipfs.io/ipfs/${result.metadataCID}`)
      console.log(`\n   Set BABYLON_REGISTRY_REGISTERED=true in .env to skip future registrations`)
    } else {
      console.log('\n⚠️  Registration skipped (already registered or Agent0 disabled)')
      console.log('   Check BABYLON_REGISTRY_REGISTERED and AGENT0_ENABLED environment variables')
    }
  } catch (error) {
    console.error('\n❌ Registration failed:', error)
    if (error instanceof Error) {
      console.error(`   ${error.message}`)
    }
    process.exit(1)
  }
}

main()

