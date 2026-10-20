import { defineConfig } from "@playwright/test";
import config from "./playwright.config.mjs";

export default defineConfig({
  ...config,
  testMatch: "ai-*.spec.mjs",
  webServer: { ...config.webServer, reuseExistingServer: true },
});
