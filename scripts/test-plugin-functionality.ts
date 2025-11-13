/**
 * Test Plugin Functionality
 * 
 * Tests that the plugin structure is correct and can be loaded
 * Does NOT require A2A server or environment setup
 */

import { babylonPlugin } from '@/lib/agents/plugins/babylon'

console.log('🧪 Testing Babylon Plugin Structure...\n')

let errors = 0
let warnings = 0

// Test 1: Plugin exports
console.log('1️⃣  Testing plugin exports...')
if (!babylonPlugin) {
  console.error('   ❌ babylonPlugin not exported')
  errors++
} else {
  console.log('   ✅ babylonPlugin exported')
}

if (!babylonPlugin.name || babylonPlugin.name !== 'babylon') {
  console.error('   ❌ Plugin name incorrect')
  errors++
} else {
  console.log('   ✅ Plugin name: babylon')
}

// Test 2: Providers
console.log('\n2️⃣  Testing providers...')
const expectedProviders = [
  'BABYLON_DASHBOARD',
  'BABYLON_MARKETS',
  'BABYLON_PORTFOLIO',
  'BABYLON_FEED',
  'BABYLON_TRENDING',
  'BABYLON_MESSAGES',
  'BABYLON_NOTIFICATIONS'
]

if (!babylonPlugin.providers || babylonPlugin.providers.length === 0) {
  console.error('   ❌ No providers found')
  errors++
} else {
  console.log(`   ✅ ${babylonPlugin.providers.length} providers found`)
  
  for (const expectedName of expectedProviders) {
    const provider = babylonPlugin.providers.find(p => p.name === expectedName)
    if (!provider) {
      console.error(`   ❌ Provider ${expectedName} not found`)
      errors++
    } else {
      // Check provider structure
      if (!provider.get || typeof provider.get !== 'function') {
        console.error(`   ❌ Provider ${expectedName} missing get() function`)
        errors++
      } else {
        console.log(`   ✅ ${expectedName}`)
      }
    }
  }
}

// Test 3: Actions
console.log('\n3️⃣  Testing actions...')
const expectedActions = [
  'BUY_PREDICTION_SHARES',
  'SELL_PREDICTION_SHARES',
  'OPEN_PERP_POSITION',
  'CLOSE_PERP_POSITION',
  'CREATE_POST',
  'COMMENT_ON_POST',
  'LIKE_POST',
  'SEND_MESSAGE',
  'CREATE_GROUP'
]

if (!babylonPlugin.actions || babylonPlugin.actions.length === 0) {
  console.error('   ❌ No actions found')
  errors++
} else {
  console.log(`   ✅ ${babylonPlugin.actions.length} actions found`)
  
  for (const expectedName of expectedActions) {
    const action = babylonPlugin.actions.find(a => a.name === expectedName)
    if (!action) {
      console.error(`   ❌ Action ${expectedName} not found`)
      errors++
    } else {
      // Check action structure
      if (!action.handler || typeof action.handler !== 'function') {
        console.error(`   ❌ Action ${expectedName} missing handler() function`)
        errors++
      } else if (!action.validate || typeof action.validate !== 'function') {
        console.error(`   ❌ Action ${expectedName} missing validate() function`)
        errors++
      } else {
        console.log(`   ✅ ${expectedName}`)
      }
    }
  }
}

// Test 4: Integration exports
console.log('\n4️⃣  Testing integration exports...')
try {
  const { enhanceRuntimeWithBabylon, initializeAgentA2AClient } = await import('@/lib/agents/plugins/babylon/integration')
  
  if (typeof enhanceRuntimeWithBabylon !== 'function') {
    console.error('   ❌ enhanceRuntimeWithBabylon not a function')
    errors++
  } else {
    console.log('   ✅ enhanceRuntimeWithBabylon exported')
  }
  
  if (typeof initializeAgentA2AClient !== 'function') {
    console.error('   ❌ initializeAgentA2AClient not a function')
    errors++
  } else {
    console.log('   ✅ initializeAgentA2AClient exported')
  }
} catch (error) {
  console.error('   ❌ Integration import failed:', error)
  errors++
}

// Summary
console.log('\n' + '═'.repeat(60))
console.log('📊 PLUGIN STRUCTURE TEST RESULTS')
console.log('═'.repeat(60))

if (errors === 0 && warnings === 0) {
  console.log('\n✅ ALL TESTS PASSED')
  console.log('   Plugin structure is correct')
  console.log('   7 providers properly configured')
  console.log('   9 actions properly configured')
  console.log('   Integration functions available')
  console.log('\n🎉 Plugin is ready to use!\n')
  process.exit(0)
} else {
  console.log(`\n❌ TESTS FAILED`)
  console.log(`   Errors: ${errors}`)
  console.log(`   Warnings: ${warnings}\n`)
  process.exit(1)
}

