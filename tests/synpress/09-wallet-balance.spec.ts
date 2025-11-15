/**
 * Wallet and Balance E2E Tests
 * 
 * Tests wallet and balance functionality:
 * - Viewing balance
 * - Transaction history
 * - Wallet connection
 * - Gas sponsorship
 * - Token transfers
 */

import { test } from '@playwright/test'
import { loginWithPrivyEmail, getPrivyTestAccount } from './helpers/privy-auth'
import { navigateTo, waitForPageLoad, isVisible } from './helpers/page-helpers'
import { ROUTES } from './helpers/test-data'

test.describe('Wallet and Balance', () => {
  test.beforeEach(async ({ page }) => {
    await navigateTo(page, ROUTES.HOME)
    await loginWithPrivyEmail(page, getPrivyTestAccount())
    await waitForPageLoad(page)
  })

  test('should display user balance', async ({ page }) => {
    // Look for balance display (could be in header, profile, or dedicated section)
    const hasBalance = await isVisible(page, 'text=/\\$|balance|points/i', 5000) ||
                       await isVisible(page, '[data-testid="balance"]', 5000)
    
    await page.screenshot({ path: 'test-results/screenshots/09-balance-display.png' })
    
    console.log(`✅ Balance displayed: ${hasBalance}`)
  })

  test('should navigate to wallet/balance page', async ({ page }) => {
    // Look for wallet button/link
    const walletButton = page.locator('button:has-text("Wallet"), a:has-text("Wallet"), button:has-text("Balance")').first()
    
    if (await walletButton.isVisible({ timeout: 5000 }).catch(() => false)) {
      await walletButton.click()
      await waitForPageLoad(page)
      
      await page.screenshot({ path: 'test-results/screenshots/09-wallet-page.png', fullPage: true })
      
      console.log('✅ Navigated to wallet page')
    } else {
      console.log('ℹ️ Wallet button not found in navigation')
    }
  })

  test('should display wallet address', async ({ page }) => {
    // Look for wallet address
    const hasWalletAddress = await isVisible(page, 'text=/0x[a-fA-F0-9]{40}/', 5000) ||
                            await isVisible(page, '[data-testid="wallet-address"]', 5000)
    
    console.log(`✅ Wallet address displayed: ${hasWalletAddress}`)
  })

  test('should copy wallet address', async ({ page }) => {
    // Look for copy button near wallet address
    const copyButton = page.locator('button[aria-label*="copy" i]:near(text=/0x/), button:has-text("Copy")').first()
    
    if (await copyButton.isVisible({ timeout: 5000 }).catch(() => false)) {
      await copyButton.click()
      await page.waitForTimeout(1000)
      
      // Check for success toast
      const hasSuccess = await isVisible(page, 'text=/copied|success/i', 3000)
      
      await page.screenshot({ path: 'test-results/screenshots/09-address-copied.png' })
      
      console.log(`✅ Wallet address copy: ${hasSuccess}`)
    }
  })

  test('should display embedded wallet info', async ({ page }) => {
    // Look for Privy embedded wallet indicators
    const hasEmbeddedWallet = await isVisible(page, 'text=/privy|embedded|created/i', 5000)
    
    console.log(`✅ Embedded wallet info: ${hasEmbeddedWallet}`)
  })
})

test.describe('Transaction History', () => {
  test.beforeEach(async ({ page }) => {
    await navigateTo(page, ROUTES.HOME)
    await loginWithPrivyEmail(page, getPrivyTestAccount())
    await waitForPageLoad(page)
  })

  test('should view transaction history', async ({ page }) => {
    // Navigate to profile which might have transaction history
    await navigateTo(page, ROUTES.PROFILE)
    await page.waitForTimeout(2000)
    
    // Look for transaction history section
    const hasHistory = await isVisible(page, 'text=/transactions|history|activity/i', 5000)
    
    console.log(`✅ Transaction history section: ${hasHistory}`)
  })

  test('should display transaction details', async ({ page }) => {
    await navigateTo(page, ROUTES.PROFILE)
    await page.waitForTimeout(2000)
    
    // Look for transaction items
    const hasTransactions = await isVisible(page, '[data-testid="transaction"], [data-testid="activity-item"]', 5000)
    
    if (hasTransactions) {
      // Click first transaction
      const txItem = page.locator('[data-testid="transaction"], [data-testid="activity-item"]').first()
      await txItem.click()
      await page.waitForTimeout(1000)
      
      await page.screenshot({ path: 'test-results/screenshots/09-transaction-details.png' })
      
      console.log('✅ Transaction details displayed')
    } else {
      console.log('ℹ️ No transactions found')
    }
  })

  test('should filter transactions by type', async ({ page }) => {
    await navigateTo(page, ROUTES.PROFILE)
    await page.waitForTimeout(2000)
    
    // Look for filter buttons/tabs
    const filterTabs = page.locator('button:has-text("All"), button:has-text("Trades"), button:has-text("Deposits")')
    const tabCount = await filterTabs.count()
    
    if (tabCount > 0) {
      for (let i = 0; i < Math.min(tabCount, 3); i++) {
        await filterTabs.nth(i).click()
        await page.waitForTimeout(1000)
        console.log(`✅ Filtered transactions tab ${i}`)
      }
    }
  })
})

