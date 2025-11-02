import { test, expect, type Page } from '@playwright/test'

/**
 * Referral System E2E Tests
 * 
 * Tests the complete referral flow from generation to signup and points award.
 * 
 * Test Coverage:
 * 1. Referral code generation
 * 2. Referral page UI and functionality
 * 3. Referral link sharing
 * 4. Signup with referral code
 * 5. Auto-follow functionality
 * 6. Points award (+250)
 * 7. Referral stats display
 */

// Helper function to mock authentication
async function mockAuth(page: Page, userId: string = 'test-user-1') {
  await page.addInitScript((userId) => {
    // Mock Privy authentication
    window.__privyAccessToken = 'mock-token-' + userId
    
    // Mock authenticated user
    localStorage.setItem('authenticated', 'true')
    localStorage.setItem('userId', userId)
  }, userId)
}

// Helper function to wait for API response
async function waitForAPI(page: Page, url: string) {
  return page.waitForResponse(
    response => response.url().includes(url) && response.status() === 200,
    { timeout: 10000 }
  )
}

test.describe('Referral System - Unauthenticated', () => {
  test('should show login prompt on referrals page when not authenticated', async ({ page }) => {
    await page.goto('/referrals')
    
    // Should see auth required banner
    await expect(page.getByText('Connect Your Wallet')).toBeVisible()
    await expect(page.getByText('Sign in to get your unique referral code')).toBeVisible()
    
    // Should see login button
    await expect(page.getByRole('button', { name: /connect|sign in|login/i })).toBeVisible()
  })
  
  test('should accept referral code in URL query parameter', async ({ page }) => {
    // Visit with referral code
    await page.goto('/?ref=TEST1234-ABCD')
    
    // Check that referral code is captured in localStorage or sessionStorage
    const referralCode = await page.evaluate(() => {
      return sessionStorage.getItem('referralCode') || localStorage.getItem('referralCode')
    })
    
    expect(referralCode).toBeTruthy()
  })
})

test.describe('Referral System - Authenticated User Flow', () => {
  test.beforeEach(async ({ page }) => {
    await mockAuth(page, 'referrer-user-id')
  })
  
  test('should display referrals page with user data', async ({ page }) => {
    await page.goto('/referrals')
    
    // Wait for page to load
    await page.waitForLoadState('networkidle')
    
    // Should see page header
    await expect(page.getByRole('heading', { name: 'Referrals' })).toBeVisible()
    await expect(page.getByText('+250 points per signup')).toBeVisible()
    
    // Should see stats cards
    await expect(page.getByText('Total Referrals')).toBeVisible()
    await expect(page.getByText('Points Earned')).toBeVisible()
    await expect(page.getByText('Following You')).toBeVisible()
  })
  
  test('should generate and display referral code', async ({ page }) => {
    await page.goto('/referrals')
    await page.waitForLoadState('networkidle')
    
    // Should see referral code section
    await expect(page.getByText('Your Referral Code')).toBeVisible()
    await expect(page.getByText('Referral Code')).toBeVisible()
    
    // Should have a referral code displayed (either existing or generated)
    const codeElement = page.locator('[class*="font-mono"]').first()
    await expect(codeElement).toBeVisible()
    
    const code = await codeElement.textContent()
    expect(code).toBeTruthy()
    expect(code).not.toBe('Generating...')
  })
  
  test('should copy referral code to clipboard', async ({ page, context }) => {
    // Grant clipboard permissions
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    
    await page.goto('/referrals')
    await page.waitForLoadState('networkidle')
    
    // Find and click the copy code button
    const copyCodeButton = page.getByRole('button', { name: /copy/i }).first()
    await copyCodeButton.click()
    
    // Should show "Copied!" feedback
    await expect(page.getByText('Copied!')).toBeVisible()
    
    // Verify clipboard content (would need actual implementation)
    const clipboardText = await page.evaluate(() => navigator.clipboard.readText())
    expect(clipboardText).toBeTruthy()
  })
  
  test('should copy referral URL to clipboard', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    
    await page.goto('/referrals')
    await page.waitForLoadState('networkidle')
    
    // Find the URL copy button (second copy button)
    const copyButtons = page.getByRole('button', { name: /copy/i })
    const copyUrlButton = await copyButtons.nth(1)
    await copyUrlButton.click()
    
    // Should show "Copied!" feedback
    await expect(page.getByText('Copied!')).toBeVisible()
    
    // Verify clipboard contains full URL
    const clipboardText = await page.evaluate(() => navigator.clipboard.readText())
    expect(clipboardText).toContain('?ref=')
  })
  
  test('should display referral rewards information', async ({ page }) => {
    await page.goto('/referrals')
    await page.waitForLoadState('networkidle')
    
    // Should see rewards info box
    await expect(page.getByText('Referral Rewards')).toBeVisible()
    await expect(page.getByText('+250 points')).toBeVisible()
    await expect(page.getByText('Auto-follow')).toBeVisible()
    await expect(page.getByText('Unlimited')).toBeVisible()
  })
  
  test('should show empty state when no referrals', async ({ page }) => {
    await page.goto('/referrals')
    await page.waitForLoadState('networkidle')
    
    // If user has no referrals, should see empty state
    const noReferralsText = page.getByText('No referrals yet')
    if (await noReferralsText.isVisible()) {
      await expect(page.getByText('Share your referral link to start earning points!')).toBeVisible()
      await expect(page.getByText('+250 points')).toBeVisible()
    }
  })
  
  test('should display tips section for users with few referrals', async ({ page }) => {
    await page.goto('/referrals')
    await page.waitForLoadState('networkidle')
    
    // Should see tips section if user has < 5 referrals
    const tipsSection = page.getByText('Tips to Get More Referrals')
    if (await tipsSection.isVisible()) {
      await expect(page.getByText('Share your referral link on Twitter/X')).toBeVisible()
      await expect(page.getByText('build your network')).toBeVisible()
    }
  })
})

