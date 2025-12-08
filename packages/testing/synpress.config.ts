/**
 * Synpress configuration for E2E tests with MetaMask integration.
 *
 * Uses @synthetixio/synpress for real MetaMask wallet interaction.
 * The default Anvil test wallet is used for authentication via Privy.
 *
 * @module testing/synpress.config
 * @see https://docs.synpress.io/docs/playwright/configuration
 */

import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';
import path from 'path';

const rootDir = path.resolve(__dirname, '../..');
dotenv.config({ path: path.resolve(rootDir, '.env.local') });
dotenv.config({ path: path.resolve(rootDir, '.env') });

const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000';

export default defineConfig({
  testDir: './synpress',
  testMatch: '**/*.spec.ts',

  /* Maximum time one test can run for */
  timeout: process.env.CI ? 90_000 : 120_000,

  /* Expect timeout */
  expect: {
    timeout: 10_000,
  },

  /* Run tests in files in parallel - disabled for wallet tests */
  fullyParallel: false,

  /* Fail the build on CI if you accidentally left test.only in the source code */
  forbidOnly: !!process.env.CI,

  /* Retry on CI only */
  retries: process.env.CI ? 1 : 0,

  /* Single worker for wallet tests to avoid conflicts */
  workers: 1,

  /* Reporter to use */
  reporter: process.env.CI
    ? [
        ['github'],
        ['json', { outputFile: 'test-results/synpress-results.json' }],
      ]
    : [
        ['list'],
        ['json', { outputFile: 'test-results/synpress-results.json' }],
      ],

  /* Shared settings for all the projects below */
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 30_000,
    navigationTimeout: 60_000,
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
          timeout: 120_000,
          stdout: 'pipe',
          stderr: 'pipe',
        },
});
