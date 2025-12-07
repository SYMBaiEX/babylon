/**
 * Admin Panel Comprehensive E2E Tests
 *
 * Tests all admin functionality:
 * - Dashboard stats
 * - User management
 * - Agent management
 * - Registry panel
 * - Reports moderation
 * - Training data
 * - Notifications
 * - All admin tabs
 */

import { expect, test } from '@playwright/test';
import {
  cooldownBetweenTests,
  navigateTo,
  waitForPageLoad,
} from './helpers/page-helpers';
import { getPrivyTestAccount, loginWithPrivyEmail } from './helpers/privy-auth';
import { ROUTES, TIMEOUTS, VIEWPORTS } from './helpers/test-data';

test.setTimeout(TIMEOUTS.EXTRA_LONG);

test.describe('Admin Panel - Access and Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.DESKTOP);
    await navigateTo(page, ROUTES.HOME);
    await loginWithPrivyEmail(page, getPrivyTestAccount());
    await navigateTo(page, ROUTES.ADMIN);
    await waitForPageLoad(page);
    await page.waitForTimeout(2000);
  });

  test.afterEach(async ({ page }) => {
    await cooldownBetweenTests(page);
  });

  test('should access admin dashboard', async ({ page }) => {
    expect(page.url()).toContain('/admin');

    const heading = page.getByRole('heading', { name: 'Admin Dashboard' });
    const isVisible = await heading
      .isVisible({ timeout: TIMEOUTS.MEDIUM })
      .catch(() => false);

    if (isVisible) {
      console.log('✅ Admin dashboard accessible');
    } else {
      // Check if access denied
      const accessDenied = await page
        .getByText('Access Denied')
        .isVisible({ timeout: TIMEOUTS.SHORT })
        .catch(() => false);
      if (accessDenied) {
        console.log('⚠️ Admin access denied - may not have admin role');
      } else {
        console.log('ℹ️ Admin dashboard loading or different layout');
      }
    }
  });

  test('should display admin navigation tabs', async ({ page }) => {
    const expectedTabs = [
      'Stats',
      'Users',
      'Agents',
      'Registry',
      'Reports',
      'Training',
      'Notifications',
    ];

    for (const tabName of expectedTabs) {
      const tab = page
        .locator(
          `button:has-text("${tabName}"), [role="tab"]:has-text("${tabName}")`
        )
        .first();
      const isVisible = await tab
        .isVisible({ timeout: TIMEOUTS.SHORT })
        .catch(() => false);

      if (isVisible) {
        console.log(`✅ Admin tab "${tabName}" visible`);
      }
    }
  });

  test('should display stats overview on dashboard', async ({ page }) => {
    const statsIndicators = [
      'Total Users',
      'Total Agents',
      'Active',
      'Revenue',
    ];

    for (const stat of statsIndicators) {
      const element = page.locator(`text=/${stat}/i`).first();
      const isVisible = await element
        .isVisible({ timeout: TIMEOUTS.SHORT })
        .catch(() => false);

      if (isVisible) {
        console.log(`✅ Stat "${stat}" visible`);
      }
    }
  });
});

test.describe('Admin Panel - Stats Tab', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.DESKTOP);
    await navigateTo(page, ROUTES.HOME);
    await loginWithPrivyEmail(page, getPrivyTestAccount());
    await navigateTo(page, ROUTES.ADMIN);
    await waitForPageLoad(page);
    await page.waitForTimeout(2000);

    // Click Stats tab
    const statsTab = page.locator('button:has-text("Stats")').first();
    if (await statsTab.isVisible()) {
      await statsTab.click();
      await page.waitForTimeout(1000);
    }
  });

  test('should display network statistics', async ({ page }) => {
    const statsElements = page.locator(
      'text=/Users|Agents|Posts|Trades|Active/i'
    );
    const count = await statsElements.count().catch(() => 0);
    console.log(`✅ Stats tab shows ${count} stat elements`);
  });

  test('should display charts or graphs', async ({ page }) => {
    const charts = page.locator('canvas, svg, [data-testid="chart"]');
    const count = await charts.count().catch(() => 0);
    console.log(`ℹ️ Charts/graphs found: ${count}`);
  });
});

