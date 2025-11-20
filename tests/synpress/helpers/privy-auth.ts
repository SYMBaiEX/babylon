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
  }

  // Check if email input is already visible (modal already open)
  const emailInput = page.locator('input[type="email"], input[name="email"]').first()
  let emailInputVisible = await emailInput.isVisible({ timeout: 2000 }).catch(() => false)

  if (!emailInputVisible) {
    // Look for Privy login button or modal
    const loginButton = page.locator('button:has-text("Log in"), button:has-text("Sign in"), button:has-text("Connect Wallet"), [data-testid="privy-login"]').first()
    
    const isVisible = await loginButton.isVisible({ timeout: 5000 }).catch(() => false)
    
    if (isVisible) {
      // Try to click, but handle potential overlays
      try {
        await loginButton.click({ timeout: 5000 })
      } catch (e) {
        console.log('⚠️  Click on login button failed, checking if modal is already open or blocked:', e)
        // Check if modal appeared anyway or if we need to handle an overlay
      }
      await page.waitForTimeout(1000)
      
      // Re-check email input
      emailInputVisible = await emailInput.isVisible({ timeout: 5000 }).catch(() => false)
    }
  }
  
  if (emailInputVisible) {
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
          await passwordInput.fill(account.password)
          await page.waitForTimeout(500)
          
          const submitButton = page.locator('button[type="submit"]').first()
          await submitButton.click()
          await page.waitForTimeout(2000)
        }
      }

      // If OTP is required
      if (account.otp) {
        const otpInput = page.locator('input[type="text"][maxlength="6"], input[name="otp"]').first()
        const otpVisible = await otpInput.isVisible({ timeout: 5000 }).catch(() => false)
        
        if (otpVisible) {
          await otpInput.fill(account.otp)
          await page.waitForTimeout(500)
          
          const verifyButton = page.locator('button:has-text("Verify"), button[type="submit"]').first()
          await verifyButton.click()
          await page.waitForTimeout(2000)
        }
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
