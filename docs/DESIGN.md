# Design

Every system here exists to answer a specific way v1 broke down around hour six. This document
pairs each one with the failure it fixes, then gives the mechanical detail.

---

## The five failures, and the fixes

| v1 failure | v2 answer |
| --- | --- |
| **The flywheel saturated.** Additive, capped quality meant every mature session scored "Excellent". | Quality compresses asymptotically toward a **practice-level ceiling** that rises across the whole run, plus per-session variance. Late-game sessions keep real spread. |
| **The anti-snowball punished success.** Higher reputation made clients *less patient*. | Reputation now changes **who is referred to you** — complex, comorbid, higher-severity cases that pay more and demand more. Success makes the game richer, not more annoying. |
| **Scale multiplied tedium.** Five therapists meant 5× the booking clicks. | Automation arrives *just before* the scale that would make manual play a chore: autofill → batch booking → the Act-3 **policy scheduler**. Your attention moves to exceptions. |
| **Sessions were passive.** One random modal from a pool of ~6 dilemmas. | Sessions have a **plan → play → reflect** spine, and the play beat draws **technique cards** from that therapist's learned repertoire. 48 techniques across 8 modalities. |
| **The UI was informational, not emotional.** Numbers in tables. | A **living office** you watch, a growing-plant motif for every client's progress, portraits and backstories, and a photo wall that physically fills up. |

---

## 1. The quality formula

Six weighted terms, each in 0..1:

| Term | Weight | Driven by |
| --- | --- | --- |
| Skill | 0.30 | Therapist skill, grown by levels and training |
| Specialization | 0.17 | Modality fit, **averaged across every condition the client presents with** |
| Energy | 0.13 | `sqrt(energy / maxEnergy)` |
| Rapport | 0.16 | The therapeutic alliance, built session by session |
| Focus fit | 0.13 | Whether Stabilize/Process/Build Skills suits their current state |
| Technique fit | 0.11 | Whether the card you played suits this condition, chapter and focus |

Then additive modifiers (traits, morale, office, philosophy, supervision, case complexity),
**summed and then clamped as a group**. This clamp matters more than it looks: without it, the
26-item upgrade tree alone was worth +0.5 quality and pinned every session at the ceiling — the
exact "solved spreadsheet" failure v1 shipped with. Aggregate office quality and aggregate trait
quality each asymptote separately as well.

Finally:

```
quality = compress(raw, skillCap(practiceLevel)) + sessionVariance
```

`compress` uses the practice ceiling as an **asymptote rather than a hard clamp**. A clamp made
every mature session score the identical number; an asymptote preserves the spread underneath it.
`sessionVariance` is one normal sample per session, drawn when the session starts and stored on
it, so the preview and the result always agree.

Grades: breakthrough ≥ 0.86, excellent ≥ 0.79, good ≥ 0.63, mixed ≥ 0.44, poor below.

**Every term and modifier is reported** in `result.reasons`, which is what the reflect card
renders. That is the no-hidden-punishments contract in code.

## 2. Focus: the pacing lesson

| Focus | Progress | Stability | Energy | Base regression | Safe above |
| --- | --- | --- | --- | --- | --- |
| **Stabilize** | ×0.62 | +0.16 | ×0.78 | 1% | any |
| **Process** | ×1.55 | −0.14 | ×1.35 | 9% | 0.55 stability |
| **Build Skills** | ×1.00 | +0.03 | ×1.00 | 3% | 0.30 stability |

Processing a destabilised client is the game's central pacing lesson, and it is never a gotcha:
the regression percentage is shown on the focus selector and on every technique card before you
commit. Resilience — built by Build Skills — cuts regression chance by up to 55%, which is why
the "boring" focus is the one that unlocks the aggressive one.

## 3. Client arcs

Progress 0→100 across three chapters: **Trust** (0–34) → **Work** (34–76) → **Consolidation**
(76–100). In the Trust chapter, progress is gated at 55% until rapport passes 0.45 — you cannot
rush the alliance.

Four client meters, all asymptotic so none of them ever pins:

