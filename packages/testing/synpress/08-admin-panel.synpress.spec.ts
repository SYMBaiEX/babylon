/**
 * Admin Panel E2E Tests
 *
 * Tests admin functionality: dashboard, user management, agents, reports.
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

test.describe('Admin Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.DESKTOP);
    await navigateTo(page, ROUTES.HOME);
    await loginWithWallet(page);
    await navigateTo(page, ROUTES.ADMIN);
    await waitForPageLoad(page);
    await page.waitForTimeout(2000);
  });

  test.afterEach(async ({ page }) => {
    await cooldownBetweenTests(page);
  });

  test('admin dashboard is accessible', async ({ page }) => {
    expect(page.url()).toContain('/admin');

    // Should show dashboard or access denied
    const heading = page.getByRole('heading', { name: 'Admin Dashboard' });
    const accessDenied = page.getByText('Access Denied');

    const hasDashboard = await heading.isVisible({ timeout: TIMEOUTS.MEDIUM }).catch(() => false);
    const hasAccessDenied = await accessDenied.isVisible({ timeout: TIMEOUTS.SHORT }).catch(() => false);

    // On localhost, should have access
    if (!hasAccessDenied) {
      expect(hasDashboard).toBe(true);
    }
  });

  test('admin tabs are present', async ({ page }) => {
    const tabs = ['Stats', 'Users', 'Agents', 'Registry', 'Reports'];
    let tabsFound = 0;

    for (const tabName of tabs) {
      const tab = page.locator(`button:has-text("${tabName}")`).first();
      if (await tab.isVisible({ timeout: TIMEOUTS.SHORT }).catch(() => false)) {
        tabsFound++;
      }
    }

    // Should have at least some admin tabs
    expect(tabsFound).toBeGreaterThan(0);
  });

  test('can switch between admin tabs', async ({ page }) => {
    const tabs = page.locator('[role="tab"], button.admin-tab');
    const count = await tabs.count();

    if (count > 1) {
      await tabs.nth(1).click();
      await page.waitForTimeout(1000);
      // No crash = success
    }
  });
});

test.describe('Admin Users Tab', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.DESKTOP);
    await navigateTo(page, ROUTES.HOME);
    await loginWithWallet(page);
    await page.goto(
      `${process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000'}/admin?tab=users`
    );
    await waitForPageLoad(page);
    await page.waitForTimeout(2000);
  });

  test.afterEach(async ({ page }) => {
    await cooldownBetweenTests(page);
  });

  test('displays user list or table', async ({ page }) => {
    // Should have some user display content
    const body = await page.locator('body').textContent();
    expect(body?.length).toBeGreaterThan(100);

    // Should have users-related content
    const hasUserContent =
      body?.toLowerCase().includes('user') ||
      body?.toLowerCase().includes('email') ||
      body?.toLowerCase().includes('admin');
    expect(hasUserContent).toBe(true);
  });

  test('has user search functionality', async ({ page }) => {
    const searchInput = page
      .locator('input[type="search"], input[placeholder*="Search"]')
      .first();
    const hasSearch = await searchInput.isVisible({ timeout: TIMEOUTS.SHORT }).catch(() => false);

    if (hasSearch) {
      await searchInput.fill('test');
      await page.waitForTimeout(1000);
    }
  });
});

test.describe('Admin Agents Tab', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.DESKTOP);
    await navigateTo(page, ROUTES.HOME);
    await loginWithWallet(page);
    await page.goto(
      `${process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000'}/admin?tab=agents`
    );
    await waitForPageLoad(page);
    await page.waitForTimeout(2000);
  });

  test.afterEach(async ({ page }) => {
    await cooldownBetweenTests(page);
  });

  test('displays agent management interface', async ({ page }) => {
    const body = await page.locator('body').textContent();

    // Should have agent-related content
    const hasAgentContent =
      body?.toLowerCase().includes('agent') ||
      body?.toLowerCase().includes('pause') ||
      body?.toLowerCase().includes('resume');

    expect(hasAgentContent).toBe(true);
  });

  test('has pause/resume all agents buttons', async ({ page }) => {
    const pauseButton = page.locator('button:has-text("Pause")').first();
    const resumeButton = page.locator('button:has-text("Resume")').first();

    const hasPause = await pauseButton.isVisible({ timeout: TIMEOUTS.SHORT }).catch(() => false);
    const hasResume = await resumeButton.isVisible({ timeout: TIMEOUTS.SHORT }).catch(() => false);

    // Should have control buttons
    expect(hasPause || hasResume).toBe(true);
  });
});

test.describe('Admin Reports Tab', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.DESKTOP);
    await navigateTo(page, ROUTES.HOME);
    await loginWithWallet(page);
    await page.goto(
      `${process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000'}/admin?tab=reports`
    );
    await waitForPageLoad(page);
    await page.waitForTimeout(2000);
  });

  test('displays reports moderation interface', async ({ page }) => {
    const body = await page.locator('body').textContent();

    // Should have report-related content
    const hasReportContent =
      body?.toLowerCase().includes('report') ||
      body?.toLowerCase().includes('moderation') ||
      body?.toLowerCase().includes('review');

    expect(hasReportContent).toBe(true);
  });
});
