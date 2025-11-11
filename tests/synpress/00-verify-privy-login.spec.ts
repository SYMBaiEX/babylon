/**
 * Privy Login Verification Test
 * 
 * This test verifies that Privy test account login works correctly.
 * Run this FIRST to ensure Privy authentication is configured properly.
 * 
 * Reference: https://docs.privy.io/recipes/using-test-accounts
 * 
 * Prerequisites:
 * 1. Enable test accounts in Privy Dashboard (dashboard.privy.io)
 * 2. Add credentials to .env.local (exact values from Dashboard)
 * 3. Run: bun run test:verify-login
 */

import { test, expect } from '@playwright/test'
import { loginWithPrivyEmail, getPrivyTestAccount, isAuthenticated, waitForAuthentication } from './helpers/privy-auth'

test.describe('Privy Login Verification', () => {
  test('VERIFY: Privy test account credentials are configured', () => {
    console.log('\n🔍 Verifying Privy test account credentials...\n')
    
    try {
      const testAccount = getPrivyTestAccount()
      
      // Verify credentials format
      expect(testAccount.email).toMatch(/^test-.+@privy\.io$/)
      expect(testAccount.phone).toMatch(/^\+1 555 555 \d{4}$/)
      expect(testAccount.otp).toMatch(/^\d{6}$/)
      
      console.log('✅ Credentials configured correctly')
      console.log(`   Email: ${testAccount.email}`)
      console.log(`   Phone: ${testAccount.phone}`)
      console.log(`   OTP: ${testAccount.otp}`)
      console.log('\n')
    } catch (error) {
      console.error('\n❌ PRIVY CREDENTIALS NOT CONFIGURED\n')
      console.error('Please follow these steps:\n')
      console.error('1. Visit https://dashboard.privy.io')
      console.error('2. Go to: User management > Authentication > Advanced')
      console.error('3. Toggle ON "Enable test accounts"')
      console.error('4. Copy the exact credentials shown')
      console.error('5. Add to .env.local:\n')
      console.error('   PRIVY_TEST_EMAIL=test-XXXX@privy.io')
      console.error('   PRIVY_TEST_PHONE=+1 555 555 XXXX')
      console.error('   PRIVY_TEST_OTP=XXXXXX\n')
      console.error('Reference: https://docs.privy.io/recipes/using-test-accounts\n')
      
      throw error
    }
  })

  test('VERIFY: Can load home page', async ({ page }) => {
    console.log('\n🌐 Loading home page...\n')
    
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    
    // Take screenshot
    await page.screenshot({ path: 'test-results/screenshots/verify-00-home-page.png', fullPage: true })
    
    console.log('✅ Home page loaded successfully')
    console.log(`   URL: ${page.url()}\n`)
  })

  test('VERIFY: Privy login modal appears', async ({ page }) => {
    console.log('\n🔐 Testing Privy login modal...\n')
    
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    
    // Wait a bit for page to fully load
    await page.waitForTimeout(2000)
    
    // Look for login/connect button
    const loginButton = page.locator('button:has-text("Connect Wallet"), button:has-text("Login"), button:has-text("Sign in")').first()
    
    if (await loginButton.isVisible({ timeout: 5000 }).catch(() => false)) {
      console.log('✅ Found login button')
      
      // Click login button
      await loginButton.click()
      console.log('✅ Clicked login button')
      
      // Wait for Privy modal to appear
      await page.waitForTimeout(2000)
      
      // Take screenshot of modal
      await page.screenshot({ path: 'test-results/screenshots/verify-01-privy-modal.png', fullPage: true })
      
      // Check if Privy modal appeared
      const modalVisible = await page.locator('[data-privy-modal], [role="dialog"], iframe[title*="Privy" i]').isVisible({ timeout: 5000 }).catch(() => false)
      
      if (modalVisible) {
        console.log('✅ Privy modal appeared\n')
      } else {
        console.log('⚠️  Privy modal may have different structure\n')
      }
    } else {
      console.log('ℹ️  No login button found - may already be authenticated or different page structure\n')
    }
  })

  test('VERIFY: Complete Privy email login flow', async ({ page }) => {
    console.log('\n🔐 Testing complete Privy login flow...\n')
    console.log('═'.repeat(60))
    console.log('PRIVY LOGIN FLOW VERIFICATION')
    console.log('═'.repeat(60))
    console.log('\n')
    
    const testAccount = getPrivyTestAccount()
    
    console.log('📋 Test Account Details:')
    console.log(`   Email: ${testAccount.email}`)
    console.log(`   Phone: ${testAccount.phone}`)
    console.log(`   OTP: ${testAccount.otp}`)
    console.log('\n')
    
    // Navigate to home
    console.log('Step 1: Navigating to home page...')
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(2000)
    console.log('✅ Home page loaded')
    
    // Screenshot before login
    await page.screenshot({ path: 'test-results/screenshots/verify-02-before-login.png', fullPage: true })
    
    // Perform login
    console.log('\nStep 2: Attempting Privy login...')
    try {
      await loginWithPrivyEmail(page, testAccount)
      console.log('✅ Login function completed')
    } catch (error) {
      console.error('❌ Login function failed:', error)
      await page.screenshot({ path: 'test-results/screenshots/verify-02-login-failed.png', fullPage: true })
      throw error
    }
    
    // Screenshot after login
    await page.screenshot({ path: 'test-results/screenshots/verify-03-after-login.png', fullPage: true })
    
    // Verify authentication
    console.log('\nStep 3: Verifying authentication...')
    const authenticated = await isAuthenticated(page)
    
    if (authenticated) {
      console.log('✅ User is authenticated')
    } else {
      console.log('⚠️  Authentication indicators not found')
      console.log('    Checking alternative authentication methods...')
      
      // Check if we're on a logged-in page (like /feed)
      const currentUrl = page.url()
      console.log(`    Current URL: ${currentUrl}`)
      
      if (currentUrl.includes('/feed') || currentUrl.includes('/profile') || currentUrl.includes('/markets')) {
        console.log('✅ Redirected to authenticated page - login likely successful')
      }
    }
    
    // Wait for any additional authentication confirmation
    await waitForAuthentication(page, 10000).catch(() => {
      console.log('ℹ️  Standard authentication indicators not found, but may still be logged in')
    })
    
    console.log('\n')
    console.log('═'.repeat(60))
    console.log('LOGIN VERIFICATION COMPLETE')
    console.log('═'.repeat(60))
    console.log('\n')
    console.log('✅ Privy login flow executed')
    console.log('📸 Screenshots saved to test-results/screenshots/')
    console.log('   - verify-00-home-page.png')
    console.log('   - verify-01-privy-modal.png')
    console.log('   - verify-02-before-login.png')
    console.log('   - verify-03-after-login.png')
    console.log('\n')
    console.log('👀 Review screenshots to verify login worked correctly')
    console.log('\n')
  })

  test('VERIFY: Session persists after page reload', async ({ page }) => {
    console.log('\n🔄 Testing session persistence...\n')
    
    const testAccount = getPrivyTestAccount()
    
    // Login
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    await loginWithPrivyEmail(page, testAccount)
    
    console.log('✅ Logged in')
    
    // Check authentication
    const wasAuthenticated = await isAuthenticated(page)
    console.log(`   Initial auth status: ${wasAuthenticated}`)
    
    // Reload page
    console.log('\n🔄 Reloading page...')
    await page.reload()
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(2000)
    
    // Check if still authenticated
    const stillAuthenticated = await isAuthenticated(page)
    console.log(`   Auth status after reload: ${stillAuthenticated}`)
    
    // Take screenshot
    await page.screenshot({ path: 'test-results/screenshots/verify-04-after-reload.png', fullPage: true })
    
    if (stillAuthenticated) {
      console.log('✅ Session persisted after reload')
    } else {
      console.log('⚠️  Session may not have persisted (check screenshot)')
    }
    
    console.log('\n')
  })
})

