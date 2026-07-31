# Future work

Started at the end of the initial build and kept current since. Every item says **why it matters**,
**where to start**, and **what done looks like**, so none of them need re-deriving. Finished items
are struck through rather than deleted — several of them record *why* something is the shape it is,
and that is worth more than a tidy list.

Items marked **⚑** are what I would do first. Effort is rough: **S** ≈ an hour, **M** ≈ a day,
**L** ≈ several days.

---

## 1. The largest gap between plan and build

### ~~Couples, family and group sessions are plumbed but unreachable~~ — **done**

They arrive. Each certification takes a flat share of ordinary referrals and puts somebody at the
door the same week it is bought; the group room seeds a cohort, because a lone group client is a
person nobody can see. Balance write-up in docs/BALANCE.md → *What the session types moved*; the
shape of each room is in docs/DESIGN.md → *Four shapes of hour*.

The part that was not wiring: **a group session holds several clients in one slot.**
`ScheduledSession` carries `memberIds` and resolves once per member, because at 0.55× the fee and
0.78× the progress a group of one is strictly worse than an individual hour and the Group Room
would have been a $3,800 trap. Energy and experience are sublinear in heads, attention divides
with a floor on the aggregate, the least steady member sets the room's pace, and every member's
deltas are reported — `session.results` holds one `SessionResult` each and all of them reach
`lastDayResults`. `sessionMembers()` / `sessionIncludes()` / `detachClientFromSchedule()` in
`src/sim/session.ts` and `src/sim/scheduler.ts` are the seam; nothing should read
`session.clientId` directly again. Save v8 migrates old schedules.

The UI renders it: the schedule cell reads *"Room of four · A.M., P.T. and 2 more"* with a roster
popover, the caseload card carries a companion line and a type chip, and the reflect card reports
every member's delta separately — including the ones that went backwards inside an hour graded
"good", which is what the no-hidden-punishments commitment costs and is meant to cost.

One rule earned its own guard on the way out as well as in: **a room that drops below
`GROUP_MIN_MEMBERS` dissolves rather than leaving one person in it.** Excusing the second-to-last
chair, or curing one half of a pair, used to leave a circle of one — a full-cost hour billing
0.55× and moving at the group's slower pace, with nothing on screen to say so.

The office scene seats the room too. `office.ts` reads the guest list through `sessionMembers()`,
and a circle is drawn as two shallow arcs on a twelve-unit grid that already lands on the room's
two armchairs — so a group is the 1:1 hour with plain wooden chairs carried in, not a different
room. The far arc sits six units higher, a shade smaller, and carries a z-bias, because actors
sort on x alone and the two arcs interleave. The chairs live in their own Graphics layers either
side of the room's furniture and are redrawn only when the set of circles changes.

**Still open:**

- **No group-specific content.** No arc beats about being in a room with other people, no events
  about a member who dominates the circle or one who stops coming, and the technique pool is not
  aware that a technique is being chosen for six people at once. This is the cheapest remaining
  content win now that the mechanism exists — see §3.
- **Couples and family have no second-stakeholder mechanic.** `partnerHandles` is currently
  flavour; the partner never has an agenda of their own. Related to *Minors and parent
  involvement* below, and probably the same system.

### Satellite clinics are a beat, not a system — **M**

`ev_staff_satellite_clinic` fires and reads beautifully, but choosing it currently ends there.
The plan describes a departing veteran founding a clinic under your banner that keeps sending
referrals and paying a small royalty — a proud legacy moment rather than a loss. Needs state on
`GameState` (a `satellites` array), a weekly referral + cash trickle in `tickPrograms`-style
processing, and a line on the end screen.

### Minors and parent involvement — **M**

`up_child_certification` gates the School Partnership and ages are now condition-appropriate, so
under-18 clients genuinely exist. There is no parent-involvement mechanic — sessions with a minor
should occasionally surface a parent as a second stakeholder with their own agenda.

### Insurance panels — **M**

