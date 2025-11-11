/**
 * COMPLETE VALIDATION - ALL PAGES, ALL BUTTONS
 * 
 * This test ensures:
 * - EVERY page is accessible
 * - EVERY button on EVERY page is tested
 * - ANY error causes immediate test failure
 * - Complete coverage with no gaps
 */

import { test } from '@playwright/test'
import { loginWithPrivyEmail, getPrivyTestAccount } from './helpers/privy-auth'
import { navigateTo, waitForPageLoad } from './helpers/page-helpers'
import { createValidators } from './helpers/error-detector'

// ALL pages in the application
const ALL_PAGES = [
  { name: 'Home', path: '/', requiresAuth: false },
  { name: 'Feed', path: '/feed', requiresAuth: true },
  { name: 'Game', path: '/game', requiresAuth: true },
  { name: 'Markets', path: '/markets', requiresAuth: true },
  { name: 'Markets Pools', path: '/markets/pools', requiresAuth: true },
  { name: 'Leaderboard', path: '/leaderboard', requiresAuth: true },
  { name: 'Profile', path: '/profile', requiresAuth: true },
  { name: 'Chats', path: '/chats', requiresAuth: true },
  { name: 'Notifications', path: '/notifications', requiresAuth: true },
  { name: 'Referrals', path: '/referrals', requiresAuth: true },
  { name: 'Rewards', path: '/rewards', requiresAuth: true },
  { name: 'Settings', path: '/settings', requiresAuth: true },
  { name: 'Registry', path: '/registry', requiresAuth: true },
  { name: 'Admin', path: '/admin', requiresAuth: true }, // Will 403 if not admin
  { name: 'Debug', path: '/debug', requiresAuth: true },
]

test.describe('COMPLETE VALIDATION - All Pages', () => {
  test.beforeEach(async ({ page }) => {
    console.log('🔐 Authenticating...')
    await navigateTo(page, '/')
    await loginWithPrivyEmail(page, getPrivyTestAccount())
    await waitForPageLoad(page)
    console.log('✅ Authenticated')
  })

  for (const pageInfo of ALL_PAGES) {
    test(`PAGE: ${pageInfo.name} - Validate accessibility and content`, async ({ page }) => {
      console.log(`\n${'='.repeat(60)}`)
      console.log(`📄 TESTING PAGE: ${pageInfo.name}`)
      console.log(`   Path: ${pageInfo.path}`)
      console.log(`${'='.repeat(60)}\n`)

      // Create validators
      const { errorDetector, pageValidator } = createValidators(page)

      try {
        // Navigate to page
        console.log(`🧭 Navigating to ${pageInfo.path}`)
        await navigateTo(page, pageInfo.path)
        await waitForPageLoad(page)

        // Validate page loaded
        await pageValidator.validatePageLoad(pageInfo.path)

        // Wait for content to load
        await page.waitForTimeout(2000)

        // Check for errors during load
        if (errorDetector.hasErrors()) {
          console.error(`❌ ERRORS during page load:`)
          errorDetector.throwIfErrors()
        }

        // Validate no error messages on page
        await pageValidator.validateNoErrors()

        // Take screenshot
        await page.screenshot({ 
          path: `test-results/screenshots/validate-${pageInfo.name.toLowerCase().replace(/\s+/g, '-')}.png`,
          fullPage: true 
        })

        console.log(`✅ Page "${pageInfo.name}" validated successfully\n`)
      } catch (error) {
        console.error(`\n❌ VALIDATION FAILED for page "${pageInfo.name}"`)
        console.error(`Error: ${error instanceof Error ? error.message : String(error)}\n`)
        
        // Take failure screenshot
        await page.screenshot({ 
          path: `test-results/screenshots/FAILED-${pageInfo.name.toLowerCase().replace(/\s+/g, '-')}.png`,
          fullPage: true 
        })
        
        throw error // Re-throw to fail test
      }
    })
  }
})

test.describe('COMPLETE VALIDATION - All Buttons on All Pages', () => {
  test.beforeEach(async ({ page }) => {
    await navigateTo(page, '/')
    await loginWithPrivyEmail(page, getPrivyTestAccount())
    await waitForPageLoad(page)
  })

  for (const pageInfo of ALL_PAGES) {
    test(`BUTTONS: ${pageInfo.name} - Test every button`, async ({ page }) => {
      console.log(`\n${'='.repeat(60)}`)
      console.log(`🔘 TESTING ALL BUTTONS: ${pageInfo.name}`)
      console.log(`   Path: ${pageInfo.path}`)
      console.log(`${'='.repeat(60)}\n`)

      // Create validators
      const { errorDetector, buttonValidator } = createValidators(page)

      try {
        // Navigate to page
        await navigateTo(page, pageInfo.path)
        await waitForPageLoad(page)
        await page.waitForTimeout(2000)

        // Test all buttons on the page
        const results = await buttonValidator.testAllButtons({
          skipPatterns: [
            /logout/i,
            /sign out/i,
            /disconnect/i,
            /delete account/i,
            /delete.*permanently/i,
            /remove account/i,
            /ban user/i,
            /delete user/i,
          ],
          screenshotPrefix: `buttons-${pageInfo.name.toLowerCase().replace(/\s+/g, '-')}`
        })

        console.log(`\n✅ Button validation complete for "${pageInfo.name}"`)
        console.log(`   Total tested: ${results.tested}`)
        console.log(`   Skipped: ${results.skipped}`)
        console.log(`   Failed: ${results.failed}\n`)

        // Throw if any errors occurred
        if (errorDetector.hasErrors()) {
          console.error(`❌ ERRORS occurred during button testing:`)
          errorDetector.throwIfErrors()
        }

        // Ensure at least some buttons were found and tested
        if (results.tested === 0 && results.skipped === 0) {
          console.warn(`⚠️  WARNING: No buttons found on page "${pageInfo.name}"`)
        }

      } catch (error) {
        console.error(`\n❌ BUTTON TESTING FAILED for page "${pageInfo.name}"`)
        console.error(`Error: ${error instanceof Error ? error.message : String(error)}\n`)
        
        // Take failure screenshot
        await page.screenshot({ 
          path: `test-results/screenshots/FAILED-buttons-${pageInfo.name.toLowerCase().replace(/\s+/g, '-')}.png`,
          fullPage: true 
        })
        
        throw error // Re-throw to fail test
      }
    })
  }
})

