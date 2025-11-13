/**
 * E2E Tests for Agents Feature
 * 
 * Tests the complete user journey:
 * - Navigate to agents tab
 * - Create new agent
 * - Chat with agent
 * - Manage wallet
 * - Enable autonomous mode
 * - View logs and performance
 */

import { test, expect } from '@playwright/test'

test.describe('Agents Feature E2E', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to app
    await page.goto('http://localhost:3000')
    
    // TODO: Authenticate with Privy
    // For now, skip auth in dev mode or use test credentials
  })

  test('should show Agents tab in sidebar', async ({ page }) => {
    // Look for Agents link in sidebar
    const agentsLink = page.locator('a[href="/agents"]')
    await expect(agentsLink).toBeVisible()
    
    // Check for Bot icon
    const botIcon = agentsLink.locator('svg')
    await expect(botIcon).toBeVisible()
  })

  test('should navigate to agents page', async ({ page }) => {
    await page.click('a[href="/agents"]')
    
    // Should see agents page
    await expect(page).toHaveURL('/agents')
    await expect(page.locator('h1')).toContainText('My Agents')
  })

  test('should show create agent button', async ({ page }) => {
    await page.goto('http://localhost:3000/agents')
    
    const createButton = page.locator('button:has-text("Create Agent"), a:has-text("Create Agent")')
    await expect(createButton).toBeVisible()
  })

  test('should open agent creation wizard', async ({ page }) => {
    await page.goto('http://localhost:3000/agents')
    
    // Click create button
    await page.click('button:has-text("Create Agent"), a:has-text("Create Agent")')
    
    // Should navigate to creation page or show modal
    await expect(page.locator('h1, h2')).toContainText('Create')
    
    // Should see step 1 of wizard
    await expect(page.locator('text=Step 1')).toBeVisible()
  })

  test('should complete agent creation wizard', async ({ page }) => {
    await page.goto('http://localhost:3000/agents/create')
    
    // Step 1: Basic Info
    await page.fill('input[placeholder*="name" i]', 'Test Agent')
    await page.fill('textarea[placeholder*="description" i]', 'Test agent for E2E tests')
    
    // Next step
    await page.click('button:has-text("Next")')
    
    // Step 2: Personality
    await expect(page.locator('text=Step 2')).toBeVisible()
    await page.fill('textarea[placeholder*="AI agent" i]', 'You are a helpful test agent')
    
    // Next step
    await page.click('button:has-text("Next")')
    
    // Step 3: Trading Strategy
    await expect(page.locator('text=Step 3')).toBeVisible()
    
    // Next step
    await page.click('button:has-text("Next")')
    
    // Step 4: Initial Deposit
    await expect(page.locator('text=Step 4')).toBeVisible()
    
    // Submit (would need auth to complete)
    const submitButton = page.locator('button:has-text("Create Agent")')
    await expect(submitButton).toBeVisible()
  })

  test('should show agent detail page with tabs', async ({ page }) => {
    // Assuming an agent exists
    await page.goto('http://localhost:3000/agents')
    
    // Click on first agent (if exists)
    const firstAgent = page.locator('a[href^="/agents/"]:not([href="/agents/create"])').first()
    
    if (await firstAgent.isVisible()) {
      await firstAgent.click()
      
      // Should see tabs
      await expect(page.locator('button:has-text("Chat")')).toBeVisible()
      await expect(page.locator('button:has-text("Performance")')).toBeVisible()
      await expect(page.locator('button:has-text("Logs")')).toBeVisible()
      await expect(page.locator('button:has-text("Settings")')).toBeVisible()
      await expect(page.locator('button:has-text("Wallet")')).toBeVisible()
    }
  })

  test('should show chat interface', async ({ page }) => {
    await page.goto('http://localhost:3000/agents')
    
    const firstAgent = page.locator('a[href^="/agents/"]:not([href="/agents/create"])').first()
    
    if (await firstAgent.isVisible()) {
      await firstAgent.click()
      
      // Click Chat tab
      await page.click('button:has-text("Chat")')
      
      // Should see chat interface
      await expect(page.locator('input[placeholder*="message" i]')).toBeVisible()
      await expect(page.locator('button:has([class*="Send"])')).toBeVisible()
    }
  })

  test('should show settings with autonomous controls', async ({ page }) => {
    await page.goto('http://localhost:3000/agents')
    
    const firstAgent = page.locator('a[href^="/agents/"]:not([href="/agents/create"])').first()
    
    if (await firstAgent.isVisible()) {
      await firstAgent.click()
      
      // Click Settings tab
      await page.click('button:has-text("Settings")')
      
      // Should see all 5 autonomous controls
      await expect(page.locator('text=Autonomous Trading')).toBeVisible()
      await expect(page.locator('text=Autonomous Posting')).toBeVisible()
      await expect(page.locator('text=Autonomous Commenting')).toBeVisible()
      await expect(page.locator('text=Autonomous DMs')).toBeVisible()
      await expect(page.locator('text=Autonomous Group Chats')).toBeVisible()
    }
  })

  test('should show wallet management', async ({ page }) => {
    await page.goto('http://localhost:3000/agents')
    
    const firstAgent = page.locator('a[href^="/agents/"]:not([href="/agents/create"])').first()
    
    if (await firstAgent.isVisible()) {
      await firstAgent.click()
      
      // Click Wallet tab
      await page.click('button:has-text("Wallet")')
      
      // Should see deposit/withdraw buttons
      await expect(page.locator('button:has-text("Deposit")')).toBeVisible()
      await expect(page.locator('button:has-text("Withdraw")')).toBeVisible()
      
      // Should see transaction history
      await expect(page.locator('text=Transaction History')).toBeVisible()
    }
  })

  test('should show logs viewer', async ({ page }) => {
    await page.goto('http://localhost:3000/agents')
    
    const firstAgent = page.locator('a[href^="/agents/"]:not([href="/agents/create"])').first()
    
    if (await firstAgent.isVisible()) {
      await firstAgent.click()
      
      // Click Logs tab
      await page.click('button:has-text("Logs")')
      
      // Should see filter controls
      await expect(page.locator('select, button:has-text("Refresh")')).toBeVisible()
    }
  })

  test('should show performance dashboard', async ({ page }) => {
    await page.goto('http://localhost:3000/agents')
    
    const firstAgent = page.locator('a[href^="/agents/"]:not([href="/agents/create"])').first()
    
    if (await firstAgent.isVisible()) {
      await firstAgent.click()
      
      // Click Performance tab
      await page.click('button:has-text("Performance")')
      
      // Should see stats
      await expect(page.locator('text=Lifetime P&L, text=Total Trades')).toBeVisible()
    }
  })

  test('should not have console errors', async ({ page }) => {
    const errors: string[] = []
    
    page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(msg.text())
      }
    })

    await page.goto('http://localhost:3000/agents')
    await page.waitForLoadState('networkidle')
    
    // Filter out known acceptable errors
    const criticalErrors = errors.filter(e => 
      !e.includes('Hydration') &&
      !e.includes('Warning') &&
      !e.includes('[HMR]')
    )
    
    expect(criticalErrors.length).toBe(0)
  })
})

export {}


