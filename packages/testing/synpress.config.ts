/**
 * Synpress configuration for Playwright tests.
 *
 * Configures Playwright for Synpress-style tests with MetaMask wallet integration.
 * Uses the default Anvil test wallet for authentication via Privy.
 *
 * @module testing/synpress.config
 */

import { defineConfig, devices } from '@playwright/test';
import { config } from 'dotenv';
import { resolve } from 'path';

const rootDir = resolve(__dirname, '../..');
config({ path: resolve(rootDir, '.env.local') });
config({ path: resolve(rootDir, '.env') });

// Wallet configuration for MetaMask/Synpress
// Default uses Anvil's first test account which should be configured as admin
const SEED_PHRASE =
  process.env.WALLET_SEED_PHRASE ||
  'test test test test test test test test test test test junk';
const PASSWORD = process.env.WALLET_PASSWORD || 'Tester@1234';

// Log wallet configuration status
console.log('🔐 Wallet configuration:');
console.log(`   Seed phrase: ${SEED_PHRASE === 'test test test test test test test test test test test junk' ? 'Default Anvil' : 'Custom'}`);
console.log(`   Password: ${PASSWORD === 'Tester@1234' ? 'Default' : 'Custom'}`);

// Export for use in tests
export { SEED_PHRASE, PASSWORD };

export default defineConfig({
  testDir: './synpress',
  testMatch: '**/*.spec.ts',

  /* Maximum time one test can run for */
  timeout: process.env.CI ? 60 * 1000 : 120 * 1000,

  /* Run tests in files in parallel */
  fullyParallel: false,

  /* Fail the build on CI if you accidentally left test.only in the source code */
  forbidOnly: !!process.env.CI,

  /* Retry on CI only */
  retries: process.env.CI ? 1 : 0,

  /* Use 2 workers in CI for faster execution, 1 locally for stability */
  workers: process.env.CI ? 2 : 1,

  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: [
    ['list'], // Non-blocking console output only
    ['json', { outputFile: 'test-results/synpress-results.json' }],
  ],

  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('/')` */
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000',

    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'on-first-retry',

    /* Screenshot on failure */
    screenshot: 'only-on-failure',

    /* Video on failure */
    video: 'retain-on-failure',

    /* Action timeout - reduced in CI for faster feedback */
    actionTimeout: process.env.CI ? 15 * 1000 : 30 * 1000,

    /* Navigation timeout - reduced in CI */
    navigationTimeout: process.env.CI ? 30 * 1000 : 60 * 1000,

    /* Launch Options to prevent CI crashes */
    launchOptions: {
      args: ['--disable-dev-shm-usage'],
    },
  },

  /* Configure projects for major browsers with wallet setup */
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
      },
    },
  ],

  /* Run your local dev server before starting the tests */
  /* Note: Set PLAYWRIGHT_SKIP_WEBSERVER=1 to use an existing server */
  webServer:
    process.env.CI || process.env.PLAYWRIGHT_SKIP_WEBSERVER
      ? undefined
      : {
          command: `cd ${rootDir}/apps/web && bunx next dev`,
          url: 'http://localhost:3000',
          reuseExistingServer: true,
          timeout: 120 * 1000,
          stdout: 'pipe',
          stderr: 'pipe',
        },
});
