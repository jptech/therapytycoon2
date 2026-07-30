# Balance

> Each phase ends with a playable build and a balance-harness report — the discipline that keeps
> v2 from re-inheriting v1's invisible late-game rot.

## Running it

```bash
bun run balance                                              # 60 runs × 200 days, standard
bun run balance -- --runs 40 --days 200 --difficulty cozy,standard,challenge
bun run balance -- --runs 200 --days 260 --csv balance-out   # writes runs.csv / summary.txt / runs.json
bun run balance -- --skill 0.85,0.55,0.35                    # model a range of player competence
bun run balance -- --policy adversarial                      # measure the floor, not the curve
bun run balance -- --seed 2105 --difficulty cozy             # one named run, exactly as the sweep played it
bun run balance -- --strict                                  # exit 1 on any pacing violation
```

`--seed` replaces the generated sweep with the seeds you name (comma-separated). The sweep derives
each seed from the run index *and* the skill, so without it there is no way to ask for one
particular run back — which is why the Pacing section prints a full `--seed/--days/--difficulty/
--policy/--skill` command beside every example rather than telling you to go and play it.

`--skill` drives `tools/autoplay.ts`, a headless "reasonable player" that accepts clients, books
the day, hires, trains, buys upgrades, launches programs, sets up mentorships and resolves every
event. At skill 1.0 it always picks the highest-value option; at 0.0 it picks at random. A run of
40×200 days across three difficulties takes about two seconds.

