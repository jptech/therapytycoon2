# Testing

Three layers, and they measure different things. None of them replaces another.

| | What it runs | What it can see |
| --- | --- | --- |
| `bun run test` | 275 vitest tests over `src/sim`, `src/content`, `src/ui/*.ts` | Formulas, liveness predicates, saves, replay, content integrity |
| `bun run balance` | Thousands of headless 200-day playthroughs | Curves, grade distribution, late-game spread |
| `bun run test:e2e` | 6 Playwright tests driving a real Chromium | Everything that only exists once there is a page |

The third one is new and this file is mostly about why it exists.

---

## Why there is a browser layer at all

The sim is the best-tested part of this codebase and the balance harness runs more playtime in a
minute than a person will play in a year. Neither of them could see a single one of the bugs a
person actually hit when they sat down with the finished build:

- a tooltip clipped by an ancestor's `overflow`
- a tooltip running off the right edge of the viewport
- a panel opening underneath the HUD, hiding its own header
- a day that started running under a tutorial coach-mark
- a freeze

Every one of those is a fact about a rendered page. A typechecker cannot see any of them, and the
harness never opens a window. `e2e/` is the only layer that can, and all five have a test here.

## Running it

```bash
bun run test:e2e            # the suite, headless
bun run test:e2e:headed     # watch it play
bun run test:e2e:ui         # Playwright's UI mode — pick tests, step through, time-travel
bun run test:e2e:debug      # inspector, one step at a time
bun run test:e2e:report     # open the HTML report from the last run
bun run test:e2e -- --grep "coach-mark"   # one test
```

**Once per machine**, before the first run:

```bash
bun run e2e:install         # downloads the Chromium build Playwright drives
```

Playwright starts the dev server itself, so nothing needs to be running first. It takes about
**50 seconds** wall-clock on six workers, or **1m30s** with `--workers=1`. Most of that is the
game clock: a day is ten hours of game time, which is fifteen seconds of real time at 4× and
nothing can make it shorter.

## When to run it

Any change to `src/ui`, `src/store.ts`, `src/App.tsx`, or anything about layout, z-index, portals
or the day loop. It is not needed for a tuning change or a content addition — those are what the
harness and `content.test.ts` are for.

**Nothing enforces this remotely.** The only workflow in `.github/` builds the game and publishes
it; it does not run a single test. That is deliberate — the suites here are worth minutes of a
person's attention on the change they just made, not minutes of a runner's on every push — but it
does mean the gate is you. A broken build will still fail the deploy, loudly. A broken *game* will
publish perfectly.

## How it is set up

**Its own server, with HMR off** (`e2e/vite.e2e.config.ts`, port 5299). It is the project's real
Vite config, so it is a dev build and `window.__tt` is installed — the tests need that. The two
differences are deliberate:

- *Hot reload is off.* With it on, saving any file mid-run full-reloads the page under whatever
  test is halfway through a day, and the failure reads "execution context was destroyed" rather
  than anything about the game. A suite that goes red because somebody hit save is worse than no
  suite.
- *Port 5299, not 5199.* It never fights the dev server a person already has open.

**The office scene is blocked, on purpose.** `openGame()` aborts the request for
`scene/OfficeScene`, so every spec runs against the app's own no-WebGL path — the one the lazy
import's `.catch()` already provides, because "the game stays playable without the scene" is an
architectural rule rather than an aspiration. This is not only about avoiding the canvas: on a
machine without a GPU, PixiJS falls back to software rasterisation, its animation loop pegs the
core it is given, and the page starves. That was measured, not guessed — on a two-core cloud
runner `page.evaluate` itself timed out and every spec failed against a two-minute budget, for want
of a canvas that no test asserts on. Blocking it also halves the suite's wall clock on a laptop.
The office is verified by looking at it, which is the only way a drawing can be verified anyway.

**Warmed before the first test.** `e2e/global-setup.ts` loads the page once and waits for
`window.__tt`. `webServer.url` only waits for Vite to *answer*, and Vite answers with the HTML
shell while the module graph behind it is still uncompiled and transformed on demand — long enough
on a two-core runner that the first click of the first spec timed out against a cold cache wearing
the costume of a broken app.

**Deterministic from the first frame.** `createInitialState` falls back to `Math.random()` when no
seed is given and the setup screen has no seed field, so `openGame()` installs a seeded
`Math.random` before any app code runs, and clears `localStorage`. The whole boot — seed, practice
name, who is on the waitlist — is reproducible, and the tests still go in through the front door
rather than constructing a run behind the UI's back.

**No `waitForTimeout`, anywhere.** Waits are on real signals: a state predicate through
`page.waitForFunction`, or `runFrames(n)`, which resolves after N `requestAnimationFrame` ticks.
That last one is how "the clock did not move" is asserted honestly — a sleep proves nothing about
whether the game *had a chance* to move, whereas counting frames proves the loop that drives the
clock ran thirty times and the clock still did not budge.

## The rules the tests follow

1. **Everything a player does goes through the UI**, by accessible name, exactly as a screen
   reader would find it. There is not a single `data-testid` in this codebase and adding one would
   be a last resort — the game already ships real buttons with real labels, and a selector that is
   hard to write here is usually telling you something about the markup.
