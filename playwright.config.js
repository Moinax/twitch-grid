const { defineConfig } = require('@playwright/test');
module.exports = defineConfig({
  testDir: './tests', testMatch: '**/*.spec.js', fullyParallel: true,
  use: { baseURL: 'http://localhost:8767', headless: true, colorScheme: 'dark' },
  webServer: { command: 'VITE_TEST_API=true node server.cjs 8767', url: 'http://localhost:8767', reuseExistingServer: !process.env.CI }
});