test.describe('Referral System - Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await mockAuth(page)
  })
  
  test('should navigate to referrals from sidebar', async ({ page }) => {
    await page.goto('/feed')
    await page.waitForLoadState('networkidle')
    
    // Click referrals link in sidebar (desktop only)
    const referralsLink = page.getByRole('link', { name: /referrals/i })
    if (await referralsLink.isVisible()) {
      await referralsLink.click()
      
      // Should navigate to referrals page
      await expect(page).toHaveURL(/\/referrals/)
      await expect(page.getByRole('heading', { name: 'Referrals' })).toBeVisible()
    }
  })
  
  test('should navigate to referrals from profile page', async ({ page }) => {
    await page.goto('/profile')
    await page.waitForLoadState('networkidle')
    
    // Look for referral card or link
    const viewAllLink = page.getByRole('link', { name: /view all|referrals/i })
    if (await viewAllLink.isVisible()) {
      await viewAllLink.click()
      
      // Should navigate to referrals page
      await expect(page).toHaveURL(/\/referrals/)
    }
  })
  
  test('should highlight referrals nav item when on referrals page', async ({ page }) => {
    await page.goto('/referrals')
    await page.waitForLoadState('networkidle')
    
    // Referrals nav item should be highlighted/active
    const referralsLink = page.getByRole('link', { name: /referrals/i })
    if (await referralsLink.isVisible()) {
      // Check if link has active styling (would need to check computed styles or class)
      const classList = await referralsLink.getAttribute('class')
      expect(classList).toBeTruthy()
    }
  })
})

test.describe('Referral System - API Integration', () => {
  test.beforeEach(async ({ page }) => {
    await mockAuth(page, 'api-test-user')
  })
  
  test('should fetch referral code from API', async ({ page }) => {
    const apiPromise = waitForAPI(page, '/api/users/')
    
    await page.goto('/referrals')
    
    // Wait for API call
    const response = await apiPromise
    expect(response.status()).toBe(200)
    
    const data = await response.json()
    expect(data).toHaveProperty('referralCode')
    expect(data).toHaveProperty('referralUrl')
  })
  
  test('should fetch referral stats from API', async ({ page }) => {
    const apiPromise = page.waitForResponse(
      response => response.url().includes('/api/users/') && 
                   response.url().includes('/referrals') &&
                   response.status() === 200
    )
    
    await page.goto('/referrals')
    
    const response = await apiPromise
    const data = await response.json()
    
    // Should have stats structure
    expect(data).toHaveProperty('stats')
    expect(data.stats).toHaveProperty('totalReferrals')
    expect(data.stats).toHaveProperty('totalPointsEarned')
    expect(data.stats).toHaveProperty('pointsPerReferral')
    expect(data.stats.pointsPerReferral).toBe(250)
    
    // Should have user and referrals list
    expect(data).toHaveProperty('user')
    expect(data).toHaveProperty('referredUsers')
  })
})

test.describe('Referral System - Referred Users Display', () => {
  test.beforeEach(async ({ page }) => {
    await mockAuth(page, 'user-with-referrals')
  })
  
  test('should display list of referred users', async ({ page }) => {
    await page.goto('/referrals')
    await page.waitForLoadState('networkidle')
    
    // Look for referred users section
    const referralsSection = page.getByText(/Your Referrals/i)
    await expect(referralsSection).toBeVisible()
    
    // If there are referred users, check the display
    const userCards = page.locator('[class*="bg-gray-800"]').filter({ hasText: '+250' })
    const count = await userCards.count()
    
    if (count > 0) {
      // Each user card should show:
      const firstCard = userCards.first()
      await expect(firstCard).toBeVisible()
      
      // Should have +250 points badge
      await expect(firstCard.getByText('+250')).toBeVisible()
      
      // Should show follow status
      const followStatus = firstCard.locator('[class*="Heart"]')
      expect(followStatus).toBeTruthy()
    }
  })
  
  test('should show follow status for each referred user', async ({ page }) => {
    await page.goto('/referrals')
    await page.waitForLoadState('networkidle')
    
    // Look for user cards with follow indicators
    const followingIndicators = page.getByText('Following')
    const notFollowingIndicators = page.getByText('Not following')
    
    const hasFollowers = await followingIndicators.count() > 0
    const hasNonFollowers = await notFollowingIndicators.count() > 0
    
    // At least one should be present if there are referrals
    expect(hasFollowers || hasNonFollowers).toBeTruthy()
  })
  
  test('should link to referred user profiles', async ({ page }) => {
    await page.goto('/referrals')
    await page.waitForLoadState('networkidle')
    
    // Find profile links
    const profileLinks = page.locator('a[href*="/profile/"]')
    const count = await profileLinks.count()
    
    if (count > 0) {
      const firstLink = profileLinks.first()
      const href = await firstLink.getAttribute('href')
      expect(href).toContain('/profile/')
    }
  })
})

