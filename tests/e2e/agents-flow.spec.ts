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

  test('should navigate to agents page', async ({ page }) => {
    // Navigate to agents
    await page.goto('http://localhost:3000/agents')
    
    // Should see agents page with PageContainer
    await expect(page.locator('h1')).toContainText('My Agents')
    
    // Should see filter buttons with rounded pills
    const allButton = page.locator('button:has-text("All")')
    await expect(allButton).toBeVisible()
    await expect(allButton).toHaveClass(/rounded-full/)
  })

  test('should show agent creation wizard with progress bar', async ({ page }) => {
    await page.goto('http://localhost:3000/agents/create')
    
    // Should see header
    await expect(page.locator('h1')).toContainText('Create New Agent')
    
    // Should see progress bar
    const progressBars = page.locator('div[class*="rounded-full"]').filter({ hasText: '' })
    await expect(progressBars.first()).toBeVisible()
    
    // Should see step indicator
    await expect(page.locator('text=Step 1 of 4')).toBeVisible()
  })

  test('should complete agent creation wizard steps', async ({ page }) => {
    await page.goto('http://localhost:3000/agents/create')
    
    // Step 1: Basic Info
    await page.fill('input[placeholder*="Alpha Trading" i]', 'E2E Test Agent')
    await page.fill('textarea[placeholder*="description" i]', 'Test agent for E2E tests')
    
    // Click Next button (styled with bg-[#0066FF])
    const nextButton = page.locator('button:has-text("Next")')
    await expect(nextButton).toBeVisible()
    await expect(nextButton).toHaveClass(/bg-\[#0066FF\]/)
    await nextButton.click()
    
    // Step 2: Personality
    await expect(page.locator('text=Step 2 of 4')).toBeVisible()
    await page.fill('textarea[placeholder*="AI agent" i]', 'You are a helpful test agent')
    
    // Test Generate button (should be native button with specific styling)
    const generateButton = page.locator('button:has-text("Generate")').first()
    await expect(generateButton).toBeVisible()
    await expect(generateButton).toHaveClass(/bg-muted/)
    
    // Test Add Bio Point button
    const addBioButton = page.locator('button:has-text("Add Bio Point")')
    await expect(addBioButton).toBeVisible()
    
    await nextButton.click()
    
    // Step 3: Trading Strategy
    await expect(page.locator('text=Step 3 of 4')).toBeVisible()
    
    // Test model tier buttons
    const freeButton = page.locator('button:has-text("Free (Groq 8B)")')
    await expect(freeButton).toBeVisible()
    await expect(freeButton).toHaveClass(/border/)
    
    await nextButton.click()
    
    // Step 4: Initial Deposit
    await expect(page.locator('text=Step 4 of 4')).toBeVisible()
    
    // Should see summary with blue background
    const summary = page.locator('div').filter({ hasText: 'Summary' }).first()
    await expect(summary).toBeVisible()
    await expect(summary).toHaveClass(/bg-\[#0066FF\]/)
    
    // Submit button
    const submitButton = page.locator('button:has-text("Create Agent")')
    await expect(submitButton).toBeVisible()
    await expect(submitButton).toHaveClass(/bg-\[#0066FF\]/)
  })

  test('should show agent detail page with new design', async ({ page }) => {
    await page.goto('http://localhost:3000/agents')
    
    // Click on first agent (if exists)
    const firstAgent = page.locator('a[href^="/agents/"]:not([href="/agents/create"])').first()
    
    if (await firstAgent.isVisible()) {
      await firstAgent.click()
      
      // Should see tabs with new styling
      const tabs = page.locator('[role="tablist"]')
      await expect(tabs).toBeVisible()
      
      // Tabs should have data-state attribute and blue active style
      const chatTab = page.locator('[role="tab"]:has-text("Chat")')
      await expect(chatTab).toBeVisible()
      
      // Should see delete button with red styling
      const deleteButton = page.locator('button:has-text("Delete")')
      await expect(deleteButton).toBeVisible()
      await expect(deleteButton).toHaveClass(/text-red-400/)
      
      // Should see stats with responsive grid
      const statsContainer = page.locator('div').filter({ hasText: 'Balance' }).first()
      await expect(statsContainer).toBeVisible()
    }
  })

  test('should show chat interface with new design', async ({ page }) => {
    await page.goto('http://localhost:3000/agents')
    
    const firstAgent = page.locator('a[href^="/agents/"]:not([href="/agents/create"])').first()
    
    if (await firstAgent.isVisible()) {
      await firstAgent.click()
      
      // Click Chat tab
      await page.click('[role="tab"]:has-text("Chat")')
      
      // Should see chat interface with new styling
      const chatContainer = page.locator('div').filter({ hasText: 'Chat with' }).first()
      await expect(chatContainer).toBeVisible()
      await expect(chatContainer).toHaveClass(/rounded-lg/)
      await expect(chatContainer).toHaveClass(/bg-card/)
      
      // Should see Pro Mode button
      const proModeButton = page.locator('button:has-text("Pro Mode"), button:has-text("Free Mode")')
      await expect(proModeButton).toBeVisible()
      
      // Should see send button with blue styling
      const sendButton = page.locator('button').filter({ has: page.locator('svg') }).last()
      if (await sendButton.isVisible()) {
        await expect(sendButton).toHaveClass(/bg-\[#0066FF\]/)
      }
    }
  })

  test('should show wallet with new design', async ({ page }) => {
    await page.goto('http://localhost:3000/agents')
    
    const firstAgent = page.locator('a[href^="/agents/"]:not([href="/agents/create"])').first()
    
    if (await firstAgent.isVisible()) {
      await firstAgent.click()
      
      // Click Wallet tab
      await page.click('[role="tab"]:has-text("Wallet")')
      
      // Should see balance cards
      const agentBalanceCard = page.locator('div').filter({ hasText: 'Agent Balance' }).first()
      await expect(agentBalanceCard).toBeVisible()
      await expect(agentBalanceCard).toHaveClass(/rounded-lg/)
      
      // Should see Deposit/Withdraw buttons with new styling
      const depositButton = page.locator('button:has-text("Deposit")')
      await expect(depositButton).toBeVisible()
      await expect(depositButton).toHaveClass(/rounded-lg/)
      
      // Test button toggle
      await depositButton.click()
      await expect(depositButton).toHaveClass(/bg-\[#0066FF\]/)
      
      const withdrawButton = page.locator('button:has-text("Withdraw")')
      await withdrawButton.click()
      await expect(withdrawButton).toHaveClass(/bg-\[#0066FF\]/)
    }
  })

  test('should show settings with autonomous controls', async ({ page }) => {
    await page.goto('http://localhost:3000/agents')
    
    const firstAgent = page.locator('a[href^="/agents/"]:not([href="/agents/create"])').first()
    
    if (await firstAgent.isVisible()) {
      await firstAgent.click()
      
      // Click Settings tab
      await page.click('[role="tab"]:has-text("Settings")')
      
      // Should see all autonomous controls with hover states
      const autonomousControls = [
        'Autonomous Trading',
        'Autonomous Posting',
        'Autonomous Commenting',
        'Autonomous DMs',
        'Autonomous Group Chats'
      ]
      
      for (const control of autonomousControls) {
        const controlElement = page.locator('div').filter({ hasText: control }).first()
        await expect(controlElement).toBeVisible()
        await expect(controlElement).toHaveClass(/bg-muted/)
        await expect(controlElement).toHaveClass(/hover:bg-muted/)
      }
      
      // Should see save button
      const saveButton = page.locator('button:has-text("Save Changes")')
      await expect(saveButton).toBeVisible()
      await expect(saveButton).toHaveClass(/bg-\[#0066FF\]/)
    }
  })

  test('should show logs with filters', async ({ page }) => {
    await page.goto('http://localhost:3000/agents')
    
    const firstAgent = page.locator('a[href^="/agents/"]:not([href="/agents/create"])').first()
    
    if (await firstAgent.isVisible()) {
      await firstAgent.click()
      
      // Click Logs tab
      await page.click('[role="tab"]:has-text("Logs")')
      
      // Should see filter controls
      const typeFilter = page.locator('select').first()
      await expect(typeFilter).toBeVisible()
      
      // Should see refresh button
      const refreshButton = page.locator('button:has-text("Refresh")')
      await expect(refreshButton).toBeVisible()
      
      // Test filter dropdown
      await typeFilter.selectOption('chat')
      await expect(typeFilter).toHaveValue('chat')
    }
  })

  test('should show performance dashboard', async ({ page }) => {
    await page.goto('http://localhost:3000/agents')
    
    const firstAgent = page.locator('a[href^="/agents/"]:not([href="/agents/create"])').first()
    
    if (await firstAgent.isVisible()) {
      await firstAgent.click()
      
      // Click Performance tab
      await page.click('[role="tab"]:has-text("Performance")')
      
      // Should see stats cards with hover effects
      const statsCards = page.locator('div').filter({ hasText: 'Lifetime P&L' })
      await expect(statsCards.first()).toBeVisible()
      
      // Stats should have hover border effect
      const firstCard = page.locator('div[class*="border-border"]').first()
      await expect(firstCard).toHaveClass(/hover:border-\[#0066FF\]/)
    }
  })

  test('should have consistent color scheme', async ({ page }) => {
    await page.goto('http://localhost:3000/agents')
    
    // Check primary color usage (#0066FF)
    const createButton = page.locator('button:has-text("Create Agent")')
    if (await createButton.isVisible()) {
      await expect(createButton).toHaveClass(/bg-\[#0066FF\]/)
    }
    
    // Check filter buttons
    const allFilter = page.locator('button:has-text("All")').first()
    await allFilter.click()
    await expect(allFilter).toHaveClass(/bg-\[#0066FF\]/)
  })

  test('should have no console errors', async ({ page }) => {
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
      !e.includes('[HMR]') &&
      !e.includes('favicon')
    )
    
    expect(criticalErrors.length).toBe(0)
  })

  test('should have responsive design', async ({ page }) => {
    // Test mobile viewport
    await page.setViewportSize({ width: 375, height: 667 })
    await page.goto('http://localhost:3000/agents')
    
    // Should still show header
    await expect(page.locator('h1')).toBeVisible()
    
    // Should show mobile-friendly cards
    const cards = page.locator('div[class*="grid"]').first()
    await expect(cards).toBeVisible()
    
    // Test tablet viewport
    await page.setViewportSize({ width: 768, height: 1024 })
    await page.goto('http://localhost:3000/agents/create')
    
    // Should see progress bar
    await expect(page.locator('h1')).toBeVisible()
    
    // Test desktop viewport
    await page.setViewportSize({ width: 1920, height: 1080 })
    await page.goto('http://localhost:3000/agents')
    
    // Should show full layout
    await expect(page.locator('h1')).toBeVisible()
  })
})

export {}
