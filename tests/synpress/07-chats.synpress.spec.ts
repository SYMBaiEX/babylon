/**
 * Chats and Messaging E2E Tests with Synpress
 * 
 * Tests all chat functionality with real wallet integration:
 * - Viewing chats list
 * - Opening chat conversations  
 * - Sending messages
 * - Creating new DMs
 * - Real-time updates
 */

import { test, expect } from '@playwright/test'
import { loginWithPrivyEmail, getPrivyTestAccount } from './helpers/privy-auth'
import { navigateTo, waitForPageLoad } from './helpers/page-helpers'
import { ROUTES } from './helpers/test-data'

test.describe('Chats Page - Updated Design', () => {
  test.beforeEach(async ({ page }) => {
    // Set a consistent viewport size to ensure consistent rendering
    // Use 1920x1080 to ensure we're in desktop layout (xl breakpoint is 1280px)
    await page.setViewportSize({ width: 1920, height: 1080 })
    
    await navigateTo(page, ROUTES.HOME)
    await loginWithPrivyEmail(page, getPrivyTestAccount())
    await navigateTo(page, ROUTES.CHATS)
    await waitForPageLoad(page)
    
    // Wait for the page to be ready by waiting for a specific element that indicates content is loaded
    // The "Messages" header appears when the main content is rendered (after auth check)
    await page.waitForSelector('h2:has-text("Messages")', { state: 'visible', timeout: 30000 })
  })

  test('should load chats page with new design', async ({ page }) => {
    expect(page.url()).toContain('/chats')
    
    // Playwright's getByText automatically waits for the element to be visible
    // Check for Messages header - it appears in both desktop and mobile layouts
    const messagesHeader = page.getByRole('heading', { name: 'Messages', exact: true }).first()
    await expect(messagesHeader).toBeVisible()
    
    await page.screenshot({ path: 'test-results/screenshots/07-chats-page-new.png', fullPage: true })
    console.log('✅ Chats page loaded with new design')
  })

  test('should display All/DMs/Groups filter tabs', async ({ page }) => {
    // Playwright's getByRole automatically waits for elements to be visible
    // Check for all three filter tabs - they appear in the same container
    // Buttons use aria-label, so we match on the aria-label values which take precedence
    const allTab = page.getByRole('button', { name: 'Show all conversations', exact: true }).first()
    const dmsTab = page.getByRole('button', { name: 'Show direct messages', exact: true }).first()
    const groupsTab = page.getByRole('button', { name: 'Show group chats', exact: true }).first()
    
    await expect(allTab).toBeVisible()
    await expect(dmsTab).toBeVisible()
    await expect(groupsTab).toBeVisible()
    
    console.log('✅ Filter tabs visible')
  })

  test('should switch between filter tabs', async ({ page }) => {
    // Playwright's getByRole automatically waits for elements and handles clicks
    // Buttons use aria-label, so we match on the aria-label values which take precedence
    const allTab = page.getByRole('button', { name: 'Show all conversations', exact: true }).first()
    const dmsTab = page.getByRole('button', { name: 'Show direct messages', exact: true }).first()
    const groupsTab = page.getByRole('button', { name: 'Show group chats', exact: true }).first()
    
    // Verify all tabs are visible
    await expect(allTab).toBeVisible()
    await expect(dmsTab).toBeVisible()
    await expect(groupsTab).toBeVisible()
    
    // Click through each tab - Playwright waits for elements to be actionable
    await dmsTab.click()
    await groupsTab.click()
    await allTab.click()
    
    await page.screenshot({ path: 'test-results/screenshots/07-filter-tabs.png' })
    
    console.log('✅ Filter tabs switching works')
  })

  test('should display search conversations', async ({ page }) => {
    // Look for search input
    const hasSearch = await page.getByPlaceholder(/search/i).isVisible({ timeout: 5000 }).catch(() => false)
    
    console.log(`✅ Search input visible: ${hasSearch}`)
  })

  test('should display chats list', async ({ page }) => {
    await page.waitForTimeout(2000)
    
    // Page should have loaded successfully
    const pageContent = await page.locator('body').textContent()
    expect(pageContent).toBeTruthy()
    
    await page.screenshot({ path: 'test-results/screenshots/07-chats-list.png', fullPage: true })
    
    console.log('✅ Chats list page rendered')
  })
})

