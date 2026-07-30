# Future work

Written at the end of the initial build, by the person who built it. Every item says **why it
matters**, **where to start**, and **what done looks like**, so none of them need re-deriving.

Items marked **⚑** are what I would do first. Effort is rough: **S** ≈ an hour, **M** ≈ a day,
**L** ≈ several days.

---

## 1. The largest gap between plan and build

### ⚑ Couples, family and group sessions are plumbed but unreachable — **L**

**Why.** The concept plan lists these as the main widening of case types, and they are the
clearest content-per-effort win left: three new session shapes reusing every existing system.

**State today.** Fully typed (`SessionType` in `src/sim/types.ts`), certifications exist
(`up_couples_certification`, `up_family_certification`, `up_group_room`), rates are multiplied,
`generateClient` can produce them, and `resolveSession` already adjusts progress per type
(group ×0.78, couples/family ×1.12). **What is missing is the referral path** — nothing ever
passes `sessionType` to `generateClient`, so they never arrive.

**Where to start.** `src/sim/engine.ts`, the referral block in `nextDay()`. Gate on the owned
certification and give each type a small share of referrals.

**Done looks like.** Buying a certification visibly changes who arrives; the schedule shows a
two-client session; the clients panel renders `partnerHandles`; the balance harness shows the
economics are not degenerate (group therapy at 0.55× revenue for 6–8 clients is a big swing).

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

It found a live defect on its first run — see "Scripted event raises ignore the cooldown" below.

### Standard no longer collapses at all — **S**

Measured 0/40 collapses, down from 5/40 before the Phase 6/7 fixes (age-appropriate referrals and
the event-pacing changes both shifted it). The spread is still legible — the p10 run owns 4 of 26
upgrades against p90's 26 — but the floor has come up and the mode now never bites. Either that is
right for a cozy game's default, or Standard needs a little of Challenge's margin pressure back.
The number to move is `DIFFICULTIES.standard.expenseMult`; re-run the sweep and update the table
in docs/BALANCE.md.

### Cozy has no late-game choices — **S**

Every Cozy run owns all 26 upgrades and runs 3 programs by day 200. Either add a genuinely
expensive top tier that even a rich practice must choose between, or accept it as correct for the
mode and say so in the UI. Currently it is unstated either way.

### ⚑ Scripted event raises ignore the cooldown — **S**

Found by the new pacing assertions, on their first run. `pickEvent` consults
`state.eventCooldowns`, so a *random* draw can never land inside the window — but `raiseEvent`
only ever *sets* the cooldown, so every scripted raise walks straight through it. 120 of 120
reasonable 200-day runs violate. Two of the offenders are real and small:

- **`ev_practice_insurance_renegotiation` is scoped wrong**, not raised wrong. `engine.ts` raises
  it per client when that client's authorisation runs out, but it is authored `scope: 'practice'`,
  so a per-client trigger inherits a practice-wide 20-day window and re-fires the same morning.
- **`ev_staff_burnout_aftermath` re-fires for the same therapist** inside its 16-day window,
  because `SABBATICAL_DAYS` is 2–4.

The rest is one event template being reused for *different* people, which is what a per-client arc
beat necessarily does and is not a defect — which is why the assertion splits same-subject from
different-subject. **Do not "fix" this by having `raiseEvent` return early on cooldown**: arc beats
and follow-ups reach the system through that path, and a silent `return undefined` deletes them.
See the long note in docs/BALANCE.md before touching `eventsys.ts`.

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

### Panels and the day cards overlap — **S**

Opening a panel while the morning brief or day-end card is up leaves the two competing for the
same space. The panel should either dismiss the card or dock beside it. `src/App.tsx`.

### The scene has a lot of dead sky — **S**

The building sits in the lower half of the viewport with a large empty sky above it. That reads
as deliberate at 900px tall and as wasted space on a wider screen. Either fill it (a skyline,
weather, birds) or scale the building to the available height. `layout()` in `src/scene/office.ts`
already computes a single fit transform, so this is one number.

### Panel state is not remembered — **S**

Sort orders, filters and the expanded client all reset when a panel closes. Lift into
`UiState` in `src/store.ts`.

### No keyboard navigation between panels — **S**

Space and 1/2/3 drive the clock and the technique cards take 1–4, but there is no way to move
between panels without a mouse.

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

### ⚑ No end-to-end tests — **M**

The sim has 195 tests; the React layer has almost none (only `anchor.test.ts`, which is pure). A
Playwright pass driving one full day — book, run, choose a technique, read the reflect card, close
the day — would catch integration regressions that typechecking cannot.

This is now the biggest measurement gap in the project. Of the bugs found by a person playing,
**every single one** was invisible to both the typechecker and the balance harness: a tooltip
clipped by an ancestor's `overflow`, a tooltip running off the viewport, a panel opening under the
HUD, a day that started running under a tutorial coach-mark, and a freeze whose root cause is
still unconfirmed. All five are the kind a browser-driving test catches on the first run.

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
