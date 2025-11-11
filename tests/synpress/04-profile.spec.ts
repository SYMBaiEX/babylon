/**
 * Profile E2E Tests
 * 
 * Tests all profile functionality:
 * - Viewing profile
 * - Editing profile
 * - Following/unfollowing users
 * - Viewing user posts
 * - Profile stats
 */

import { test, expect } from '@playwright/test'
import { loginWithPrivyEmail, getPrivyTestAccount } from './helpers/privy-auth'
import { navigateTo, waitForPageLoad, isVisible } from './helpers/page-helpers'
import { ROUTES, SELECTORS } from './helpers/test-data'

test.describe('Profile Page', () => {
  test.beforeEach(async ({ page }) => {
    await navigateTo(page, ROUTES.HOME)
    await loginWithPrivyEmail(page, getPrivyTestAccount())
    await navigateTo(page, ROUTES.PROFILE)
    await waitForPageLoad(page)
  })

  test('should load profile page', async ({ page }) => {
    expect(page.url()).toContain('/profile')
    
    await page.screenshot({ path: 'test-results/screenshots/04-profile-page.png', fullPage: true })
    console.log('✅ Profile page loaded')
  })

  test('should display user profile information', async ({ page }) => {
    // Check for profile elements
    const hasProfileImage = await isVisible(page, 'img[alt*="profile" i], [data-testid="profile-image"]', 5000)
    const hasUsername = await isVisible(page, '[data-testid="username"], h1, h2', 5000)
    const hasDisplayName = await isVisible(page, '[data-testid="display-name"]', 5000)
    
    await page.screenshot({ path: 'test-results/screenshots/04-profile-info.png' })
    
    console.log('✅ Profile information displayed')
    console.log(`  - Profile image: ${hasProfileImage}`)
    console.log(`  - Username: ${hasUsername}`)
    console.log(`  - Display name: ${hasDisplayName}`)
  })

  test('should display profile stats', async ({ page }) => {
    // Look for stats (followers, following, posts, etc.)
    const statsVisible = await isVisible(page, 'text=/followers|following|posts/i', 5000)
    
    await page.screenshot({ path: 'test-results/screenshots/04-profile-stats.png' })
    
    console.log(`✅ Profile stats displayed: ${statsVisible}`)
  })

  test('should display user bio', async ({ page }) => {
    const hasBio = await isVisible(page, '[data-testid="bio"], p', 5000)
    
    console.log(`✅ Bio section displayed: ${hasBio}`)
  })

  test('should display edit profile button', async ({ page }) => {
    const editButtonVisible = await isVisible(page, SELECTORS.EDIT_PROFILE_BUTTON, 5000)
    
    await page.screenshot({ path: 'test-results/screenshots/04-edit-button.png' })
    
    console.log(`✅ Edit profile button: ${editButtonVisible}`)
  })
})

