import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests: the only layer that sees what a person sees.
 *
 * The sim has hundreds of unit tests and a balance harness; neither of them can
 * see a tooltip clipped by an ancestor's overflow, a panel opening underneath
 * the HUD, or a clock that will not start. Everything in `e2e/` drives a real
 * browser against the real dev server for exactly that reason.
 *
 * The server is the project's real dev server — same Vite config, so
 * `import.meta.env.DEV` is true and `window.__tt` is installed — on its own port
 * and with HMR switched off. See e2e/vite.e2e.config.ts for why: a suite that
 * goes red because somebody saved a file is worse than no suite. Port 5299 keeps
 * it clear of the 5199 a person already has open.
 */

const PORT = Number(process.env.TT_E2E_PORT ?? 5299);
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './e2e',
  outputDir: './e2e-results',

  // Each spec drives its own run of the game from a clean profile, so they are
  // independent by construction.
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI
    ? [['github'], ['html', { outputFolder: 'playwright-report', open: 'never' }]]
    : [['list']],

  // A full in-game day is ten hours of game time — about fifteen seconds of wall
  // clock at 4×, plus whatever the day stops to ask you. 90s is roomy but not so
  // roomy that a genuine freeze looks like a slow machine.
  timeout: process.env.CI ? 120_000 : 90_000,
  expect: { timeout: process.env.CI ? 20_000 : 10_000 },

  // Compiles the module graph once before any test opens a page — see the note
  // in the file. Without it the first click of the first spec races a cold Vite.
  globalSetup: './e2e/global-setup.ts',

  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
    // Without this a covered button waits for the whole test budget and the
    // failure says "timeout" rather than "something was on top of it". The CI
    // runner is a good deal slower than a laptop, so it gets more rope — but
    // not so much that a genuinely covered control looks like a slow machine.
    actionTimeout: process.env.CI ? 30_000 : 15_000,
    navigationTimeout: process.env.CI ? 60_000 : 30_000,
  },

  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // 1280×800: the laptop the layout was designed against, and the width at
        // which a day card still docks beside the wide panel rather than yielding.
        viewport: { width: 1280, height: 800 },
      },
    },
  ],

  webServer: {
    command: `bun --bun vite --config e2e/vite.e2e.config.ts --port ${PORT} --strictPort`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
