import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  testMatch: "**/*.browser.test.mjs",
  expect: { timeout: 30_000 },
  use: {
    launchOptions: process.env.CHROME_BIN ? { executablePath: process.env.CHROME_BIN } : {},
  },
  projects: [
    { name: "public", testIgnore: "**/admin-browser.browser.test.mjs" },
    { name: "clerk", testMatch: "**/admin-browser.browser.test.mjs" },
  ],
});
