# Therapy Tycoon v2 — Concept & Build Plan

A cozy, web-based practice-management sim where the product is care. You grow from a solo therapist into a beloved community institution — and the game's central promise is that *your job changes as you grow*. v1 proved the core loop works; v2 fixes why it stopped working around hour six.

---

## 1. Diagnosis: why v1 broke down

Before adding anything, it's worth naming the failure modes precisely, because each one dictates a specific design fix.

**The flywheel saturated.** The quality formula is additive and capped. Once therapists hit high skill, matched specializations, and full energy management, every session scores "Excellent," and the game becomes a solved spreadsheet. There were no new *verbs* after roughly practice level 3 — just more of the same booking.

**The anti-snowball punished success.** Making clients *less* patient as reputation grows is a brake, but it's a hostile one: the reward for playing well was a worse experience (more dropout anxiety, more micromanagement). Good anti-snowball design converts success into *new kinds of decisions*, not friction on old ones.

**Scale multiplied tedium instead of transforming it.** Five therapists meant 5× the booking clicks. Tycoon games survive scale by shifting the player from operator to designer (RollerCoaster Tycoon: you stop placing individual paths and start designing park economy). v1 never made that shift.

**Sessions were passive.** Decision events were the only interactive moment, and they were a random slot machine of the same ~6 dilemmas. Clients were stat blocks named "Client AB," so there was nothing to care *about* — fatal for a game whose theme is caring.

**The UI was informational, not emotional.** The PixiJS floor plan existed but the game was really played in tabs and tables. The celebration layer helped, but the moment-to-moment screen didn't express warmth, growth, or the passage of time.

Every system below is an answer to one of these five problems.

---

## 2. The core reframe: three acts, three jobs

The single biggest structural change: the game is explicitly designed as **three acts**, each with a different player role, and each act's systems are the *automation* of the previous act's chores. This is how the game supports 20+ hour playthroughs without the loop going stale, and it's also how the early game stays fast — Act 1 is deliberately small and intimate, not a crippled version of the full game.

**Act 1 — The Therapist (days 1–14, solo).** You play *as* your own therapist. Only 3–5 clients at a time, each a real character with a name-style tag, portrait, backstory blurb, and a visible story arc. Sessions are the interactive centerpiece (see §3). No payroll, trivial rent, no insurance paperwork — money is nearly a non-issue by design. Act 1 teaches the session layer deeply because that layer never goes away; it just gets delegated. It ends with a warm forced beat: your waitlist overflows, a mentor NPC nudges you, and you make your first hire.

**Act 2 — The Practice Owner (roughly days 15–60, 2–4 therapists).** This is v1's game, retained and deepened: hiring, scheduling, training, insurance panels, energy management, cash flow. The difference is what surrounds it — therapists are characters with traits and relationships (§4), clients arrive with comorbidities and arcs (§5), and the scheduling burden is capped because Act 3 tools start unlocking before tedium peaks.

**Act 3 — The Director (day ~60 onward, 5–9 therapists, no hard end).** You stop booking individual sessions. You unlock the **auto-scheduler**, which runs your triage *policies* — rules you author ("prioritize high-severity trauma clients to Maya; keep everyone under 5 sessions/day; hold Friday afternoons for supervision"). Your attention shifts to exceptions the system surfaces (a flagged at-risk client, a therapist trending toward burnout, a conflict between two hires), to launching **programs** (§6), and to the long **accreditation campaign** (§8). Playing well in Act 3 means designing a practice that runs beautifully — and the fantasy payoff is watching the office scene hum with life you architected.

The acts aren't hard-gated modes; they're an intended experience curve created by unlock pacing. A player can keep hand-booking forever if they enjoy it.

---

## 3. Sessions with a spine: plan → play → reflect

Sessions stay real-time, but every session now has three light beats instead of one random modal.

