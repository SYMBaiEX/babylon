/**
 * Verification script for Twitter sharing setup
 * Run with: npx ts-node scripts/verify-twitter-setup.ts
 */

import { config } from 'dotenv'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

// ES module __dirname equivalent
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Load environment variables
config({ path: resolve(__dirname, '../.env') })

interface CheckResult {
  name: string
  passed: boolean
  message: string
}

const checks: CheckResult[] = []

function addCheck(name: string, passed: boolean, message: string) {
  checks.push({ name, passed, message })
  const icon = passed ? '✅' : '❌'
  console.log(`${icon} ${name}: ${message}`)
}

async function verifySetup() {
  console.log('🔍 Verifying Twitter Sharing Setup...\n')

  // Check 1: Environment Variables
  console.log('1️⃣ Checking Environment Variables...')
  
  const xApiKey = process.env.X_API_KEY
  const xApiSecret = process.env.X_API_KEY_SECRET
  const appUrl = process.env.NEXT_PUBLIC_APP_URL
  
  addCheck(
    'X_API_KEY',
    Boolean(xApiKey),
    xApiKey ? `Set (${xApiKey.substring(0, 8)}...)` : 'Missing - Add to .env'
  )
  
  addCheck(
    'X_API_KEY_SECRET',
    Boolean(xApiSecret),
    xApiSecret ? `Set (${xApiSecret.substring(0, 8)}...)` : 'Missing - Add to .env'
  )
  
  addCheck(
    'NEXT_PUBLIC_APP_URL',
    Boolean(appUrl),
    appUrl || 'Missing - Add to .env'
  )
  
  console.log('')

  // Check 2: Database Connection
  console.log('2️⃣ Checking Database Connection...')
  
  try {
    const { prisma } = await import('../src/lib/database-service')
    
    // Try to connect
    await prisma.$connect()
    addCheck('Database Connection', true, 'Successfully connected to database')
    
    // Check if tables exist
    try {
      await prisma.oAuthState.count()
      addCheck('OAuthState Table', true, 'Table exists')
    } catch (error) {
      addCheck('OAuthState Table', false, 'Table missing - Run migration')
    }
    
    try {
      await prisma.twitterOAuthToken.count()
      addCheck('TwitterOAuthToken Table', true, 'Table exists')
    } catch (error) {
      addCheck('TwitterOAuthToken Table', false, 'Table missing - Run migration')
    }
    
    await prisma.$disconnect()
  } catch (error) {
    addCheck('Database Connection', false, `Failed to connect: ${error}`)
  }
  
  console.log('')

  // Check 3: API Routes
  console.log('3️⃣ Checking API Routes...')
  
  const fs = await import('fs')
  const path = await import('path')
  
  const apiRoutes = [
    'src/app/api/twitter/oauth/request-token/route.ts',
    'src/app/api/twitter/oauth/callback/route.ts',
    'src/app/api/twitter/auth-status/route.ts',
    'src/app/api/twitter/disconnect/route.ts',
    'src/app/api/twitter/upload-media/route.ts',
    'src/app/api/twitter/tweet/route.ts',
  ]
  
  for (const route of apiRoutes) {
    const fullPath = path.resolve(__dirname, '..', route)
    const exists = fs.existsSync(fullPath)
    const routeName = route.split('/').slice(-2, -1)[0]
    addCheck(
      `API Route: ${routeName}`,
      exists,
      exists ? 'File exists' : 'File missing'
    )
  }
  
  console.log('')

  // Check 4: Frontend Components
  console.log('4️⃣ Checking Frontend Components...')
  
  const components = [
    'src/hooks/useTwitterAuth.ts',
    'src/components/markets/PnLShareModal.tsx',
  ]
  
  for (const component of components) {
    const fullPath = path.resolve(__dirname, '..', component)
    const exists = fs.existsSync(fullPath)
    const componentName = component.split('/').pop()?.replace('.tsx', '').replace('.ts', '')
    addCheck(
      `Component: ${componentName}`,
      exists,
      exists ? 'File exists' : 'File missing'
    )
  }
  
  console.log('')

  // Check 5: Test Files
  console.log('5️⃣ Checking Test Files...')
  
  const testFile = 'tests/twitter-sharing.spec.ts'
  const fullPath = path.resolve(__dirname, '..', testFile)
  const exists = fs.existsSync(fullPath)
  addCheck(
    'E2E Tests',
    exists,
    exists ? 'Test file exists' : 'Test file missing'
  )
  
  console.log('')

  // Summary
  console.log('📊 Summary\n')
  const passed = checks.filter(c => c.passed).length
  const total = checks.length
  const percentage = Math.round((passed / total) * 100)
  
  console.log(`✅ Passed: ${passed}/${total} (${percentage}%)`)
  console.log(`❌ Failed: ${total - passed}/${total}`)
  
  console.log('\n')
  
  if (passed === total) {
    console.log('🎉 All checks passed! Setup is complete.')
    console.log('\n📝 Next Steps:')
    console.log('1. Start dev server: npm run dev')
    console.log('2. Navigate to /markets')
    console.log('3. Click "Share P&L" → "Share to X"')
    console.log('4. Complete OAuth flow')
  } else {
    console.log('⚠️  Some checks failed. Please review the errors above.')
    console.log('\n📝 Common Fixes:')
    console.log('- Missing env vars: Add to .env file')
    console.log('- Missing tables: Run `npx prisma migrate dev`')
    console.log('- Missing files: Check if files were created correctly')
  }
  
  console.log('\n📚 Documentation:')
  console.log('- Setup Guide: TWITTER_SHARING_SETUP.md')
  console.log('- Implementation: TWITTER_SHARING_IMPLEMENTATION.md')
  console.log('\n')
  
  process.exit(passed === total ? 0 : 1)
}

// Run verification
verifySetup().catch((error) => {
  console.error('❌ Verification failed:', error)
  process.exit(1)
})

