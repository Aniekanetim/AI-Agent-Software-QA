import { defineConfig } from '@playwright/test';
import { resolve } from 'node:path';

export default defineConfig({
  testDir: '.',
  testMatch: 'capability.spec.js',
  outputDir: resolve(process.cwd(), '.local/playwright-test-results'),
  reporter: 'list',
  workers: 1,
  retries: 0,
  timeout: 90_000,
  forbidOnly: true,
});
