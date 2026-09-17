import { fileURLToPath } from 'node:url';
import { defineConfig, devices } from '@playwright/test';

const port = 3100;
const baseURL = `http://127.0.0.1:${port}`;
const databaseUrl = process.env.DATABASE_URL || '';
const repositoryRoot = fileURLToPath(new URL('..', import.meta.url));

export default defineConfig({
  testDir: '.',
  testMatch: '**/*.spec.mjs',
  outputDir: '../test-results/e2e',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI
    ? [['line'], ['html', { outputFolder: '../playwright-report', open: 'never' }]]
    : 'list',
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'pnpm dev',
    cwd: repositoryRoot,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: 'pipe',
    stderr: 'pipe',
    env: {
      ...process.env,
      PORT: String(port),
      OXSIG_HOST: '127.0.0.1',
      OXSIG_APP_HOST: '127.0.0.1',
      OXSIG_APP_URL: baseURL,
      ALLOWED_ORIGINS: baseURL,
      OXSIG_E2E_AUTH_ENABLED: 'true',
      DATABASE_URL: databaseUrl,
      NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY:
        process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || 'pk_test_Y2xlcmsuZXhhbXBsZS5jb20k',
      CLERK_SECRET_KEY: process.env.CLERK_SECRET_KEY || 'sk_test_dummy',
      LAB_AWS_ENABLED: 'false',
      STORAGE_BUCKET: process.env.STORAGE_BUCKET || 'oxsig-e2e',
      STORAGE_REGION: process.env.STORAGE_REGION || 'eu-central-1',
      CRON_SECRET: process.env.CRON_SECRET || 'e2e-cron-secret-0123456789abcdef',
      OXSIG_TERMINAL_BRIDGE_SECRET:
        process.env.OXSIG_TERMINAL_BRIDGE_SECRET ||
        'e2e-terminal-bridge-secret-0123456789abcdef0123456789abcdef',
    },
  },
});