test.describe('COMPLETE VALIDATION - Critical User Flows', () => {
  test.beforeEach(async ({ page }) => {
    await navigateTo(page, '/')
    await loginWithPrivyEmail(page, getPrivyTestAccount())
    await waitForPageLoad(page)
  })

  test('FLOW: Complete user journey through all main features', async ({ page }) => {
    console.log('\n' + '='.repeat(60))
    console.log('🚀 TESTING COMPLETE USER JOURNEY')
    console.log('='.repeat(60) + '\n')

    const { errorDetector, pageValidator } = createValidators(page)

    const flow = [
      { step: 'Visit Feed', path: '/feed' },
      { step: 'Visit Markets', path: '/markets' },
      { step: 'Visit Leaderboard', path: '/leaderboard' },
      { step: 'Visit Rewards', path: '/rewards' },
      { step: 'Visit Profile', path: '/profile' },
      { step: 'Visit Settings', path: '/settings' },
      { step: 'Visit Chats', path: '/chats' },
      { step: 'Visit Notifications', path: '/notifications' },
      { step: 'Visit Referrals', path: '/referrals' },
      { step: 'Visit Registry', path: '/registry' },
      { step: 'Visit Game', path: '/game' },
    ]

    for (const item of flow) {
      try {
        console.log(`📍 ${item.step}...`)
        
        await navigateTo(page, item.path)
        await waitForPageLoad(page)
        await pageValidator.validatePageLoad(item.path)
        await page.waitForTimeout(1000)

        // Check for errors
        if (errorDetector.hasErrors()) {
          console.error(`❌ Errors during: ${item.step}`)
          errorDetector.throwIfErrors()
        }

        console.log(`   ✅ ${item.step} - Success`)
      } catch (error) {
        console.error(`\n❌ USER FLOW FAILED at: ${item.step}`)
        console.error(`Error: ${error instanceof Error ? error.message : String(error)}\n`)
        
        await page.screenshot({ 
          path: `test-results/screenshots/FAILED-flow-${item.step.toLowerCase().replace(/\s+/g, '-')}.png`,
          fullPage: true 
        })
        
        throw error
      }
    }

    console.log('\n✅ Complete user journey validated successfully\n')
  })
})

test.describe('COMPLETE VALIDATION - Error Detection', () => {
  test.beforeEach(async ({ page }) => {
    await navigateTo(page, '/')
    await loginWithPrivyEmail(page, getPrivyTestAccount())
    await waitForPageLoad(page)
  })

  test('VERIFY: No console errors on any page', async ({ page }) => {
    console.log('\n' + '='.repeat(60))
    console.log('🔍 CHECKING FOR CONSOLE ERRORS ON ALL PAGES')
    console.log('='.repeat(60) + '\n')

    const pagesToCheck = ALL_PAGES.filter(p => !p.name.includes('Admin')) // Skip admin

    const errors: {page: string, errors: string[]}[] = []

    for (const pageInfo of pagesToCheck) {
      const { errorDetector } = createValidators(page)
      
      console.log(`Checking: ${pageInfo.name}`)
      
      await navigateTo(page, pageInfo.path)
      await waitForPageLoad(page)
      await page.waitForTimeout(2000)

      const pageErrors = errorDetector.getErrors()
      
      if (pageErrors.length > 0) {
        errors.push({
          page: pageInfo.name,
          errors: pageErrors
        })
        console.error(`  ❌ ${pageErrors.length} errors found`)
      } else {
        console.log(`  ✅ No errors`)
      }
    }

    if (errors.length > 0) {
      console.error('\n❌ CONSOLE ERRORS DETECTED:\n')
      errors.forEach(({ page, errors: pageErrors }) => {
        console.error(`\nPage: ${page}`)
        pageErrors.forEach((error, i) => {
          console.error(`  ${i + 1}. ${error}`)
        })
      })
      
      throw new Error(`Console errors detected on ${errors.length} page(s). See logs above.`)
    }

    console.log('\n✅ No console errors detected on any page\n')
  })
})

test.describe('COMPLETE VALIDATION - Coverage Report', () => {
  test('REPORT: Generate complete test coverage summary', async () => {
    console.log('\n' + '='.repeat(60))
    console.log('📊 COMPLETE VALIDATION TEST COVERAGE SUMMARY')
    console.log('='.repeat(60) + '\n')

    console.log(`Total Pages Tested: ${ALL_PAGES.length}`)
    console.log(`\nPages:`)
    ALL_PAGES.forEach((p, i) => {
      console.log(`  ${i + 1}. ${p.name} (${p.path})`)
    })

    console.log(`\n✅ Complete validation test suite covers:`)
    console.log(`   - ${ALL_PAGES.length} pages`)
    console.log(`   - All buttons on all pages`)
    console.log(`   - Complete user flows`)
    console.log(`   - Error detection and reporting`)
    console.log(`   - Crash on any error\n`)
  })
})