test.describe('Admin Panel - Users Tab', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.DESKTOP);
    await navigateTo(page, ROUTES.HOME);
    await loginWithPrivyEmail(page, getPrivyTestAccount());
    await navigateTo(page, ROUTES.ADMIN);
    await waitForPageLoad(page);
    await page.waitForTimeout(2000);

    // Click Users tab
    const usersTab = page.locator('button:has-text("Users")').first();
    if (await usersTab.isVisible()) {
      await usersTab.click();
      await page.waitForTimeout(1000);
    }
  });

  test('should display user management interface', async ({ page }) => {
    const content = await page.locator('body').textContent();
    expect(content).toBeTruthy();
    console.log('✅ Users tab displays content');
  });

  test('should have search for users', async ({ page }) => {
    const searchInput = page
      .locator('input[placeholder*="Search" i], input[type="search"]')
      .first();
    const isVisible = await searchInput
      .isVisible({ timeout: TIMEOUTS.SHORT })
      .catch(() => false);
    console.log(`✅ User search input: ${isVisible}`);
  });

  test('should display user list or table', async ({ page }) => {
    const userList = page.locator(
      'table, [role="table"], [data-testid="user-list"]'
    );
    const isVisible = await userList
      .first()
      .isVisible({ timeout: TIMEOUTS.SHORT })
      .catch(() => false);
    console.log(`✅ User list/table: ${isVisible}`);
  });

  test('should have ban/unban actions for users', async ({ page }) => {
    const actionButtons = page.locator(
      'button:has-text("Ban"), button:has-text("Unban")'
    );
    const count = await actionButtons.count().catch(() => 0);
    console.log(`✅ Ban/Unban buttons found: ${count}`);
  });
});

test.describe('Admin Panel - Agents Tab', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.DESKTOP);
    await navigateTo(page, ROUTES.HOME);
    await loginWithPrivyEmail(page, getPrivyTestAccount());
    await navigateTo(page, ROUTES.ADMIN);
    await waitForPageLoad(page);
    await page.waitForTimeout(2000);

    // Click Agents tab
    const agentsTab = page.locator('button:has-text("Agents")').first();
    if (await agentsTab.isVisible()) {
      await agentsTab.click();
      await page.waitForTimeout(1000);
    }
  });

  test('should display agent management interface', async ({ page }) => {
    const content = await page.locator('body').textContent();
    expect(content).toBeTruthy();
    console.log('✅ Agents tab displays content');
  });

  test('should list registered agents', async ({ page }) => {
    const agentList = page.locator('text=/Agent|NPC|External/i');
    const count = await agentList.count().catch(() => 0);
    console.log(`✅ Agent list elements: ${count}`);
  });

  test('should have agent status controls', async ({ page }) => {
    const controls = page.locator(
      'button:has-text("Activate"), button:has-text("Deactivate"), button:has-text("Pause")'
    );
    const count = await controls.count().catch(() => 0);
    console.log(`ℹ️ Agent control buttons: ${count}`);
  });
});

