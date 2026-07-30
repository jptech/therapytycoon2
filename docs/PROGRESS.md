# Build log

What was built, in what order, and why it was ordered that way. Written as the build happened.

---

## Phase 0 — Foundations

**Goal:** a headless simulation that runs 200 deterministic days with no UI attached.

Scaffolded Vite + React 19 + TypeScript, then switched the package manager and runtime to **bun**
partway through (bun runs the TypeScript tools directly, so `tools/balance.ts` needs no build
step).

The first real artefact was `src/sim/types.ts` — the complete type contract for every entity,
action and event in the game. Everything else, including all the parallel work below, was written
against it. Then `rng.ts` (seedable, serialisable sfc32), `bus.ts` (typed event bus) and
`balance.ts` (every tuning number in one place).

**Exit criterion met:** 200 headless days, deterministic across runs, zero DOM dependencies.

## Phase 1 — Content, in parallel

With the contract fixed, all content could be authored concurrently. Nine agents wrote sibling
files, then a tenth reconciled cross-references and typechecked the tree.

| File | Count |
| --- | --- |
| `techniques.ts` | 48 across 8 modalities, incl. 8 philosophy-exclusive |
| `events-life.ts` + `events-practice.ts` | 62 |
| `arcs.ts` | 42 arc beats |
| `traits.ts` | 22 |
| `upgrades.ts` | 26 |
| `trainings.ts` | 24 |
| `milestones.ts` | 30 |
| `campaign.ts` | 5 accreditation stages |
| `programs.ts` / `philosophies.ts` | 6 / 3 |
| `names.ts` / `testimonials.ts` | ~120 names, 70 backstories, 45 testimonials |

The integration pass caught six dangling program→event references and wired trait-specific events,
and it also caught a real infrastructure bug: **`tsconfig.json` had `baseUrl` set, which
TypeScript 7 removed, so `tsc` was aborting on config parse and typechecking nothing at all.**
Every "clean" typecheck up to that point had been meaningless.

## Phase 2 — Simulation systems

`quality.ts`, `session.ts`, `generators.ts`, `eventsys.ts`, `scheduler.ts`, `engine.ts`, `save.ts`.

The design decision that shaped the most code: `SessionResult.reasons` carries the full
explanation of every session, so the reflect card never has to re-derive anything and the
"no hidden punishments" commitment is structural rather than a UI convention.

## Phase 3 — The balance harness, and what it found

`tools/autoplay.ts` (a headless reasonable player) plus `tools/balance.ts` (runs it thousands of
times and reports the curves).

**The first run failed the game.** 6 runs × 60 days reported:

- Reputation, community trust, morale and practice level **all pinned at maximum by day 60**
- **86% of sessions graded "Excellent"**, 0% breakthrough, 0% poor
- Zero dropouts, zero burnouts, zero departures across every run
- Cash compounding to $75k with nothing to spend it on

This is v1's failure reproduced exactly, three times faster. Four root causes, all found by
reading the report:

1. **Quality could not exceed 0.907.** Compression above the knee was linear, so the 0.92
   breakthrough threshold was mathematically unreachable — while every session simultaneously
   reached the ceiling.
2. **Aggregate bonuses were unbounded.** The 26-item upgrade tree was worth up to +0.5 raw
   quality on its own, which pinned every session at the cap regardless of play.
3. **The same bug in morale.** Aggregate office `moraleDrift` was worth +5.2/night against a
   −3.1/night reversion, so every team pinned at 100 and the poaching/retention game never fired.
4. **Linear meter gains.** Reputation and trust gained linearly and decayed at a constant rate, so
   both ran to 100 and stopped being meters.

The fixes were structural rather than numeric:

- Compression now asymptotes toward the **practice-level ceiling used as an asymptote rather than
  a hard clamp** — a clamp made every mature session score the identical number.
- Additive modifiers are summed and **clamped as a group**; office and trait contributions each
  asymptote separately.
