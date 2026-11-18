import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  testMatch: "**/*.browser.test.ts",
  expect: { timeout: 30_000 },
  use: {
    actionTimeout: 30_000,
    navigationTimeout: 45_000,
    launchOptions: process.env.CHROME_BIN ? { executablePath: process.env.CHROME_BIN } : {},
  },
  projects: [
    { name: "public", testIgnore: "**/admin-browser.browser.test.ts" },
    { name: "clerk", testMatch: "**/admin-browser.browser.test.ts" },
  ],
});
