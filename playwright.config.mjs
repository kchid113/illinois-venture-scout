import {defineConfig,devices} from '@playwright/test';

/**
 * Real Chromium executes the complete Next.js/React client.
 * API responses are deterministic synthetic fixtures, not production DB writes.
 */
export default defineConfig({
 testDir:'./tests/browser',
 testMatch:'**/*.spec.mjs',
 timeout:45_000,
 expect:{timeout:12_000},
 fullyParallel:true,
 forbidOnly:!!process.env.CI,
 retries:process.env.CI?1:0,
 workers:process.env.CI?2:undefined,
 reporter:process.env.CI?[['list'],['html',{outputFolder:'playwright-report',open:'never'}]]:'list',
 use:{
  baseURL:'http://127.0.0.1:3000',
  trace:'retain-on-failure',
  screenshot:'only-on-failure',
  actionTimeout:12_000,
  ...devices['Desktop Chrome']
 },
 projects:[{name:'chromium',use:{...devices['Desktop Chrome']}}],
 webServer:{
  command:'npm run start -- -H 127.0.0.1 -p 3000',
  url:'http://127.0.0.1:3000',
  reuseExistingServer:!process.env.CI,
  timeout:120_000
 }
});