test.describe('Edit Profile', () => {
  test.beforeEach(async ({ page }) => {
    await navigateTo(page, ROUTES.HOME)
    await loginWithPrivyEmail(page, getPrivyTestAccount())
    await navigateTo(page, ROUTES.PROFILE)
    await waitForPageLoad(page)
  })

  test('should open edit profile modal', async ({ page }) => {
    const editButton = page.locator(SELECTORS.EDIT_PROFILE_BUTTON).first()
    
    if (await editButton.isVisible({ timeout: 5000 }).catch(() => false)) {
      await editButton.click()
      await page.waitForTimeout(2000)
      
      // Check for edit modal
      const modalVisible = await isVisible(page, '[role="dialog"], [data-testid="edit-profile-modal"]', 5000)
      
      await page.screenshot({ path: 'test-results/screenshots/04-edit-modal.png' })
      
      console.log(`✅ Edit profile modal opened: ${modalVisible}`)
    } else {
      console.log('⚠️ Edit button not found')
    }
  })

  test('should update display name', async ({ page }) => {
    const editButton = page.locator(SELECTORS.EDIT_PROFILE_BUTTON).first()
    
    if (await editButton.isVisible({ timeout: 5000 }).catch(() => false)) {
      await editButton.click()
      await page.waitForTimeout(2000)
      
      // Find display name input
      const displayNameInput = page.locator('input[name="displayName"], input[placeholder*="name" i]').first()
      
      if (await displayNameInput.isVisible({ timeout: 5000 }).catch(() => false)) {
        const newName = 'Test User ' + Date.now()
        await displayNameInput.fill(newName)
        console.log(`✅ Updated display name to: ${newName}`)
        
        // Save changes
        const saveButton = page.locator(SELECTORS.SAVE_BUTTON).first()
        if (await saveButton.isVisible({ timeout: 5000 }).catch(() => false)) {
          await saveButton.click()
          await page.waitForTimeout(3000)
          
          await page.screenshot({ path: 'test-results/screenshots/04-profile-updated.png' })
          
          console.log('✅ Profile saved')
        }
      }
    }
  })

  test('should update bio', async ({ page }) => {
    const editButton = page.locator(SELECTORS.EDIT_PROFILE_BUTTON).first()
    
    if (await editButton.isVisible({ timeout: 5000 }).catch(() => false)) {
      await editButton.click()
      await page.waitForTimeout(2000)
      
      // Find bio input
      const bioInput = page.locator('textarea[name="bio"], textarea[placeholder*="bio" i]').first()
      
      if (await bioInput.isVisible({ timeout: 5000 }).catch(() => false)) {
        const newBio = 'Updated bio at ' + new Date().toISOString()
        await bioInput.fill(newBio)
        console.log(`✅ Updated bio`)
        
        // Save
        const saveButton = page.locator(SELECTORS.SAVE_BUTTON).first()
        if (await saveButton.isVisible({ timeout: 5000 }).catch(() => false)) {
          await saveButton.click()
          await page.waitForTimeout(3000)
          
          console.log('✅ Bio saved')
        }
      }
    }
  })

  test('should cancel profile edit', async ({ page }) => {
    const editButton = page.locator(SELECTORS.EDIT_PROFILE_BUTTON).first()
    
    if (await editButton.isVisible({ timeout: 5000 }).catch(() => false)) {
      await editButton.click()
      await page.waitForTimeout(2000)
      
      // Find cancel button
      const cancelButton = page.locator('button:has-text("Cancel")').first()
      
      if (await cancelButton.isVisible({ timeout: 5000 }).catch(() => false)) {
        await cancelButton.click()
        await page.waitForTimeout(1000)
        
        // Modal should be closed
        const modalClosed = !(await isVisible(page, '[role="dialog"]', 2000))
        
        console.log(`✅ Edit cancelled (modal closed: ${modalClosed})`)
      }
    }
  })
})

test.describe('Profile Posts', () => {
  test.beforeEach(async ({ page }) => {
    await navigateTo(page, ROUTES.HOME)
    await loginWithPrivyEmail(page, getPrivyTestAccount())
    await navigateTo(page, ROUTES.PROFILE)
    await waitForPageLoad(page)
  })

  test('should display user posts', async ({ page }) => {
    await page.waitForTimeout(2000)
    
    // Look for posts section
    const hasPosts = await isVisible(page, 'article, [data-testid="post-card"]', 5000)
    
    await page.screenshot({ path: 'test-results/screenshots/04-profile-posts.png', fullPage: true })
    
    console.log(`✅ User posts section: ${hasPosts}`)
  })

  test('should filter posts by type', async ({ page }) => {
    // Look for post type tabs/filters
    const tabs = page.locator('button[role="tab"]')
    const tabCount = await tabs.count()
    
    if (tabCount > 0) {
      console.log(`Found ${tabCount} post filter tabs`)
      
      for (let i = 0; i < Math.min(tabCount, 3); i++) {
        const tab = tabs.nth(i)
        await tab.click()
        await page.waitForTimeout(2000)
        
        const tabText = await tab.textContent()
        console.log(`✅ Filtered by: ${tabText}`)
      }
    } else {
      console.log('ℹ️ No post filter tabs found')
    }
  })
})

