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
  console.log('🔄 Navigating to home page...')
  await page.goto('/')

  // Wait for page to load
  await page.waitForLoadState('networkidle')
  
  // Wait for either user menu (logged in) OR login button/input (not logged in)
  // We use a generous timeout because local dev server can be slow
  console.log('⏳ Waiting for auth UI elements...')
  const authElement = await Promise.race([
    page.waitForSelector('[data-testid="user-menu"]', { timeout: 20000 }).then(() => 'loggedin'),
    page.waitForSelector('button:has-text("Log in"), button:has-text("Sign in")', { timeout: 20000 }).then(() => 'login_button'),
    page.waitForSelector('input[type="email"]', { timeout: 20000 }).then(() => 'email_input')
  ]).catch((_) => {
    console.log('⚠️ Timeout waiting for auth elements')
    return 'timeout'
  })

  console.log(`ℹ️ Auth state detected: ${authElement}`)

  if (authElement === 'loggedin') {
    console.log('✅ Already authenticated - skipping login flow')
    return
  }

  if (authElement === 'login_button') {
    // Click login button
    const loginButton = page.locator('button:has-text("Log in"), button:has-text("Sign in")').first()
    await loginButton.click()
    // Wait for modal to appear
    await page.waitForSelector('input[type="email"]', { timeout: 10000 })
  }

  // At this point, email input should be visible (either found initially or after click)
  // Fill in email
  const emailInput = page.locator('input[type="email"]').first()
  await emailInput.fill(email)
  await page.waitForTimeout(500)

  // Click continue/submit
  const continueButton = page.locator('button:has-text("Continue"), button:has-text("Log in"), button:has-text("Submit")')
    .last(); // usually the one in modal
  
  await continueButton.click()
  await page.waitForTimeout(2000)

  // If password is required, fill it in
  if (password) {
    // Check if password input appears
    const passwordInput = page.locator('input[type="password"]').first()
    if (await passwordInput.isVisible({ timeout: 5000 }).catch(() => false)) {
      await passwordInput.fill(password)
      await page.waitForTimeout(500)

      const submitButton = page.locator('button:has-text("Log in"), button:has-text("Sign in")').first()
      await submitButton.click()
      await page.waitForTimeout(2000)
    }
  }

  // Wait for successful authentication
  console.log('⏳ Waiting for final authenticated state...')
  await page.waitForFunction(() => {
    const hasUserMenu = document.querySelector('[data-testid="user-menu"]') !== null;
    const hasPrivyToken = window.localStorage.getItem('privy:token') !== null;
    return hasUserMenu || hasPrivyToken;
  }, { timeout: 30000 })

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
    console.log('🔄 Verifying admin access...')
    await page.goto('/admin')
    await page.waitForLoadState('networkidle')

    // Check that we're not redirected away (which would happen if not authenticated)
    const currentUrl = page.url()
    if (!currentUrl.includes('/admin')) {
      throw new Error(`Authentication failed: redirected to ${currentUrl} instead of /admin`)
    }

    // Wait for admin dashboard to load
    await Promise.race([
      page.waitForSelector('[data-testid="admin-dashboard"]', { timeout: 10000 }),
      page.waitForSelector('h1:has-text("Admin")', { timeout: 10000 })
    ])

    console.log('✅ Admin access verified')

    // Save authenticated state
    await page.context().storageState({ path: authFile })
    console.log(`💾 Authentication state saved to ${authFile}`)

  } catch (error) {
    console.error('❌ Authentication setup failed:', error)
    await page.screenshot({ path: '.playwright/auth-failure.png', fullPage: true })
    throw error
  }
})
