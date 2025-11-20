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
  // Navigate to home page with dev mode forced to ensure app loads
  await page.goto('/?dev=true')

  // Wait for page to load completely (networkidle is better for SPAs than domcontentloaded)
  await page.waitForLoadState('networkidle')
  
  // Give React time to hydrate and render the modal
  await page.waitForTimeout(3000)

  // Check for authentication indicators first
  const isAlreadyLoggedIn = await page.evaluate(() => {
    const hasUserMenu = document.querySelector('[data-testid="user-menu"]') !== null;
    const hasProfile = Array.from(document.querySelectorAll('button')).some(b => b.textContent?.includes('Profile'));
    const hasToken = window.localStorage.getItem('privy:token') !== null;
    return (hasUserMenu || hasProfile) && hasToken;
  }).catch(() => false);

  if (isAlreadyLoggedIn) {
    console.log('✅ Already authenticated - skipping login flow')
    return
  }

  // Check for Coming Soon state which would prevent login
  const comingSoon = await page.locator('text=Coming Soon').isVisible().catch(() => false)
  if (comingSoon) {
    console.log('❌ Page is showing "Coming Soon" - localhost detection failed')
  }

  // Look for login button or modal input
  // Also look for the Sidebar "Connect Wallet" button as a fallback
  const sidebarLoginBtn = page.locator('button:has-text("Connect Wallet")').first()
  const loginButton = page.locator('button:has-text("Log in"), button:has-text("Sign in"), button:has-text("Login")').first()
  const emailInput = page.locator('input[type="email"], input[name="email"], input[placeholder*="email" i]').first()

  // Check if modal is ALREADY open
  let isLoginModalOpen = await emailInput.isVisible({ timeout: 2000 }).catch(() => false)

  if (!isLoginModalOpen) {
    // If sidebar login button is visible, click it to open modal
    if (await sidebarLoginBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        console.log('ℹ️  Clicking sidebar "Connect Wallet" button')
        await sidebarLoginBtn.click()
        await page.waitForTimeout(1000)
        isLoginModalOpen = await emailInput.isVisible({ timeout: 5000 }).catch(() => false)
    }
    
    // If still not open, try other login buttons
    if (!isLoginModalOpen) {
        const loginButtonVisible = await loginButton.isVisible({ timeout: 5000 }).catch(() => false)
    
        if (loginButtonVisible) {
        try {
            await loginButton.click({ timeout: 5000 })
        } catch (e) {
            console.log('⚠️  Normal click failed, trying force click...', e)
            await loginButton.click({ force: true })
        }
        await page.waitForTimeout(1000)
        isLoginModalOpen = await emailInput.isVisible({ timeout: 5000 }).catch(() => false)
        }
    }
  }

  if (!isLoginModalOpen) {
    // One last check if we missed the logged-in state
    const loggedInNow = await page.evaluate(() => {
        const hasUserMenu = document.querySelector('[data-testid="user-menu"]') !== null;
        return hasUserMenu;
    }).catch(() => false);

    if (loggedInNow) {
        console.log('✅ Logged in detected late')
        return;
    }
    
    // Debugging output
    const title = await page.title();
    const content = await page.content();
    console.log(`❌ Debug - Page Title: ${title}`);
    console.log(`❌ Debug - Page Content Start: ${content.substring(0, 200)}`);

    // On localhost, app should auto-open modal. If not, something is wrong.
    throw new Error('Could not find login button or open login modal on page')
  }

  // Fill in email
  await emailInput.fill(email)
  await page.waitForTimeout(500)

  // Click continue/submit
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

  // Wait for successful authentication
  await page.waitForFunction(() => {
    const hasAccessToken = (window as any).__privyAccessToken;
    if (hasAccessToken) return true;

    const hasUserMenu = document.querySelector('[data-testid="user-menu"]') !== null;
    const hasProfileButton = Array.from(document.querySelectorAll('button')).some(b => b.textContent?.includes('Profile'));
    const hasPrivyToken = window.localStorage.getItem('privy:token') !== null;
    
    return (hasUserMenu || hasProfileButton) && hasPrivyToken;
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
