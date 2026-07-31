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
| `events-life.ts` + `events-practice.ts` | 64 |
| `arcs.ts` | 42 arc beats |
| `traits.ts` | 22 |
| `upgrades.ts` | 26 |
| `trainings.ts` | 24 |
| `milestones.ts` | 30 |
| `campaign.ts` | 5 accreditation stages |
| `programs.ts` / `philosophies.ts` | 6 / 3 |
| `names.ts` / `testimonials.ts` | ~120 names, 70 backstories, 48 testimonials |

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
Final curves are in [BALANCE.md](BALANCE.md). Measured after the Phase 6 and 7 fixes: Cozy never
collapses and 39/40 runs finish accredited; Standard also holds at 0/40 collapses but spreads
widely (p10 owns 4 upgrades, p90 owns all 26); Challenge collapses 14/40 with a median final
balance of $4,723 and a p10 that ends in the red.

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

## Phase 8 — Closing the two blind spots

Phase 7's lesson was that three tools each see one class of bug and never each other's. Two of the
three gaps were still open, so this phase built instruments rather than features.

**Replay turned out to be an audit of everything that was not an action.** The premise is trivial —
the sim is deterministic and `GameAction` is serialisable, so record the dispatches and re-run them
— and it immediately found two places where the run was not, in fact, a function of its actions.
Log and toast ids came off module-level counters, so two same-seed games in one process differed in
exactly the way that defeats a whole-state diff. And three UI surfaces wrote `state.flags` directly
with a no-op dispatch to force a publish, which had worked invisibly for the whole build: a
recorded run where somebody dismissed the quarter review no longer reproduced. Neither was
detectable before there was something that cared.

The one genuinely subtle bug was in the recorder itself, and it was found by review rather than by
running it: `Recorder` kept the run's starting `legacy` **by reference**, and legacy is meta-
progression the end screen mutates after a run finishes. So retiring, spending a legacy perk, then
exporting the run rewrote the recorded starting conditions retroactively — and the CLI reported a
divergence on day 1, blaming the player's log in the exact moment the tool exists to serve them.
Deep-copying the origin is a one-line fix; noticing that the tool could lie about the thing it was
built to prove is the part worth remembering.

One design note that reads as pedantry and is not: **ticks are run-length encoded, not summed.**
`TICK 1` twice is not `TICK 2` — `tick()` reads thresholds off `state.minute`, so a coarser step
can activate two sessions in one pass and draw their variance in schedule order rather than clock
order. Recording `{action, n}` keeps the sequence identical and still takes a 12,288-action browser
run down to 384 entries.

**The adversarial player measured a floor nobody had seen.** `--skill 0` never did the genuinely
wrong thing — it would not work an exhausted therapist or process trauma on an unstable client — so
"poor" sessions were 0.0% in every sweep ever run. A policy that plays like an overwhelmed beginner
rather than a random button-masher puts them at ~7% and mixed at ~65%, and finally exercises
departures and burnouts at scale.

