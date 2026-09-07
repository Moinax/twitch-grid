const { defineConfig } = require('@playwright/test');
module.exports = defineConfig({
  testDir: './tests', fullyParallel: true,
  use: { baseURL: 'http://localhost:8767', headless: true },
  webServer: { command: 'python3 server.py 8767', url: 'http://localhost:8767', reuseExistingServer: !process.env.CI }
});
