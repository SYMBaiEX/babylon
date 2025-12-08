/**
 * Synpress configuration for Playwright tests with MetaMask integration.
 *
 * Uses @synthetixio/synpress for real MetaMask wallet interaction.
 * The default Anvil test wallet is used for authentication via Privy.
 *
 * @module testing/synpress.config
 */

import { defineConfig, devices } from '@playwright/test';
import { config } from 'dotenv';
import { resolve } from 'path';

const rootDir = resolve(__dirname, '../..');
config({ path: resolve(rootDir, '.env.local') });
config({ path: resolve(rootDir, '.env') });

const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000';

export default defineConfig({
  testDir: './synpress',
  testMatch: '**/*.spec.ts',

  /* Maximum time one test can run for */
  timeout: process.env.CI ? 90 * 1000 : 120 * 1000,

  /* Run tests in files in parallel - disabled for wallet tests */
  fullyParallel: false,

  /* Fail the build on CI if you accidentally left test.only in the source code */
  forbidOnly: !!process.env.CI,

  /* Retry on CI only */
  retries: process.env.CI ? 1 : 0,

  /* Single worker for wallet tests to avoid conflicts */
  workers: 1,

  /* Reporter to use */
  reporter: [
    ['list'],
    ['json', { outputFile: 'test-results/synpress-results.json' }],
  ],

  /* Shared settings for all the projects below */
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 30 * 1000,
    navigationTimeout: 60 * 1000,
    launchOptions: {
      args: ['--disable-dev-shm-usage'],
    },
  },

  /* Configure projects - Synpress tests use chromium with MetaMask */
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
      },
    },
  ],

  /* Run local dev server unless skipped */
  webServer:
    process.env.CI || process.env.PLAYWRIGHT_SKIP_WEBSERVER
      ? undefined
      : {
          command: `cd ${rootDir}/apps/web && bunx next dev`,
          url: baseURL,
          reuseExistingServer: true,
          timeout: 120 * 1000,
          stdout: 'pipe',
          stderr: 'pipe',
        },
});