It also caught three things the competent bot had been hiding, all documented rather than tuned
away because they are design questions and not bugs: **bad practice is not punished financially**
(adversarial Cozy banks $393k against the reasonable player's $130k, purely on session volume),
**cures track session count more than session quality**, and **burnout has an upside**, because a
sabbatical hands a therapist back with more capacity than they left with. The first is the one that
undercuts the design, and it is still open.

---

## Phase 9 — Docking, and the card that covered the decision

Three small UI gaps, one of which turned out to be the same shape as the freeze from Phase 7.

**Panels and the day cards had been fighting for the middle of the screen.** Dismissing the card
when a panel opens was the tempting fix and the wrong one: the morning brief's own footer says
"Open the schedule", so hiding the brief in order to show the schedule would have made the game
argue with itself. The card docks into the column beside the panel instead, and below a readable
width it fades back rather than being unmounted, so it returns exactly where it was. The
arithmetic went into `src/ui/dock.ts`, pure and unit-tested beside `anchor.ts`, and the panel
publishes its own measured width rather than anyone keeping a table of panel sizes — a table would
be wrong the first time somebody changed a shell.

**The shortcut card could cover a decision that was holding the clock.** Opening it was already
suppressed while a modal was up, but the reverse order was reachable: leave it open at 4×, have an
event fire a second later, and a list of keyboard shortcuts is painted over the thing `tick()` is
waiting on. That is Phase 7's freeze wearing a different hat — the clock stops, pause does not
help, and the explanation is behind the card. `src/ui/modals.ts` is now the single answer to "who
owns the centre of the screen", which `App.tsx` mounts from and the keyboard layer suppresses from,
so the two cannot drift apart. Same shape of fix as `src/sim/pending.ts`, for the same reason.

**And the first tests that drive a browser.** Six Playwright specs; the full-day one crosses every
integration seam the unit tests cannot reach, and four of Phase 7's five player-found bugs now have
a regression test. The pair that matters most asserts the liveness contract from both ends: the
clock stops for a decision, starts again when it is answered, and — the assertion that took a
second pass to get right — *taking the pause away mid-decision does not move it*. A decision
auto-pauses as well as blocking, so `paused` alone cannot tell you which one is holding the clock,
and that ambiguity is precisely why the reported freeze was so hard to read.

Two things learned the hard way. The suite needs **its own Vite config with HMR off**, because a
source file saved mid-run destroys the execution context and the failure looks like a game bug.
And **`getBoundingClientRect` cannot see a clip** — the tooltip test hit-tests with
`elementFromPoint`, which is the difference between catching the Phase 7 clipping bug and writing a
test that would have passed while it was live.

---

## Phase 10 — The same conversation, twice

The pacing assertions had been in the harness for about an hour when they turned up a live defect,
and it is a good example of a bug that only a *moment*-shaped test can see: 120 of 120 reasonable
200-day runs were re-raising an event inside its own cooldown, and every statistical table in
docs/BALANCE.md was perfectly happy about it.

**`pickEvent` checked the cooldown; `raiseEvent` only ever set it.** So random draws were spaced
and scripted raises were not, which is backwards — the scripted ones are the beats that matter.
The visible symptom was the cosiest possible thing going wrong: a client asks whether she should
stop therapy, you spend a wrenching minute deciding, and the same conversation reopens the next
morning. Two clients' insurance authorisation running out on the same Tuesday produced two
identical practice-wide letters in the same brief.

**The obvious fix was a trap, and the harness's own notes said so.** Making `raiseEvent` return
`undefined` on a live cooldown fixes every count in the report and quietly deletes narrative beats,
because arc beats and `followUp` chains both reach the event system through `state.queuedEvents`
and **no caller on that path reads the return value**. `beat_asks_to_bring_someone` would have gone
on promising a conversation that never arrived — the exact failure this codebase already has a
scar from. So the rule became *hold*, not *refuse*: a raise that cannot land today is re-queued for
the day the window lifts, and only a caller who explicitly says it promised nothing
(`onRepeat: 'skip'`) gets to drop one. `EVENT_MAX_DEFERRALS` bounds the wait, because at the limit
"deferred" and "deleted" are the same word.

**Two of the offenders were not event-system bugs at all.** The insurance renegotiation was raised
per client but authored `scope: 'practice'` — a practice-wide letter that never names the client,
triggered by one client's paperwork. It is fixed by not passing a `clientId` and by treating the
practice as its own subject. The burnout aftermath call is the morning after a sabbatical and means
nothing detached from it, so it skips rather than waits. Both were fixed where they lived.

**And then the narrated run said it was not fixed.** The sweep reported same-subject repeats down
from 6,543 to 8. `bun run playtest` reported "I think I'm done." twice in one morning and again the
next — three different clients, all legitimate, and unreadable as anything but a bug. The morning
queue drains before the player answers anything, so both modals went up together. One more rule —
one conversation per morning, whoever it is about — took days carrying a duplicated modal title
from 14 to 1 over 12 × 200 days. Which is the third time in this build that the statistical harness
and the narrated run disagreed, and the third time the narrated run was right about how it *feels*.

**The cost is in the ledger, and it is not small.** That insurance event was firing about fifty
times a run, and three of its four choices hand out cash or practice-wide morale. Closing it took
seven points off average morale everywhere and pushed Challenge from 14/40 collapses to 17/40. It
was an aggregate faucet scaling with the client list — the same shape as the three aggregate-bonus
bugs before it, wearing an event's clothes — so the numbers were left where they fell rather than
compensated for. That decision is recorded in docs/BALANCE.md with the before/after table, because
the next person to read the curves deserves to know which of them moved for a pacing fix.

---

## Phase 11 — Three certifications that bought nothing

`SessionType` had been fully typed since Phase 0. Three certifications carried
`mods.unlockSessionType`, `generateClient` could produce every kind, and `resolveSession` already
multiplied progress and revenue per type. Nothing ever passed `sessionType` to `generateClient`,
so none of it had ever run. The Group Room cost $3,800 and changed nothing a player could see.

**The referral path was an afternoon. The reason it had not been done was the other half.**
`ScheduledSession` held one `clientId`, so a "group" client was an ordinary client booking an
ordinary slot at 0.55× revenue for 0.78× progress — strictly worse than an individual on every
axis. Wiring the referral in without touching the schedule would have shipped a $3,800 purchase
whose only effect is to make your practice worse, which is worse than shipping nothing, because
the player pays to find out. So a group session had to hold several people: `memberIds` on the
session, one `SessionResult` per member, and a seam (`sessionMembers`, `sessionIncludes`,
`detachClientFromSchedule`) so that every existing single-client path stays byte-identical.

**Couples and family were already right and were left alone.** A couple is one case with one arc
and one bill — that is what `partnerHandles` and the 1.5× rate always meant. What they were
missing was a *cost*: 1.5× the fee for 1.12× progress made the certification a pure upgrade whose
only question was "why not sooner". The cost that fits the fiction is the alliance — two people
have to trust you — and because rapport gates progress through the whole Trust chapter, it lands
as "slow to get going, then faster", which is what couples work actually is.

**The measurement nearly went out wrong twice.**

The first sweep showed Standard accreditation falling 32/40 → 29/40 and Challenge collapses
17/40 → 10/40, and it would have been easy to write that up as the price of session types. It was
not. Rewriting the scheduler's energy forecast to use the *real* per-session cost — which is
obviously more correct — also made it subtract the cost of the hour being considered, which the
old flat estimate never did. That one-session-stricter reserve was doing all of it. It is now
`SCHEDULER_ENERGY_ESTIMATE`, deliberately left defending the reserve one session late, with the
measured cost of fixing it recorded in docs/BALANCE.md. A correct change is still the wrong change
when it rides in on somebody else's.

The second was quieter. A reason line that explains a 22% haircut on every group session is
exactly the kind of number the reasons array exists to carry — and it was being truncated off the
end of it, because `slice(0, 9)` kept the quality breakdown and dropped everything appended after
it. Which meant regressions and the trust gate had *always* been at risk of vanishing from the
card on a session with a busy breakdown. The array is now two lists: what happened to this hour
first, why it went that way second.

**One latent bug fell out of the noise.** A client's chapter is derived from their progress, and
`applyEffect` moved progress without re-deriving it — so an event could leave somebody sitting in
the Work chapter at 78%, drawing the wrong arc beats and being offered the wrong techniques. It
had been there the whole time; it only surfaced because a shifted rng stream made an invariant
test finally land on it. Fixed at the source, one line, in `eventsys.ts`.

**And `bun run playtest` could not see any of it.** The narrated run — the tool that exists to
catch what statistics smooth away — never bought an upgrade, so it could never reach a
certification. It buys them now, cheapest first, and prints a group as one room rather than six
sessions. The first group in the seed-2024 run lands on day 113 with two people in it and is
running rooms of six by day 138, with the roster turning over as people finish. That is the check
that mattered, and it is not one the harness could have made.

---

## Phase 12 — Six people, one chair

The room shipped in the sim and in the panels and never reached the office. `office.ts` indexed
today's sessions on `s.clientId`, which is only the seat a session is *filed under*, so every
member past the first was invisible to the scene: they never walked in, never sat down, and a room
of five drew as one person in an armchair. The rule CLAUDE.md had just gained — *any new
`schedule.filter(x => x.clientId === ...)` is a bug waiting for the first group booking* — turned
out to be describing code that was already written.

**The interesting part was where to put six people in 186 units.** A therapy room is that wide and
already has a therapist's armchair at 66, a side table at ~104, a client's armchair at 138 and a
floor lamp at 168. A single row of six would have been a queue at a bus stop. Two shallow arcs read
as a circle instead — a near row on the boards and a far row six units higher, a shade smaller,
interleaved in x so that the z-order carries the depth. Actors sort on x alone, so the far arc also
takes a fixed z-bias; without it a person at the back of the circle can draw in front of the person
beside them.

The ring is a twelve-unit half-step grid, chosen because it lands exactly on the two armchairs the
room already owns. So a group is the 1:1 hour with chairs pulled up rather than a different room,
the therapist sits *in* the circle at the same spacing as everyone else, and the fill order is such
that a room of four is a room of three with one more chair in it. It closes at 150, which keeps the
lamp and the corner plant outside the circle, and centres on 108 — the little table with the
tissues on it, which is where the Group Room's own blurb says they should be.

**Two chair layers, not one.** The first pass drew the borrowed chairs in a single Graphics after
the room's furniture, and the far chairs then painted over the armchair and the side table — a
chair at the back reading as nearer than one at the front. They are two layers now, one either side
of `propsG`. The chairs are the plain wooden ones from the waiting room in mismatched dye lots,
because five matching armchairs would read as a set the practice does not own.

**And a thing nobody asked for that turned out to matter.** Six members leave the waiting room on
the same intent pass at the same speed, so they crossed the building as a single blob and popped
apart on arrival. A ±10% per-actor walking pace — seeded off their id, so it is stable — is the
difference between a group arriving and a group marching.

---

## Phase 13 — An art pass, and the hairline nobody could see

Four surfaces got a craft pass at once — the SVG portraits, the Pixi drawing toolkit, the scene
composition, and the UI chrome — on the rule that each owned a disjoint set of files and none of
them changed a signature the others called. The palette was frozen for the duration, because
`PAL` in `sprites.ts` and the `@theme` block in `theme.css` are the same eighteen colours written
down twice and a drift between them is invisible until something sits next to something else.

**The portraits were the worst thing in the game and the easiest to miss.** At 46px on a client
card they read fine. Rendered at 220px they were a passport photo taken from a foot away: the head
filled the entire clip circle, there was no neck, the shoulders were a sliver at the bottom, the
twelve hairstyles had been authored against a head that no longer existed and sat on the skull like
swim caps, the ears were two detached lumps, and every single face was the same face with a
different colour — no nose, identical eyes, identical mouth, identical blush. It is now a bust: a
smaller head on five face shapes, hair re-authored in a back layer and a front layer so long styles
fall behind the shoulders, and per-seed variation in eye shape and spacing, brow weight and tilt,
nose, mouth, lips and blush — all of it hashed out of the eight integers `PortraitSeed` already
carries, because the sim owns that type and a craft pass does not get to extend it.

Two real bugs fell out of looking closely. The `<defs>` id concatenated seed digits with no
separator, so `(skin 1, hair 12)` and `(skin 11, hair 2)` minted the same string and two different
people shared one clipPath and one gradient. And the `Plant` motif — the reward for finishing a
client — had a stem long enough that a fully bloomed flower's top petals were clipped off by the
viewBox. Both had been true for the whole build.

**The scene was mostly missing, not mostly wrong.** On any wide viewport the building fills the
bottom 40% of the frame and the rest was a flat blue-grey wash with five invisible cloud ellipses
in it, the roof was one dark triangle, and the "skyline" was the same `PAL.night` at two alphas —
which is not depth, it is two grey blocks. There is now a horizon that sits behind the roofline, a
sun and moon that hand over the arc at dusk, four backdrop bands separated in warmth as well as in
value, a hill town whose windows come on when ours do, a front garden with a path and a gate and a
street lamp, a roof with courses and an eave and a gutter, cladding, and a painted name board.

**The bug that was there the whole time, in front of everyone.** Four amber hairlines fanned
across the entire building from the top-left corner of the design box. They were not new — they
came from `drawWallClock`, which opened a subpath with `arc()`, and Pixi's `arc` continues the
current path rather than starting one. A path that has just been stroked has its cursor back at
the origin, so the bezel highlight on a wall clock was drawing a line to itself from the corner of
the world. The same latent mistake was sitting in the session door's progress ring, where it was
a spoke through the middle of the dial and read as decoration.

The lesson is not "check your arcs". It is that **this defect was only ever visible in a
screenshot of the whole frame.** The typechecker cannot see it, no unit test asserts on a canvas,
and the e2e suite deliberately blocks the office module because a software rasteriser on a CI
runner starves the page. Every other instrument in this project was working perfectly while a
hairline ran the width of the building.

Which is also why `bun run shots` now exists. The README embeds four pictures of the game, and
every art pass silently makes them false; regenerating them is one seeded command rather than an
afternoon of cropping, which is the only reason it will actually get done.

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

**Every tool has exactly one blind spot, and they do not overlap.** The typechecker cannot see a
60-year-old referred for "Child Behavioral". The balance harness cannot see the same dilemma firing
three mornings running. The narrated playtest cannot see a tooltip running off the right edge. The
browser tests cannot see a curve going soft over two hundred days. And not one of them — including
the browser tests, which block the office module on purpose — can see a stray hairline drawn the
full width of the building; that took a screenshot of the whole frame and somebody looking at it.
Every class of bug in this project was found by exactly one instrument and never by the others — so "it typechecks and the
curves are fine" is not evidence of much on its own.

The corollary is that **building an instrument is a way of finding bugs, not just of preventing
them.** The pacing assertions found a live defect within an hour of existing. Replay found two
places where the run was not a function of its actions. Neither was a regression; both had been
true for the whole build, and neither was visible until something was looking.

**The tempting fix is usually the one that deletes something quietly.** Twice now the obvious
one-liner — make `raiseEvent` return early on cooldown; let a group session shrink to one member —
would have passed every test and taken away something the player was promised. Both times the
right shape was *hold*, not *refuse*: defer the beat, dissolve the room. When a fix makes a number
go to zero, check whether it fixed the cause or removed the evidence.

**Design commitments need structural enforcement, not discipline.** "No hidden punishments" only
held because `SessionResult.reasons` carries the full explanation and `progressDelta` reports the
*total* change. The moment those were computed separately from what the sim applied, the card
started lying — quietly, and only sometimes.