- Morale **reverts toward a baseline** every night.
- Reputation and trust gains scale by `(1 − v/max)^n` while losses land at full strength.
- One **normal variance sample per session**, drawn at session start and stored on it so the
  preview and the result agree.
- Strain accrues from **carrying too many hours**, not from a tired evening, so burnout is
  visible before it lands.
- Most overhead moved from per-client to **per-session**, so a large caseload no longer quietly
  bankrupts a healthy practice.

Iterated against the harness until the three difficulties read as three genuinely different games.
Final curves are in [BALANCE.md](BALANCE.md); the headline is 0/40 collapses on Cozy with every run
accredited, 5/40 on Standard with a p10 run ending in the red, and 12/40 on Challenge with a median
final balance of $1,137.

## Phase 4 — UI, in parallel

Design tokens (`theme.css`), shared primitives and the procedural portrait system were written
first as the shared vocabulary, then eight agents built panels and moments against them:
HUD and day flow, schedule, clients, staff and hiring, finances and upgrades, programs/policies/
campaign/wall, the session decision overlay, the reflect card, events, celebrations, title and
onboarding, philosophy and the end screen.

## Phase 5 — Scene, audio, tests

- **The living office** (`src/scene/`): a PixiJS v8 dollhouse cross-section, drawn entirely
  procedurally — no image assets, no network requests. Lazy-loaded behind a boundary that
  degrades to nothing, so the game stays fully playable without WebGL.
- **Audio** (`src/audio/`): every sound synthesised with the Web Audio API, in an F-major
  pentatonic scale so nothing clashes across a long session, with a voice limiter and a generated
  convolution reverb. No audio files.
- **Tests** (`src/sim/*.test.ts`): RNG determinism, the quality formula's invariants, session
  resolution, the day loop, scheduling, save migrations, and content integrity.

## Phase 6 — Integration and polish

Wired everything through `src/App.tsx`, then actually played it. Six real bugs came out of
half an hour of play plus the test suite, and every one of them was invisible to typechecking:

1. **A 60-year-old was referred for "Child Behavioral."** Client age was drawn independently of
   the presenting condition. Worse, the session card then rated *Sand Tray* a "Strong fit" for a
   57-year-old with PTSD, because Play Therapy techniques legitimately list trauma in `goodFor`.
   Ages now follow the condition, and both `specializationFit` and `techniqueFit` account for
   whether a school is built for the person actually in the chair.
2. **`progressDelta` was computed before arc beats applied**, so the reflect card could report
   +4 while the client sheet moved −2. It now reports the true total, and a beat that moves
   progress says so in the reasons list. This one matters more than its size: the whole
   no-hidden-punishments contract rests on the card and the sheet agreeing.
3. **Events repeated within days of each other** — the same dilemma three mornings running, and
   twice on one day. Found by `tools/playtest.ts`, which narrates a single run; the statistical
   harness had smoothed it away completely. Events now carry a per-scope cooldown.
4. **A flat per-session event chance** would have fired ~5 modals a day at late-game session
   volume — the opposite of cozy. Capped per day.
5. **Two events the engine raises by name had never been authored**, so the Act 1→2 hinge and
   the post-burnout conversation were both dead — and the first-hire nudge silently retried
   every single day of Act 1, because a no-op raise never lands in `firedOnce`.
6. **`compress()` could exceed the practice ceiling** by 0.01 when the cap sat exactly on the
   knee, and `capacity()` returned NaN for a save missing `practiceLevel`.

Also caught during setup: `tsconfig.json` had `baseUrl`, which TypeScript 7 removed, so `tsc`
was aborting on config parse and checking **nothing**. Every green typecheck before that fix was
meaningless — worth knowing if you upgrade TypeScript under an older config.

## Phase 7 — What playing it in someone else's hands found

The build was "done" before this phase. Everything here came from a person actually sitting with
it, and none of it was visible to typechecking or to the balance harness.

