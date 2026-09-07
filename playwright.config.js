const { defineConfig } = require('@playwright/test');
module.exports = defineConfig({
  testDir: './tests', testMatch: '**/*.spec.js', fullyParallel: true,
  use: { baseURL: 'http://localhost:8767', headless: true },
  webServer: { command: 'node server.cjs 8767', url: 'http://localhost:8767', reuseExistingServer: !process.env.CI }
});
