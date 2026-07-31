# Architecture

The one non-negotiable: **the simulation is headless**. Nothing in `src/sim` imports React,
Pixi, or the DOM. The whole game is a pure function of `(state, action, rng)`.

That buys three things that directly attack v1's failure modes:

1. A **balance harness** that runs thousands of 200-day playthroughs in seconds, so late-game
   breakdown is measured rather than discovered by players.
2. Fast unit tests for every formula.
3. Deterministic replays — a seed plus an action log reproduces a run exactly.

---

## Layout

```
src/
  sim/            the headless simulation — zero DOM/Pixi/React
    types.ts        the whole type contract; read this first
    balance.ts      every tuning number in the game
    rng.ts          seedable, serialisable sfc32 PRNG
    bus.ts          typed event bus (SESSION_COMPLETED, CLIENT_CURED, …)
    quality.ts      the session quality formula and its explanations
    session.ts      session resolution, technique cards, arc beats
    scheduler.ts    autofill, the Act-3 policy scheduler, exception feed
    eventsys.ts     event selection, requirements, effect application
    generators.ts   procedural clients, therapists, candidates, portraits
    engine.ts       the Game object: the reducer and the day loop
    pending.ts      which pending event owns the clock — a liveness contract
    save.ts         versioned saves, migrations, autosave ring, export/import
    replay.ts       action-log recording, state fingerprints, replay
    util.ts         clamps, formatters, softGain

  content/        authored data — adding content is never an engine change
  ui/             React panels and overlays
  scene/          the PixiJS living office
  audio/          procedurally synthesised sound
  store.ts        the bridge between the sim and React

tools/
  autoplay.ts     a headless "reasonable player" that drives the sim
  balance.ts      the harness that runs it thousands of times
  playtest.ts     one narrated run; --record writes a replay log
  replay.ts       replays a log, --verify checks it reproduces

e2e/
  game.ts         the driver: clicks by accessible name, reads state via window.__tt
  *.spec.ts       one full day, the three layout faults, the two clock contracts
  vite.e2e.config.ts   the project's dev config with HMR off, on its own port
```

## The sim contract

```ts
const game = Game.create({ seed: 42, difficulty: 'standard' }, bus);
game.dispatch({ type: 'BOOK_SESSION', clientId, therapistId, slot: 3 });
game.dispatch({ type: 'START_DAY' });
game.dispatch({ type: 'TICK', dtMinutes: 10 });
```

`GameAction` in `types.ts` is the complete list of things the outside world can do. There is no
other mutation path — the UI never writes to state directly.

The sim mutates its own state in place for speed, then emits typed events on the bus. Discrete
moments (a cure, a level-up, a session ending) are events; continuous state (cash, the clock) is
read from `game.state`.

### Determinism

`Rng` is a seedable sfc32 with a fully serialisable four-word state, so a save resumes the exact
same stream. `Date.now()` and `Math.random()` appear nowhere in `src/sim`. Tests assert that two
games with the same seed, driven identically, end with identical cash and cure counts.

## The React bridge

`src/store.ts` publishes a monotonically increasing `rev` counter whenever the sim changes.

```ts
const day = useSim((s) => s.day);                                    // primitive → cheap
const active = useSimShallow((s) => s.clients.filter(isActive));     // array → shallow compare
const dispatch = useDispatch();
```

`useSim` re-runs its selector on every revision but only re-renders when the derived value
actually changes, so selectors must be cheap and should return primitives where possible.
`getSim()` is the imperative escape hatch for the Pixi scene and the audio layer — never call it
during render.

The clock is a single `requestAnimationFrame` loop in the store that converts real milliseconds
into game minutes at the current speed and dispatches `TICK`. It is the only thing driving time.

### Liveness: which modal owns the clock

`tick()` refuses to advance time while any event is pending — deliberately, so a decision can
never be skipped. The cost of that design is that **a pending event nobody renders freezes the
game outright**, and silently: pause/play has no effect, because pause is not what is blocking it.

`src/sim/pending.ts` is therefore the single source of truth. `pendingDecision()` and
`pendingChoice()` are used by `App.tsx` to decide what to mount *and* by the modals to pick their
subject, so the two can never disagree about whose turn it is. They live in the sim rather than
the UI because whether the clock can advance is a liveness contract, not a presentation detail —
and so `src/sim/stall.test.ts` can assert on them without importing React.

Two backstops sit on top:

- **A watchdog** in `App.tsx` detects the blocked-but-nothing-on-screen state, logs what was
  pending, drops it and resumes the clock.
- **An error boundary** (`src/ui/ErrorBoundary.tsx`) catches render failures, which present
  identically to a freeze. Because the simulation lives outside React its state is intact when
  this fires, so the boundary offers retry, roll back to the last autosave, or export the run.

If you add a new kind of blocking modal, add its predicate to `pending.ts` and extend the
liveness tests. Do not inline the check in a component.

### Floating UI

`src/ui/anchor.ts` positions tooltips and popovers: it flips to the opposite side when the
preferred one has no room, then clamps into the viewport. It is pure and viewport-agnostic so it
is unit tested without a DOM.

Tooltips render into a **portal on `document.body`**. The HUD strip clips its overflow and
establishes a stacking context via `backdrop-filter`, so anything positioned inside it was both
cut off and trapped below the scene. A portal is the only reliable escape from an ancestor's
clip, transform, filter or z-index — if you build another floating element, do the same.

