import { chromium, type FullConfig } from '@playwright/test';

/**
 * Warm the dev server before any test opens a page.
 *
 * `webServer.url` only waits for Vite to answer, and Vite answers with the HTML
 * shell immediately — while the module graph behind it (React, Pixi, Tailwind,
 * every content file) is still uncompiled and gets transformed on demand at the
 * first request. Locally that is a second or two and nobody notices. On a
 * two-core CI runner, with two workers asking for it at once, it was long
 * enough that the *first* click of the first test — "New practice" — blew a 15s
 * action budget, and every spec failed at its own setup with a timeout that
 * looked like a broken app rather than a cold cache.
 *
 * So pay that cost once, here, where it is allowed to be slow. Waiting on
 * `window.__tt` rather than on load means we wait for the app's own modules to
 * have evaluated, not merely for a document.
 */
export default async function globalSetup(config: FullConfig): Promise<void> {
  const baseURL = config.projects[0]?.use?.baseURL;
  if (!baseURL) return;

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.goto(baseURL, { waitUntil: 'domcontentloaded', timeout: 180_000 });
    await page.waitForFunction(() => !!window.__tt, undefined, { timeout: 180_000 });
  } finally {
    await browser.close();
  }
}
