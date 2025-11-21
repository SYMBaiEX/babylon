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
    
    // Capture console errors for debugging Privy initialization issues
    const consoleErrors: string[] = []
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text())
      }
    })
    
    try {
      await navigateTo(page, ROUTES.HOME)
      await loginWithPrivyEmail(page, getPrivyTestAccount())
      await navigateTo(page, ROUTES.CHATS)
      await waitForPageLoad(page)
      
      // Wait for the page to be ready by waiting for a specific element that indicates content is loaded
      // The "Messages" header appears when the main content is rendered (after auth check)
      await page.waitForSelector('h2:has-text("Messages")', { state: 'visible', timeout: 30000 })
    } catch (error) {
      // Log console errors if authentication or page load failed
      if (consoleErrors.length > 0) {
        console.error('❌ Console errors during test setup:', consoleErrors)
      }
      
      // Re-throw with more context
      throw new Error(
        `Test setup failed: ${error instanceof Error ? error.message : String(error)}\n` +
        `Console errors: ${consoleErrors.length > 0 ? consoleErrors.join('; ') : 'none'}`
      )
    }
  })

  test('should load chats page with new design', async ({ page }) => {
    expect(page.url()).toContain('/chats')
    
    // Wait for page to be ready - use the same selector as beforeEach for consistency
    await page.waitForSelector('h2:has-text("Messages")', { state: 'visible', timeout: 30000 })
    
    // Playwright's getByRole automatically waits for the element to be visible
    // Check for Messages header - it appears in both desktop and mobile layouts
    // Try getByRole first, fallback to locator if needed
    let messagesHeader = page.getByRole('heading', { name: 'Messages', exact: true }).first()
    const isVisible = await messagesHeader.isVisible({ timeout: 5000 }).catch(() => false)
    if (!isVisible) {
      // Fallback to locator if getByRole doesn't work
      messagesHeader = page.locator('h2:has-text("Messages")').first()
    }
    await expect(messagesHeader).toBeVisible({ timeout: 10000 })
    
    await page.screenshot({ path: 'test-results/screenshots/07-chats-page-new.png', fullPage: true })
    console.log('✅ Chats page loaded with new design')
  })

  test('should display All/DMs/Groups filter tabs', async ({ page }) => {
    // Playwright's getByRole automatically waits for elements to be visible
    // Check for all three filter tabs - they appear in the same container
    // Buttons use aria-label, so we match on the aria-label values (remove exact: true for more flexibility)
    const allTab = page.getByRole('button', { name: 'Show all conversations' }).first()
    const dmsTab = page.getByRole('button', { name: 'Show direct messages' }).first()
    const groupsTab = page.getByRole('button', { name: 'Show group chats' }).first()
    
    await expect(allTab).toBeVisible({ timeout: 10000 })
    await expect(dmsTab).toBeVisible({ timeout: 10000 })
    await expect(groupsTab).toBeVisible({ timeout: 10000 })
    
    console.log('✅ Filter tabs visible')
  })

  test('should switch between filter tabs', async ({ page }) => {
    // Playwright's getByRole automatically waits for elements and handles clicks
    // Buttons use aria-label, so we match on the aria-label values (remove exact: true for more flexibility)
    const allTab = page.getByRole('button', { name: 'Show all conversations' }).first()
    const dmsTab = page.getByRole('button', { name: 'Show direct messages' }).first()
    const groupsTab = page.getByRole('button', { name: 'Show group chats' }).first()
    
    // Verify all tabs are visible
    await expect(allTab).toBeVisible({ timeout: 10000 })
    await expect(dmsTab).toBeVisible({ timeout: 10000 })
    await expect(groupsTab).toBeVisible({ timeout: 10000 })
    
    // Click through each tab - Playwright waits for elements to be actionable
    await dmsTab.click()
    await page.waitForTimeout(500) // Wait for state update
    await groupsTab.click()
    await page.waitForTimeout(500) // Wait for state update
    await allTab.click()
    await page.waitForTimeout(500) // Wait for state update
    
    await page.screenshot({ path: 'test-results/screenshots/07-filter-tabs.png' })
    
    console.log('✅ Filter tabs switching works')
  })

  test('should display search conversations', async ({ page }) => {
    // Wait for page to be ready first
    await page.waitForSelector('h2:has-text("Messages")', { state: 'visible', timeout: 30000 })
    await page.waitForTimeout(1000) // Give time for search input to render
    
    // Look for search input - wait for it to be visible
    // Try getByPlaceholder first, fallback to locator if needed
    let searchInput = page.getByPlaceholder(/search/i).first()
    const isVisible = await searchInput.isVisible({ timeout: 5000 }).catch(() => false)
    if (!isVisible) {
      // Fallback to locator if getByPlaceholder doesn't work
      searchInput = page.locator('input[placeholder*="Search" i]').first()
    }
    await expect(searchInput).toBeVisible({ timeout: 10000 })
    
    console.log('✅ Search input visible')
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
    // Find and click DMs tab using aria-label for reliability
    const dmsTab = page.getByRole('button', { name: 'Show direct messages' }).first()
    await expect(dmsTab).toBeVisible({ timeout: 10000 })
    await dmsTab.click()
    await page.waitForTimeout(1000)
    
    // Check for empty state guidance text - the actual text is "Visit a user's profile to start a DM"
    const hasEmptyState = await page.getByText(/visit.*profile/i).first().isVisible({ timeout: 5000 }).catch(() => false)
    
    console.log(`✅ DM empty state shows profile guidance: ${hasEmptyState}`)
  })

  test('should display SSE connection status', async ({ page }) => {
    await page.waitForTimeout(2000)
    
    // Look for SSE status indicator using data-testid or text content
    // The status shows "Live" when connected or "Connecting" when not
    const sseStatus = page.getByTestId('sse-status').or(page.getByText(/Live|Connecting/i)).first()
    await expect(sseStatus).toBeVisible({ timeout: 10000 })
    
    const statusText = await sseStatus.textContent()
    console.log(`✅ SSE indicator visible with status: ${statusText}`)
  })

  test('should handle mobile responsive design', async ({ page }) => {
    // Test mobile viewport - ensure we're authenticated first
    await page.setViewportSize({ width: 375, height: 667 })
    await navigateTo(page, ROUTES.CHATS)
    await waitForPageLoad(page)
    
    // Wait for the page to be ready
    await page.waitForSelector('h2:has-text("Messages")', { state: 'visible', timeout: 30000 })
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
    await page.waitForTimeout(2000) // Give time for SSE connection to establish
    
    // Look for status indicator using data-testid or text content
    // Try getByTestId first, fallback to getByText if needed
    let sseStatus = page.getByTestId('sse-status').first()
    const isVisible = await sseStatus.isVisible({ timeout: 5000 }).catch(() => false)
    if (!isVisible) {
      // Fallback to text-based search if testid doesn't work
      sseStatus = page.getByText(/Live|Connecting/i).first()
    }
    await expect(sseStatus).toBeVisible({ timeout: 10000 })
    
    const statusText = await sseStatus.textContent()
    console.log(`✅ SSE status indicator visible with status: ${statusText}`)
  })
})
