import { defineConfig, devices } from '@playwright/test';

const e2ePort = 3100;
const e2eBaseUrl = `http://127.0.0.1:${e2ePort}`;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'line' : 'list',
  use: {
    baseURL: e2eBaseUrl,
    serviceWorkers: 'allow',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'mobile-320',
      testIgnore: /responsive-desktop\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], viewport: { width: 320, height: 720 } },
    },
    {
      name: 'mobile-390',
      testIgnore: /responsive-desktop\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 } },
    },
    {
      name: 'desktop-1440',
      testMatch: /responsive-desktop\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
  ],
  webServer: {
    command: `npm run start -- -p ${e2ePort}`,
    url: `${e2eBaseUrl}/app`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      NEXT_PUBLIC_SUPABASE_URL: '',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: '',
      SUPABASE_SERVICE_ROLE_KEY: '',
      TELEGRAM_BOT_TOKEN: '',
      TELEGRAM_WEBHOOK_SECRET: '',
      RAVEL_OWNER_TELEGRAM_CHAT_ID: '',
      RAVEL_OWNER_USER_ID: '',
      RAVEL_TIME_ZONE: '',
      TAPTRACK_OWNER_TELEGRAM_CHAT_ID: '',
      TAPTRACK_OWNER_USER_ID: '',
      TAPTRACK_TIME_ZONE: '',
    },
  },
});
