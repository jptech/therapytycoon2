# Therapy Tycoon II — The Lamplit Clinic

A cozy, web-based practice-management sim where the product is care. You start as a solo
therapist with three people on your waitlist and grow into a beloved community institution —
and the central promise is that **your job changes as you grow**.

```bash
bun install
bun run dev
```

Then open the printed URL. The game autosaves every day; `Continue` on the title screen picks
up where you left off.

---

## The shape of a run

The game is explicitly built as **three acts**, each with a different player role. Each act's
systems are the automation of the previous act's chores — which is how a 20-hour playthrough
avoids going stale, and how the early game stays small and intimate rather than being a
crippled version of the full game.

| Act | Days | You are | The verb |
| --- | --- | --- | --- |
| **I — The Therapist** | 1–14 | Your own therapist, 3–5 clients | Running sessions |
| **II — The Practice Owner** | ~15–55 | An employer | Hiring, scheduling, cash flow |
| **III — The Director** | ~55+ | An institution-builder | Writing policies, launching programs |

The acts are not hard-gated modes — they are an experience curve created by unlock pacing.
A player who enjoys hand-booking every hour can keep doing it forever.

## The session loop

Every session has three beats:

1. **Plan** — pick a focus. *Stabilize* (safe, restores the client's footing), *Process* (big
   progress, costly, genuinely risky if they are not ready), or *Build Skills* (steady progress,
   raises the resilience that protects against future regression). The right choice depends on
   the client's state; a destabilised client punished for Processing too early is the game
   teaching real therapeutic pacing.
2. **Play** — mid-session, pick a **technique card** drawn from that therapist's learned
   repertoire. A CBT therapist offers *Thought Record*; an EMDR therapist offers *Bilateral
   Processing*. Training purchases change what your choices actually look like in play, not
   just a hidden multiplier.
3. **Reflect** — a card showing the client's arc advancing, the progress delta, and any
   breakthrough, plateau or regression **with its cause stated plainly**.

## Design commitments

- **No hidden punishments.** Every negative outcome states its cause. Regression odds are shown
  *before* you commit to a risky choice. Burnout and dropout always telegraph.
- **Success creates new decisions, not friction.** Reputation doesn't make clients less patient;
  it changes *who is referred to you*. Higher standing brings complex, comorbid, higher-severity
  cases that pay more and demand more.
- **Approachable, never brutal.** On *Cozy*, bankruptcy is impossible — running out of money
  triggers a hardship arc, not a game over.
- **Anonymised dignity.** Clients appear as "A.M., 34" with a face, a two-line backstory and a
  visible arc. They are people, not stat blocks.

## Documentation

| Document | What's in it |
| --- | --- |
| [docs/DESIGN.md](docs/DESIGN.md) | Every system, and which v1 failure it answers |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Code layout, the sim/UI contract, how to extend |
| [docs/BALANCE.md](docs/BALANCE.md) | The harness, the current curves, how to retune |
| [docs/CONTENT.md](docs/CONTENT.md) | Adding techniques, events, arcs and programs |
| [docs/PROGRESS.md](docs/PROGRESS.md) | What was built, in what order, and why |
| [FUTURE_WORK.md](FUTURE_WORK.md) | Known gaps and the next things worth doing |

## Commands

```bash
bun run dev          # dev server
bun run build        # production build
bun run test         # vitest suite (sim formulas, save migrations, content integrity)
bun run typecheck    # tsc --noEmit
bun run balance      # headless balance harness — see docs/BALANCE.md
```

The balance harness is the discipline that keeps this from re-inheriting v1's invisible
late-game rot:

```bash
bun run balance -- --runs 60 --days 200 --difficulty cozy,standard,challenge --csv balance-out
```

## Stack

TypeScript · Vite · React 19 · PixiJS v8 (the living office scene) · Zustand · Tailwind v4 ·
Web Audio (all sound is synthesised — there are no audio assets and no network requests).