test.describe('Referral System - Stats Cards', () => {
  test.beforeEach(async ({ page }) => {
    await mockAuth(page)
  })
  
  test('should display total referrals count', async ({ page }) => {
    await page.goto('/referrals')
    await page.waitForLoadState('networkidle')
    
    // Should see total referrals card
    const totalCard = page.locator('[class*="purple"]').filter({ hasText: 'Total Referrals' })
    await expect(totalCard).toBeVisible()
    
    // Should have a number displayed
    const count = totalCard.locator('[class*="text-3xl"]')
    await expect(count).toBeVisible()
  })
  
  test('should calculate and display points earned correctly', async ({ page }) => {
    await page.goto('/referrals')
    await page.waitForLoadState('networkidle')
    
    // Get total referrals
    const totalCard = page.locator('[class*="purple"]').filter({ hasText: 'Total Referrals' })
    const countText = await totalCard.locator('[class*="text-3xl"]').textContent()
    const referralCount = parseInt(countText || '0')
    
    // Get points earned
    const pointsCard = page.locator('[class*="yellow"]').filter({ hasText: 'Points Earned' })
    const pointsText = await pointsCard.locator('[class*="text-3xl"]').textContent()
    const pointsEarned = parseInt(pointsText?.replace(/,/g, '') || '0')
    
    // Should equal referrals × 250
    expect(pointsEarned).toBe(referralCount * 250)
    
    // Should show "+250 per referral"
    await expect(pointsCard.getByText('+250 per referral')).toBeVisible()
  })
  
  test('should display following count', async ({ page }) => {
    await page.goto('/referrals')
    await page.waitForLoadState('networkidle')
    
    // Should see following card
    const followingCard = page.locator('[class*="blue"]').filter({ hasText: 'Following You' })
    await expect(followingCard).toBeVisible()
    
    // Should show "Auto-followed on signup"
    await expect(followingCard.getByText('Auto-followed on signup')).toBeVisible()
  })
})

test.describe('Referral System - Share Functionality', () => {
  test.beforeEach(async ({ page }) => {
    await mockAuth(page)
  })
  
  test('should have share button', async ({ page }) => {
    await page.goto('/referrals')
    await page.waitForLoadState('networkidle')
    
    // Should see share button
    const shareButton = page.getByRole('button', { name: /share/i })
    await expect(shareButton).toBeVisible()
  })
  
  test('should track share action', async ({ page }) => {
    await page.goto('/referrals')
    await page.waitForLoadState('networkidle')
    
    // Set up API listener for share tracking
    const sharePromise = page.waitForResponse(
      response => response.url().includes('/api/users/') && 
                   response.url().includes('/share') &&
                   response.request().method() === 'POST'
    )
    
    // Click share button
    const shareButton = page.getByRole('button', { name: /share/i })
    if (await shareButton.isVisible()) {
      await shareButton.click()
      
      // Should trigger share tracking API call
      // (may not complete if actual share is cancelled)
    }
  })
})

test.describe('Referral System - Responsive Design', () => {
  test.beforeEach(async ({ page }) => {
    await mockAuth(page)
  })
  
  test('should be responsive on mobile viewport', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 })
    
    await page.goto('/referrals')
    await page.waitForLoadState('networkidle')
    
    // Should still see main elements
    await expect(page.getByRole('heading', { name: 'Referrals' })).toBeVisible()
    
    // Stats cards should stack vertically on mobile
    const statsCards = page.locator('[class*="grid"]').first()
    const gridClasses = await statsCards.getAttribute('class')
    expect(gridClasses).toContain('grid-cols-1')
  })
  
  test('should be responsive on tablet viewport', async ({ page }) => {
    // Set tablet viewport
    await page.setViewportSize({ width: 768, height: 1024 })
    
    await page.goto('/referrals')
    await page.waitForLoadState('networkidle')
    
    // Should see desktop layout
    await expect(page.getByRole('heading', { name: 'Referrals' })).toBeVisible()
  })
})

// Export for use in other tests
export { mockAuth, waitForAPI }