### One sanctioned exception

A handful of transient UI flags live on `state.flags` (`showQuarterReview`, `autoSchedule`,
`autoTechnique`). They are presentation state that happens to sit in the sim's flag bag, and they
are toggled with `SET_FLAG` — not by writing the flag directly. Components used to do the latter,
with a no-op dispatch to force a publish; it worked, and it was invisible right up until replay,
where a run whose quarter review had been dismissed stopped reproducing. The rule is simply the
general one: if it changes the run, it is an action.

The only remaining direct write is the watchdog's emergency `pendingEvents = []` in `App.tsx`,
recovering from an unrenderable pending event. It logs what it dropped.

## Replay

The sim being a pure function of `(state, action, rng)` means a run is completely described by the
options it started from plus the ordered actions dispatched into it. `src/sim/replay.ts` records
exactly that, and `stateFingerprint()` reduces a `GameState` to a short digest of everything a
replay is supposed to reproduce.

Two details carry the weight:

- **Ticks are run-length encoded, never summed.** `TICK 1` twice is not `TICK 2` — the session
  loop reads thresholds off `state.minute`, so a coarser step can start two sessions in one pass
  and draw their variance in schedule order rather than clock order. Recording a repeat count
  re-dispatches the identical sequence, and collapses a day's ~600 ticks to a handful of entries.
- **Fingerprints are stamped at every day boundary**, so a replay that drifts reports the day it
  drifted on rather than an action index nobody can interpret.

The store records every dispatch of the current run; `__tt.saveReplay()` and the crash screen both
write one out. `bun run replay <log> --verify` exits non-zero on drift.

## The office scene

`src/scene/` mounts a PixiJS v8 application under the React tree and reads the sim imperatively
each frame. It renders everything procedurally — no image assets, no network requests. It is
lazy-loaded behind a `Suspense` boundary that resolves to a no-op component if the import or
WebGL initialisation fails, so **the game remains fully playable without it**.

Two files, split by what they know:

- **`sprites.ts` is a drawing toolkit and knows nothing.** Rigged people, every prop, the cat, and
  the handful of one-off Canvas 2D textures that do the lighting (glow, core, cone, beam, vignette,
  side shade, grain, sky). It never imports game state. People are drawn with their feet at the
  local origin; props stand on it too, so either can be dropped straight onto a room's floor line.
- **`office.ts` composes.** The plan, the seats, the furniture placement, the shell, the backdrop,
  the ambient ramps, the actors and the particle FX. It calls into `sprites.ts` by name — a
  signature change there is a compile error here, and a prop that quietly grows wider collides
  with a neighbour that was placed by hand.

Three rules keep the scene honest, and all three have been broken at least once:

1. **Geometry is never random.** `hash01(a, b, salt)` and `wobble(...)` hash a position into the
   crookedness of a picture frame or the tone of a floorboard, so the office looks hand-laid,
   holds still, and comes back identical after a rebuild. `Math.random()` appears in exactly two
   legitimate places: per-actor animation *phase*, and the one-off cached grain texture.
2. **Geometry is built when the plan changes, never per frame.** `signature()` decides that.
   Everything that moves — light, weather, the sun and moon, the day's colour — is a tint, an
   alpha, a position or a skew on a sprite that already exists. `layout()` re-fits the transform
   and redraws the screen-space backdrop *without* rebuilding the plan, because resizing a window
   must not teleport the people back to their spawn points.
3. **A subpath needs a `moveTo`.** Pixi's `arc()` continues the current path rather than starting
   one, and a path that has just been filled or stroked has its cursor back at the origin. Two
   `arc()` calls without one were dragging hairlines across the whole building from the top-left
   corner of the design box. If you add an `arc`, open it with a `moveTo` to its first point.

## Audio

`src/audio/` synthesises every sound with the Web Audio API — there are no audio files. Sounds
live in an F-major pentatonic scale so nothing can clash across a long session, and a voice
limiter drops extras rather than letting a busy day turn into noise. The context is created
lazily on the first user gesture (browsers block autoplay) and the whole layer degrades to
silence on any failure.

## Saves

Versioned envelopes with ordered migrations (`SAVE_VERSION` in `balance.ts`). `migrate()` walks a
save from its version to the current one, then defensively fills anything a hand-edited file is
missing. There is a five-slot autosave ring, plus export/import as a downloadable JSON file, so
nothing depends on browser storage surviving.

## Browser tests

`bun run test:e2e` drives a real Chromium through one full day and through the layout and clock
contracts that only exist once there is a page — a portalled tooltip actually escaping the HUD's
clip, a panel actually sitting below it, the clock actually stopping for a decision and actually
starting again. Everything in `e2e/` clicks by accessible name and asserts against `window.__tt`.
Run it after touching `src/ui`, `src/store.ts`, `src/App.tsx`, or anything about layout, portals
or the day loop. See [TESTING.md](TESTING.md).

## Adding a system

1. Add its state to `GameState` in `types.ts` and its verbs to `GameAction`.
2. Add tuning numbers to `balance.ts` — never inline a constant in system code.
3. Implement it in its own `src/sim/*.ts` module, mutating state and emitting bus events.
4. Add a case to `Game.dispatch`.
5. Add a test in `src/sim/*.test.ts`.
6. Run `bun run balance` and check the curves did not move in a way you did not intend.
7. Only then build UI for it.
