/**
 * Privy authentication helpers for synpress tests
 */

import type { Page } from '@playwright/test'

export interface PrivyTestAccount {
  email: string
  password?: string
  phone?: string
  otp?: string
}

/**
 * Get Privy test account credentials from environment
 */
export function getPrivyTestAccount(): PrivyTestAccount {
  const email = process.env.PRIVY_TEST_EMAIL || 'test@example.com'
  const password = process.env.PRIVY_TEST_PASSWORD
  const phone = process.env.PRIVY_TEST_PHONE
  const otp = process.env.PRIVY_TEST_OTP

  if (!email) {
    throw new Error('PRIVY_TEST_EMAIL environment variable is required for synpress tests')
  }

  console.log(`📧 Privy test credentials loaded for: ${email}`)

  return {
    email,
    password,
    phone,
    otp,
  }
}

/**
 * Wait for Privy SDK to be initialized and ready
 * 
 * @description Waits for Privy SDK to be loaded and ready before attempting authentication.
 * Verifies that PrivyProvider is rendered (not the fallback UI) and that the SDK
 * has finished initializing. This is critical because Privy SDK must be ready before
 * any authentication UI interactions can succeed.
 */
async function waitForPrivyReady(page: Page, timeout = 45000): Promise<void> {
  console.log('⏳ Waiting for Privy SDK to initialize...')
  
  const startTime = Date.now()
  
  try {
    // First, check if our debug warning banner is visible (indicates Privy not configured)
    const warningBanner = page.locator('[data-testid="privy-not-configured-warning"]').first()
    const warningVisible = await warningBanner.isVisible({ timeout: 2000 }).catch(() => false)
    
    if (warningVisible) {
      throw new Error(
        'Privy not configured: The app shows the "Privy not configured" warning banner.\n' +
        'This means NEXT_PUBLIC_PRIVY_APP_ID was not set when the app was built.\n' +
        '\n' +
        'To fix this in CI:\n' +
        '1. Go to GitHub repository → Settings → Secrets and variables → Actions\n' +
        '2. Add/verify repository secret: NEXT_PUBLIC_PRIVY_APP_ID (or PRIVY_APP_ID)\n' +
        '3. Ensure the secret value is your Privy App ID (starts with "cl...")\n' +
        '4. Re-run the workflow after adding the secret'
      )
    }
    
    // Check for Privy-specific DOM elements
    const privyRoot = page.locator('[data-privy-root]').first()
    const privyRootVisible = await privyRoot.isVisible({ timeout: 5000 }).catch(() => false)
    
    if (!privyRootVisible) {
      // Check if we're in the fallback UI (no PrivyProvider)
      const hasPrivyConfig = await page.evaluate(() => {
        // Check if window has Privy SDK
        return typeof window !== 'undefined' && typeof (window as { privy?: unknown }).privy !== 'undefined'
      }).catch(() => false)
      
      if (!hasPrivyConfig) {
        // Get page content for additional debugging
        const pageTitle = await page.title().catch(() => 'unknown')
        const hasLoginButton = await page.locator('button:has-text("Log in"), button:has-text("Connect")').first().isVisible({ timeout: 1000 }).catch(() => false)
        
        throw new Error(
          'PrivyProvider not rendered - NEXT_PUBLIC_PRIVY_APP_ID was likely not set during build.\n' +
          `Page title: ${pageTitle}\n` +
          `Login button visible: ${hasLoginButton}\n` +
          '\n' +
          'This usually means the GitHub secret is missing or empty. Check:\n' +
          '1. Repository Settings → Secrets → Actions → NEXT_PUBLIC_PRIVY_APP_ID exists\n' +
          '2. The secret value is not empty and starts with "cl..."\n' +
          '3. If using environment secrets, ensure they apply to this workflow'
        )
      }
    }
    
    // Wait for Privy SDK to be available and ready
    // IMPORTANT: Only return true when window.privy.ready is explicitly true
    // Do NOT use script tag presence as a fallback - it's misleading
    await page.waitForFunction(
      () => {
        // Check if Privy SDK is loaded and ready
        if (typeof window === 'undefined') {
          return false
        }
        
        // Check for Privy SDK on window object
        const privy = (window as { privy?: { ready?: boolean } }).privy
        
        // Only return true when SDK is fully ready
        // The script tag existing doesn't mean the SDK is ready to use
        return privy?.ready === true
      },
      { timeout, polling: 500 }
    )
    
    const elapsed = Date.now() - startTime
    console.log(`✅ Privy SDK is ready (took ${elapsed}ms)`)
  } catch (error) {
    const elapsed = Date.now() - startTime
    
    // Gather debugging information
    const debugInfo = await page.evaluate(() => {
      const info: Record<string, unknown> = {
        hasWindow: typeof window !== 'undefined',
        hasPrivy: typeof (window as { privy?: unknown }).privy !== 'undefined',
        privyReady: (window as { privy?: { ready?: boolean } }).privy?.ready,
        privyScriptExists: document.querySelector('script[src*="privy"]') !== null,
        privyScriptSrc: document.querySelector('script[src*="privy"]')?.getAttribute('src') || 'not found',
      }
      return info
    }).catch(() => ({ error: 'Could not gather debug info' }))
    
    throw new Error(
      `Privy SDK failed to initialize after ${elapsed}ms: ${error instanceof Error ? error.message : String(error)}\n` +
      `Debug info: ${JSON.stringify(debugInfo, null, 2)}\n` +
      `This usually means:\n` +
      `1. NEXT_PUBLIC_PRIVY_APP_ID was not set during build (check CI workflow)\n` +
      `2. Privy SDK script failed to load (check for 404 errors)\n` +
      `3. Network issues preventing Privy API calls`
    )
  }
}