`--policy adversarial` swaps that player for a different one — see [the floor](#the-floor-what-bad-play-actually-costs)
below. `--skill` does not apply to it: the adversarial player is a fixed set of plausible
mistakes, not a dice roll, so the sweep runs it once per difficulty.

## What the harness watches

The single most important output is the **session grade distribution** and the **late-game
quality spread**. If the 10th-percentile session after day 120 is already excellent, the game has
been solved and the report says so in as many words:

```
⚠  Late-game looks SOLVED — even the 10th percentile session is excellent.
```

That check exists because it is precisely how v1 died, and it fired on the very first run of this
harness: 86% of sessions were "Excellent" by day 60, every meter was pinned at 100, and quality
could not even reach the breakthrough threshold.

Every sweep also ends with a **Pacing** section — per-run assertions on event cooldowns, the
client-modal cap, and arc-beat repeats. Those are the things a statistical report is structurally
blind to. See [Pacing](#pacing-the-assertions-the-statistics-cannot-make).

## Current curves

40 runs × 200 days per difficulty, player skill 0.85. Values are median unless noted.

| | Cozy | Standard | Challenge |
| --- | --- | --- | --- |
| Collapsed | **0 / 40** | **0 / 40** | 14 / 40 |
| Fully accredited | 39 / 40 | 34 / 40 | 8 / 40 |
| Final cash | $126,052 | $45,813 | $4,723 |
| Reputation | 84.1 | 84.5 | 75.8 |
| Community trust | 87.3 | 88.4 | 79.3 |
| Practice level | 9 | 9 | 8 (p10: 6) |
| Therapists | 8 | 8 | 4 (p10: 2) |
| Active clients | 59 | 57 | 37 |
| Avg morale | 88.7 | 88.3 | 80.4 |
| Cures | 150 | 144 | 94 |
| Complex cures | 69 | 72 | 47 |
| Dropouts | 0 | 0 | 0 (p90: 34) |
| Burnouts | 2 | 4 | 2 |
| Upgrades owned | 26 / 26 | 25 / 26 (p10: 4) | 4 / 26 |
| Campaign stages | 5 / 5 | 5 / 5 (p10: 3) | 2 / 5 |

Session grades:

| Grade | Cozy | Standard | Challenge |
| --- | --- | --- | --- |
| Breakthrough | 3.6% | 1.8% | 1.0% |
| Excellent | 37.1% | 30.0% | 24.8% |
| Good | 56.5% | 64.6% | 70.6% |
| Mixed | 2.8% | 3.6% | 3.6% |
| Poor | 0.0% | 0.0% | 0.0% |

Quality drift, early (≤ day 40) → late (> day 120):

| | Early | Late | Late p10–p90 |
| --- | --- | --- | --- |
| Cozy | 0.708 | 0.787 | 0.76 – 0.81 |
| Standard | 0.705 | 0.771 | 0.75 – 0.79 |
| Challenge | 0.700 | 0.764 | 0.74 – 0.79 |

Quality rises meaningfully across a run — mastery is real — while retaining spread, so no
difficulty ever reads as solved.

### How to read this

The three difficulties are three genuinely different games rather than three multipliers:

- **Cozy** delivers on "approachable and fun, never brutal". Nobody collapses, everybody finishes
  the accreditation campaign, and money stops being a question by the midgame. It is the mode
  where you play for the clients and the office.
- **Standard** spreads widely without ever collapsing: the p10 run finishes with 4 of 26 upgrades
  and 3 of 5 campaign stages, the p90 run is a thriving 8-person institution with $69k banked. The
  median finishes accredited with about a month of runway. That gap is the game — but see below.
- **Challenge** is hard and winnable: 35% collapse, 20% fully accredited, median cash of $4,723 at
  day 200 and a p10 that ends in the red — living hand to mouth for two hundred days.

### Known softness

- **Standard no longer collapses at all** (0/40, down from 5/40 before the Phase 6/7 fixes). The
  spread is still wide — p10 owns 4 upgrades against p90's 26 — so the *difficulty* is still
  legible, but the floor has come up. Either that is the right call for a cozy game's default
  mode, or Standard now needs a little of Challenge's margin pressure back. It is a deliberate
  question, not an oversight, and the number to move is `DIFFICULTIES.standard.expenseMult`.

- **Cozy owns every upgrade in every run**, so its late economy has no meaningful choices left.
  That is arguably correct for the mode, but the upgrade tree could use a genuinely expensive
  top tier that even Cozy has to choose between.

## The floor: what bad play actually costs

The reasonable player produces ~0% poor sessions and ~0.05 departures per run, which measures the
good half of the curve and nothing else. `--policy adversarial` measures the other half.

The adversarial player is not a button-masher. It is somebody in their first month with a full
inbox, and every decision it makes is one a real person makes:

- accepts **everyone** on the waitlist, straight up to the engine's own capacity check;
- books by **worst** specialisation match, ties broken toward whoever is already carrying the most
  — and books through `BOOK_SESSION` directly, so the energy reserve and the per-therapist session
  cap never apply;
- picks the focus that costs most in the situation it's in: Process for a client who isn't steady
  enough to be taken there, Stabilize for one who was ready to work weeks ago;
- takes the technique card with the worst hint and the highest regression risk;
- resolves events short-termist — cash today and one more referral, morale and trust never;
- hires the cheapest body against the waitlist rather than the ledger;
- buys only capacity and referral upgrades, and never mentors, trains, or launches a program.

20 runs × 200 days per difficulty. Median unless noted.

| | Cozy | Standard | Challenge |
| --- | --- | --- | --- |
| Collapsed | 0 / 20 | 0 / 20 | **4 / 20** |
| Fully accredited | 0 / 20 | 0 / 20 | 0 / 20 |
| Campaign stages | 1 / 5 | 1 / 5 | 1 / 5 (p10: 0) |
| Final cash | $393,285 | $150,493 | $23,816 (p10 −$6,260) |
| Reputation | 82.7 | 56.6 | **7.8** |
| Avg morale | 42.0 | 48.5 | 48.6 |
| Avg quality | 0.571 | 0.575 | 0.583 |
| Cures | 161 | 120 | 79 |
| Dropouts | 4 | 106 | 256 |
| Regressions | 888 | 969 | 736 |
| Burnouts | 126 | 138 | 137 |
| Departures | 18 | 14 | 9 |
| Sessions run | 6,187 | 5,084 | 3,923 |
| Upgrades owned | 12 / 26 | 12 / 26 | 12 / 26 |

Session grades:

| Grade | Cozy | Standard | Challenge |
| --- | --- | --- | --- |
| Breakthrough | 0.0% | 0.0% | 0.0% |
| Excellent | 0.3% | 0.3% | 0.3% |
| Good | 26.8% | 28.3% | 29.1% |
| Mixed | 65.2% | 64.5% | 64.2% |
| Poor | 7.7% | 6.8% | 6.4% |

Quality drift, early (≤ day 40) → late (> day 120):

| | Early | Late | Late p10–p90 |
| --- | --- | --- | --- |
| Cozy | 0.571 | 0.574 | 0.54 – 0.61 |
| Standard | 0.576 | 0.577 | 0.53 – 0.62 |
| Challenge | 0.578 | 0.586 | 0.54 – 0.64 |

### How to read the floor

The spread between the two policies is the whole game, and it is a wide one: **0% poor sessions
becomes 7%, 3% mixed becomes 65%, 2 burnouts become 126, and 0 departures become 18.** Mastery is
worth roughly +0.19 average quality, and the retention game — poaching, burnout, sabbatical, the
lot — is now exercised at scale rather than only by unit tests.

Note also that the adversarial curve is *flat*: quality barely moves from day 40 to day 200. The
reasonable player climbs 0.71 → 0.79 over the same run. Nothing about the practice ceiling helps
you if you keep handing the wrong case to the wrong therapist, which is the right shape.

Three things the floor makes visible that the reasonable sweep never could:

- **Bad practice is not punished financially.** Adversarial Cozy finishes with $393k against the
  reasonable player's $130k, because it runs 6,187 sessions to their 4,295 and skips the expensive
  upgrades and programs entirely. Volume beats craft on the balance sheet. Whether that is a
  problem depends on whether money is meant to be a scoreboard; today it reads as one, and it
  rewards the wrong thing.
- **Cures follow session count, not session quality.** 161 adversarial Cozy cures against 151
  reasonable ones. A mixed hour still moves the needle (`qualityCurve = 0.18 + q·1.18` never
  reaches zero), so enough mixed hours out-cure fewer good ones.
- **Burnout has an upside.** Each sabbatical grants `SABBATICAL_MAX_ENERGY_BONUS`, so 126 burnouts
  over a run leave the team with far more capacity than they started with. Intended as a gentle
  landing; at this frequency it is a loop worth closing.

What *does* separate the two everywhere is the human ledger — dropouts, regressions, morale,
departures, reputation on Challenge, and the accreditation campaign, which the adversarial player
never gets past stage 1 of in any difficulty. That is arguably the right shape for this game: bad
play doesn't bankrupt you, it just makes you a bad place to be a client or a therapist.

## Pacing: the assertions the statistics cannot make

Both event bugs found during the build — the same dilemma firing three mornings running, and a
modal rate that would have hit ~5/day late game — were invisible in every table above and obvious
in the first minute of `bun run playtest`. Statistics smooth *moments* away completely.

So every run now carries a pacing trace, and the sweep ends with a **Pacing** section that checks
what `src/sim/eventsys.ts` actually promises:

| Assertion | The contract it tests |
| --- | --- |
| `cooldown_same_subject` | A non-`once` event may not come round again **for the same subject** inside `EVENT_COOLDOWN_DAYS[scope]`. |
| `cooldown_global` | The same event id was reused inside that window **for somebody else**. |
| `modal_cap` | At most `MAX_CLIENT_EVENTS_PER_DAY` client-scope interruptions during a working day. |
| `beat_repeat` | An arc beat is played at most once per client (`c.playedBeats`). |
| `once_repeat` | A `once` event is exactly that (`state.firedOnce`). |

The subject is decided by scope, not by whatever context happened to be on the raise: the client
for client-scope, the therapist for staff-scope, the practice itself for everything else. The two
cooldown kinds are counted apart because they are different findings and one of them is far bigger
than the other. `cooldown_same_subject` is a repeat a player sits through twice — *this* client
asked to end therapy again nine days later. `cooldown_global` is one event template reaching two
different people inside a fortnight, which is what a per-client arc necessarily does when two
clients hit the same chapter in the same week, and is usually not a defect at all. Reporting them
as one number makes the interesting set untriageable — a third of the reasonable sweep's count is
same-subject, and everything else buries it.

Violations are grouped by kind *and* id, with the closest gap seen, one full example per group, and
the exact `bun run balance -- --seed …` command that plays that run again. `--strict` exits nonzero
on any violation — see [what it currently reports](#what-it-currently-reports) before wiring it
into anything.

The in-session technique card is deliberately not counted as a modal: it is the core loop, not an
interruption, and it is supposed to appear every session.

### What it currently reports

`--runs 20 --days 200 --difficulty cozy,standard,challenge`, reasonable player, 120 runs:

```
50,147 modals over 23,165 simulated days (2.16/day; 88% of days interrupted at all).
Busiest single day: 11 modals on day 152 (reasonable/standard seed 41375).

✗  19,929 PACING VIOLATIONS across 120/120 runs
     cooldown_global        13,386
     cooldown_same_subject   6,543
```

All of them are cooldown lines, and none of them is a random draw: `pickEvent` consults
`state.eventCooldowns`, so a draw can never land inside the window. Every line above therefore came
from a scripted `raiseEvent` / `raiseEventById`, which **sets** the cooldown and, by design, does
not **check** it — `EVENT_COOLDOWN_DAYS` is documented in `src/sim/balance.ts` as how long before an
event may be *drawn* again, and `raiseEvent`'s own comment says a scripted raise sets it "so a
follow-up cannot be immediately echoed by the random draw". Scripted raises are exempt from the
check they perform, deliberately.

That is why the split matters. Broken out by id:

| Event | Reasonable, 120 runs | Adversarial, 60 runs |
| --- | --- | --- |
| **same subject** | | |
| `ev_practice_insurance_renegotiation` | 6,353 | 4,691 |
| `ev_staff_burnout_aftermath` | 9 | 6,598 |
| `ev_client_asks_to_end` | 96 | 295 |
| `ev_practice_cash_warning` | 43 | 100 |
| `ev_client_brings_partner` | 26 | 22 |
| **different subject** | | |
| `ev_client_asks_to_end` | 9,036 | 4,933 |
| `ev_client_brings_partner` | 3,880 | 3,222 |
| `ev_staff_burnout_aftermath` | 149 | 1,070 |
| `ev_client_crisis_call` | 321 | 127 |

The bottom half is the shape you would expect from healthy content: `ev_client_asks_to_end` is a
chapter beat, and in a practice carrying fifty clients several of them reach that chapter in the
same fortnight. Nine thousand of those is not nine thousand bugs.

The top half is worth reading, and it is two separate stories:

- **`ev_practice_insurance_renegotiation` is scoped wrong, not raised wrong.** `engine.ts:997`
  raises it per *client*, when that client's authorised sessions run out — but the event is
  authored `scope: 'practice'`, so it inherits a practice-wide 20-day cooldown for a per-client
  trigger. The likely fix is content-side (`scope: 'client'`), not engine-side, and it costs one
  line in `src/content/events-practice.ts`.
- **`ev_staff_burnout_aftermath` for the same therapist, 6,598 times under adversarial play**, is a
  genuine repeat: `engine.ts:933` raises it on every burnout, a sabbatical is only `SABBATICAL_DAYS`
  (2–4) long, and the adversarial player puts the same person back into the wall inside the event's
  16-day window. That one is about how often a therapist can hit the wall, not about the event
  system — note it is 9 occurrences under reasonable play and 6,598 under adversarial.

Both are real, both are small and specific, and neither is the sweeping "make `raiseEvent` check
its own cooldown" fix an earlier draft of this page prescribed. **Do not make that change.**
`raiseEvent` returns `undefined` when it declines, and no caller looks at the return value. Arc
beats reach the event system through `session.ts:299` → `state.queuedEvents` → `engine.ts:1094`,
and `applyEffect`'s `followUp` path goes the same way; a cooldown check there does not reschedule
those beats, it **deletes** them. `beat_asks_to_bring_someone` would fire, promise a conversation,
and `ev_client_brings_partner` would never arrive — which is the failure CLAUDE.md names by
name ("`raiseEventById` silently no-ops on an unknown id. Two narrative beats were dead for the
whole build because of this"), and which `src/sim/content.test.ts` now exists to prevent.

The open design question is a narrower one: **is a per-subject cooldown wanted?** Today
`state.eventCooldowns` is keyed by event id alone, which is why the harness has to reconstruct the
subject itself. If the answer is yes, it wants a `state.eventCooldowns[id][subjectId]` shape and a
constant beside `EVENT_COOLDOWN_DAYS`, applied in `pickEvent`. If a scripted raise is ever made to
respect a cooldown, it must not be a silent `return undefined` — the beat has to be re-queued into
`state.queuedEvents` for after the window, or the caller has to be told it was dropped. Anything
else voids the dead-beat guarantee.

`--strict` stays red until one of those lands, so it is not yet usable as a gate.

The other three assertions pass: the client-event cap holds in every run, no arc beat repeats for
a client, no `once` event fires twice. Worth noting separately that **88% of days carry at least
one modal, at 2.16/day and up to 11 on the worst day** — under the per-scope caps, but not
obviously cozy.

## Where the numbers live

Every tuning constant is in `src/sim/balance.ts` — nothing is inlined in system code. The ones
that move the game most:

| Constant | Effect |
| --- | --- |
| `SKILL_CAP_BY_LEVEL` | The ceiling a practice can reach at each level. The main anti-solve lever. |
| `DIMINISH_KNEE` / `DIMINISH_SCALE` | Where compression starts and how hard it bites. |
| `MOD_CEILING` / `MOD_FLOOR` | Clamps the *aggregate* of every additive bonus. Removing this pins quality instantly. |
| `UPGRADE_QUALITY_ASYMPTOTE` | Total office contribution, however much you buy. |
| `BASE_PROGRESS` | Sessions per cure — drives cures, which drive reputation, XP and the campaign. |
| `XP_PER_LEVEL` | Pace of the whole run. |
| `MORALE_BASELINE` / `MORALE_REVERSION` | Where morale settles. Without reversion, teams pin at 100 and retention stops existing. |
| `REPUTATION_GAIN_FALLOFF` / `REPUTATION_DECAY_SCALE` | Whether reputation asymptotes or pins. |
| `SESSION_OVERHEAD` / `OVERHEAD_PER_CLIENT` | Margin. Tying most overhead to sessions rather than headcount stops a big caseload from quietly bankrupting a healthy practice. |
| `COLLECTION_RATE` | Not every billed hour is a collected hour. |

## Retuning workflow

1. Change a constant in `src/sim/balance.ts`.
2. `bun run balance -- --runs 40 --days 200 --difficulty cozy,standard,challenge`
3. Compare against the table above. Watch the grade distribution and the late-game spread first —
   they move before anything else does.
4. If the change touches morale, strain, patience or the event system, run the floor too:
   `bun run balance -- --runs 20 --days 200 --difficulty cozy,standard,challenge --policy adversarial`.
   A tuning change that quietly makes bad play survivable will show up there and nowhere else.
5. Read the **Pacing** section at the bottom of the report. It is the only guard on anything that
   produces moments rather than numbers, and it is cheap to read.
6. `bun run test` to confirm you have not broken an invariant.
7. Update the tables above when the change is deliberate.

## A worked example

The first harness run reported reputation, community trust, morale and practice level **all
pinned at maximum by day 60**, with 86% Excellent sessions. Four causes, all found by reading the
report rather than by playing:

1. Quality could never exceed 0.907 because the compression was linear, so the 0.92 breakthrough
   threshold was unreachable — while simultaneously *everything* reached the cap.
2. The 26-item upgrade tree contributed up to +0.5 raw quality with no aggregate limit.
3. The same bug existed in morale: aggregate office `moraleDrift` was worth +5.2/night against a
   −3.1/night reversion, so every team pinned at 100 and poaching never fired.
4. Reputation and trust had linear gains and constant decay, so both ran to 100 and stopped
   being meters at all.

The fixes — aggregate clamps, asymptotic gains, the practice ceiling as an asymptote rather than
a clamp, and morale reversion — are why the current curves hold. None of it would have been
visible in an hour of hand-play.
