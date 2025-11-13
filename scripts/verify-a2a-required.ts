/**
 * Verify A2A Requirements
 * 
 * Checks that all required A2A configuration is in place before starting agents
 */

async function verifyA2ARequirements() {
  console.log('🔍 Verifying A2A Requirements...\n')
  
  let hasErrors = false
  
  // Check BABYLON_A2A_ENDPOINT
  console.log('1. Checking BABYLON_A2A_ENDPOINT...')
  if (!process.env.BABYLON_A2A_ENDPOINT) {
    console.error('   ❌ BABYLON_A2A_ENDPOINT not set')
    console.error('   Set in .env.local: BABYLON_A2A_ENDPOINT="ws://localhost:8765"')
    hasErrors = true
  } else {
    console.log(`   ✅ ${process.env.BABYLON_A2A_ENDPOINT}`)
  }
  
  // Check AGENT_DEFAULT_PRIVATE_KEY
  console.log('2. Checking AGENT_DEFAULT_PRIVATE_KEY...')
  if (!process.env.AGENT_DEFAULT_PRIVATE_KEY) {
    console.error('   ❌ AGENT_DEFAULT_PRIVATE_KEY not set')
    console.error('   Generate with: openssl rand -hex 32')
    console.error('   Set in .env.local: AGENT_DEFAULT_PRIVATE_KEY="0x..."')
    hasErrors = true
  } else {
    const keyLength = process.env.AGENT_DEFAULT_PRIVATE_KEY.replace('0x', '').length
    if (keyLength !== 64) {
      console.error('   ❌ Private key must be 32 bytes (64 hex characters)')
      hasErrors = true
    } else {
      console.log('   ✅ Private key configured (32 bytes)')
    }
  }
  
  // Check GROQ_API_KEY
  console.log('3. Checking GROQ_API_KEY...')
  if (!process.env.GROQ_API_KEY) {
    console.error('   ❌ GROQ_API_KEY not set')
    console.error('   Get free key from: https://console.groq.com')
    console.error('   Set in .env.local: GROQ_API_KEY="gsk_..."')
    hasErrors = true
  } else {
    console.log('   ✅ Groq API key configured')
  }
  
  // Check DATABASE_URL
  console.log('4. Checking DATABASE_URL...')
  if (!process.env.DATABASE_URL) {
    console.error('   ❌ DATABASE_URL not set')
    console.error('   Set in .env.local: DATABASE_URL="postgresql://..."')
    hasErrors = true
  } else {
    console.log(`   ✅ ${process.env.DATABASE_URL.split('@')[1] || 'Database configured'}`)
  }
  
  console.log()
  
  if (hasErrors) {
    console.error('❌ CONFIGURATION INCOMPLETE')
    console.error('\nAgents require A2A protocol to function.')
    console.error('Please configure all required environment variables.\n')
    console.error('📖 See:')
    console.error('   - .env.local.example for template')
    console.error('   - A2A_SETUP.md for setup guide')
    console.error('   - QUICKSTART.md for quick start\n')
    process.exit(1)
  } else {
    console.log('✅ ALL REQUIREMENTS MET')
    console.log('\nYou can now:')
    console.log('   1. Start A2A server: npm run a2a:server')
    console.log('   2. Start application: npm run dev')
    console.log('   3. Create agents that will connect via A2A\n')
    process.exit(0)
  }
}

verifyA2ARequirements().catch(console.error)

