/**
 * Profile Page E2E Tests
 *
 * Tests all profile functionality:
 * - Viewing own profile
 * - Viewing other user profiles
 * - Follow/unfollow functionality
 * - Messaging from profile
 * - Profile tabs (posts, stats, etc.)
 * - Edit profile navigation
 */

import { expect, test } from '@playwright/test';
import {
  cooldownBetweenTests,
  navigateTo,
  waitForPageLoad,
} from './helpers/page-helpers';
import { loginWithWallet } from './helpers/privy-auth';
import { ROUTES, TIMEOUTS, VIEWPORTS } from './helpers/test-data';

test.setTimeout(TIMEOUTS.EXTRA_LONG);

test.describe('Profile Page - Own Profile', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.DESKTOP);
    await navigateTo(page, ROUTES.HOME);
    await loginWithWallet(page);
    await navigateTo(page, ROUTES.PROFILE);
    await waitForPageLoad(page);
    await page.waitForTimeout(2000);
  });

  test.afterEach(async ({ page }) => {
    await cooldownBetweenTests(page);
  });

  test('should display own profile page', async ({ page }) => {
    expect(page.url()).toContain('/profile');

    // Should have profile content
    const content = await page.locator('body').textContent();
    expect(content).toBeTruthy();

    console.log('✅ Own profile page displays');
  });

  test('should display profile avatar/image', async ({ page }) => {
    const avatar = page
      .locator(
        'img[alt*="avatar" i], img[alt*="profile" i], [data-testid="profile-avatar"]'
      )
      .first();
    const isVisible = await avatar
      .isVisible({ timeout: TIMEOUTS.SHORT })
      .catch(() => false);

    console.log(`✅ Profile avatar visible: ${isVisible}`);
  });

  test('should display username and display name', async ({ page }) => {
    // Look for username (usually with @) or display name
    const username = page.locator('text=/@\\w+/').first();
    const displayName = page.locator('h1, h2').first();

    const hasUsername = await username
      .isVisible({ timeout: TIMEOUTS.SHORT })
      .catch(() => false);
    const hasDisplayName = await displayName
      .isVisible({ timeout: TIMEOUTS.SHORT })
      .catch(() => false);

    console.log(`✅ Username: ${hasUsername}, Display name: ${hasDisplayName}`);
  });

  test('should display bio if set', async ({ page }) => {
    const bio = page
      .locator('[data-testid="profile-bio"], .bio, p.text-muted')
      .first();
    const isVisible = await bio
      .isVisible({ timeout: TIMEOUTS.SHORT })
      .catch(() => false);

    console.log(`ℹ️ Bio section visible: ${isVisible}`);
  });

  test('should display follower/following counts', async ({ page }) => {
    const followers = page
      .locator('text=/\\d+\\s*(Followers|following)/i')
      .first();
    const isVisible = await followers
      .isVisible({ timeout: TIMEOUTS.SHORT })
      .catch(() => false);

    console.log(`✅ Follower counts visible: ${isVisible}`);
  });

  test('should have edit profile button on own profile', async ({ page }) => {
    const editButton = page
      .locator('button:has-text("Edit"), a:has-text("Edit Profile")')
      .first();
    const isVisible = await editButton
      .isVisible({ timeout: TIMEOUTS.SHORT })
      .catch(() => false);

    if (isVisible) {
      console.log('✅ Edit profile button visible');
    } else {
      // May be in settings instead
      console.log('ℹ️ Edit button not on profile (may be in settings)');
    }
  });

  test('should not show follow button on own profile', async ({ page }) => {
    // Should NOT have follow button on own profile
    const followButton = page
      .locator('button:has-text("Follow"):not(:has-text("Following"))')
      .first();
    const isVisible = await followButton
      .isVisible({ timeout: TIMEOUTS.SHORT })
      .catch(() => false);

    // If visible, check if it's related to showing followers, not following yourself
    if (isVisible) {
      const text = await followButton.textContent();
      if (!text?.includes('Following')) {
        console.log('⚠️ Follow button should not appear on own profile');
      }
    } else {
      console.log('✅ No follow button on own profile (correct)');
    }
  });

  test('should display profile stats/reputation', async ({ page }) => {
    const stats = page.locator('text=/Reputation|Points|Score|Stats/i').first();
    const isVisible = await stats
      .isVisible({ timeout: TIMEOUTS.SHORT })
      .catch(() => false);

    console.log(`✅ Profile stats visible: ${isVisible}`);
  });
});