**Plan (5 seconds, optional after the first weeks).** Before a session you pick a *focus*: **Stabilize** (safe, small progress, restores client engagement), **Process** (high progress, drains client and therapist, risk of regression), or **Build Skills** (medium progress, raises the client's resilience stat, which reduces future regression odds). The right choice depends on client state — a destabilized client punished for Processing too early is the game teaching real therapeutic pacing. The auto-scheduler learns your preferences and picks focuses for you in Act 3.

**Play — technique cards replace generic dilemmas.** Decision events remain, but the options come from that therapist's learned **techniques** — a small collection built through training and modality (CBT therapists offer *Thought Record*; EMDR unlocks *Bilateral Processing*; Somatic unlocks *Grounding*). Techniques have flavor, costs, and situational strengths, so training purchases now change *what choices look like in play*, not just a hidden multiplier. This is the depth engine: ~40 techniques across 8 modalities gives event variety that scales with progression, and makes each therapist feel mechanically distinct. Keep the "decision memory" QoL from v1.

**Reflect.** The end-of-session card shows the client's arc advancing (see §5) in one glance — a sentence of narrative, the progress delta, and any breakthrough/plateau/regression beat with its cause stated plainly ("Processing while destabilized → regression risk was 40%"). Transparency here is an approachability feature: players should never feel randomly punished.

The quality formula itself gets one structural change: **diminishing returns above 0.85 and a soft skill cap that rises with practice level**, so "solved" perfect sessions can't happen in Act 2 — mastery is something the whole practice grows into, not a plateau you hit at hour four.

---

## 4. Therapists as people, not stat sticks

Energy stays as the moment-to-moment resource, but the long game of staff management becomes about **people, morale, and retention** — this is Act 3's replacement for the exhausted energy-juggling loop.

Every therapist gets two or three **traits** from a pool of ~20 (Night Owl, Warm, Blunt, Perfectionist, Mentor-at-Heart, Skeptic of Telehealth…), which hook into scheduling, client matching, events, and relationships. Therapists form **relationships** with each other — mentorship pairs grant XP and morale, friendships buffer stress, and occasional frictions generate choice-driven events (two therapists want the same corner office; a supervisee outgrows their mentor). A simple **morale** stat (fed by workload fairness, wins, relationships, office quality, and your event choices) drives the late-game stakes: high-morale veterans perform brilliantly and mentor for free; neglected stars get **poaching offers** from a rival practice, creating tense keep-or-let-go beats. Departures are never sudden — you always see warnings and get a chance to respond.

Career arcs give each hire a shape: junior associates are cheap and hungry, mid-career therapists want specialization support, veterans want autonomy and supervision roles, and eventually a beloved long-tenure therapist may ask to **found a satellite clinic** under your banner — which is a proud legacy moment and an Act 3 mechanic (§8), not a loss.

Burnout is redesigned as **fail-forward**: hitting zero energy triggers a sabbatical arc (2–4 days out, practice absorbs the load, an event chain about what went wrong) and the therapist returns with +max energy and a new trait. It still hurts and you still avoid it, but it produces story instead of a death spiral.

---

## 5. Clients as characters and cases

Clients keep their v1 anatomy (condition, severity, payment, preferences) and gain three layers.

**Identity.** Every client gets a procedurally assembled portrait, a two-line backstory, and a name-style handle. Anonymized dignity stays a value ("A.M., 34, new to the city"), but there is now a face and a sentence to care about.

**Arcs.** Treatment is a visible three-chapter arc (Trust → Work → Consolidation) rather than a bare progress bar, with 1–2 scripted-ish beats drawn from a library keyed to condition and severity: a setback week, a life event (new job, a loss) that shifts their needs mid-treatment, a chapter where they ask for a different modality. Cured clients join an **alumni** pool that quietly matters — alumni send referrals, occasionally return for tune-up sessions, and appear in the practice's success-story wall.

**Complexity as the new snowball brake.** The v1 patience-shrink is removed. Instead, reputation changes *who* is referred to you: higher rep brings a rising share of **complex cases** — comorbid conditions (trauma + substance use), higher severity, court-referred or crisis-adjacent clients — which pay more, award more rep, and demand certified, senior, high-morale staff. Success makes the game *richer*, not more annoying. Alongside this, a **Community Trust** meter tracks whether you also serve ordinary and sliding-scale clients; letting it slide has soft costs (fewer referrals, colder events) and feeding it unlocks community programs. Triage — who gets your limited hours — becomes the defining Act 3 moral-economic decision, which is exactly on-theme.

Later unlocks widen the case types: **couples and family sessions** (two-client sessions needing certification), **group therapy** (6–8 clients, one therapist, its own economics and event set), and **minors** (parent-involvement mechanics).

---

## 6. Programs: the Act 3 content engine

Programs are persistent initiatives you launch and staff, each a small ongoing system with setup cost, weekly upkeep, a dedicated payoff, and its own event flavor: a **Group Therapy** track, **Workshops** (weekend revenue + rep spikes), a **School Partnership** (steady minor referrals, requires child certification), a **Crisis Line** (large Community Trust and rep, heavy energy cost, dramatic events), a **Research Study** (slow burn → a published paper granting a permanent practice-wide bonus and a big celebration), and a **Training Institute** (your supervisors teach externs: income + a pipeline of pre-vetted junior hires). Programs are the "tall vs. wide" strategy layer — you can't run them all well, and which ones you choose expresses your practice's identity.

---

## 7. Practice identity: a mid-game choice that creates replays

Around practice level 3 you commit to a **philosophy** — Trauma-Informed Center, Family & Community Clinic, or Integrative Wellness Studio. Each shifts client referral mix, discounts certain trainings and programs, adds ~10 exclusive techniques and events, and reskins parts of the office aesthetic. It's a light specialization (maybe 20% of content), but it gives distinct runs a distinct flavor and gives the endgame campaign three variants.

---

## 8. The long game: campaign, seasons, and legacy

**The Accreditation Campaign** replaces the "no win state" vagueness with a proper aspirational arc: a multi-stage "Center of Excellence" credential with visible requirements spanning every system (N cures including complex cases, staff morale threshold, a running program, community trust, a site-visit event you prepare for). Completing it is the run's crowning ceremony — and then the game keeps going for players who want it to.

**Seasons.** Time is structured into quarters with gentle meta-shifts — insurance renegotiation windows, a winter demand surge, an economic-cycle dial, a yearly conference event where you can send staff. Quarters give long playthroughs a heartbeat and a natural "one more quarter" hook, and the quarterly **Practice Review** screen (trends, wins, staff notes, one framed suggestion) is both a retention beat and an approachability tool.

**Legacy.** When you're done with a run — or as the reward for satellite clinics and graduated therapists — you bank **Legacy** points into a small permanent tree for future runs: cosmetic office themes, a starting mentor, one carried-over technique, modest early-game boosts. Nothing that trivializes a new run; enough that replays with a different philosophy feel fresh and slightly faster.

---

## 9. Approachability by design

The stated goal is *approachable and fun, never brutal*, supporting long runs without a slow start. Concretely:

**Three difficulty modes.** *Cozy* — bankruptcy is impossible; running out of money triggers a hardship arc (a loan from the mentor NPC with story strings attached) instead of game over. *Standard* — bankruptcy exists but as a 3-stage arc (warning → line of credit → collapse) with clear off-ramps. *Challenge* — v1-style pressure plus complex-case intensity, for players who want it.

**A fast, warm start.** Act 1's small scope *is* the tutorial; the 9-step spotlight system from v1 is retained but shortened, because the design itself now onboards. Week one keeps v1's generosity (doubled arrivals, enthusiasm buffer) and adds a guaranteed-strong first-hire candidate so the pivotal Act 1→2 moment can't whiff.

**No hidden punishments.** Every negative outcome states its cause. Regression odds are shown before risky choices. Burnout and dropout always telegraph. The energy forecast and at-risk badges from v1 stay and get siblings (morale forecast, cash-flow forecast).

**Automation before tedium.** Booking auto-population (v1) → batch booking → policy auto-scheduler, each arriving *just before* the scale that would make manual play a chore.

---

## 10. Art direction: "lamplit clinic"

The v1 UI told you numbers; v2's should make you feel the place. Direction: a hand-illustrated, storybook-cozy interface — think a warmly lit evening office rather than a SaaS dashboard — while deliberately avoiding the current AI-default looks (cream + terracotta serif, or black + acid green).

**Palette (working tokens).** Ink teal `#1E3A3A` (text, lines), lamplight amber `#E8A94C` (primary accents, highlights, the literal lamps), paper cream `#FAF5EC` (surfaces), sage `#8FAF8B` (growth, progress, cures), dusty plum `#8B6B8F` (rest, night, energy), soft brick `#C2634F` (warnings, used sparingly). Day/night ambient tinting shifts the whole scene as the clock runs — the office glows amber at 5 PM, which makes the daily rhythm *felt*.

**Typography.** A characterful rounded display face for headings and celebration moments (e.g., Bricolage Grotesque or Fraunces set soft), a friendly humanist body face (Nunito Sans), and a compact tabular face for schedules and money so data stays crisp inside the warmth.

**The signature element: the living office.** The PixiJS scene graduates from floor plan to the game's home screen — a cutaway "dollhouse" cross-section where therapist and client characters walk, sit, and session in real time, doors close during sessions with a soft progress ring, the coffee machine actually steams, plants grow as upgrades land, and cured clients wave goodbye at the door. Panels (schedule, clients, staff, finances) slide over this scene rather than replacing it. One aesthetic risk, spent here: session progress and client arcs are visualized as **growing plants** — a sprout on the client card that leafs, buds, and blooms at cure, echoed by real plants accumulating in the office. It's thematically honest (growth takes tending) and gives the whole UI a unifying motif.

**Characters.** A layered procedural portrait system (base shapes × palettes × hair × accessories × idle animation) so ~50 assets yield thousands of distinct, charming people. Traits and modalities get visual tells (the Somatic therapist has a yoga mat; the Night Owl gets sleepy sprite animations before noon).

**Juice budget.** Keep and extend v1's celebration layer: cure ceremonies with confetti-petals, level-up glow, milestone toasts, gentle ambient sound bed with per-room audio, and a "photo wall" of framed success stories that physically fills up over a run. Respect reduced-motion preferences and offer a "calm mode" that tones down effects.

---

## 11. Technical architecture (for building in Claude Code)

**Stack.** TypeScript + Vite. React for all UI panels/overlays; PixiJS v8 for the office scene, mounted in a React shell; Zustand (or the existing event-bus + reducers pattern, formalized) for state; Tailwind for panel styling with the token palette above; Howler for audio.

**The one non-negotiable: a headless simulation core.** Extract the entire game sim — clock, RNG, entities, events, economy — into a pure TypeScript package with zero DOM/Pixi dependencies, driven by a fixed tick and a **seedable RNG**. The UI subscribes to the same event bus v1 already had (`session_completed`, `DAY_STARTED`…), which was genuinely good architecture and should be kept. This buys three things that directly attack v1's failures: (1) a **balance harness** — a script that runs 1,000 simulated 200-day runs overnight and reports curves (cash, rep, quality distribution, dropout, burnout) so late-game breakdown is *measured*, not discovered by players; (2) fast unit tests for every formula and event; (3) deterministic replays for debugging. This is also the ideal shape for iterating with Claude Code, which can write and run headless balance experiments without touching the UI.

**Data-driven content.** Techniques, traits, events, client arcs, programs, milestones, and testimonials all live in typed JSON/TS content files with a validation script — so adding the 40th technique or a new event chain is a content PR, not an engine change, and Claude Code can generate/lint content at scale.

**Saves.** Keep v1's versioned migrations; add an autosave ring buffer and export/import (a file download — no browser-storage assumptions in any artifact prototyping).

---

## 12. Build roadmap

**Phase 0 — Foundations (the unglamorous week).** Repo scaffold; headless sim package with clock, seedable RNG, event bus, entity stores; balance-harness CLI producing CSV/plots; save/migration plumbing; content-file schema + validator. Exit test: simulate 100 days headless with stub content, deterministic across runs.

**Phase 1 — Act 1 vertical slice.** Solo therapist, 5 clients with portraits and arcs, plan/play/reflect sessions with ~10 techniques, energy, money-lite, day cycle, and a *placeholder* office scene. This slice is the fun test: if Act 1 isn't charming here, fix it before scaling.

**Phase 2 — Act 2: the practice.** Hiring with traits, scheduling UI, training/certifications, insurance panels, at-risk & dropout, morale v1, the first-hire story beat, difficulty modes, bankruptcy arc. Run the balance harness hard here.

**Phase 3 — The living office.** PixiJS dollhouse scene with characters, ambient day/night, plant motif, panel-over-scene layout, celebration layer, audio. (Deliberately after Phase 2 so the scene renders real systems.)

**Phase 4 — Act 3: the institution.** Auto-scheduler policies, complex cases + Community Trust, programs (ship 3 of the 6 first), relationships/poaching/satellites, practice philosophies.

**Phase 5 — The long game & polish.** Accreditation campaign, seasons + quarterly review, legacy tree, remaining programs, content pass to ~40 techniques / ~60 events / ~30 client arc beats, calm mode, onboarding polish, soundtrack.

Each phase ends with a playable build and a balance-harness report — the discipline that keeps v2 from re-inheriting v1's invisible late-game rot.

---

## 13. Open design questions (good first discussions)

Whether therapist relationships should ever produce hard conflict (a resignation) or stay soft in keeping with the cozy tone; whether the player's own therapist should remain playable forever or gracefully retire into a director role in Act 3; how sessions should feel at 3× speed once techniques exist (probably: decision events always pause, everything else compresses); whether philosophies should be permanent per-run or respec-able; and how far to push the client-arc writing before it needs a real content pipeline.
