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

import { test as setup, expect } from '@playwright/test'
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
  
  // Wait for Privy SDK to be loaded
  await page.waitForFunction(() => {
    return (window as any).privy !== undefined || 
           document.querySelector('script[src*="privy"]') !== null
  }, { timeout: 10000 }).catch(() => {
    console.log('⚠️  Privy SDK check timed out, continuing anyway')
  })
  
  // Wait for the login button to be enabled (not disabled)
  // This ensures Privy is ready and the button is clickable
  // The button is disabled when Privy's `ready` state is false
  console.log('⏳ Waiting for login button to be enabled (Privy ready)...')
  try {
    await page.waitForFunction(() => {
      const buttons = Array.from(document.querySelectorAll('button'))
      const loginBtn = buttons.find(btn => {
        const text = btn.textContent?.toLowerCase() || ''
        return (text.includes('connect wallet') || 
                text.includes('log in') || 
                text.includes('sign in'))
      })
      
      // Button exists and is NOT disabled (meaning Privy is ready)
      return loginBtn !== undefined && !(loginBtn as HTMLButtonElement).disabled
    }, { timeout: 15000 })
    console.log('✅ Login button is enabled (Privy ready)')
  } catch (e) {
    console.log('⚠️  Login button enabled check timed out, will try anyway')
  }
  
  // Give React time to hydrate and render components
  await page.waitForTimeout(2000)

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
  // Use comprehensive selectors matching synpress helper
  const emailInput = page.locator('input[type="email"], input[name="email"]').first()
  
  // Check if modal is ALREADY open
  let isLoginModalOpen = await emailInput.isVisible({ timeout: 2000 }).catch(() => false)
  console.log(`ℹ️ Email input visible initially: ${isLoginModalOpen}`)

  if (!isLoginModalOpen) {
    // Find login button - wait for it to be enabled (not disabled)
    // This ensures Privy is ready before we try to click
    console.log('🔍 Looking for enabled login button...')
    
    const loginButton = page.locator(
      'button:has-text("Log in"), button:has-text("Sign in"), button:has-text("Connect Wallet"), [data-testid="privy-login"]'
    ).first()
    
    // Wait for button to be visible AND enabled
    // The button is disabled when Privy's `ready` state is false
    try {
      await expect(loginButton).toBeVisible({ timeout: 10000 })
      console.log('✅ Login button is visible')
      
      // Wait for button to be enabled (Privy ready)
      await page.waitForFunction(() => {
        const buttons = Array.from(document.querySelectorAll('button'))
        const btn = buttons.find(b => {
          const text = b.textContent?.toLowerCase() || ''
          return (text.includes('connect wallet') || 
                  text.includes('log in') || 
                  text.includes('sign in'))
        })
        return btn !== null && !(btn as HTMLButtonElement).disabled
      }, { timeout: 10000 }).catch(() => {
        console.log('⚠️  Button enabled check timed out, will try clicking anyway')
      })
      
      console.log('🖱️ Clicking login button...')
      // Now click the button - it should be enabled
      await loginButton.click({ timeout: 5000 })
      await page.waitForTimeout(1500) // Wait for modal to open
      
      // Re-check email input after click
      isLoginModalOpen = await emailInput.isVisible({ timeout: 5000 }).catch(() => false)
      console.log(`ℹ️ Email input visible after click: ${isLoginModalOpen}`)
      
    } catch (e) {
      console.log('⚠️  Login button click failed, trying force click:', e)
      
      // Fallback: Try force click if normal click failed
      try {
        const isVisible = await loginButton.isVisible({ timeout: 5000 }).catch(() => false)
        if (isVisible) {
          await loginButton.click({ timeout: 5000, force: true })
          await page.waitForTimeout(1500)
          
          // Re-check email input after force click
          isLoginModalOpen = await emailInput.isVisible({ timeout: 5000 }).catch(() => false)
          console.log(`ℹ️ Email input visible after force click: ${isLoginModalOpen}`)
        }
      } catch (forceError) {
        console.log('⚠️  Force click also failed:', forceError)
        // Re-check in case modal opened despite error
        isLoginModalOpen = await emailInput.isVisible({ timeout: 2000 }).catch(() => false)
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
    
    // Additional debugging - check for Privy elements
    const privyElements = await page.evaluate(() => {
      const privyModal = document.querySelector('[data-privy-modal], [class*="privy"], [id*="privy"]');
      const allButtons = Array.from(document.querySelectorAll('button')).map(b => ({
        text: b.textContent?.trim(),
        visible: b.offsetParent !== null,
        enabled: !b.disabled
      }));
      return { hasPrivyModal: privyModal !== null, buttons: allButtons.slice(0, 10) };
    }).catch(() => ({ hasPrivyModal: false, buttons: [] }));
    
    // Debugging output
    const title = await page.title();
    const content = await page.content();
    console.log(`❌ Debug - Page Title: ${title}`);
    console.log(`❌ Debug - Page Content Start: ${content.substring(0, 200)}`);
    console.log(`❌ Debug - Privy modal found: ${privyElements.hasPrivyModal}`);
    console.log(`❌ Debug - First 10 buttons:`, JSON.stringify(privyElements.buttons, null, 2));

    // On localhost, app should auto-open modal. If not, something is wrong.
    throw new Error('Could not find login button or open login modal on page')
  }

  // Fill in email
  console.log(`⌨️ Filling email: ${email}`)
  await emailInput.fill(email)
  await page.waitForTimeout(500)

  // Find the modal context from the email input to ensure we target the button INSIDE the modal
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
    console.log('⚠️  Submit button not found in modal, trying fallback')
    // Fallback: try to find Continue button
    await page.locator('button:has-text("Continue")').first().click()
  }
  
  await page.waitForTimeout(2000)

  // If password is required, fill it in
  if (password) {
    const passwordInput = page.locator('input[type="password"]').first()
    const passwordVisible = await passwordInput.isVisible({ timeout: 5000 }).catch(() => false)

    if (passwordVisible) {
      console.log('⌨️ Filling password')
      await passwordInput.fill(password)
      await page.waitForTimeout(500)

      const submitButton = page.locator('button[type="submit"]').first()
      await submitButton.click()
      await page.waitForTimeout(2000)
    }
  }

  // Check for OTP screen (if required)
  const otpText = page.getByText('Enter confirmation code').first()
  const otpInput = page.locator('input[autocomplete="one-time-code"], input[name="code"], input[name="otp"], input[data-privy-otp-input]').first()
  
  const isOtpScreen = await otpText.isVisible({ timeout: 5000 }).catch(() => false) || 
                      await otpInput.isVisible({ timeout: 1000 }).catch(() => false)

  if (isOtpScreen) {
    console.log('ℹ️ OTP screen detected - authentication may require manual OTP entry')
    // Note: OTP codes are typically time-sensitive and can't be automated easily
    // Tests should use accounts that don't require OTP or handle it separately
  }

  // Wait for successful authentication using Playwright's recommended approach
  // Use expect().toBeVisible() which is more reliable than waitForFunction
  // This matches Playwright best practices for verification
  try {
    await expect(page.locator('[data-testid="user-menu"]')).toBeVisible({ timeout: 30000 })
    console.log('✅ Authentication successful - user menu visible')
  } catch (error) {
    // Fallback: check for Privy token in localStorage as secondary verification
    const hasToken = await page.evaluate(() => {
      return window.localStorage.getItem('privy:token') !== null ||
             (window as any).__privyAccessToken !== undefined
    })
    
    if (hasToken) {
      console.log('✅ Authentication successful - token found (user menu may not be visible yet)')
    } else {
      throw new Error('Authentication verification failed: no user menu and no token found')
    }
  }
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
    // Use Playwright's recommended pattern: wait for URL change OR specific element
    await page.goto('/admin')
    await page.waitForLoadState('networkidle')

    // Check that we're not redirected away (which would happen if not authenticated)
    // Use waitForURL for more reliable verification (Playwright best practice)
    try {
      await page.waitForURL('**/admin**', { timeout: 5000 })
      console.log('✅ Admin page URL verified')
    } catch {
      const currentUrl = page.url()
      if (!currentUrl.includes('/admin')) {
        throw new Error(`Authentication failed: redirected to ${currentUrl} instead of /admin`)
      }
    }

    // Wait for admin dashboard to load using expect() for better reliability
    // The admin page has a heading "Admin Dashboard" and tabs
    try {
      // Wait for the main heading which is always present when authorized
      await expect(page.getByRole('heading', { name: 'Admin Dashboard' })).toBeVisible({ timeout: 15000 })
      console.log('✅ Admin dashboard loaded')
    } catch (error) {
      // If heading doesn't appear, check if we were redirected or if page is still loading
      const currentUrl = page.url()
      if (!currentUrl.includes('/admin')) {
        throw new Error(`Admin access verification failed: redirected to ${currentUrl} instead of /admin`)
      }
      
      // Check if we see "Access Denied" which means auth worked but user isn't admin
      const accessDenied = await page.getByText('Access Denied').isVisible({ timeout: 2000 }).catch(() => false)
      if (accessDenied) {
        // On localhost, any authenticated user should have access
        const isLocalhost = currentUrl.includes('localhost') || currentUrl.includes('127.0.0.1')
        if (isLocalhost) {
          throw new Error('Admin access denied on localhost - this should not happen for authenticated users')
        }
        throw new Error('Admin access denied - user may not have admin privileges')
      }
      
      // If we're still on /admin but heading isn't visible, page might still be loading
      // Wait a bit more and check again
      await page.waitForTimeout(2000)
      const headingVisible = await page.getByRole('heading', { name: 'Admin Dashboard' }).isVisible({ timeout: 5000 }).catch(() => false)
      if (!headingVisible) {
        throw new Error(`Admin dashboard heading not found after extended wait. Error: ${error instanceof Error ? error.message : String(error)}`)
      }
      console.log('✅ Admin dashboard loaded (after extended wait)')
    }

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
