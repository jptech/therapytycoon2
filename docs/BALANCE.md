# Balance

> Each phase ends with a playable build and a balance-harness report — the discipline that keeps
> v2 from re-inheriting v1's invisible late-game rot.

## Running it

```bash
bun run balance                                              # 60 runs × 200 days, standard
bun run balance -- --runs 40 --days 200 --difficulty cozy,standard,challenge
bun run balance -- --runs 200 --days 260 --csv balance-out   # writes runs.csv / summary.txt / runs.json
bun run balance -- --skill 0.85,0.55,0.35                    # model a range of player competence
```

`--skill` drives `tools/autoplay.ts`, a headless "reasonable player" that accepts clients, books
the day, hires, trains, buys upgrades, launches programs, sets up mentorships and resolves every
event. At skill 1.0 it always picks the highest-value option; at 0.0 it picks at random. A run of
40×200 days across three difficulties takes about two seconds.

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

- **Poor sessions are ~0%** even for a weak player. The floor is high because the autoplay bot
  never assigns a wildly wrong therapist. A human can produce them (mismatch a modality, Process
  a destabilised client, work an exhausted therapist), but the harness does not currently model
  that failure. Worth a `--skill 0` sweep with a deliberately adversarial policy.
- **Cozy owns every upgrade in every run**, so its late economy has no meaningful choices left.
  That is arguably correct for the mode, but the upgrade tree could use a genuinely expensive
  top tier that even Cozy has to choose between.
- **Departures are near-zero** because the bot keeps morale healthy. The poaching path is covered
  by unit tests rather than by the harness.

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
4. `bun run test` to confirm you have not broken an invariant.
5. Update the table above when the change is deliberate.

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
