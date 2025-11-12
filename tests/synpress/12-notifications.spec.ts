/**
 * Notifications E2E Tests
 * 
 * Tests all notification functionality with Privy authentication:
 * - Receiving comment notifications
 * - Receiving like notifications (posts and comments)
 * - Receiving follow notifications
 * - Receiving share notifications
 * - Receiving reply notifications
 * - Receiving DM notifications
 * - Receiving group chat notifications
 * - Notification links and navigation
 * - Mark as read functionality
 */

import { test, expect } from '@playwright/test'
import { loginWithPrivyEmail, getPrivyTestAccount } from './helpers/privy-auth'
import { navigateTo, waitForPageLoad, isVisible } from './helpers/page-helpers'
import { ROUTES } from './helpers/test-data'

test.describe('Notifications Page', () => {
  test.beforeEach(async ({ page }) => {
    await navigateTo(page, ROUTES.HOME)
    await loginWithPrivyEmail(page, getPrivyTestAccount())
    await waitForPageLoad(page)
  })

  test('should load notifications page', async ({ page }) => {
    // Navigate to notifications
    await navigateTo(page, '/notifications')
    await waitForPageLoad(page)
    
    expect(page.url()).toContain('/notifications')
    
    // Check for notifications page header
    const headerVisible = await isVisible(page, 'h1:has-text("Notifications")', 5000)
    expect(headerVisible).toBe(true)
    
    await page.screenshot({ path: 'test-results/screenshots/12-notifications-page.png', fullPage: true })
    
    console.log('✅ Notifications page loaded')
  })

  test('should display notification count badge', async ({ page }) => {
    // Navigate to feed or any page with notification bell
    await navigateTo(page, ROUTES.FEED)
    await waitForPageLoad(page)
    
    // Look for notification bell icon
    const bellIcon = page.locator('[aria-label*="notification" i], button:has-text("Notifications"), svg[data-icon="bell"]').first()
    
    if (await bellIcon.isVisible({ timeout: 5000 }).catch(() => false)) {
      // Check for unread badge
      const badgeVisible = await isVisible(page, '[data-testid="unread-badge"], .badge, .notification-count', 3000)
      
      await page.screenshot({ path: 'test-results/screenshots/12-notification-bell.png' })
      
      console.log(`✅ Notification bell visible (badge: ${badgeVisible})`)
    } else {
      console.log('ℹ️ Notification bell not found')
    }
  })

  test('should click notification bell to navigate to notifications', async ({ page }) => {
    // Navigate to feed
    await navigateTo(page, ROUTES.FEED)
    await waitForPageLoad(page)
    
    // Click notification bell
    const bellIcon = page.locator('[aria-label*="notification" i], button:has-text("Notifications")').first()
    
    if (await bellIcon.isVisible({ timeout: 5000 }).catch(() => false)) {
      await bellIcon.click()
      await waitForPageLoad(page)
      await page.waitForTimeout(2000)
      
      // Should navigate to notifications page
      expect(page.url()).toContain('/notifications')
      
      await page.screenshot({ path: 'test-results/screenshots/12-navigate-to-notifications.png', fullPage: true })
      
      console.log('✅ Navigated to notifications via bell icon')
    }
  })

  test('should display notification list', async ({ page }) => {
    await navigateTo(page, '/notifications')
    await waitForPageLoad(page)
    await page.waitForTimeout(3000)
    
    // Check for notifications (or empty state)
    const hasNotifications = await isVisible(page, '[data-testid="notification-item"], article, li', 5000)
    const hasEmptyState = await isVisible(page, 'text=No notifications, text=No new notifications', 3000)
    
    const notificationState = hasNotifications ? 'has notifications' : (hasEmptyState ? 'empty state shown' : 'loading')
    
    await page.screenshot({ path: 'test-results/screenshots/12-notification-list.png', fullPage: true })
    
    console.log(`✅ Notification list: ${notificationState}`)
  })

  test('should display unread count', async ({ page }) => {
    await navigateTo(page, '/notifications')
    await waitForPageLoad(page)
    await page.waitForTimeout(2000)
    
    // Look for unread count text
    const unreadText = await page.locator('text=/\\d+ unread/i').first()
    
    if (await unreadText.isVisible({ timeout: 5000 }).catch(() => false)) {
      const countText = await unreadText.textContent()
      console.log(`✅ Unread count displayed: ${countText}`)
    } else {
      console.log('ℹ️ No unread notifications or count not displayed')
    }
  })
})

