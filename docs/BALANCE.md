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
| Collapsed | **0 / 40** | 2 / 40 | 17 / 40 |
| Fully accredited | 39 / 40 | 32 / 40 | 9 / 40 |
| Final cash | $125,847 | $44,354 | $155 |
| Reputation | 84.2 | 83.6 | 72.5 |
| Community trust | 88.8 | 89.9 | 77.6 |
| Practice level | 9 | 9 (p10: 8) | 8 (p10: 6) |
| Therapists | 8 | 8 (p10: 3) | 4 (p10: 2) |
| Active clients | 59 | 57 (p10: 31) | 32 |
| Avg morale | 81.6 | 79.9 | 78.0 |
| Cures | 149 | 140 | 73 |
| Complex cures | 69 | 68 | 33 |
| Dropouts | 0 | 0 | 0 (p90: 48) |
| Burnouts | 3 | 4 | 2 |
| Upgrades owned | 26 / 26 | 22 / 26 (p10: 4) | 4 / 26 |
| Campaign stages | 5 / 5 | 5 / 5 (p10: 2) | 2 / 5 |

Session grades:

| Grade | Cozy | Standard | Challenge |
| --- | --- | --- | --- |
| Breakthrough | 3.8% | 1.9% | 1.0% |
| Excellent | 38.2% | 30.0% | 23.8% |
| Good | 55.5% | 64.2% | 70.9% |
| Mixed | 2.5% | 3.9% | 4.3% |
| Poor | 0.0% | 0.0% | 0.0% |

Quality drift, early (≤ day 40) → late (> day 120):

| | Early | Late | Late p10–p90 |
| --- | --- | --- | --- |
| Cozy | 0.709 | 0.788 | 0.77 – 0.81 |
| Standard | 0.706 | 0.770 | 0.75 – 0.79 |
| Challenge | 0.699 | 0.761 | 0.74 – 0.78 |

Quality rises meaningfully across a run — mastery is real — while retaining spread, so no
difficulty ever reads as solved.

### How to read this

The three difficulties are three genuinely different games rather than three multipliers:

- **Cozy** delivers on "approachable and fun, never brutal". Nobody collapses, everybody finishes
  the accreditation campaign, and money stops being a question by the midgame. It is the mode
  where you play for the clients and the office.
- **Standard** spreads widely and almost never collapses: the p10 run finishes with 4 of 26
  upgrades and 2 of 5 campaign stages, the p90 run is a thriving 8-person institution with $77k. The
  median finishes accredited with about a month of runway. That gap is the game — but see below.
- **Challenge** is hard and winnable: 43% collapse, 23% fully accredited, median cash of $155 at
  day 200 and a p10 that ends in the red — living hand to mouth for two hundred days.

### Known softness

- **Standard barely collapses** (2/40, against 5/40 before the Phase 6/7 fixes and 0/40 before the
  event-repeat fix closed a per-client cash faucet). The spread is still wide — p10 owns 4 upgrades
  against p90's 26 — so the *difficulty* is legible, but the floor is high. Either that is the right
  call for a cozy game's default mode, or Standard needs a little more of Challenge's margin
  pressure. It is a deliberate question, not an oversight, and the number to move is
  `DIFFICULTIES.standard.expenseMult`.

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
| Collapsed | 0 / 20 | 0 / 20 | **8 / 20** |
| Fully accredited | 0 / 20 | 0 / 20 | 0 / 20 |
| Campaign stages | 1 / 5 | 1 / 5 | 1 / 5 (p10: 0) |
| Final cash | $316,206 | $113,316 | $6,158 (p10 −$6,461) |
| Reputation | 82.6 | 60.2 | **5.7** |
| Avg morale | 41.5 | 44.6 | 44.7 |
| Avg quality | 0.571 | 0.576 | 0.578 |
| Cures | 158 | 113 | 43 |
| Dropouts | 6 | 99 | 260 |
| Regressions | 902 | 955 | 535 |
| Burnouts | 128 | 140 | 73 |
| Departures | 18 | 14 | 6 |
| Sessions run | 6,284 | 5,074 | 2,139 |
| Upgrades owned | 12 / 26 | 12 / 26 | 12 / 26 |

