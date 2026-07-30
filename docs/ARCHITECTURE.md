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
    save.ts         versioned saves, migrations, autosave ring, export/import
    util.ts         clamps, formatters, softGain

  content/        authored data — adding content is never an engine change
  ui/             React panels and overlays
  scene/          the PixiJS living office
  audio/          procedurally synthesised sound
  store.ts        the bridge between the sim and React

tools/
  autoplay.ts     a headless "reasonable player" that drives the sim
  balance.ts      the harness that runs it thousands of times
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

### One sanctioned exception

A handful of transient UI flags live on `state.flags` (`showQuarterReview`, `autoSchedule`,
`autoTechnique`) and have no dedicated action. Components that toggle them mutate the flag and
then dispatch a no-op to force a publish. Every such site is commented; if you find yourself
adding a fourth, add a real action instead.

## The office scene

`src/scene/` mounts a PixiJS v8 application under the React tree and reads the sim imperatively
each frame. It renders everything procedurally — no image assets, no network requests. It is
lazy-loaded behind a `Suspense` boundary that resolves to a no-op component if the import or
WebGL initialisation fails, so **the game remains fully playable without it**.

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

## Adding a system

1. Add its state to `GameState` in `types.ts` and its verbs to `GameAction`.
2. Add tuning numbers to `balance.ts` — never inline a constant in system code.
3. Implement it in its own `src/sim/*.ts` module, mutating state and emitting bus events.
4. Add a case to `Game.dispatch`.
5. Add a test in `src/sim/*.test.ts`.
6. Run `bun run balance` and check the curves did not move in a way you did not intend.
7. Only then build UI for it.
