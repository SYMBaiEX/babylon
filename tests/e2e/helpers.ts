import { type Page } from '@playwright/test'

/**
 * Get Privy test account credentials from environment
 */
export function getPrivyTestAccount() {
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
export async function authenticateWithPrivy(page: Page) {
  const { email, password } = getPrivyTestAccount()
  
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
  const emailInput = page.locator('input[type="email"], input[name="email"], input[placeholder*="email" i]').first()
  const isLoginModalOpen = await emailInput.isVisible({ timeout: 5000 }).catch(() => false)

  if (!isLoginModalOpen) {
    // Click login button
    const loginButtonVisible = await loginButton.isVisible({ timeout: 15000 }).catch(() => false)
    if (!loginButtonVisible) {
      throw new Error('Could not find login button on page')
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
    const hasUserMenu = document.querySelector('[data-testid="user-menu"]') !== null;
    const hasAriaLabel = document.querySelector('[aria-label*="user menu"]') !== null;
    
    const buttons = Array.from(document.querySelectorAll('button'));
    const hasProfileButton = buttons.some(b => b.textContent?.includes('Profile'));
    
    const hasPrivyToken = window.localStorage.getItem('privy:token') !== null;
    const hasPrivyKeys = Object.keys(window.localStorage).some(key => key.startsWith('privy:'));
    
    return hasUserMenu || hasAriaLabel || hasProfileButton || hasPrivyToken || hasPrivyKeys;
  }, { timeout: 15000 })

  console.log('✅ Authentication successful')
}