Session grades:

| Grade | Cozy | Standard | Challenge |
| --- | --- | --- | --- |
| Breakthrough | 0.0% | 0.0% | 0.0% |
| Excellent | 0.2% | 0.3% | 0.3% |
| Good | 27.0% | 27.3% | 29.2% |
| Mixed | 65.4% | 65.8% | 63.6% |
| Poor | 7.3% | 6.6% | 6.9% |

Quality drift, early (≤ day 40) → late (> day 120):

| | Early | Late | Late p10–p90 |
| --- | --- | --- | --- |
| Cozy | 0.573 | 0.576 | 0.54 – 0.61 |
| Standard | 0.576 | 0.579 | 0.54 – 0.62 |
| Challenge | 0.575 | 0.586 | 0.54 – 0.64 |

### How to read the floor

The spread between the two policies is the whole game, and it is a wide one: **0% poor sessions
becomes 7%, 3% mixed becomes 65%, 3 burnouts become 128, and 0 departures become 18.** Mastery is
worth roughly +0.19 average quality, and the retention game — poaching, burnout, sabbatical, the
lot — is now exercised at scale rather than only by unit tests.

Note also that the adversarial curve is *flat*: quality barely moves from day 40 to day 200. The
reasonable player climbs 0.71 → 0.79 over the same run. Nothing about the practice ceiling helps
you if you keep handing the wrong case to the wrong therapist, which is the right shape.

Three things the floor makes visible that the reasonable sweep never could:

- **Bad practice is not punished financially.** Adversarial Cozy finishes with $316k against the
  reasonable player's $126k, because it runs 6,284 sessions to their 4,295 and skips the expensive
  upgrades and programs entirely. Volume beats craft on the balance sheet. Whether that is a
  problem depends on whether money is meant to be a scoreboard; today it reads as one, and it
  rewards the wrong thing.
- **Cures follow session count, not session quality.** 158 adversarial Cozy cures against 149
  reasonable ones. A mixed hour still moves the needle (`qualityCurve = 0.18 + q·1.18` never
  reaches zero), so enough mixed hours out-cure fewer good ones.
- **Burnout has an upside.** Each sabbatical grants `SABBATICAL_MAX_ENERGY_BONUS`, so 128 burnouts
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
as one number makes the interesting set untriageable: the split is what turned 19,929 undifferentiated
violations into two findings worth about a day's work, one of which was a real defect and the other
of which is the content working as authored.