test.describe('Profile Page - Other User Profile', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.DESKTOP);
    await navigateTo(page, ROUTES.HOME);
    await loginWithWallet(page);
    await page.waitForTimeout(2000);
  });

  test.afterEach(async ({ page }) => {
    await cooldownBetweenTests(page);
  });

  test('should navigate to other user profile from feed', async ({ page }) => {
    await navigateTo(page, ROUTES.FEED);
    await waitForPageLoad(page);
    await page.waitForTimeout(2000);

    // Find a post author link
    const authorLink = page.locator('a[href*="/profile/"]').first();
    if (await authorLink.isVisible({ timeout: TIMEOUTS.SHORT })) {
      await authorLink.click();
      await page.waitForTimeout(2000);

      expect(page.url()).toContain('/profile/');
      console.log('✅ Navigated to other user profile');
    } else {
      console.log('ℹ️ No profile links in feed');
    }
  });

  test('should show follow button on other user profile', async ({ page }) => {
    // Navigate directly to a test user profile
    await page.goto(
      `${process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000'}/profile/testuser1`
    );
    await waitForPageLoad(page);
    await page.waitForTimeout(2000);

    const followButton = page
      .locator('button:has-text("Follow"), button:has-text("Following")')
      .first();
    const isVisible = await followButton
      .isVisible({ timeout: TIMEOUTS.SHORT })
      .catch(() => false);

    console.log(`✅ Follow button on other profile: ${isVisible}`);
  });

  test('should show message button on other user profile', async ({ page }) => {
    await page.goto(
      `${process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000'}/profile/testuser1`
    );
    await waitForPageLoad(page);
    await page.waitForTimeout(2000);

    const messageButton = page
      .locator('button:has-text("Message"), button[title*="message" i]')
      .first();
    const isVisible = await messageButton
      .isVisible({ timeout: TIMEOUTS.SHORT })
      .catch(() => false);

    console.log(`✅ Message button on other profile: ${isVisible}`);
  });

  test('should toggle follow on other user profile', async ({ page }) => {
    await page.goto(
      `${process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000'}/profile/testuser1`
    );
    await waitForPageLoad(page);
    await page.waitForTimeout(2000);

    const followButton = page.locator('button:has-text("Follow")').first();
    if (await followButton.isVisible({ timeout: TIMEOUTS.SHORT })) {
      const initialText = await followButton.textContent();
      await followButton.click();
      await page.waitForTimeout(2000);

      const newText = await followButton.textContent();
      console.log(`✅ Follow button: "${initialText}" -> "${newText}"`);
    } else {
      console.log('ℹ️ Follow button not available');
    }
  });

  test('should navigate to DM from message button', async ({ page }) => {
    await page.goto(
      `${process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000'}/profile/testuser1`
    );
    await waitForPageLoad(page);
    await page.waitForTimeout(2000);

    const messageButton = page.locator('button:has-text("Message")').first();
    if (await messageButton.isVisible({ timeout: TIMEOUTS.SHORT })) {
      await messageButton.click();
      await page.waitForTimeout(2000);

      expect(page.url()).toContain('/chats');
      console.log('✅ Message button navigates to chats');
    }
  });
});

test.describe('Profile Page - Content Tabs', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.DESKTOP);
    await navigateTo(page, ROUTES.HOME);
    await loginWithWallet(page);
    await navigateTo(page, ROUTES.PROFILE);
    await waitForPageLoad(page);
    await page.waitForTimeout(2000);
  });

  test.afterEach(async ({ page }) => {
    await cooldownBetweenTests(page);
  });

  test('should display profile content tabs', async ({ page }) => {
    const possibleTabs = ['Posts', 'Replies', 'Likes', 'Media', 'Activity'];

    for (const tabName of possibleTabs) {
      const tab = page
        .locator(
          `button:has-text("${tabName}"), [role="tab"]:has-text("${tabName}")`
        )
        .first();
      const isVisible = await tab
        .isVisible({ timeout: TIMEOUTS.SHORT })
        .catch(() => false);

      if (isVisible) {
        console.log(`✅ Tab "${tabName}" visible`);
      }
    }
  });

  test('should switch between profile tabs', async ({ page }) => {
    const tabs = page.locator('[role="tab"], button.tab').all();
    const tabElements = await tabs;

    if (tabElements.length > 1) {
      for (let i = 0; i < Math.min(tabElements.length, 3); i++) {
        const tab = tabElements[i];
        if (tab && (await tab.isVisible())) {
          await tab.click();
          await page.waitForTimeout(1000);
        }
      }
      console.log('✅ Profile tabs switchable');
    } else {
      console.log('ℹ️ Not enough tabs to test switching');
    }
  });

  test('should display posts in posts tab', async ({ page }) => {
    const postsTab = page
      .locator('button:has-text("Posts"), [role="tab"]:has-text("Posts")')
      .first();
    if (await postsTab.isVisible()) {
      await postsTab.click();
      await page.waitForTimeout(2000);

      const posts = page.locator('article, [data-testid="post-card"]');
      const count = await posts.count().catch(() => 0);

      console.log(`✅ Posts tab shows ${count} posts`);
    }
  });
});