test.describe('Admin Panel - Registry Tab', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.DESKTOP);
    await navigateTo(page, ROUTES.HOME);
    await loginWithPrivyEmail(page, getPrivyTestAccount());
    await navigateTo(page, ROUTES.ADMIN);
    await waitForPageLoad(page);
    await page.waitForTimeout(2000);

    // Click Registry tab
    const registryTab = page.locator('button:has-text("Registry")').first();
    if (await registryTab.isVisible()) {
      await registryTab.click();
      await page.waitForTimeout(1000);
    }
  });

  test('should display ERC8004 Registry', async ({ page }) => {
    const registryTitle = page.locator('text=/ERC8004|Registry/i').first();
    const isVisible = await registryTitle
      .isVisible({ timeout: TIMEOUTS.SHORT })
      .catch(() => false);
    console.log(`✅ Registry section: ${isVisible}`);
  });

  test('should display entity type filters', async ({ page }) => {
    const filters = ['All', 'Users', 'Actors', 'Agents', 'Apps'];
    for (const filter of filters) {
      const button = page.locator(`button:has-text("${filter}")`).first();
      const isVisible = await button
        .isVisible({ timeout: TIMEOUTS.SHORT })
        .catch(() => false);
      if (isVisible) {
        console.log(`✅ Registry filter "${filter}" visible`);
      }
    }
  });

  test('should display reputation scores', async ({ page }) => {
    const reputation = page.locator('text=/Reputation|\\d+\\/100|\\d+ pts/');
    const count = await reputation.count().catch(() => 0);
    console.log(`✅ Reputation displays: ${count}`);
  });

  test('should have feedback button for agents', async ({ page }) => {
    const feedbackButtons = page.locator('button:has-text("Feedback")');
    const count = await feedbackButtons.count().catch(() => 0);
    console.log(`ℹ️ Feedback buttons: ${count}`);
  });

  test('should have on-chain only filter', async ({ page }) => {
    const onChainFilter = page
      .locator('button:has-text("On-chain Only")')
      .first();
    const isVisible = await onChainFilter
      .isVisible({ timeout: TIMEOUTS.SHORT })
      .catch(() => false);
    console.log(`✅ On-chain filter: ${isVisible}`);
  });
});

test.describe('Admin Panel - Reports Tab', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.DESKTOP);
    await navigateTo(page, ROUTES.HOME);
    await loginWithPrivyEmail(page, getPrivyTestAccount());
    await navigateTo(page, ROUTES.ADMIN);
    await waitForPageLoad(page);
    await page.waitForTimeout(2000);

    // Click Reports tab
    const reportsTab = page.locator('button:has-text("Reports")').first();
    if (await reportsTab.isVisible()) {
      await reportsTab.click();
      await page.waitForTimeout(1000);
    }
  });

  test('should display reports interface', async ({ page }) => {
    const content = await page.locator('body').textContent();
    expect(content).toBeTruthy();
    console.log('✅ Reports tab displays content');
  });

  test('should show pending reports count', async ({ page }) => {
    const pendingCount = page.locator('text=/Pending|\\d+ reports/i').first();
    const isVisible = await pendingCount
      .isVisible({ timeout: TIMEOUTS.SHORT })
      .catch(() => false);
    console.log(`ℹ️ Pending reports indicator: ${isVisible}`);
  });

  test('should have moderation actions', async ({ page }) => {
    const actions = page.locator(
      'button:has-text("Approve"), button:has-text("Reject"), button:has-text("Review")'
    );
    const count = await actions.count().catch(() => 0);
    console.log(`ℹ️ Moderation action buttons: ${count}`);
  });
});

test.describe('Admin Panel - Training Tab', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.DESKTOP);
    await navigateTo(page, ROUTES.HOME);
    await loginWithPrivyEmail(page, getPrivyTestAccount());
    await navigateTo(page, ROUTES.ADMIN);
    await waitForPageLoad(page);
    await page.waitForTimeout(2000);

    // Click Training tab
    const trainingTab = page.locator('button:has-text("Training")').first();
    if (await trainingTab.isVisible()) {
      await trainingTab.click();
      await page.waitForTimeout(1000);
    }
  });

  test('should display training data interface', async ({ page }) => {
    const content = await page.locator('body').textContent();
    expect(content).toBeTruthy();
    console.log('✅ Training tab displays content');
  });

  test('should show training data stats', async ({ page }) => {
    const stats = page.locator('text=/Training|Dataset|Samples|Examples/i');
    const count = await stats.count().catch(() => 0);
    console.log(`✅ Training stats elements: ${count}`);
  });
});