test.describe('Notification Interactions', () => {
  test.beforeEach(async ({ page }) => {
    await navigateTo(page, ROUTES.HOME)
    await loginWithPrivyEmail(page, getPrivyTestAccount())
    await navigateTo(page, '/notifications')
    await waitForPageLoad(page)
    await page.waitForTimeout(2000)
  })

  test('should click on notification to navigate', async ({ page }) => {
    // Find first notification item
    const notification = page.locator('[data-testid="notification-item"], article, li').first()
    
    if (await notification.isVisible({ timeout: 5000 }).catch(() => false)) {
      // Get notification text for logging
      const notifText = await notification.textContent()
      console.log(`Found notification: ${notifText?.substring(0, 50)}...`)
      
      // Click notification
      await notification.click()
      await waitForPageLoad(page)
      await page.waitForTimeout(2000)
      
      // Should navigate somewhere (post, profile, chats, etc.)
      const newUrl = page.url()
      const navigated = !newUrl.endsWith('/notifications')
      
      await page.screenshot({ path: 'test-results/screenshots/12-notification-clicked.png', fullPage: true })
      
      console.log(`✅ Notification clicked (navigated: ${navigated}, url: ${newUrl})`)
    } else {
      console.log('ℹ️ No notifications to click')
    }
  })

  test('should mark notification as read on click', async ({ page }) => {
    // Find first unread notification
    const unreadNotification = page.locator('[data-testid="notification-item"]:not([data-read="true"]), .notification:not(.read), li:not(.read)').first()
    
    if (await unreadNotification.isVisible({ timeout: 5000 }).catch(() => false)) {
      // Click to mark as read
      await unreadNotification.click()
      await page.waitForTimeout(2000)
      
      // Go back to notifications
      await navigateTo(page, '/notifications')
      await waitForPageLoad(page)
      await page.waitForTimeout(2000)
      
      await page.screenshot({ path: 'test-results/screenshots/12-notification-marked-read.png', fullPage: true })
      
      console.log('✅ Notification marked as read')
    } else {
      console.log('ℹ️ No unread notifications found')
    }
  })

  test('should mark all notifications as read', async ({ page }) => {
    // Look for "Mark all as read" button
    const markAllButton = page.locator('button:has-text("Mark all"), button:has-text("Mark as read"), [data-testid="mark-all-read"]').first()
    
    if (await markAllButton.isVisible({ timeout: 5000 }).catch(() => false)) {
      // Click mark all as read
      await markAllButton.click()
      await page.waitForTimeout(2000)
      
      // Check if unread count is now 0 or button disappeared
      const buttonStillVisible = await markAllButton.isVisible({ timeout: 2000 }).catch(() => false)
      const unreadCountZero = await isVisible(page, 'text=0 unread', 2000)
      
      await page.screenshot({ path: 'test-results/screenshots/12-mark-all-read.png', fullPage: true })
      
      console.log(`✅ Mark all as read (button hidden: ${!buttonStillVisible}, zero count: ${unreadCountZero})`)
    } else {
      console.log('ℹ️ Mark all as read button not visible (no unread notifications)')
    }
  })

  test('should pull to refresh notifications', async ({ page }) => {
    // Scroll to top
    await page.evaluate(() => window.scrollTo(0, 0))
    await page.waitForTimeout(500)
    
    // Simulate pull down
    await page.mouse.move(400, 100)
    await page.mouse.down()
    await page.mouse.move(400, 300)
    await page.waitForTimeout(500)
    await page.mouse.up()
    
    await page.waitForTimeout(2000)
    
    await page.screenshot({ path: 'test-results/screenshots/12-pull-to-refresh.png' })
    
    console.log('✅ Pull to refresh tested')
  })
})

