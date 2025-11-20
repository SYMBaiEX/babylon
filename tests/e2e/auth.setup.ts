/**
 * Playwright Authentication Setup
 *
 * This setup file handles authentication for E2E tests that require admin access.
 * It creates an authenticated state that can be reused across tests.
 *
 * Following Playwright 2025 best practices:
 * - Authenticate once in setup project
 * - Save authentication state to file
 * - Reuse state in all tests via storageState config
 *
 * @see https://playwright.dev/docs/auth
 */

import { test as setup } from '@playwright/test'
import path from 'path'
import type { Page } from '@playwright/test'

const authFile = path.join(__dirname, '../../.playwright/auth.json')

/**
 * Get Privy test account credentials from environment
 */
function getPrivyTestAccount() {
  const email = process.env.PRIVY_TEST_EMAIL
  const password = process.env.PRIVY_TEST_PASSWORD

  if (!email) {
    throw new Error('PRIVY_TEST_EMAIL environment variable is required for E2E tests')
  }

  return { email, password }
}

/**
 * Authenticate with Privy and wait for successful login
 */
async function authenticateWithPrivy(page: Page, email: string, password: string | undefined) {
  // Navigate to home page
  await page.goto('/')

  // Wait for page to load
  await page.waitForLoadState('networkidle')

  // Look for login button - Privy typically uses these patterns
  const loginButton = page.locator('button:has-text("Log in"), button:has-text("Sign in"), button:has-text("Login"), button:has-text("Connect")').first()

  // Check if already logged in by looking for user menu
  const userMenu = page.locator('[data-testid="user-menu"], button:has-text("Profile"), [aria-label*="user menu"]').first()
  const isAlreadyLoggedIn = await userMenu.isVisible({ timeout: 2000 }).catch(() => false)

  if (isAlreadyLoggedIn) {
    console.log('✅ Already authenticated - skipping login flow')
    return
  }

  // Check if login modal is already open (email input visible)
  // Increase timeout to allow for Privy SDK to initialize (can take a few seconds)
  const emailInput = page.locator('input[type="email"], input[name="email"], input[placeholder*="email" i]').first()
  const isLoginModalOpen = await emailInput.isVisible({ timeout: 5000 }).catch(() => false)

  if (!isLoginModalOpen) {
    // Click login button
    // Wait longer for the button to appear (Privy initialization takes time)
    const loginButtonVisible = await loginButton.isVisible({ timeout: 15000 }).catch(() => false)
    if (!loginButtonVisible) {
      throw new Error('Could not find login button on page (or Privy failed to initialize)')
    }

    // Force click if necessary or retry
    try {
      await loginButton.click({ timeout: 5000 })
    } catch (e) {
      console.log('⚠️  Normal click failed, trying force click...', e)
      await loginButton.click({ force: true })
    }
    await page.waitForTimeout(1000)
  } else {
    console.log('ℹ️  Login modal already open')
  }

  // Fill in email
  await emailInput.waitFor({ state: 'visible', timeout: 10000 })
  await emailInput.fill(email)
  await page.waitForTimeout(500)

  // Click continue/submit
  // Use .last() to target the button in the modal (which is usually appended last in the DOM)
  const continueButton = page.locator('button:has-text("Continue"), button:has-text("Log in"), button:has-text("Submit"), button[type="submit"]')
    .filter({ hasText: /Continue|Log in|Submit/ })
    .last();
  
  await continueButton.click()
  await page.waitForTimeout(2000)

  // If password is required, fill it in
  if (password) {
    const passwordInput = page.locator('input[type="password"]').first()
    const passwordVisible = await passwordInput.isVisible({ timeout: 5000 }).catch(() => false)

    if (passwordVisible) {
      await passwordInput.fill(password)
      await page.waitForTimeout(500)

      const submitButton = page.locator('button:has-text("Log in"), button:has-text("Sign in"), button[type="submit"]').first()
      await submitButton.click()
      await page.waitForTimeout(2000)
    }
  }

  // Wait for successful authentication by checking for user menu or authenticated state
  // On localhost, admin middleware allows any authenticated user to access admin routes
  await page.waitForFunction(() => {
    // Check for common authentication indicators
    const hasUserMenu = document.querySelector('[data-testid="user-menu"]') !== null;
    const hasAriaLabel = document.querySelector('[aria-label*="user menu"]') !== null;
    
    // Check for profile button (standard DOM way)
    const buttons = Array.from(document.querySelectorAll('button'));
    const hasProfileButton = buttons.some(b => b.textContent?.includes('Profile'));
    
    // Check localStorage for Privy auth tokens
    const hasPrivyToken = window.localStorage.getItem('privy:token') !== null;
    const hasPrivyKeys = Object.keys(window.localStorage).some(key => key.startsWith('privy:'));
    
    return hasUserMenu || hasAriaLabel || hasProfileButton || hasPrivyToken || hasPrivyKeys;
  }, { timeout: 15000 })

  console.log('✅ Authentication successful')
}

/**
 * Setup: Authenticate as admin
 *
 * This runs once before all tests in projects that depend on it.
 * The authenticated state is saved to .playwright/auth.json and reused.
 */
setup('authenticate as admin', async ({ page }) => {
  const { email, password } = getPrivyTestAccount()

  console.log(`🔐 Authenticating with email: ${email}`)

  try {
    await authenticateWithPrivy(page, email, password)

    // Wait a bit for all auth cookies/localStorage to be set
    await page.waitForTimeout(2000)

    // Verify we can access admin page
    await page.goto('/admin')
    await page.waitForLoadState('networkidle')

    // Check that we're not redirected away (which would happen if not authenticated)
    const currentUrl = page.url()
    if (!currentUrl.includes('/admin')) {
      throw new Error(`Authentication failed: redirected to ${currentUrl} instead of /admin`)
    }

    // Wait for admin dashboard to load - either the test ID or admin content
    await Promise.race([
      page.waitForSelector('[data-testid="admin-dashboard"]', { timeout: 10000 }),
      page.waitForSelector('text=Admin', { timeout: 10000 })
    ]).catch(() => {
      // If neither appears, that's okay - we verified the URL didn't redirect
      console.log('⚠️  Admin dashboard elements not found, but URL is correct')
    })

    console.log('✅ Admin access verified')

    // Save authenticated state
    await page.context().storageState({ path: authFile })
    console.log(`💾 Authentication state saved to ${authFile}`)

  } catch (error) {
    console.error('❌ Authentication setup failed:', error)

    // Take a screenshot for debugging
    await page.screenshot({ path: '.playwright/auth-failure.png', fullPage: true })
    console.log('📸 Screenshot saved to .playwright/auth-failure.png')

    throw error
  }
})