Violations are grouped by kind *and* id, with the closest gap seen, one full example per group, and
the exact `bun run balance -- --seed …` command that plays that run again. `--strict` exits nonzero
on any violation — see [what it currently reports](#what-it-currently-reports) before wiring it
into anything.

The in-session technique card is deliberately not counted as a modal: it is the core loop, not an
interruption, and it is supposed to appear every session.

### What it currently reports

`--runs 20 --days 200 --difficulty cozy,standard,challenge`, reasonable player, 120 runs:

```
43,279 modals over 23,343 simulated days (1.85/day; 87% of days interrupted at all).
Busiest single day: 7 modals on day 164 (reasonable/cozy seed 25862).

✗  12,192 PACING VIOLATIONS across 120/120 runs
     cooldown_global        12,184
     cooldown_same_subject       8
```

`cooldown_same_subject` was **6,543** before the subject cooldown landed, and 11,706 under
adversarial play; it is now 8 and 4. Every one of the survivors is `ev_client_crisis_call`, which
is authored `urgent: true` and is *meant* to come round again — see below. The other three
assertions pass: the client-event cap holds in every run, no arc beat repeats for a client, no
`once` event fires twice.

`cooldown_global` is the class that remains, and it is still mostly not a defect. It is one event
template reaching two different people inside a fortnight, which is exactly what a per-client arc
does when several clients hit the same chapter in the same week:

| Event | Reasonable, 120 runs | Adversarial, 60 runs |
| --- | --- | --- |
| `ev_client_asks_to_end` | 7,705 | 3,985 |
| `ev_client_brings_partner` | 4,017 | 3,162 |
| `ev_staff_burnout_aftermath` | 152 | 2,673 |
| `ev_client_crisis_call` | 310 | 128 |

Seven thousand of those is not seven thousand bugs. `ev_client_asks_to_end` is the only "my client
wants to stop" event in the game, so every client who reaches consolidation routes through the same
modal; the fix for the *feel* of that is more variants of the beat, not a stricter cooldown. It is
filed under content in [FUTURE_WORK.md](../FUTURE_WORK.md).

`--strict` therefore still exits nonzero and is still not usable as a gate. What would make it one
is either counting `cooldown_global` separately from failures, or the content above.

### What the fix actually was

The finding was that `pickEvent` consults `state.eventCooldowns` but `raiseEvent` only ever *set*
it, so every scripted raise walked straight through a live window. The tempting one-line fix —
have `raiseEvent` return `undefined` on a live cooldown — was wrong, and the reason is worth
keeping: arc beats reach the event system through `session.ts` → `state.queuedEvents` →
`engine.ts`, `applyEffect`'s `followUp` path goes the same way, and **no caller on either path
reads the return value**. A silent early return does not reschedule those beats, it deletes them.
`beat_asks_to_bring_someone` would fire, promise a conversation, and `ev_client_brings_partner`
would never arrive.

So the rule is not "refuse", it is "**hold, and say when**":

1. `state.subjectCooldowns` is keyed `eventId@subject`, where the subject is decided **by scope** —
   the client for client-scope, the therapist for staff-scope, the practice for everything else
   (`eventSubject()` in `src/sim/eventsys.ts`, mirroring exactly what the harness reconstructs).
   It uses the same `EVENT_COOLDOWN_DAYS` window and is swept nightly so it cannot grow with the
   client list.
2. An identical `(id, subject)` already on screen is **dropped**. A second copy of an unanswered
   modal is a duplicate, not a beat.
3. Otherwise a scripted raise inside a live window is **deferred** into `state.queuedEvents` for the
   day the window lifts — unless the caller passes `onRepeat: 'skip'`, which is for ambient raises
   that promise nothing (a meter crossing a line), or the event is authored `urgent`, which lands
   anyway because a crisis call that arrives a fortnight late is a worse lie than one that arrives
   twice. `ev_client_crisis_call` is the only `urgent` event, and is the whole of the residual
   `cooldown_same_subject` count.
4. `EVENT_MAX_DEFERRALS` (1) bounds the wait. A beat that has already been pushed back once lands
   regardless: at the limit, "defer" and "delete" are the same thing.
5. A queued beat whose subject has since **left the practice** is dropped at the queue, not raised.
   Substituting "your client" into a line written about a person reads as a bug, and a conversation
   about somebody who graduated a week ago is worse than no conversation.

   Note that this check runs against **every** due queue entry, not only deferred ones — ordinary
   arc beats and `applyEffect` follow-ups arriving on their originally scheduled day go through the
   same drain, and by volume they are the large majority of the drops. Measured over 30 × 200
   standard days: 387 queued beats dropped, of which 280 carried no deferral at all. Before this
   change 316 of those raised anyway, rendering the "your client" placeholder. The deferral slice
   is much smaller — over 12 × 200 days, 23 deferrals, 17 delivered (all next-day), 6 dropped for a
   subject who had left. **This is the one place a beat is deliberately lost**; if you are reading
   this to answer "can an authored beat disappear?", the answer is yes, here, and only here.

Two same-subject offenders were also fixed where they actually lived, not in the event system:

- **`ev_practice_insurance_renegotiation` was raised per client and scoped `practice`.** It is a
  letter about a panel contract and never names the client, so the engine no longer passes a
  `clientId` at all and raises it `onRepeat: 'skip'`. Two clients exhausting their authorisation on
  the same Tuesday no longer produce two identical letters that morning. This was 6,353 of the
  6,543, and it had also quietly become an economic subsystem — see the balance note below.
- **`ev_staff_burnout_aftermath` re-fired for the same therapist**, 6,598 times under adversarial
  play. It is the phone call the morning after a sabbatical and means nothing detached from it, so
  it is raised `onRepeat: 'skip'` too. How often a therapist can hit the wall at all is a difficulty
  question, not a pacing one, and is left alone.

### The one-per-morning rule, and what it cost

The sweep said the same-subject class was fixed; `bun run playtest` said it was not fixed *enough*.
Three different clients reached consolidation in the same week and "I think I'm done." went up
twice on one morning and again the next — every one of them a legitimate, different person, and all
of it reading like a bug. The morning queue drains before the player answers anything, so both
modals were on screen together.

So a raise also holds until **tomorrow** if the same event id is already pending, whoever it is
about. It is not a cooldown; it is a rule that one conversation happens once a morning. Over
12 × 200 standard days, days carrying the same modal title more than once fell from **14 to 1**, and
the worst case from three of them in a day to two. The survivor is the case this does not catch: a
modal raised in the morning, answered, and the same template raised again off the back of an
afternoon session. Hours apart and after the first was resolved, that reads as a coincidence rather
than a repeat, and catching it would mean tracking raises per day for very little.

### What it cost the curves

This is a pacing change with a real balance consequence, and it is worth stating plainly.
`ev_practice_insurance_renegotiation` fired roughly **fifty times a run** because it was triggered
per client; three of its four choices hand out `+$800`, `allMorale +2`, or both. It was an
aggregate faucet scaling with the client list — the exact shape CLAUDE.md warns about — and closing
it moved the table. 40 runs × 200 days per difficulty at skill 0.85, the same sweep as
[Current curves](#current-curves), run against the tree before and after:

| | Before | After |
| --- | --- | --- |
| Avg morale (Cozy / Standard / Challenge) | 88.7 / 88.3 / 80.4 | 81.6 / 79.9 / 78.0 |
| Collapsed (Cozy / Standard / Challenge) | 0 / 0 / 14 | 0 / 2 / 17 |
| Median cash, Challenge | $4,723 | $155 |
| Cures, Challenge | 94 | 73 |
| Modals per day | 2.16 | 1.85 |
| Busiest single day | 11 | 7 |

Grade distribution and the late-game spread barely moved — Cozy 3.6/37.1/56.5 becomes
3.8/38.2/55.5 — and every difficulty still prints `✓ Late-game still has spread`. Cozy is
unchanged. What moved is morale everywhere and margin at the bottom end, which is what you would
expect from closing a faucet that paid out most often to a practice carrying many clients.

Morale losing seven points of free lift is a correction rather than a regression: it was being held
up by an accident of triggering, and 80 is still a comfortable place for a team to sit. Standard
picking up its first couple of collapses is the direction [FUTURE_WORK.md](../FUTURE_WORK.md)
already asked for. Challenge at 43% collapse is at the top of "hard and winnable" and worth
watching. **Nothing was retuned to compensate** — this landed as a pacing change and the numbers
are reported as they fell. If Challenge now bites too hard, the knob is
`DIFFICULTIES.challenge.expenseMult`.

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
| `EVENT_COOLDOWN_DAYS` | How long before an event may be drawn *or scripted* again — globally, and for the same person. |
| `EVENT_MAX_DEFERRALS` | How long a promised beat may be held back before it lands regardless. |

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