**The day started running while the tour was up.** You cannot read a coach-mark against a moving
schedule. The clock now waits while `tutorialStep >= 0`, and finishing or skipping the tour hands
it back — so nobody is left staring at a paused day wondering what they broke.

**Panels opened underneath the HUD strip**, hiding their own headers. Both now hang off a single
`--hud-h` token so the bar and the panels cannot disagree.

**Tooltips were clipped, and then ran off the page.** Two separate faults. The HUD sets
`overflow-hidden` *and* establishes a stacking context via `backdrop-filter`, so a tooltip inside
it was both cut off and trapped below the scene — fixed by portaling to `document.body`, the only
reliable escape from an ancestor's clip, transform, filter or z-index. Then a tooltip on a control
near the right edge hung off the viewport, which needed real placement logic: flip to the opposite
side when the preferred one has no room, *then* clamp along the cross axis. That is fiddly enough
to be worth extracting (`src/ui/anchor.ts`) and testing exhaustively — the sweep across every
anchor position immediately caught that the clamp's `Math.max` has to come *after* the `Math.min`,
or an oversized tooltip gets pushed off the right edge instead of pinning left.

**"I selected a therapy option and now the game is stuck."** The most interesting bug of the
build, and the one I did not fully solve.

The symptom was diagnostic: *pause/play has no impact on time*. `tick()` refuses to advance while
any event is pending, and that check ignores `paused` — so a freeze means a pending event with
nothing on screen to resolve it. `App.tsx` decided what to mount using `!!p.techniqueCards` while
the modals picked their subject using `.length > 0`, so an empty array would mount an overlay that
renders nothing *and* suppress the event modal.

But a stress harness driving 120 seeds × 45 days through the exact browser tick pattern found zero
stalls, which means the engine does not currently produce that empty array — so that probably was
not the reported freeze. Rather than keep guessing, the failure mode was made non-fatal:

- The predicates moved into `src/sim/pending.ts` as a stated liveness contract, used by both the
  mounting decision and the modals, so they cannot disagree.
- A watchdog detects blocked-but-nothing-on-screen, logs what was pending, and resumes the clock.
- An error boundary catches render failures, which present identically to a freeze. The sim lives
  outside React, so its state is intact — the boundary offers retry, roll back to autosave, or
  export the run.
- `src/sim/stall.test.ts` guards the whole class: tick sizes, auto-pause on and off, a
  fully-booked day, and "a resolved decision always hands the clock back".

The honest summary is that the bug is now recoverable and diagnosable rather than definitively
identified. If it recurs, the console names the pending event or the boundary shows the stack.

---

## What I would tell the next person

**The harness is the product.** Every serious balance problem in this build was found by reading a
report, not by playing. None of them would have surfaced in an hour of hand-play, and all of them
were the kind that only bite at hour six — which is exactly the failure mode v2 exists to fix.

**Aggregate bonuses are the recurring bug.** It appeared three separate times — quality, morale,
reputation — always the same shape: a per-item bonus that is obviously fine multiplied by a
content list that grows. Any new "sum a modifier across owned things" needs an aggregate clamp
written at the same time.

**The type contract paid for itself immediately.** Twenty-odd agents wrote against
`src/sim/types.ts` concurrently with essentially no integration friction, because the contract was
finished and detailed before any of them started.

**Three tools, three blind spots.** The typechecker cannot see a 60-year-old referred for "Child
Behavioral". The balance harness cannot see the same dilemma firing three mornings running. The
narrated playtest cannot see a tooltip running off the right edge. Every class of bug in this
project was found by exactly one of the three, and never by the other two — so "it typechecks and
the curves are fine" is not evidence of much on its own.

**Design commitments need structural enforcement, not discipline.** "No hidden punishments" only
held because `SessionResult.reasons` carries the full explanation and `progressDelta` reports the
*total* change. The moment those were computed separately from what the sim applied, the card
started lying — quietly, and only sometimes.
