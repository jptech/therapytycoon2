# Adding content

Techniques, traits, events, arc beats, programs, philosophies, upgrades, trainings, milestones and
campaign stages all live in typed files under `src/content/`. Adding the 49th technique is a data
change, never an engine change.

Everything is re-exported and indexed by `src/content/index.ts`. The sim never reaches into a
specific content module — it reads `techniqueById`, `eventsByScope`, `beatsByChapter` and friends.

Run `bun run test` after any content change: `src/sim/content.test.ts` checks that every
cross-reference resolves, every id is unique, and every effect magnitude is in range.

## ID conventions

| Kind | Pattern | Example |
| --- | --- | --- |
| Technique | `<modality>_<snake_name>` | `cbt_thought_record` |
| Trait | `trait_<snake_name>` | `trait_night_owl` |
| Event | `ev_<scope>_<snake_name>` | `ev_staff_corner_office` |
| Arc beat | `beat_<snake_name>` | `beat_first_time_crying` |
| Upgrade | `up_<snake_name>` | `up_group_room` |
| Training | `train_<modality>_<tier>` | `train_emdr_2` |
| Milestone | `ms_<snake_name>` | `ms_first_goodbye` |
| Campaign stage | `camp_<n>_<snake_name>` | `camp_3_outcomes_review` |

## Adding a technique

Techniques are the cards the player picks mid-session, so they are the depth engine. A good one is
*situationally* right and wrong, not globally strong.

```ts
{
  id: 'dbt_opposite_action',
  name: 'Opposite Action',
  modality: 'dbt',
  tier: 2,
  blurb: 'Name the urge, then do the opposite of what it wants, on purpose.',
  flavor: 'She went to the party. She hated forty minutes of it and stayed for the rest.',
  focuses: ['build_skills'],
  goodFor: ['depression', 'anxiety'],
  poorFor: ['trauma'],
  chapters: ['work', 'consolidation'],
  minStability: 0.5,
  effects: { progress: 1.15, resilience: 0.06, energy: 2, regression: 0.9 },
}
```

Guidance that keeps the card pool honest:

- **Every technique needs at least one `goodFor`**, and about half should have a `poorFor` — a bad
  pick has to be possible, and it has to be legible.
- Restrict roughly a third by `chapters`, and most by `focuses`. A card that is fine everywhere is
  a card that never creates a decision.
- Set `minStability` (0.5–0.7) on genuinely activating work — exposure, trauma processing, chair
  work. The UI shows the client's current stability against it.
- Potent `progress` must be paid for somewhere: energy, stability, or `regression` above 1.
- Ranges: `progress` 0.8–1.45, `quality` −0.04…+0.09, `rapport`/`stability`/`resilience`
  −0.08…+0.10, `energy` 0–5, `regression` 0.5–1.5, `breakthrough` 0–0.08.
- Tier 3 cards are stronger but narrower.
- If you set `philosophy`, the technique is granted to the whole practice when that philosophy is
  chosen — and is unreachable otherwise, so it must not be a training's `grants` target.

Then add it to the right `TrainingDef.grants` in `trainings.ts`, or it will never reach a
therapist.

## Adding an event

```ts
{
  id: 'ev_client_asks_to_end',
  scope: 'client',
  title: 'They think they are done',
  body: '{client} says the thing that brought them in has stopped running the show...',
  weight: 3,
  chapters: ['consolidation'],
  mood: 'warm',
  choices: [
    {
      id: 'agree',
      label: 'Agree, and plan a proper ending',
      hint: 'Ends treatment sooner. A clean goodbye is worth reputation.',
      effects: { clientProgress: 12, reputation: 2 },
      outcome: 'You spend the hour on what they will do when it gets hard again.',
    },
    // …
  ],
}
```

Rules the whole event set holds to:

- **2–4 choices, and every choice states its consequence in `hint`.** The hint must not lie or
  omit the main cost. This is a design commitment, not a style preference — the UI renders the
  hint directly beneath the label, and also renders a derived preview of `effects`.
- Real dilemmas: time vs. money, this client vs. the waitlist, the rule vs. the person. If one
  option is obviously correct, the event is not doing its job.
- Use `requires` on a choice to unlock a better path when the player has the resource, trait or
  standing for it.
- Set `once: true` on story-heavy beats and `minDay` on anything that assumes an established
  practice.
- Magnitudes: cash ±80–1500, reputation ±1–6, communityTrust ±1–8, clientRapport ±0.05–0.15,
  clientStability ±0.05–0.2, clientPatience ±5–25, therapistMorale ±3–12.
- Tokens `{client}`, `{clientFirst}`, `{therapist}`, `{therapistFirst}`, `{practice}` are
  substituted at runtime.

`scope` determines when it can fire: `client` (after a session), `staff` / `day` / `practice`
(overnight), `program` (while that program runs), `session` (reserved for the technique beat).

## Adding an arc beat

Beats are the narrative spine — a sentence or two of a real person's life, plus a small
mechanical nudge. Keyed by `chapter`, optionally by `conditions` and severity band.

Keep effects small (stability ±0.05–0.18, rapport ±0.04–0.12, progress ±3–8) and let the writing
carry the weight. Rarer, more dramatic beats get lower `weight`. A beat can raise a full event via
`event`, and can add a comorbidity mid-treatment via `effects.addComorbidity` — which is how a
life event genuinely shifts what a client needs.

## Tone

Warm, specific, humane; never clinical-cold and never twee. Clients are people, not diagnoses.
Real modality vocabulary and real pacing wisdom — you do not process trauma with an unstable
client. Anonymised dignity: clients are "A.M., 34" in the UI. Concrete images beat adjectives, and
every line should still be worth reading the tenth time you see it.
