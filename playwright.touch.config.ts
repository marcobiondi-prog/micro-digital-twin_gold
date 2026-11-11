import { defineConfig, devices } from "@playwright/test";
import fs from "node:fs";

/**
 * Touch suite on simulated phones (npm run test:touch). It runs on the production build (npm run build first):
 * the dev server compiles on demand and would measure the compiler, not the app.
 *
 * Projects:
 *  - android: Pixel 7 (touch, mobile viewport, Android Chrome user agent)
 *  - iphone: iPhone 13 screen and user agent, on Chromium (WebKit is not installed here)
 *  - android-lento: the Pixel 7 with the CPU slowed 6× (a low-end phone): shows whether the app keeps up with taps
 */
const PORT = Number(process.env.TOUCH_PORT ?? 5179);
export default defineConfig({
  testDir: "./tests/touch",
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  reporter: [["list"], ["json", { outputFile: "test-results/touch-results.json" }]],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    // The browser of the machine (the pinned Playwright may want another build): PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH, else the shared one.
    launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ?? (fs.existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined) },
    trace: "off",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "android", use: { ...devices["Pixel 7"] } },
    { name: "iphone", use: { ...devices["iPhone 13"], browserName: "chromium" } },
    { name: "android-lento", use: { ...devices["Pixel 7"], cpuSlowdown: 6 } as never },
  ],
  webServer: {
    command: `PORT=${PORT} node .output/server/index.mjs`,
    url: `http://127.0.0.1:${PORT}/benvenuto`,
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
