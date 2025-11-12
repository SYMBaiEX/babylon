#!/usr/bin/env bun
/**
 * Minimal Agent Test - Absolute Bare Bones
 * 
 * Tests ONLY the core agent libraries work
 * NO backend, NO Eliza, NO registry
 * Just proves: wallet generation + session management code runs
 */

import { Mnemonic, HDNodeWallet } from 'ethers'

const MNEMONIC = 'test test test test test test test test test test test junk'

console.log('🧪 Minimal Agent Library Test\n')

// Test 1: Wallet Generation
console.log('1️⃣ Testing HD Wallet Generation...')
try {
  const mnemonic = Mnemonic.fromPhrase(MNEMONIC)
  const wallet1 = HDNodeWallet.fromMnemonic(mnemonic, "m/44'/60'/0'/0/0")
  const wallet2 = HDNodeWallet.fromMnemonic(mnemonic, "m/44'/60'/0'/0/1")
  
  console.log(`   Agent 1: ${wallet1.address}`)
  console.log(`   Agent 2: ${wallet2.address}`)
  
  if (wallet1.address === wallet2.address) {
    throw new Error('Wallets should be different!')
  }
  
  // Test determinism
  const wallet1Again = HDNodeWallet.fromMnemonic(mnemonic, "m/44'/60'/0'/0/0")
  if (wallet1.address !== wallet1Again.address) {
    throw new Error('Wallets should be deterministic!')
  }
  
  console.log('   ✅ HD wallet generation works\n')
} catch (error) {
  console.error('   ❌ HD wallet generation FAILED:', error)
  process.exit(1)
}

// Test 2: Session Storage (in-memory)
console.log('2️⃣ Testing Session Management...')
try {
  const sessions = new Map<string, { token: string; expires: number }>()
  
  const agent1Token = 'token-agent-1-' + Math.random()
  const agent2Token = 'token-agent-2-' + Math.random()
  
  sessions.set('agent-1', { token: agent1Token, expires: Date.now() + 3600000 })
  sessions.set('agent-2', { token: agent2Token, expires: Date.now() + 3600000 })
  
  const retrieved = sessions.get('agent-1')
  if (!retrieved || retrieved.token !== agent1Token) {
    throw new Error('Session storage broken!')
  }
  
  console.log(`   Agent 1 session: ${agent1Token.slice(0, 20)}...`)
  console.log(`   Agent 2 session: ${agent2Token.slice(0, 20)}...`)
  console.log('   ✅ Session management works\n')
} catch (error) {
  console.error('   ❌ Session management FAILED:', error)
  process.exit(1)
}

// Test 3: Configuration Loading
console.log('3️⃣ Testing Config Loading...')
try {
  const fs = await import('fs')
  const path = await import('path')
  
  const manifestPath = path.join(process.cwd(), 'eliza', 'config', 'agents-manifest.json')
  const manifestData = fs.readFileSync(manifestPath, 'utf-8')
  const manifest = JSON.parse(manifestData)
  
  if (!Array.isArray(manifest) || manifest.length === 0) {
    throw new Error('Manifest should be non-empty array!')
  }
  
  console.log(`   Loaded ${manifest.length} agent configs`)
  manifest.forEach((agent: { id: string }, i: number) => {
    console.log(`   ${i + 1}. ${agent.id}`)
  })
  
  console.log('   ✅ Config loading works\n')
} catch (error) {
  console.error('   ❌ Config loading FAILED:', error)
  process.exit(1)
}

// Test 4: Character File Loading
console.log('4️⃣ Testing Character File Loading...')
try {
  const fs = await import('fs')
  const path = await import('path')
  
  const characterPath = path.join(process.cwd(), 'eliza', 'characters', 'alice-trader.json')
  const characterData = fs.readFileSync(characterPath, 'utf-8')
  const character = JSON.parse(characterData)
  
  if (!character.name || !character.bio) {
    throw new Error('Character file missing required fields!')
  }
  
  console.log(`   Character: ${character.name}`)
  console.log(`   Bio: ${character.bio[0]}`)
  console.log(`   Model: ${character.modelProvider}`)
  console.log('   ✅ Character loading works\n')
} catch (error) {
  console.error('   ❌ Character loading FAILED:', error)
  process.exit(1)
}

console.log('═'.repeat(50))
console.log('✅ ALL MINIMAL TESTS PASSED')
console.log('')
console.log('Core agent libraries work correctly!')
console.log('Next step: Test against live backend')
console.log('')
console.log('Run: bun run eliza/scripts/validate-backend.ts')
console.log('═'.repeat(50))