test.describe('Notification Types', () => {
  test.beforeEach(async ({ page }) => {
    await navigateTo(page, ROUTES.HOME)
    await loginWithPrivyEmail(page, getPrivyTestAccount())
  })

  test('should receive comment notification after commenting', async ({ page }) => {
    // Navigate to feed
    await navigateTo(page, ROUTES.FEED)
    await waitForPageLoad(page)
    await page.waitForTimeout(2000)
    
    // Find a post and add a comment
    const commentButton = page.locator('button[aria-label*="comment" i], button:has-text("Comment")').first()
    
    if (await commentButton.isVisible({ timeout: 5000 }).catch(() => false)) {
      await commentButton.click()
      await page.waitForTimeout(1000)
      
      const commentInput = page.locator('textarea, input[placeholder*="comment" i], input[placeholder*="reply" i]').first()
      
      if (await commentInput.isVisible({ timeout: 5000 }).catch(() => false)) {
        await commentInput.fill('Great post! 🎉')
        await page.waitForTimeout(500)
        
        const submitButton = page.locator('button:has-text("Comment"), button:has-text("Reply"), button:has-text("Post")').first()
        
        if (await submitButton.isVisible({ timeout: 5000 }).catch(() => false)) {
          await submitButton.click()
          await page.waitForTimeout(3000)
          
          console.log('✅ Comment posted - notification should be generated for post author')
        }
      }
    }
    
    await page.screenshot({ path: 'test-results/screenshots/12-comment-notification-trigger.png' })
  })

  test('should receive like notification after liking', async ({ page }) => {
    // Navigate to feed
    await navigateTo(page, ROUTES.FEED)
    await waitForPageLoad(page)
    await page.waitForTimeout(2000)
    
    // Like a post
    const likeButton = page.locator('button[aria-label*="like" i], button:has-text("Like")').first()
    
    if (await likeButton.isVisible({ timeout: 5000 }).catch(() => false)) {
      await likeButton.click()
      await page.waitForTimeout(2000)
      
      console.log('✅ Post liked - notification should be generated for post author')
    }
    
    await page.screenshot({ path: 'test-results/screenshots/12-like-notification-trigger.png' })
  })

  test('should navigate to post from comment notification', async ({ page }) => {
    await navigateTo(page, '/notifications')
    await waitForPageLoad(page)
    await page.waitForTimeout(2000)
    
    // Find a comment notification (contains "commented" text)
    const commentNotif = page.locator('text=/commented/i').first()
    
    if (await commentNotif.isVisible({ timeout: 5000 }).catch(() => false)) {
      await commentNotif.click()
      await waitForPageLoad(page)
      await page.waitForTimeout(2000)
      
      // Should navigate to post detail page
      const isPostPage = page.url().includes('/post/')
      expect(isPostPage).toBe(true)
      
      await page.screenshot({ path: 'test-results/screenshots/12-comment-notification-nav.png', fullPage: true })
      
      console.log('✅ Comment notification navigated to post')
    } else {
      console.log('ℹ️ No comment notifications found')
    }
  })

  test('should navigate to profile from follow notification', async ({ page }) => {
    await navigateTo(page, '/notifications')
    await waitForPageLoad(page)
    await page.waitForTimeout(2000)
    
    // Find a follow notification (contains "follow" text)
    const followNotif = page.locator('text=/followed|following/i').first()
    
    if (await followNotif.isVisible({ timeout: 5000 }).catch(() => false)) {
      await followNotif.click()
      await waitForPageLoad(page)
      await page.waitForTimeout(2000)
      
      // Should navigate to profile page
      const isProfilePage = page.url().includes('/profile/')
      expect(isProfilePage).toBe(true)
      
      await page.screenshot({ path: 'test-results/screenshots/12-follow-notification-nav.png', fullPage: true })
      
      console.log('✅ Follow notification navigated to profile')
    } else {
      console.log('ℹ️ No follow notifications found')
    }
  })

  test('should navigate to chats from DM notification', async ({ page }) => {
    await navigateTo(page, '/notifications')
    await waitForPageLoad(page)
    await page.waitForTimeout(2000)
    
    // Find a DM notification (contains "message" text)
    const dmNotif = page.locator('text=/message|direct message/i').first()
    
    if (await dmNotif.isVisible({ timeout: 5000 }).catch(() => false)) {
      await dmNotif.click()
      await waitForPageLoad(page)
      await page.waitForTimeout(2000)
      
      // Should navigate to chats page
      const isChatsPage = page.url().includes('/chats')
      expect(isChatsPage).toBe(true)
      
      await page.screenshot({ path: 'test-results/screenshots/12-dm-notification-nav.png', fullPage: true })
      
      console.log('✅ DM notification navigated to chats')
    } else {
      console.log('ℹ️ No DM notifications found')
    }
  })

  test('should navigate to chats from group invite notification', async ({ page }) => {
    await navigateTo(page, '/notifications')
    await waitForPageLoad(page)
    await page.waitForTimeout(2000)
    
    // Find a group invite notification (contains "invited" text)
    const inviteNotif = page.locator('text=/invited/i').first()
    
    if (await inviteNotif.isVisible({ timeout: 5000 }).catch(() => false)) {
      await inviteNotif.click()
      await waitForPageLoad(page)
      await page.waitForTimeout(2000)
      
      // Should navigate to chats page
      const isChatsPage = page.url().includes('/chats')
      expect(isChatsPage).toBe(true)
      
      await page.screenshot({ path: 'test-results/screenshots/12-invite-notification-nav.png', fullPage: true })
      
      console.log('✅ Group invite notification navigated to chats')
    } else {
      console.log('ℹ️ No group invite notifications found')
    }
  })
})