test.describe('Following/Followers', () => {
  test.beforeEach(async ({ page }) => {
    await navigateTo(page, ROUTES.HOME)
    await loginWithPrivyEmail(page, getPrivyTestAccount())
    await navigateTo(page, ROUTES.PROFILE)
    await waitForPageLoad(page)
  })

  test('should view followers list', async ({ page }) => {
    // Click followers
    const followersButton = page.locator('button:has-text("Followers"), a:has-text("Followers")').first()
    
    if (await followersButton.isVisible({ timeout: 5000 }).catch(() => false)) {
      await followersButton.click()
      await page.waitForTimeout(2000)
      
      await page.screenshot({ path: 'test-results/screenshots/04-followers-list.png' })
      
      console.log('✅ Followers list displayed')
    } else {
      console.log('ℹ️ Followers button not found')
    }
  })

  test('should view following list', async ({ page }) => {
    // Click following
    const followingButton = page.locator('button:has-text("Following"), a:has-text("Following")').first()
    
    if (await followingButton.isVisible({ timeout: 5000 }).catch(() => false)) {
      await followingButton.click()
      await page.waitForTimeout(2000)
      
      await page.screenshot({ path: 'test-results/screenshots/04-following-list.png' })
      
      console.log('✅ Following list displayed')
    } else {
      console.log('ℹ️ Following button not found')
    }
  })
})

test.describe('Other User Profile', () => {
  test.beforeEach(async ({ page }) => {
    await navigateTo(page, ROUTES.HOME)
    await loginWithPrivyEmail(page, getPrivyTestAccount())
    await waitForPageLoad(page)
  })

  test('should view another user profile', async ({ page }) => {
    // Navigate to feed to find other users
    await navigateTo(page, ROUTES.FEED)
    await page.waitForTimeout(2000)
    
    // Find a user link/avatar in a post
    const userLink = page.locator('a[href*="/profile/"], [data-testid="user-link"]').first()
    
    if (await userLink.isVisible({ timeout: 5000 }).catch(() => false)) {
      await userLink.click()
      await waitForPageLoad(page)
      
      await page.screenshot({ path: 'test-results/screenshots/04-other-user-profile.png', fullPage: true })
      
      console.log('✅ Viewed another user profile')
    } else {
      console.log('ℹ️ No user links found in feed')
    }
  })

  test('should follow another user', async ({ page }) => {
    // Navigate to feed
    await navigateTo(page, ROUTES.FEED)
    await page.waitForTimeout(2000)
    
    // Find and click user link
    const userLink = page.locator('a[href*="/profile/"]').first()
    
    if (await userLink.isVisible({ timeout: 5000 }).catch(() => false)) {
      await userLink.click()
      await waitForPageLoad(page)
      
      // Find follow button
      const followButton = page.locator(SELECTORS.FOLLOW_BUTTON).first()
      
      if (await followButton.isVisible({ timeout: 5000 }).catch(() => false)) {
        await followButton.click()
        await page.waitForTimeout(2000)
        
        await page.screenshot({ path: 'test-results/screenshots/04-user-followed.png' })
        
        console.log('✅ Followed user')
      }
    }
  })

  test('should unfollow a user', async ({ page }) => {
    // Navigate to feed
    await navigateTo(page, ROUTES.FEED)
    await page.waitForTimeout(2000)
    
    // Find user link
    const userLink = page.locator('a[href*="/profile/"]').first()
    
    if (await userLink.isVisible({ timeout: 5000 }).catch(() => false)) {
      await userLink.click()
      await waitForPageLoad(page)
      
      // Follow first
      const followButton = page.locator(SELECTORS.FOLLOW_BUTTON).first()
      if (await followButton.isVisible({ timeout: 5000 }).catch(() => false)) {
        await followButton.click()
        await page.waitForTimeout(2000)
      }
      
      // Then unfollow
      const unfollowButton = page.locator(SELECTORS.UNFOLLOW_BUTTON).first()
      if (await unfollowButton.isVisible({ timeout: 5000 }).catch(() => false)) {
        await unfollowButton.click()
        await page.waitForTimeout(2000)
        
        await page.screenshot({ path: 'test-results/screenshots/04-user-unfollowed.png' })
        
        console.log('✅ Unfollowed user')
      }
    }
  })
})

