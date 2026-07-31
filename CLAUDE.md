# CLAUDE.md

Therapy Tycoon II — a cozy therapy-practice management sim. TypeScript · Vite · React 19 ·
PixiJS v8 · Zustand · Tailwind v4. **Package manager and runtime is `bun`, not npm.**

```bash
bun run dev          # dev server (port 5199 via .claude/launch.json)
bun run typecheck    # tsc --noEmit — must be 0 before you claim done
bun run test         # vitest — sim formulas, liveness, saves, content integrity
bun run test:e2e     # Playwright — one full day in a real browser; see docs/TESTING.md
bun run balance      # headless balance harness — READ docs/BALANCE.md FIRST
bun run playtest     # narrated single run — the fastest way to see a change
bun run replay       # replay a recorded action log; --verify checks it reproduces
bun run build
```

In dev, `window.__tt` exposes `{state, ui, dispatch, store, replay, saveReplay}` — the whole
simulation is one object, so reading it from the console beats adding logging. `__tt.saveReplay()`
writes the run's action log; `bun run replay <file> --verify` proves it reproduces, or names the
day it stopped.

---

## The one rule

**Nothing in `src/sim/` may import React, Pixi, or the DOM.** The simulation is a pure function
of `(state, action, rng)`. This is what makes the balance harness, the tests, and deterministic
replays possible, and it is the single most load-bearing constraint in the codebase.

Corollaries:
- No `Date.now()` or `Math.random()` anywhere in `src/sim`. Use the injected `Rng`.
- The UI never mutates state. Everything goes through `dispatch({type: ...})`.
- Every tuning number lives in `src/sim/balance.ts`. Never inline a constant in system code.

## Where things are

```
src/sim/       the simulation. types.ts is the contract — read it before anything else.
src/content/   authored data. Adding content is never an engine change.
src/ui/        React panels and overlays.
src/scene/     PixiJS office. Lazy-loaded; the game must stay playable without it.
src/audio/     Web Audio synthesis. No asset files, no network requests.
src/store.ts   the sim ↔ React bridge.
tools/         autoplay.ts (headless player), balance.ts (sweep), playtest.ts (narrate one run)
```

Read `src/sim/types.ts` first. It is long and it is the whole contract — entities, `GameAction`,
and the typed event bus payloads.

## Reading state in React

```ts
const day = useSim((s) => s.day);                                 // primitive → cheap
const active = useSimShallow((s) => s.clients.filter(isActive));  // array → shallow compare
const dispatch = useDispatch();
```

`useSim` re-runs its selector on **every** sim revision and re-renders only when the derived
value changes. Keep selectors cheap; return primitives where you can. `getSim()` is the
imperative escape hatch for the Pixi scene and audio — **never call it during render**.

## Things that will bite you

**Aggregate bonuses are the recurring bug in this codebase.** It has appeared three separate
times — quality, morale, reputation — always the same shape: a per-item modifier that is
obviously fine, multiplied by a content list that grows. A fully-upgraded office was once worth
+0.5 raw quality, which pinned every session at the ceiling and re-created the exact failure this
game exists to fix. **Any new "sum a modifier across owned things" needs an aggregate clamp or
asymptote written at the same time.** See `MOD_CEILING`, `UPGRADE_QUALITY_ASYMPTOTE`,
`UPGRADE_MORALE_ASYMPTOTE`, `RELATIONSHIP_MORALE_CAP`, `softGain()`.

**Meters must asymptote, not pin.** Gains scale by `(1 - v/max)^n`; losses land at full strength.
Morale additionally reverts toward `MORALE_BASELINE` every night — without that, small positive
drifts compound and the whole staff-retention game disappears.

**The practice ceiling is an asymptote, not a clamp.** `compress(raw, cap)` in `quality.ts`. A
hard clamp made every mature session score the *identical* number, which is a flatline, not
balance. If you touch this, check the late-game spread in the harness output.

**`raiseEventById` silently no-ops on an unknown id.** Two narrative beats were dead for the
whole build because of this. Worse, a `once` event that never fires never lands in `firedOnce`,
so the caller retries it every day forever. If you add an engine-raised event id, add the
definition in the same change — `src/sim/content.test.ts` now enforces this.

**Numbers the player sees must match the numbers the sim applied.** `SessionResult.reasons`
carries the full explanation of every session, and `progressDelta` is the *total* change
including arc beats. This is structural, not a UI convention: it is the no-hidden-punishments
design commitment in code. Never report a partial figure.

**A pending event nobody renders freezes the game.** `tick()` refuses to advance time while any
event is pending — deliberately, so a decision can never be skipped. That makes it a *liveness
contract* that something is always on screen to resolve it, and the freeze is silent: pause/play
has no effect, because pause is not what is blocking. `src/sim/pending.ts` is the single source of
truth — `App.tsx` decides what to mount with exactly the predicates the modals use to pick their
subject. **If you add a blocking modal, add its predicate there and extend
`src/sim/stall.test.ts`.** Never inline the check in a component. A watchdog in `App.tsx` and the
error boundary in `main.tsx` are backstops, not permission to be careless.

**A session is a room, not a chair.** `ScheduledSession.clientId` is the seat it is filed under;
a group session carries `memberIds` and resolves once per member into `session.results`, all of
which reach `lastDayResults`. Read the room through `sessionMembers()` / `sessionIncludes()` /
`sessionMemberClients()` in `src/sim/session.ts`, and take somebody out of the day with
`detachClientFromSchedule()` — a cure or a dropout must empty one chair, not cancel everyone
else's hour. Any new `schedule.filter(x => x.clientId === ...)` is a bug waiting for the first
group booking. `src/sim/sessiontypes.test.ts` guards the seam.