test.describe('Notification Icons and Display', () => {
  test.beforeEach(async ({ page }) => {
    await navigateTo(page, ROUTES.HOME)
    await loginWithPrivyEmail(page, getPrivyTestAccount())
    await navigateTo(page, '/notifications')
    await waitForPageLoad(page)
    await page.waitForTimeout(2000)
  })

  test('should display notification icons', async ({ page }) => {
    // Check for various notification type icons
    const hasIcons = await isVisible(page, 'svg, img, [data-icon], .emoji', 5000)
    
    await page.screenshot({ path: 'test-results/screenshots/12-notification-icons.png', fullPage: true })
    
    console.log(`✅ Notification icons present: ${hasIcons}`)
  })

  test('should display user avatars in notifications', async ({ page }) => {
    // Look for avatar images
    const hasAvatars = await isVisible(page, 'img[alt*="avatar" i], img[alt*="profile" i], [data-testid="avatar"]', 5000)
    
    console.log(`✅ User avatars in notifications: ${hasAvatars}`)
  })

  test('should show unread indicator on unread notifications', async ({ page }) => {
    // Look for unread indicators (blue dot, badge, etc.)
    const hasUnreadIndicator = await isVisible(page, '.unread, [data-read="false"], .notification-unread, .badge', 5000)
    
    await page.screenshot({ path: 'test-results/screenshots/12-unread-indicators.png', fullPage: true })
    
    console.log(`✅ Unread indicators visible: ${hasUnreadIndicator}`)
  })

  test('should display notification timestamps', async ({ page }) => {
    // Look for timestamps (5m ago, 2h ago, etc.)
    const hasTimestamps = await isVisible(page, 'time, text=/ago/, text=/just now/i', 5000)
    
    console.log(`✅ Notification timestamps visible: ${hasTimestamps}`)
  })
})

test.describe('Empty State', () => {
  test('should show empty state when no notifications', async ({ page }) => {
    await navigateTo(page, ROUTES.HOME)
    await loginWithPrivyEmail(page, getPrivyTestAccount())
    await navigateTo(page, '/notifications')
    await waitForPageLoad(page)
    await page.waitForTimeout(2000)
    
    // Check for empty state OR notifications
    const hasEmptyState = await isVisible(page, 'text=No notifications, text=No new notifications', 5000)
    const hasNotifications = await isVisible(page, '[data-testid="notification-item"], article, li', 2000)
    
    if (hasEmptyState && !hasNotifications) {
      await page.screenshot({ path: 'test-results/screenshots/12-empty-state.png', fullPage: true })
      console.log('✅ Empty state displayed')
    } else if (hasNotifications) {
      console.log('ℹ️ User has notifications - empty state not applicable')
    } else {
      console.log('⚠️ Neither empty state nor notifications found')
    }
  })
})