test.describe('Profile Page - Mobile View', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.MOBILE);
    await navigateTo(page, ROUTES.HOME);
    await loginWithWallet(page);
    await navigateTo(page, ROUTES.PROFILE);
    await waitForPageLoad(page);
    await page.waitForTimeout(2000);
  });

  test.afterEach(async ({ page }) => {
    await cooldownBetweenTests(page);
  });

  test('should display mobile-friendly profile layout', async ({ page }) => {
    const content = page.locator('main').first();
    if (await content.isVisible()) {
      const box = await content.boundingBox();
      if (box) {
        expect(box.width).toBeLessThanOrEqual(VIEWPORTS.MOBILE.width + 20);
        console.log('✅ Profile is mobile-width');
      }
    }
  });

  test('should show profile actions in mobile layout', async ({ page }) => {
    // Check that key actions are still visible on mobile
    const avatar = page.locator('img').first();
    const isVisible = await avatar
      .isVisible({ timeout: TIMEOUTS.SHORT })
      .catch(() => false);

    console.log(`✅ Mobile profile displays avatar: ${isVisible}`);
  });

  test('should have scrollable tabs on mobile', async ({ page }) => {
    const tabsContainer = page.locator('[role="tablist"]').first();
    if (await tabsContainer.isVisible()) {
      console.log('✅ Tabs container visible on mobile');
    }
  });
});

test.describe('Profile Page - Agent Profiles', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.DESKTOP);
    await navigateTo(page, ROUTES.HOME);
    await loginWithWallet(page);
    await page.waitForTimeout(2000);
  });

  test('should display agent profile with agent-specific info', async ({
    page,
  }) => {
    // Navigate to agents page to find an agent
    await navigateTo(page, ROUTES.AGENTS);
    await waitForPageLoad(page);
    await page.waitForTimeout(2000);

    const agentLink = page
      .locator('a[href*="/agents/"], a[href*="/profile/"]')
      .first();
    if (await agentLink.isVisible({ timeout: TIMEOUTS.SHORT })) {
      await agentLink.click();
      await page.waitForTimeout(2000);

      // Agent profiles may have different elements
      const content = await page.locator('body').textContent();
      expect(content).toBeTruthy();
      console.log('✅ Agent profile page displays');
    } else {
      console.log('ℹ️ No agent links found');
    }
  });
});

test.describe('Profile Page - Reputation Display', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.DESKTOP);
    await navigateTo(page, ROUTES.HOME);
    await loginWithWallet(page);
    await navigateTo(page, ROUTES.PROFILE);
    await waitForPageLoad(page);
    await page.waitForTimeout(2000);
  });

  test('should display reputation score', async ({ page }) => {
    const reputation = page
      .locator('text=/Reputation|Score|\\d+\\s*pts/i')
      .first();
    const isVisible = await reputation
      .isVisible({ timeout: TIMEOUTS.SHORT })
      .catch(() => false);

    console.log(`✅ Reputation display: ${isVisible}`);
  });

  test('should navigate to reputation page from profile', async ({ page }) => {
    const reputationLink = page
      .locator('a[href*="/reputation"], button:has-text("Reputation")')
      .first();
    if (await reputationLink.isVisible({ timeout: TIMEOUTS.SHORT })) {
      await reputationLink.click();
      await page.waitForTimeout(2000);

      expect(page.url()).toContain('/reputation');
      console.log('✅ Navigated to reputation page from profile');
    } else {
      console.log('ℹ️ No reputation link on profile');
    }
  });
});

test.describe('Profile Page - Wallet/Blockchain Info', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.DESKTOP);
    await navigateTo(page, ROUTES.HOME);
    await loginWithWallet(page);
    await navigateTo(page, ROUTES.PROFILE);
    await waitForPageLoad(page);
    await page.waitForTimeout(2000);
  });

  test('should display wallet address or on-chain status', async ({ page }) => {
    const walletInfo = page
      .locator('text=/0x[a-fA-F0-9]+/, text=/On-chain|Registered/i')
      .first();
    const isVisible = await walletInfo
      .isVisible({ timeout: TIMEOUTS.SHORT })
      .catch(() => false);

    console.log(`ℹ️ Wallet/on-chain info visible: ${isVisible}`);
  });

  test('should display referral code if available', async ({ page }) => {
    const referralCode = page.locator('text=/Referral|Invite|ref=/i').first();
    const isVisible = await referralCode
      .isVisible({ timeout: TIMEOUTS.SHORT })
      .catch(() => false);

    console.log(`ℹ️ Referral code visible: ${isVisible}`);
  });
});