2. **Everything a test asserts comes from `window.__tt`.** The whole sim is one object, so "the
   clock did not move" is read off `state.minute` rather than parsed out of a screenshot of the
   clock. Reading state is observation; it never drives the run.
3. **A rectangle is not visibility.** Layout assertions hit-test with `document.elementFromPoint`
   (`isTopmostAt` in `e2e/game.ts`). An element clipped by an ancestor's `overflow`, or buried
   under a stacking context, still reports a perfectly good `getBoundingClientRect` — which is
   exactly how the clipped-tooltip bug survived review.
4. **Every test must be able to fail.** Each assertion here was verified by breaking something and
   watching it go red; see below.
5. **State says what is blocking; the DOM is then checked for whether it arrived.** Never the
   other way round. The sim publishes a pending event synchronously and React commits the modal a
   frame or two later, so "which dialog is on screen right now" is a value that is routinely one
   commit stale — and under parallel workers that gap is wide enough to act on. `whatIsBlocking()`
   reads `pendingEvents` and mirrors the predicates in `src/sim/pending.ts`; only then does the
   helper wait for the matching modal. This is not a violation of rule 2: state still never *does*
   anything, it only names what to look for, and the click itself goes through the UI as always.

   The rule exists because breaking it produced two real failures. Deciding from the DOM let
   `waitForTechniqueBeat` see no overlay, fall through to "something is pending, answer it", and
   spend the very beat it was waiting for — then time out claiming no session ever asked. And
   because the DOM checks were single-shot rather than polled, a modal that had simply not
   committed yet was reported as *the freeze the suite exists to catch*, pointing the reader at
   `src/sim/pending.ts` for what was entirely a test race. A false alarm on that contract is worse
   than no test. Any wait on a modal therefore polls (`expect(...).toBeVisible()`), and the freeze
   error is only reachable after that poll has timed out with the clock still blocked.

## What is in the suite

### `full-day.spec.ts` — the core path

One whole day, front door to closing up: open a practice, take somebody on, give them an hour,
open the doors, answer the decision the room asks, read the reflect card, close the day, wake up
on day two. That single line crosses every integration seam the unit tests cannot reach — the
store bridge, the modal priority order, the clock loop, the bus, and the two notebook pages that
bracket a day.

It also checks the no-hidden-punishments commitment in a browser: the figure on the reflect card
is the *total* `progressDelta` the sim applied, and the number of reasons on screen equals
`result.reasons.length` — not a summary of the interesting ones.

### `hud-layout.spec.ts` — the three layout faults

A tooltip on the far-right HUD control is portalled to `document.body`, sits inside the viewport,
and hit-tests as the topmost thing at its own centre. The test also asserts that this control
*genuinely stresses the right edge* — that an unclamped placement would have overflowed — so it
cannot quietly become vacuous the day somebody re-arranges the HUD.

Then every door on the rail is opened in turn and its panel checked: below the HUD's bottom edge,
header hit-testable, close button clickable. All of them, because the bug was a shared `--hud-h`
token drifting and checking one panel would not have caught it.

### `liveness.spec.ts` — the clock stops for the right reasons

Both of the ways the clock is allowed to stop, watched from both sides:

- A pending decision freezes it, and answering hands it back (`src/sim/pending.ts`).
- The tutorial holds the day, and skipping the tour hands it back (`startDay` in `engine.ts`).

The "starts again" half is what makes the "stops" half worth anything — without it the test would
pass just as well against a dead game.

Every spec also listens for the watchdog's console error and for uncaught render throws, which is
how the freeze presents when it is not merely a stopped clock.

## Proving the tests can fail

Each assertion below was confirmed red by breaking something, then restored. Numbers are from the
actual failing runs:

| Broke | Assertion that caught it |
| --- | --- |
| `aside { top: 0 }` — panel back under the HUD | panel top `0`, needed `≥ 54.5` |
| same, checked by hit-test | panel heading no longer topmost at its own corner |
| moved the tooltip node back inside `<header>` | not a child of `document.body`, and no longer topmost |
| placed the tooltip centred on its trigger, unclamped | right edge `1333.7` against a `1280` viewport |
| answered the decision, then ran the frozen-clock check | clock moved `30 → 61` in sixty frames |

The last one is the important one: it is the proof that "time does not pass while the room is
waiting on you" is a real assertion and not a tautology.

## Known gaps

- **One browser.** Chromium only. Firefox and WebKit would mostly re-test Chromium's layout
  engine's agreement with the spec, which is not where this project's bugs live.
- **One viewport.** 1280×800, the size the layout was designed against and the width at which a
  day card still docks beside the wide panel instead of yielding. The dock arithmetic itself is
  unit tested across widths in `src/ui/dock.test.ts`, but nothing drives a real narrow window.
- **Act 1 only.** Everything here happens on day one or two. Nothing exercises the Act 3 policy
  panels, the quarter review, the hire modal, or the end screen — all of which are blocking
  surfaces, and three of them are modals that could in principle strand the clock.
- **No visual regression.** Nothing would notice the game turning grey.
- **The office scene is never exercised here** — see above for why. Nothing in this suite would
  notice the scene throwing on load; the `.catch()` would swallow it and the run would stay green
  while the home screen quietly went blank. A cheap guard would be one spec that *allows* the
  module through and asserts a canvas appears, kept away from the frame-counting tests so it
  cannot starve them.
