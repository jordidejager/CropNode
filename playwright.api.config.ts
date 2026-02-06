import { defineConfig } from '@playwright/test';

/**
 * Playwright API Test Configuration
 *
 * Deze configuratie is specifiek voor de API tests die geen browser nodig hebben.
 * De tests draaien tegen localhost:3000 (of de URL in TEST_BASE_URL).
 *
 * Run: npm run test:api
 */
export default defineConfig({
  // Test file pattern
  testMatch: 'src/__tests__/**/*.test.ts',

  // Parallel execution - disabled for consistent results
  fullyParallel: false,

  // Forbid test.only in CI
  forbidOnly: !!process.env.CI,

  // Retry on failure
  retries: process.env.CI ? 1 : 0,

  // Single worker for consistent state
  workers: 1,

  // Reporter with verbose output
  reporter: [
    ['list', { printSteps: true }],
    ['html', { outputFolder: 'playwright-api-report' }],
  ],

  // Test settings
  use: {
    // Base URL for API requests
    baseURL: process.env.TEST_BASE_URL || 'http://localhost:3000',

    // Extended timeout for AI processing
    actionTimeout: 60000,

    // Trace collection
    trace: 'on-first-retry',
  },

  // Global timeout per test - 2 minutes for AI processing
  timeout: 120000,

  // Expect timeout
  expect: {
    timeout: 30000,
  },

  // Web server configuration
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: true, // Reuse existing dev server if running
    timeout: 120000,
  },
});