/**
 * Login with Privy email authentication
 */
export async function loginWithPrivyEmail(page: Page, account: PrivyTestAccount): Promise<void> {
  console.log('🔄 Starting Privy login flow...')
  
  // CRITICAL: Wait for Privy SDK to be ready before attempting any UI interactions
  // This ensures the SDK has finished initializing and authentication UI is available
  await waitForPrivyReady(page)

  // Check if already logged in
  // Use exact testId or text that only appears when logged in (UserMenu has data-testid="user-menu")
  // Avoid generic text like "Profile" which might appear in navigation
  const userMenu = page.locator('[data-testid="user-menu"]').first()
  const isLoggedIn = await userMenu.isVisible({ timeout: 3000 }).catch(() => false)
  
  if (isLoggedIn) {
    console.log('✅ User already logged in, skipping login flow')
    return
  } else {
    console.log('ℹ️ User not logged in, proceeding with login')
  }

  // Check if email input is already visible (modal already open)
  const emailInput = page.locator('input[type="email"], input[name="email"]').first()
  let emailInputVisible = await emailInput.isVisible({ timeout: 2000 }).catch(() => false)
  console.log(`ℹ️ Email input visible initially: ${emailInputVisible}`)

  if (!emailInputVisible) {
    // Look for Privy login button or modal
    const loginButton = page.locator('button:has-text("Log in"), button:has-text("Sign in"), button:has-text("Connect Wallet"), [data-testid="privy-login"]').first()
    
    // Check if enabled
    const isEnabled = await loginButton.isEnabled({ timeout: 2000 }).catch(() => false)
    console.log(`ℹ️ Login button found and enabled: ${isEnabled}`)

    const isVisible = await loginButton.isVisible({ timeout: 5000 }).catch(() => false)
    console.log(`ℹ️ Login button visible: ${isVisible}`)
    
    if (isVisible) {
      // Try to click, but handle potential overlays
      try {
        console.log('🖱️ Clicking login button...')
        // Force click if it's disabled or covered
        await loginButton.click({ timeout: 5000, force: true })
      } catch (e) {
        console.log('⚠️  Click on login button failed, checking if modal is already open or blocked:', e)
      }
      await page.waitForTimeout(1000)
      
      // Re-check email input
      emailInputVisible = await emailInput.isVisible({ timeout: 5000 }).catch(() => false)
      console.log(`ℹ️ Email input visible after click: ${emailInputVisible}`)
    }
  }
  
  if (emailInputVisible) {
      console.log(`⌨️ Filling email: ${account.email}`)
      await emailInput.fill(account.email)
      await page.waitForTimeout(500)

      // Find the modal context from the email input
      // This ensures we target the button INSIDE the modal, not the background "Log in" button
      const modalContext = emailInput.locator('xpath=ancestor::*[contains(@class, "Dialog") or @role="dialog"][1]')
      
      let submitButton
      if (await modalContext.isVisible().catch(() => false)) {
        // Look for submit button inside the modal
        submitButton = modalContext.locator('button[type="submit"]').first()
        if (!(await submitButton.isVisible().catch(() => false))) {
           submitButton = modalContext.locator('button').filter({ hasText: /Continue|Log in|Submit/i }).first()
        }
      } else {
        // Fallback: look for any visible submit button
        submitButton = page.locator('button[type="submit"]').first()
      }

      if (await submitButton.isVisible().catch(() => false)) {
        console.log('🖱️ Clicking submit button')
        await submitButton.click()
      } else {
        console.warn('⚠️  Could not find submit button for login form')
        // Only use loose text matching as a last resort, and try to avoid the header button
        // The header button usually has "Connect Wallet" or "Log in"
        // The modal button usually has "Continue" or "Submit"
        await page.locator('button:has-text("Continue")').first().click()
      }
      
      await page.waitForTimeout(2000)

      // If password is required
      if (account.password) {
        const passwordInput = page.locator('input[type="password"]').first()
        const passwordVisible = await passwordInput.isVisible({ timeout: 5000 }).catch(() => false)
        
        if (passwordVisible) {
          console.log('⌨️ Filling password')
          await passwordInput.fill(account.password)
          await page.waitForTimeout(500)
          
          const submitButton = page.locator('button[type="submit"]').first()
          await submitButton.click()
          await page.waitForTimeout(2000)
        }
      }

      // If OTP is required or requested
      // Check for OTP screen by text or input
      const otpText = page.getByText('Enter confirmation code').first()
      const otpInput = page.locator('input[autocomplete="one-time-code"], input[name="code"], input[name="otp"], input[data-privy-otp-input]').first()
      
      const isOtpScreen = await otpText.isVisible({ timeout: 5000 }).catch(() => false) || 
                          await otpInput.isVisible({ timeout: 1000 }).catch(() => false)

      if (isOtpScreen) {
        console.log('ℹ️ OTP screen detected')
        const code = account.otp || '000000' // Default to 000000 if not provided
        
        console.log(`⌨️ Filling OTP: ${code}`)
        // Privy often uses 6 separate inputs or one input. 
        // Best strategy is to focus the input and type the code
        
        if (await otpInput.isVisible()) {
            await otpInput.click() // Focus
            await page.waitForTimeout(100)
            await page.keyboard.type(code)
        } else {
            // Try typing blindly if input is hidden/custom
            await page.keyboard.type(code)
        }
        await page.waitForTimeout(1000)
        
        // Check for error message
        const errorMsg = page.getByText('Invalid code').first()
        if (await errorMsg.isVisible().catch(() => false)) {
            console.error('❌ Invalid OTP code detected')
        }
        
        // Click verify if button exists (sometimes auto-submits)
        // Be specific to avoid clicking "Resend code"
        const verifyButton = page.locator('button:has-text("Verify"), button[type="submit"]').first()
        if (await verifyButton.isVisible()) {
             await verifyButton.click()
        }
        await page.waitForTimeout(2000)
      }
    } else {
    // Check if already logged in (re-check)
    const userMenu = page.locator('[data-testid="user-menu"], button:has-text("Profile")').first()
    const isLoggedIn = await userMenu.isVisible({ timeout: 3000 }).catch(() => false)
    
    if (!isLoggedIn) {
      console.warn('⚠️  Could not find login button - user may already be logged in or Privy UI has changed')
    }
  }

  // Wait for authentication to complete
  await page.waitForTimeout(2000)

  // Verify authentication success
  const userMenuFinal = page.locator('[data-testid="user-menu"]').first()
  const isAuthenticated = await userMenuFinal.isVisible({ timeout: 5000 }).catch(() => false)
  
  if (isAuthenticated) {
     console.log('✅ Privy authentication successful')
  } else {
     console.warn('⚠️ Privy authentication verification failed - user menu not visible')
  }
}
