const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: '.',
  timeout: 30000,
  use: {
    baseURL: process.env.QA_BASE_URL || 'http://localhost',
    headless: true,
    screenshot: 'on',
    video: 'off',
  },
  outputDir: 'screenshots',
});