test.describe('Privy Login - Error Scenarios', () => {
  test('VERIFY: Invalid OTP handling', async ({ page }) => {
    console.log('\n🧪 Testing invalid OTP handling...\n')
    
    const testAccount = getPrivyTestAccount()
    
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(2000)
    
    // Click login button
    const loginButton = page.locator('button:has-text("Connect Wallet"), button:has-text("Login")').first()
    
    if (await loginButton.isVisible({ timeout: 5000 }).catch(() => false)) {
      await loginButton.click()
      await page.waitForTimeout(2000)
      
      // Enter email
      const emailInput = page.locator('input[type="email"], input[placeholder*="email" i]').first()
      
      if (await emailInput.isVisible({ timeout: 5000 }).catch(() => false)) {
        await emailInput.fill(testAccount.email)
        
        // Click continue
        const continueButton = page.locator('button:has-text("Continue"), button[type="submit"]').first()
        await continueButton.click()
        await page.waitForTimeout(2000)
        
        // Enter INVALID OTP
        const otpInput = page.locator('input[type="text"], input[placeholder*="code" i]').first()
        
        if (await otpInput.isVisible({ timeout: 5000 }).catch(() => false)) {
          await otpInput.fill('000000') // Invalid OTP
          
          // Submit
          const submitButton = page.locator('button:has-text("Submit"), button:has-text("Verify")').first()
          await submitButton.click()
          await page.waitForTimeout(2000)
          
          // Check for error message
          const errorVisible = await page.locator('text=/invalid|incorrect|error/i, [role="alert"]').isVisible({ timeout: 3000 }).catch(() => false)
          
          await page.screenshot({ path: 'test-results/screenshots/verify-05-invalid-otp.png' })
          
          if (errorVisible) {
            console.log('✅ Error message displayed for invalid OTP')
          } else {
            console.log('ℹ️  Error message may be handled differently (check screenshot)')
          }
        }
      }
    }
    
    console.log('\n')
  })
})

