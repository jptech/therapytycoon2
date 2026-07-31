import { mergeConfig, defineConfig } from 'vite';
import base from '../vite.config.ts';

/**
 * The dev server the e2e suite drives.
 *
 * It is the project's real config — same plugins, same aliases, same dev build,
 * so `import.meta.env.DEV` is true and `window.__tt` is there — with hot module
 * replacement switched off.
 *
 * That one difference matters more than it looks. With HMR on, saving any file
 * while the suite is running full-reloads the page out from under whatever test
 * is mid-day, and the failure reads as "execution context was destroyed" rather
 * than anything to do with the game. A test that goes red because a colleague
 * hit save is worse than no test. It also keeps the run reproducible: the whole
 * suite sees one snapshot of the code.
 *
 * Run by playwright.config.ts on its own port, so it never fights the dev server
 * a person already has open.
 */
export default mergeConfig(
  base,
  defineConfig({
    server: {
      hmr: false,
    },
  }),
);