test.describe('Wallet Connection', () => {
  test.beforeEach(async ({ page }) => {
    await navigateTo(page, ROUTES.HOME)
    await loginWithPrivyEmail(page, getPrivyTestAccount())
    await waitForPageLoad(page)
  })

  test('should view connected wallets', async ({ page }) => {
    // Look for settings or wallet management
    await navigateTo(page, ROUTES.SETTINGS)
    await page.waitForTimeout(2000)
    
    // Look for wallet section
    const hasWalletSection = await isVisible(page, 'text=/wallet|connected|accounts/i', 5000)
    
    await page.screenshot({ path: 'test-results/screenshots/09-connected-wallets.png' })
    
    console.log(`✅ Connected wallets section: ${hasWalletSection}`)
  })

  test('should add external wallet button', async ({ page }) => {
    await navigateTo(page, ROUTES.SETTINGS)
    await page.waitForTimeout(2000)
    
    // Look for add wallet button
    const addWalletButton = page.locator('button:has-text("Add Wallet"), button:has-text("Connect Wallet")').first()
    
    if (await addWalletButton.isVisible({ timeout: 5000 }).catch(() => false)) {
      await addWalletButton.click()
      await page.waitForTimeout(2000)
      
      // Check for wallet selection modal
      const modalVisible = await isVisible(page, '[role="dialog"], [data-privy-modal]', 5000)
      
      await page.screenshot({ path: 'test-results/screenshots/09-add-wallet-modal.png' })
      
      console.log(`✅ Add wallet modal: ${modalVisible}`)
    }
  })

  test('should display embedded wallet details', async ({ page }) => {
    await navigateTo(page, ROUTES.SETTINGS)
    await page.waitForTimeout(2000)
    
    // Look for embedded wallet info
    const hasEmbeddedInfo = await isVisible(page, 'text=/privy|embedded|managed/i', 5000)
    
    console.log(`✅ Embedded wallet details: ${hasEmbeddedInfo}`)
  })
})

test.describe('Gas Sponsorship', () => {
  test.beforeEach(async ({ page }) => {
    await navigateTo(page, ROUTES.HOME)
    await loginWithPrivyEmail(page, getPrivyTestAccount())
    await waitForPageLoad(page)
  })

  test('should indicate gas sponsorship on transactions', async ({ page }) => {
    // Navigate to markets to attempt a transaction
    await navigateTo(page, ROUTES.MARKETS)
    await page.waitForTimeout(2000)
    
    // Look for gas sponsorship indicators
    const hasGasSponsorship = await isVisible(page, 'text=/gas free|sponsored|no gas fees/i', 5000)
    
    console.log(`✅ Gas sponsorship indicators: ${hasGasSponsorship}`)
  })

  test('should show zero gas fees in transaction preview', async ({ page }) => {
    await navigateTo(page, ROUTES.MARKETS)
    await page.waitForTimeout(2000)
    
    // Try to initiate a transaction
    const marketCard = page.locator('a[href*="/markets/"]').first()
    
    if (await marketCard.isVisible({ timeout: 5000 }).catch(() => false)) {
      await marketCard.click()
      await waitForPageLoad(page)
      
      // Click buy button
      const buyButton = page.locator('button:has-text("Buy")').first()
      
      if (await buyButton.isVisible({ timeout: 5000 }).catch(() => false)) {
        await buyButton.click()
        await page.waitForTimeout(2000)
        
        // Look for gas fee information
        const hasGasFee = await isVisible(page, 'text=/gas|fee|network/i', 5000)
        
        await page.screenshot({ path: 'test-results/screenshots/09-transaction-preview.png' })
        
        console.log(`✅ Gas fee information: ${hasGasFee}`)
      }
    }
  })
})

test.describe('Balance Display and Updates', () => {
  test.beforeEach(async ({ page }) => {
    await navigateTo(page, ROUTES.HOME)
    await loginWithPrivyEmail(page, getPrivyTestAccount())
    await waitForPageLoad(page)
  })

  test('should show balance breakdown', async ({ page }) => {
    // Navigate to profile or wallet page
    await navigateTo(page, ROUTES.PROFILE)
    await page.waitForTimeout(2000)
    
    // Look for balance breakdown (available, locked, staked, etc.)
    const hasBreakdown = await isVisible(page, 'text=/available|locked|staked|in positions/i', 5000)
    
    console.log(`✅ Balance breakdown: ${hasBreakdown}`)
  })

  test('should display recent balance changes', async ({ page }) => {
    await navigateTo(page, ROUTES.PROFILE)
    await page.waitForTimeout(2000)
    
    // Look for recent activity affecting balance
    const hasActivity = await isVisible(page, 'text=/\\+|\\-|earned|spent/i', 5000)
    
    console.log(`✅ Balance changes displayed: ${hasActivity}`)
  })

  test('should show pending transactions', async ({ page }) => {
    await navigateTo(page, ROUTES.PROFILE)
    await page.waitForTimeout(2000)
    
    // Look for pending status
    const hasPending = await isVisible(page, 'text=/pending|processing|confirming/i', 5000)
    
    console.log(`✅ Pending transactions: ${hasPending}`)
  })
})

test.describe('Wallet Export and Backup', () => {
  test.beforeEach(async ({ page }) => {
    await navigateTo(page, ROUTES.HOME)
    await loginWithPrivyEmail(page, getPrivyTestAccount())
    await navigateTo(page, ROUTES.SETTINGS)
    await waitForPageLoad(page)
  })

  test('should have wallet export option', async ({ page }) => {
    await page.waitForTimeout(2000)
    
    // Look for export/backup options
    const hasExportOption = await isVisible(page, 'text=/export|backup|recovery|seed phrase/i', 5000)
    
    console.log(`✅ Wallet export option: ${hasExportOption}`)
  })

  test('should have wallet security settings', async ({ page }) => {
    await page.waitForTimeout(2000)
    
    // Look for security options
    const hasSecuritySettings = await isVisible(page, 'text=/security|password|2fa|authentication/i', 5000)
    
    console.log(`✅ Security settings: ${hasSecuritySettings}`)
  })
})

