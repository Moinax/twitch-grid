const { defineConfig } = require('@playwright/test');
// Each checkout gets its own port, so worktrees running side by side never test each other's server.
const port = 8767 + [...__dirname].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 1000, 0);
module.exports = defineConfig({
  testDir: './tests', testMatch: '**/*.spec.js', fullyParallel: true,
  use: { baseURL: `http://localhost:${port}`, headless: true, colorScheme: 'dark' },
  webServer: { command: `VITE_TEST_API=true node server.cjs ${port}`, url: `http://localhost:${port}`, reuseExistingServer: !process.env.CI }
});