Re-authorisation fires as an event when a client exhausts `authorizedSessions`, but there is no
panel-management layer: negotiating rates, joining or leaving networks, the trade between
reimbursement and volume. `COLLECTION_RATE` in `balance.ts` is the natural hook.

### Relationship depth — **S**

Therapists hold relationship scores, mentorship works, friction events fire — but the scores move
almost entirely through events rather than through play. Working adjacent slots, sharing a client,
or covering someone's sabbatical should all move them. `src/sim/engine.ts`, the overnight loop.

### The economic-cycle dial — **S**

Quarters exist and the Practice Review fires; the macro dial described in the seasons section
does not. A single multiplier on referral volume and self-pay rates, drifting over quarters.

---

## 2. Balance gaps the harness cannot currently see

### ~~An adversarial autoplay policy~~ — **done**

`--policy adversarial` in `tools/autoplay.ts` plays like an overwhelmed beginner rather than a
random button-masher: accepts every referral, books by *worst* specialisation match, works past
the energy reserve, processes trauma on unstable clients, and never mentors anyone. The floor it
measures is tabulated in docs/BALANCE.md — poor sessions go 0.0% → ~7%, mixed ~3% → ~65%, and
departures and burnouts are finally exercised at scale (which also closes the old "poaching and
departures are untested" item).

It surfaced three things worth someone's attention, documented in docs/BALANCE.md and not yet
addressed: **bad practice is not punished financially** (adversarial Cozy banks $393k against the
reasonable player's $130k, on session volume), **cures track session count more than quality**,
and **burnout has an upside** — a sabbatical returns a therapist with `SABBATICAL_MAX_ENERGY_BONUS`
more capacity than they left with, so running the team into the ground is a viable strategy. The
first is the one that undercuts the design.

### ~~The harness smooths pacing problems away~~ — **done**

`playRun` returns a `PacingReport` and the sweep prints a **Pacing** section: cooldown re-fires
split into same-subject and different-subject, the client-scope modal cap, repeated arc beats, and
`once` events firing twice. `--strict` exits nonzero. Every example line prints the exact
`bun run balance` command that reproduces it.

It found a live defect on its first run, which is now fixed — see "Scripted event raises ignored
the cooldown" below for what was left standing.

### ⚑ Standard barely collapses, and Challenge may now bite too hard — **S**

Standard measures 2/40 collapses, up from 0/40 and still down from 5/40 before the Phase 6/7 fixes.
The two it now has arrived with the event-repeat fix, which closed a per-client cash-and-morale
faucet nobody had noticed (`ev_practice_insurance_renegotiation`, ~50 raises a run). The spread is
legible — the p10 run owns 4 of 26 upgrades against p90's 26 — but the floor is still high for a
mode that is meant to be the default challenge.

The same change pushed Challenge from 14/40 collapses to 17/40 and its median cash from $4,723 to
$155, which is the top of "hard and winnable" and worth a look before it is the bottom of
"punishing". Nothing was retuned to compensate; the numbers stand as they fell. The knobs are
`DIFFICULTIES.standard.expenseMult` and `DIFFICULTIES.challenge.expenseMult`; re-run the sweep and
update the table in docs/BALANCE.md.

### Cozy has no late-game choices — **S**

Every Cozy run owns all 26 upgrades and runs 3 programs by day 200. Either add a genuinely
expensive top tier that even a rich practice must choose between, or accept it as correct for the
mode and say so in the UI. Currently it is unstated either way.

### ~~Scripted event raises ignored the cooldown~~ — **done**

`state.subjectCooldowns` keys the window by `eventId@subject`, and a scripted raise that lands
inside one is **held**, not dropped: deferred into `state.queuedEvents` for the day it lifts, or
skipped only when the caller says the raise promised nothing (`onRepeat: 'skip'`). Same-subject
repeats went from 6,543 to 8 over 120 reasonable runs, and from 11,706 to 4 under adversarial play;
every survivor is `ev_client_crisis_call`, which is authored `urgent` and is meant to come round
again. A second rule keeps one conversation to one morning, which is what the narrated run actually
complained about. Full write-up in docs/BALANCE.md → Pacing.

Two things it deliberately did **not** fix, both still open:

- **`cooldown_global` is untouched** — 12,184 in the same sweep. It is one template reaching two
  different people inside a fortnight, which is what a per-client arc necessarily does. The reason
  it *feels* repetitive is content, not cooldowns: `ev_client_asks_to_end` is the only "my client
  wants to stop" event in the game, so all fifty clients route through the same modal. More
  variants of that beat is the fix. See "Late-game events are quiet" below.
- **A therapist can still hit the wall twice in a fortnight.** The duplicate *conversation* is
  suppressed, but `SABBATICAL_DAYS` (2–4) plus `strain = 12` on return means the adversarial player
  can put the same person back into burnout inside the event's 16-day window. That is a difficulty
  question about the retention loop, not a pacing one.

### ~~Poaching and departures are untested at scale~~ — **done**

Folded into the adversarial policy, as predicted: ~14–18 departures and ~130 burnouts per
adversarial run against ~0 for the reasonable player.

### The `--skill` axis is one scalar — **S**

It is applied to every decision equally. Splitting it into per-domain competence (scheduling vs.
hiring vs. event choices) would show which subsystem actually carries a run.

### No sensitivity sweep — **M**

The harness runs a fixed constant set. A `--sweep SKILL_CAP_BY_LEVEL` mode that perturbs one
constant across a range and reports which output curves move would turn retuning from craft into
measurement.

---

## 3. Content

Counts meet or exceed the plan's targets: 48 techniques, 64 events, 42 arc beats, 22 traits, 26
upgrades, 24 trainings, 30 milestones, 48 testimonials. What is actually thin:

- **⚑ Nothing is written for a room.** Group, couples and family sessions now exist mechanically
  and have no content of their own: no arc beats about being in a circle with other people, no
  event about the member who takes most of the hour or the one who stops coming, and the technique
  pool does not know it is being chosen for six people at once. The pacer — the least steady person
  in the room, who sets its pace — is a ready-made subject nobody writes about yet. This is the
  cheapest content win on the list, because the mechanism is already carrying the weight and the
  writing is the only thing missing. **M**
- **Condition coverage is uneven.** `psychosis` and `behavioral` have the fewest arc beats and
  technique affinities, and they appear latest in a run, so a long playthrough notices. **S**
- **Philosophy-exclusive content is techniques only.** Each philosophy has 2–3 signature
  techniques but no exclusive *events*, so the three identities feel more similar in play than
  the plan intends. Roughly 6 events each would fix it. **M**
- **One event per program.** Three or four each would let a program's flavour accumulate over the
  many weeks it runs. **M**
- **Late-game events are quiet.** Most `once: true` beats fire before day 60. Days 120–200 are
  mechanically rich and narratively sparse. **M**
- **Testimonials repeat on long runs.** 48 quotes against ~150 cures. **S**

---

## 4. UI and presentation

### ⚑ The office scene is not a control surface — **M**

It renders the practice living its day, but you cannot click a room to open that therapist's
card, or a waiting client to see who they are. It is already the home screen; making it
interactive is the cheapest large win available. Start in `src/scene/OfficeScene.tsx` — the world
already keeps a `roomByTherapist` map and per-actor positions, so hit-testing is mostly wiring.

### ~~Panels and the day cards overlap~~ — **done**

They dock. The morning brief is where the day is decided and the day-end card is the point of the
day, so dismissing one to show a spreadsheet was never the right call — and the brief's own footer
*invites* you to open the schedule. Opening a panel now slides the notebook page left into the
column beside it and both stay live: you can book someone in the panel and then press "Open the
doors" without closing anything.

`src/ui/dock.ts` holds the arithmetic, pure and unit-tested next to `anchor.ts`. `PanelShell`
publishes its own measured width to it rather than anyone keeping a table of panel widths, so a
panel that changes its shell cannot desync the card beside it.

Below a readable width the card **yields** instead: it stays mounted, fades back, goes `inert`, and
returns to exactly where it was the moment the panel closes. That is the fallback, not the plan —
the wide panel shell docks from 1278px and the narrow one from 978px, so a 1280px laptop clears the
floor by 2px. Anything that nudges `DOCK_GAP`, `RAIL_INSET` or the panel's right margin flips that
very common width to the yielding path, so move `CARD_MIN_WIDTH` with it. (The "before the doors
open" chip in the HUD now shows from
`lg` rather than `xl`, because on the screens where the card yields it is the only thing left
saying the day is holding.)

### The sky is filled, but the building still does not grow — **S**

Half of this is done: the sky now carries a skyline, stars and a day-cycle tint, so the space above
the building reads as evening rather than as nothing. What was *not* done is the other option —
the building keeps its fixed fit at every viewport height, so on a tall screen the roof still sits
low with a lot of sky above it. `layout()` in `src/scene/office.ts` computes a single fit
transform, so scaling to the available height is one number; the question is whether a bigger
building or a bigger sky is the better picture, and that is a taste call somebody should make by
looking rather than by reasoning.

### ~~Panel state is not remembered~~ — **done**

`UiState.panels` in `src/store.ts` holds a `PanelPrefs` object, typed per panel rather than a bag
of unknowns, read through `usePanelPrefs('clients')` which returns `[prefs, patch]` and
shallow-compares so one panel's arrangement moving never re-renders another's. What it remembers:
the caseload's tab, sort order and five filters; the day book's switched-off headings; and which
disclosure is open on which therapist's card in the team panel (keyed by therapist, because "I had
Maya's training list open" is what you meant). The expanded client was already lifted, as
`selectedClientId`.

Presentation only, and deliberately so: it never goes through `dispatch`, never reaches a save, and
a replay does not care about it. It resets on a new run and on adopting a save, because those
filters describe a caseload that no longer exists.

### ~~No keyboard navigation between panels~~ — **done**

`[` and `]` step to the door before or after this one on the rail, wrapping; from no panel at all,
`]` opens the first and `[` the last, so the keyboard can always get in. The panel takes focus when
it arrives, so Tab then walks its contents. Escape closes it — and `PanelShell` now checks for a
`[role="dialog"]` above it first, because one press used to dismiss the decision *and* the panel
underneath it.

Discoverability was the real work. There is a quiet **⌨ ?** door at the foot of the rail and a
**Keys** section in the comfort panel, both rendering one list from `src/ui/shortcuts.tsx`, and `?`
opens the same card from anywhere.

The keys are suppressed whenever anything owns the centre of the screen. That predicate is now
shared: `src/ui/modals.ts` is the single source for which modal is up, `App.tsx` mounts from it and
the keyboard layer suppresses from it, so the two cannot drift — the same fix, one layer up, as
`src/sim/pending.ts`. (It also closed a small existing bug: space and the speed keys used to fire
underneath the hiring modal and the quarter review.)

### Mobile is unhandled — **L**

The layout assumes a desktop viewport. Panels are already `max-width`-constrained so a
small-screen pass is plausible, but it has not been attempted and the schedule grid in particular
will need rethinking.

### Localisation — **L**

All copy is inline English. Extracting strings is a large mechanical change and is much cheaper
now than after another content pass.

### The photo wall does not persist across runs — **M**

Legacy points carry over; the alumni do not. A permanent wall spanning every run would be a
strong meta hook and is nearly free — `saveLegacy` already exists in `src/sim/save.ts`.

---

## 5. Technical

### ~~No end-to-end tests~~ — **done**

Six Playwright specs, `bun run test:e2e`, ~55s. See docs/TESTING.md for what each layer is for.
The one that carries the most weight is the liveness pair: the clock stops for a decision and
starts again once it is answered, *and* taking the pause away mid-decision does not move it —
because pause was never what was blocking, which is exactly why the reported freeze was so hard to
read. Four of the five bugs a person found by playing now have a regression test; every one of
them was invisible to both the typechecker and the balance harness.

No `waitForTimeout` anywhere: waits are sim-state predicates or counted animation frames, because
a sleep proves nothing about whether the game had a chance to move. Every test was proven able to
fail before it was kept — if you add one, do the same, and say so.

Still thin, and worth extending as the surface grows:

- **Nothing drives a group session end to end.** The specs predate them.
- **One browser, one viewport.** Chromium at 1280×800. The mobile item below is untested in every
  sense.
- **The suite needs its own Vite config** (`e2e/vite.e2e.config.ts`, HMR off, port 5299) because a
  file save mid-run destroys the execution context. Worth knowing before you wonder why it is
  there.

### ~~No replay tooling~~ — **done**

`src/sim/replay.ts` records every dispatch of a run and fingerprints the state at each day
boundary; `bun run replay <log> --verify` reproduces it or names the day it drifted. The crash
screen exports one alongside the save, `__tt.saveReplay()` writes one on demand, and
`bun run playtest --record <file>` produces one headlessly.

Two follow-ups, neither urgent:

- **A log from a resumed save embeds the whole save.** There is no seed that reproduces a mid-run
  state, so `ReplayOrigin` carries one. Correct, but it makes those logs an order of magnitude
  larger than a fresh run's. Compressing or referencing the sibling save file would fix it.
- **The watchdog's emergency `pendingEvents = []` is still outside the action stream.** A replay
  that crosses one will diverge there. That is arguably right — it only fires after a bug — but
  the divergence report should say so rather than looking like drift.

### Save migrations are untested against real old saves — **S**

`migrate()` has coverage for synthetic v1-shaped objects, but there are no fixture files captured
from actual earlier builds. Capture one per version from here on.

### Bundle size is unmeasured — **S**

The main chunk is ~755 kB (229 kB gzipped) and Vite warns about it. Pixi is already lazy-loaded
into its own chunks; the content tree is the next largest contributor and could be split by act.

### Accessibility beyond the basics — **M**

Controls are real buttons with labels and visible focus, reduced-motion and calm mode are
respected, and the office scene is `aria-hidden` decoration. There has been no screen-reader pass
and no contrast audit of the amber-on-cream combinations.

### The reported freeze is guarded, not diagnosed — **S**

A player hit a state where the clock would not advance and pause/play had no effect. One concrete
mechanism was found and fixed (App and the modals used different predicates to decide whose turn
it was), but a stress harness across 120 seeds × 45 days shows the engine does not currently
produce it — so that was probably not the reported freeze.

It is now recoverable rather than understood: `src/sim/pending.ts` makes the predicates single-
sourced, a watchdog in `App.tsx` drops an unrenderable pending event and logs what it was, and the
error boundary catches render throws (which present identically). `src/sim/stall.test.ts` guards
the class. **If it recurs, the console names the pending event or the boundary shows the stack** —
that will pin it in one look, and the fix should then replace the watchdog rather than lean on it.

### ~~The `state.flags` write-through pattern~~ — **done**

`SET_FLAG` replaced it. Forced by replay: a flag written outside the action stream is missing from
a recorded log, so a run where somebody dismissed the quarter review no longer reproduced.

### ~~Log entry ids are not deterministic~~ — **done**

Log and toast ids now come off `state.idSeq`, so two same-seed games in one process are
byte-identical and a whole-state diff is a valid check. Save v6 migrates old saves by resuming the
counter past the highest id already in their log.

---

## 6. Open design questions

Flagged as good first discussions in the concept plan, and still open:

- **Should therapist friction ever produce a resignation the player cannot prevent?** Currently
  it cannot — every departure has a warning and a counter-offer. That is warmer, but it means
  staff retention has no true failure state, and the poaching arc may read as toothless.
- **Should the player's own therapist retire into a director role in Act 3?** They stay playable
  forever today, which is simple but slightly undercuts the act structure the whole design rests
  on.
- **Should philosophies be respec-able?** Permanent per run today.
- **How far can hand-authored client-arc writing scale** before it needs a real content pipeline
  rather than TypeScript literals?
- **4× speed with technique cards.** Decision events always pause, which is right, but at 4× a
  busy day becomes a sequence of modals. A "let the team handle routine sessions" threshold —
  auto-resolving only high-confidence picks — would probably be better than the current
  all-or-nothing `autoTechnique` toggle.
