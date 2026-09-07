import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './e2e', testMatch: '**/*.spec.ts', workers: 1,
  timeout: 45_000, expect: {timeout: 10_000},
  reporter: 'list',
  webServer: {command:'bun e2e/server.ts',url:'http://127.0.0.1:43119/health',reuseExistingServer:false},
});