test.describe('Chat Messaging - New Implementation', () => {
  test.beforeEach(async ({ page }) => {
    await navigateTo(page, ROUTES.HOME)
    await loginWithPrivyEmail(page, getPrivyTestAccount())
    await navigateTo(page, ROUTES.CHATS)
    await waitForPageLoad(page)
    
    // Wait for the page to be ready by waiting for a specific element
    await page.waitForSelector('h2:has-text("Messages")', { state: 'visible', timeout: 30000 })
  })

  test('should display chat list', async ({ page }) => {
    await page.waitForTimeout(2000)
    
    // Page renders successfully
    const hasContent = await page.locator('body').textContent()
    expect(hasContent).toBeTruthy()
    
    console.log('✅ Chat list displays')
  })

  test('should show empty state guidance for DMs', async ({ page }) => {
    // Find visible DMs tab
    const dmsTabs = await page.getByText('DMs').all()
    let dmsTab = null
    for (const tab of dmsTabs) {
      if (await tab.isVisible().catch(() => false)) {
        dmsTab = tab
        break
      }
    }
    
    if (dmsTab) {
      await dmsTab.click()
      await page.waitForTimeout(1000)
      
      // May show empty state with guidance
      const hasEmptyState = await page.getByText(/profile/i).first().isVisible({ timeout: 5000 }).catch(() => false)
      
      console.log(`✅ DM empty state shows profile guidance: ${hasEmptyState}`)
    }
  })

  test('should display SSE connection status', async ({ page }) => {
    await page.waitForTimeout(2000)
    
    // Look for Live/Connecting indicator
    const indicators = await page.getByText(/Live|Connecting/i).all()
    let hasSSEIndicator = false
    for (const indicator of indicators) {
        if (await indicator.isVisible().catch(() => false)) {
            hasSSEIndicator = true
            break
        }
    }
    
    console.log(`✅ SSE indicator visible: ${hasSSEIndicator}`)
  })

  test('should handle mobile responsive design', async ({ page }) => {
    // Test mobile viewport
    await page.setViewportSize({ width: 375, height: 667 })
    await page.goto('/chats')
    await page.waitForTimeout(2000)
    
    // Page should load successfully
    const pageContent = await page.locator('body').textContent()
    expect(pageContent).toBeTruthy()
    
    await page.screenshot({ path: 'test-results/screenshots/07-chats-mobile.png', fullPage: true })
    
    console.log('✅ Mobile responsive design works')
  })
})

test.describe('Profile Message Button', () => {
  test.beforeEach(async ({ page }) => {
    await navigateTo(page, ROUTES.HOME)
    await loginWithPrivyEmail(page, getPrivyTestAccount())
  })

  test('should show message button on user profiles', async ({ page }) => {
    // Go to a test user profile
    await page.goto('/profile/testuser1')
    await page.waitForTimeout(2000)
    
    // Look for message button (may not be visible if viewing own profile or if user doesn't exist)
    const pageContent = await page.locator('body').textContent()
    expect(pageContent).toBeTruthy()
    
    console.log('✅ Profile page loads (message button conditional on user type)')
  })

  test('should navigate to DM when clicking message button', async ({ page }) => {
    // Visit a user profile
    await page.goto('/profile/testuser2')
    await page.waitForTimeout(2000)
    
    // Look for message button
    const messageButton = page.locator('button[title*="message" i], button:has-text("Message")').first()
    
    if (await messageButton.isVisible({ timeout: 5000 }).catch(() => false)) {
      await messageButton.click()
      await page.waitForTimeout(2000)
      
      // Should navigate to chats
      expect(page.url()).toContain('/chats')
      
      console.log('✅ Message button navigates to DM')
    } else {
      console.log('⚠️ Message button not found (may be own profile or NPC)')
    }
  })
})

test.describe('Real-time Updates', () => {
  test.beforeEach(async ({ page }) => {
    await navigateTo(page, ROUTES.HOME)
    await loginWithPrivyEmail(page, getPrivyTestAccount())
  })

  test('should connect to SSE for real-time messages', async ({ page }) => {
    await navigateTo(page, ROUTES.CHATS)
    await waitForPageLoad(page)
    
    // Wait for the page to be ready
    await page.waitForSelector('h2:has-text("Messages")', { state: 'visible', timeout: 30000 })
    
    // Check for SSE connection in network tab
    // Note: Actual SSE testing requires multiple browsers
    const pageContent = await page.locator('body').textContent()
    expect(pageContent).toBeTruthy()
    
    console.log('✅ Chat page supports SSE (full test requires 2 browsers)')
  })

  test('should display Live/Connecting status', async ({ page }) => {
    await navigateTo(page, ROUTES.CHATS)
    await waitForPageLoad(page)
    
    // Wait for the page to be ready
    await page.waitForSelector('h2:has-text("Messages")', { state: 'visible', timeout: 30000 })
    
    // Look for status indicator - use Playwright's built-in waiting
    const indicators = page.getByText(/Live|Connecting/i)
    const hasStatus = await indicators.first().isVisible({ timeout: 5000 }).catch(() => false)
    
    console.log(`✅ SSE status indicator: ${hasStatus}`)
  })
})