- **Progress** — the visible plant that sprouts, leafs, buds and blooms at cure.
- **Stability** — felt safety. Gates what you can safely do.
- **Rapport** — the alliance. Gates early progress, feeds quality.
- **Resilience** — protects against regression. The long-term investment.
- **Patience** — drops when unseen, and the decay *accelerates* with each idle day. Below 42
  they are flagged at risk; below 22 they may stop coming.

**Arc beats** punctuate treatment: 42 authored narrative moments keyed to chapter, condition and
severity — a setback week, a life event that adds a comorbidity mid-treatment, the first time
they cried, the session where they start talking about ending. Three of them raise full events.

Cured clients become **alumni**: they send referrals, appear on the photo wall, and leave a
testimonial.

## 4. Therapists as people

Two or three traits from a pool of 22, each hooking into scheduling, matching, morale and events.
Career stages (junior → mid → veteran) shape salary and ambition.

**Morale** reverts toward a baseline of 55 every night. Without that reversion, small positive
drifts compound into a permanently ecstatic team and the entire retention game disappears — which
is what the harness caught. Office quality and relationship warmth both contribute, both with
diminishing returns, and a larger practice is a harder place to feel seen.

**Strain** accumulates from *carrying too many hours*, not merely from a tired evening — past
about 4.5 sessions a day it builds visibly, so the player can head it off. At 100 it triggers a
**sabbatical**, which is deliberately fail-forward: 2–4 days out, the practice absorbs the load,
and they return with more capacity than they left with and a new trait.

**Poaching** starts when morale drifts below 58. You always get warning and a chance to counter.
Departures are never sudden.

## 5. Complexity as the snowball brake

`COMPLEX_SHARE(reputation)` rises from 0 to a 55% ceiling as you become known. Complex clients
carry comorbidities, higher severity, and a 1.35× rate — and comorbidities **dilute
specialization fit**, so a complex case genuinely stretches a specialist.

Alongside it, **Community Trust** tracks whether you also serve ordinary and sliding-scale
clients. It drifts down on its own, rises with the sliding-scale share of your caseload, and
gates community programs. Turning someone away costs it.

Together these make triage — who gets your limited hours — the defining late decision, which is
exactly on-theme.

## 6. Programs

Six persistent initiatives with setup cost, weekly upkeep, dedicated staff, their own event
flavour, and payoffs shaped to their identity: Group Therapy (cash), Workshops (cash + rep),
School Partnership (referrals + trust), Crisis Line (trust + rep, heavy energy), Research Study
(a slow burn to a published paper and a permanent practice-wide bonus), Training Institute
(income + a pipeline of pre-vetted hires).

You cannot run them all well. Which ones you choose expresses your practice's identity.

## 7. Philosophy

At practice level 3 you commit, permanently for the run, to being a **Trauma-Informed Center**, a
**Family & Community Clinic**, or an **Integrative Wellness Studio**. Each shifts the referral
mix, discounts training, favours two programs, and grants signature techniques no other run gets.
It is a light specialisation that gives distinct runs a distinct flavour.

## 8. The long game

The **Center of Excellence** campaign runs five stages from roughly day 25 to day 180, with
requirements spanning every system — cures, complex cures, staff count, morale, community trust,
reputation, practice level, programs, alumni. Completing it is the run's crowning ceremony, and
the game keeps going afterward.

**Seasons**: 28-day quarters, each ending in a Practice Review — trends, wins, one generated note
per therapist, and exactly one framed suggestion. It is both a retention beat and an
approachability tool.

**Legacy**: retiring a run banks points into a small permanent tree — a starting nest egg, a
carried technique, a veteran mentor on day one. Enough that a replay with a different philosophy
feels fresh; never enough to trivialise one.

## 9. Approachability

- **Cozy** makes bankruptcy impossible: running out of money triggers a hardship arc with the
  mentor NPC instead of a game over. **Standard** has a three-stage bankruptcy arc with clear
  off-ramps. **Challenge** is tight margins and complex cases arriving early.
- Week one doubles referrals, buffers client patience, and guarantees a strong first-hire
  candidate so the pivotal Act 1→2 moment cannot whiff.
- Energy forecasts, morale forecasts, cash runway, at-risk badges and an Act-3 exception feed all
  surface trouble before it lands.
- **Calm mode** tones down every effect without changing a single number in the game.
