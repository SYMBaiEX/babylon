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
 * Login with Privy email authentication
 */
export async function loginWithPrivyEmail(page: Page, account: PrivyTestAccount): Promise<void> {
  console.log('🔄 Starting Privy login flow...')
  // Wait for Privy to be available
  await page.waitForTimeout(2000)

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