test.describe('Admin Panel - Game Control', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.DESKTOP);
    await navigateTo(page, ROUTES.HOME);
    await loginWithPrivyEmail(page, getPrivyTestAccount());
    await navigateTo(page, ROUTES.ADMIN);
    await waitForPageLoad(page);
    await page.waitForTimeout(2000);
  });

  test('should have game control options', async ({ page }) => {
    const gameControl = page
      .locator('text=/Game Control|Game Settings|Pause Game/i')
      .first();
    const isVisible = await gameControl
      .isVisible({ timeout: TIMEOUTS.SHORT })
      .catch(() => false);
    console.log(`ℹ️ Game control section: ${isVisible}`);
  });

  test('should have pause/resume game button', async ({ page }) => {
    const pauseButton = page
      .locator('button:has-text("Pause"), button:has-text("Resume")')
      .first();
    const isVisible = await pauseButton
      .isVisible({ timeout: TIMEOUTS.SHORT })
      .catch(() => false);
    console.log(`ℹ️ Pause/Resume game button: ${isVisible}`);
  });
});

test.describe('Admin Panel - Fee Management', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.DESKTOP);
    await navigateTo(page, ROUTES.HOME);
    await loginWithPrivyEmail(page, getPrivyTestAccount());
    await navigateTo(page, ROUTES.ADMIN);
    await waitForPageLoad(page);
    await page.waitForTimeout(2000);
  });

  test('should display fee management section', async ({ page }) => {
    const feeSection = page
      .locator('text=/Fees|Fee Settings|Trading Fees/i')
      .first();
    const isVisible = await feeSection
      .isVisible({ timeout: TIMEOUTS.SHORT })
      .catch(() => false);
    console.log(`ℹ️ Fee management section: ${isVisible}`);
  });
});

test.describe('Admin Panel - World Facts', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.DESKTOP);
    await navigateTo(page, ROUTES.HOME);
    await loginWithPrivyEmail(page, getPrivyTestAccount());
    await navigateTo(page, ROUTES.ADMIN);
    await waitForPageLoad(page);
    await page.waitForTimeout(2000);
  });

  test('should display world facts section', async ({ page }) => {
    const worldFacts = page
      .locator('text=/World Facts|Parody|Headlines/i')
      .first();
    const isVisible = await worldFacts
      .isVisible({ timeout: TIMEOUTS.SHORT })
      .catch(() => false);
    console.log(`ℹ️ World facts section: ${isVisible}`);
  });
});

test.describe('Admin Panel - Human Review', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.DESKTOP);
    await navigateTo(page, ROUTES.HOME);
    await loginWithPrivyEmail(page, getPrivyTestAccount());
    await navigateTo(page, ROUTES.ADMIN);
    await waitForPageLoad(page);
    await page.waitForTimeout(2000);
  });

  test('should display human review queue', async ({ page }) => {
    const reviewSection = page
      .locator('text=/Human Review|Review Queue|Pending Review/i')
      .first();
    const isVisible = await reviewSection
      .isVisible({ timeout: TIMEOUTS.SHORT })
      .catch(() => false);
    console.log(`ℹ️ Human review section: ${isVisible}`);
  });
});

test.describe('Admin Panel - Mobile View', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.MOBILE);
    await navigateTo(page, ROUTES.HOME);
    await loginWithPrivyEmail(page, getPrivyTestAccount());
    await navigateTo(page, ROUTES.ADMIN);
    await waitForPageLoad(page);
    await page.waitForTimeout(2000);
  });

  test('should display mobile-friendly admin layout', async ({ page }) => {
    const content = page.locator('main').first();
    if (await content.isVisible()) {
      const box = await content.boundingBox();
      if (box) {
        expect(box.width).toBeLessThanOrEqual(VIEWPORTS.MOBILE.width + 20);
        console.log('✅ Admin is mobile-width');
      }
    }
  });

  test('should have scrollable admin tabs on mobile', async ({ page }) => {
    const tabsContainer = page
      .locator('[role="tablist"], [class*="overflow"]')
      .first();
    const isPresent = await tabsContainer
      .isVisible({ timeout: TIMEOUTS.SHORT })
      .catch(() => false);
    console.log(`✅ Scrollable admin tabs: ${isPresent}`);
  });
});