**Floating UI must portal to `document.body`.** The HUD strip clips its overflow *and* creates a
stacking context via `backdrop-filter`, so anything positioned inside it is both cut off and
trapped below the scene. Use `placeAnchored()` from `src/ui/anchor.ts` for positioning — it flips
and clamps to the viewport, and it is unit tested without a DOM.

**The UI never writes sim state, including `state.flags`.** Transient presentation flags
(`showQuarterReview`, `autoSchedule`, `autoTechnique`) go through `SET_FLAG` like everything else.
They used to be written straight onto the live state with a no-op dispatch to force a publish,
which worked and was invisible — until replay, at which point a run where somebody closed the
quarter review no longer reproduced. Two direct writes remain, both outside the run's action
stream and both commented where they live: the watchdog's emergency `pendingEvents = []` in
`App.tsx`, recovering from an otherwise unrecoverable state — it logs loudly, and a replay that
crosses it is not to be trusted — and `spendLegacy` in `EndScreen.tsx`, which spends
meta-progression *after* the run has ended, so there is no run left for it to desync. That second
one is why `Recorder` deep-copies the legacy it was started from; see `src/sim/replay.test.ts`.

**A run is reproducible from its action log.** `src/sim/replay.ts` records every dispatch and
fingerprints the state at each day boundary, so a bug report replays exactly and a drift names the
day. Two things keep that honest and both are easy to break: **every id the sim mints must come
off `state.idSeq` or the rng**, never a module-level counter (that bug cost a whole-state diff for
most of the build), and **anything that changes the run must be an action** — a helper called
directly from the UI or a tool is a hole in the log. `src/sim/replay.test.ts` guards both.

## Before you say a change is done

1. `bun run typecheck` → 0 errors.
2. `bun run test` → all pass.
3. **If you touched `src/ui/`, `src/store.ts`, `src/App.tsx`, or anything about layout, z-index,
   portals or the day loop: `bun run test:e2e`** (~50s). It is the only layer that can see a
   clipped tooltip, a panel under the HUD, or a clock that will not start. First run on a machine
   needs `bun run e2e:install` once. See docs/TESTING.md.
4. **If you touched anything in `src/sim/` or `src/content/`: `bun run balance -- --runs 20
   --days 200 --difficulty cozy,standard,challenge`** and compare against the table in
   docs/BALANCE.md. Watch the grade distribution and the late-game spread first — they move
   before anything else does. If the report prints `⚠ Late-game looks SOLVED`, you have
   reintroduced the core bug.
5. **If you touched anything that produces *moments* rather than *numbers*** (events, arc beats,
   milestones, toasts): `bun run playtest`. The statistical harness smooths pacing problems away
   completely — both event-pacing bugs in this project were invisible in the sweep and obvious in
   the first minute of the narrated run.

## Adding things

**A tuning change** → edit `src/sim/balance.ts`, re-run the harness, update the table in
docs/BALANCE.md if the shift was deliberate.

**Content** (technique, event, arc beat, upgrade…) → `src/content/`, follow the id conventions
and quality bar in [docs/CONTENT.md](docs/CONTENT.md). `content.test.ts` checks every
cross-reference resolves and every magnitude is in range.

**A system** → state on `GameState`, verbs on `GameAction`, constants in `balance.ts`, logic in
its own `src/sim/*.ts`, a case in `Game.dispatch`, a test, then a harness run — and only then any
UI. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Tone, for anything player-facing

Warm, specific, humane. Never clinical-cold and never twee. Clients are people, not diagnoses,
and appear as initials + age ("A.M., 34"). Real modality vocabulary and real pacing wisdom — you
do not process trauma with an unstable client. Concrete images beat adjectives. Every line should
be worth reading the tenth time. Empty states are voiced: *"Nobody on the waitlist. Enjoy the
quiet."* beats *"No items."*

Sensitive-subject guardrails: no outcome guarantees, no making light of suffering, no real brands
or people.

## Docs

| | |
| --- | --- |
| [docs/DESIGN.md](docs/DESIGN.md) | Every system, and the v1 failure it answers |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Code layout, the sim/UI contract, how to extend |
| [docs/BALANCE.md](docs/BALANCE.md) | The harness, current curves, retuning workflow |
| [docs/TESTING.md](docs/TESTING.md) | The three test layers, and what only a browser can see |
| [docs/CONTENT.md](docs/CONTENT.md) | Adding content, with the quality bar |
| [docs/PROGRESS.md](docs/PROGRESS.md) | Build log — what broke and why |
| [FUTURE_WORK.md](FUTURE_WORK.md) | Known gaps, ranked |

## Environment notes

- **`tsconfig.json` must not use `baseUrl`** — TypeScript 7 removed it, and `tsc` then aborts on
  config parse and typechecks *nothing* while exiting 0. `paths` entries are relative
  (`./src/sim/*`). If a typecheck ever looks suspiciously clean, verify this first.
- Vitest config is `vitest.config.ts`, separate from `vite.config.ts` — the `test` key is not
  valid on Vite's own `defineConfig`.
- The dev server runs on **5199**, configured in `.claude/launch.json`.
