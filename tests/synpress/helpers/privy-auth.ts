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

  // Look for Privy login button or modal
  const loginButton = page.locator('button:has-text("Log in"), button:has-text("Sign in"), [data-testid="privy-login"]').first()
  
  const isVisible = await loginButton.isVisible({ timeout: 5000 }).catch(() => false)
  
  if (isVisible) {
    await loginButton.click()
    await page.waitForTimeout(1000)

    // Look for email input
    const emailInput = page.locator('input[type="email"], input[name="email"]').first()
    const emailInputVisible = await emailInput.isVisible({ timeout: 5000 }).catch(() => false)

    if (emailInputVisible) {
      await emailInput.fill(account.email)
      await page.waitForTimeout(500)

      // Look for continue/submit button
      const continueButton = page.locator('button:has-text("Continue"), button:has-text("Log in"), button[type="submit"]').first()
      await continueButton.click()
      await page.waitForTimeout(2000)

      // If password is required
      if (account.password) {
        const passwordInput = page.locator('input[type="password"]').first()
        const passwordVisible = await passwordInput.isVisible({ timeout: 5000 }).catch(() => false)
        
        if (passwordVisible) {
          await passwordInput.fill(account.password)
          await page.waitForTimeout(500)
          
          const submitButton = page.locator('button:has-text("Log in"), button[type="submit"]').first()
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
    }
  } else {
    // Check if already logged in
    const userMenu = page.locator('[data-testid="user-menu"], button:has-text("Profile")').first()
    const isLoggedIn = await userMenu.isVisible({ timeout: 3000 }).catch(() => false)
    
    if (!isLoggedIn) {
      console.warn('⚠️  Could not find login button - user may already be logged in or Privy UI has changed')
    }
  }

  // Wait for authentication to complete
  await page.waitForTimeout(2000)
}
