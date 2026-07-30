# Future work

Written at the end of the initial build. Ordered roughly by value per unit of effort within each
section. Items marked **⚑** are the ones I would do first.

---

## 1. Balance gaps the harness can see but does not yet cover

**⚑ An adversarial autoplay policy.** `tools/autoplay.ts` models a *reasonable* player at varying
competence, but even at `--skill 0` it never does the genuinely wrong thing — it will not assign a
CBT therapist to an acute trauma case, work an exhausted therapist, or accept forty clients it
cannot see. As a result **"poor" sessions are ~0% in every sweep**, which almost certainly
understates how bad a real first hour can feel. Add a second policy (`--policy adversarial`) that
deliberately mismatches, over-accepts and over-books, and re-check the low end of the grade
distribution.

**⚑ The harness smooths away pacing problems.** Both event bugs found during the build —
repetition within days, and a modal count that would have hit ~5/day late game — were invisible
in the statistical report and obvious in the first minute of `tools/playtest.ts`, which narrates
a single run in order. Any new system that produces *moments* rather than *numbers* needs a
playtest read, not just a sweep. Consider adding per-run frequency assertions to the harness
(no event twice in N days; modals per day under a ceiling) so these fail loudly next time.

**Cozy has no late-game choices.** Every Cozy run owns all 26 upgrades and runs 3 programs by day
200. Either add a genuinely expensive top tier that even a rich practice must choose between, or
accept it as correct for the mode and say so in the UI.

**Poaching and departures are untested at scale.** They are covered by unit tests but the harness
produces ~0.05 departures per run because the bot keeps morale healthy. A "neglectful" policy
would exercise the retention game properly.

**The `--skill` axis is coarse.** It is one scalar applied to every decision. Splitting it into
per-domain competence (scheduling vs. hiring vs. event choices) would show which subsystem is
actually carrying a run.

**No sensitivity sweep.** The harness runs a fixed constant set. A `--sweep SKILL_CAP_BY_LEVEL`
mode that perturbs one constant across a range and reports which output curves move would turn
retuning from craft into measurement.

## 2. Systems that are implemented but thin

**⚑ Couples, family and group sessions.** The types, certifications, rates and session-type
plumbing all exist, and `generateClient` can produce them — but nothing currently *routes* them
into the referral stream once the certification is bought. They need: a referral path gated on the
certification, a two-client session view, and their own event set. This is the largest gap between
the concept plan and the build.

**Satellite clinics.** `ev_staff_satellite_clinic` fires and reads beautifully, but choosing it is
currently a one-off narrative beat rather than an ongoing system. The plan describes it as a
legacy mechanic — a departing veteran founding a clinic under your banner that keeps sending
referrals and paying a small royalty.

**Minors and parent involvement.** `up_child_certification` gates the School Partnership, and the
generator produces under-18 clients for family sessions, but there is no parent-involvement
mechanic.

**Insurance panels.** Re-authorisation fires as an event when a client exhausts their authorised
sessions, but there is no panel-management layer — negotiating rates, joining or leaving networks.

**Relationship depth.** Therapists form and hold relationship scores, mentorship works, and
friction events fire, but the scores mostly move through events rather than through *play*.
Working adjacent slots, sharing a client, or covering a sabbatical should move them.

**The economic-cycle dial** described in the seasons section is not implemented. Quarters exist
and the Practice Review fires; the macro dial does not.

## 3. Content

The current set is complete enough to play a full run without heavy repetition, but the concept
plan's targets are higher in two places:

| | Built | Plan target |
| --- | --- | --- |
| Techniques | 48 | ~40 ✓ |
| Events | 62 | ~60 ✓ |
| Arc beats | 42 | ~30 ✓ |
| Traits | 22 | ~20 ✓ |
| Testimonials | 45 | — |

What is actually thin:

- **Condition coverage is uneven.** `psychosis` and `behavioral` have the fewest arc beats and
  technique affinities, and they are the two that appear latest, so a long run notices.
- **Philosophy-exclusive content.** Each philosophy has 2–3 signature techniques but no exclusive
  *events*, so the three identities feel more similar in play than the plan intends.
- **Program events.** One per program. Three or four each would let a program's flavour build.
- **Late-game events.** Most `once: true` beats fire before day 60. Days 120–200 are mechanically
  rich but narratively quiet.

## 4. UI and presentation

**⚑ The office scene has no interaction.** It renders the practice living its day, but you cannot
click a room to open that therapist's card, or a waiting client to see who they are. That is the
cheapest large win available — the scene is already the home screen, it just is not a control
surface yet.

**Panels and the morning brief overlap.** Opening a panel while the day-start or day-end card is
up leaves the two competing for the same space. The panel should either dismiss the card or dock
beside it.

**Panel state is not remembered.** Sort orders, filters and the expanded client all reset when a
panel closes.

**The session overlay overflows a 720px viewport.** It scrolls, but the third and fourth
technique cards sit below the fold on a short screen, which undersells the choice. A two-column
grid that fits four cards in 640px would be better.

**No keyboard navigation between panels.** Space and 1/2/3 drive the clock, and the technique
cards take 1–4, but there is no way to move between panels without the mouse.

**Mobile is unhandled.** The layout assumes a desktop viewport. Panels are already
`max-width`-constrained, so a small-screen pass is plausible but has not been attempted.

**Localisation.** All copy is inline English. Extracting strings would be a large mechanical change
and is much cheaper now than after another content pass.

**The photo wall does not persist across runs.** Legacy points carry over; the alumni do not. A
permanent wall spanning every run would be a strong meta hook.

## 5. Technical

**No end-to-end tests.** The sim is well covered; the React layer is not tested at all. A
Playwright pass driving a full day — book, run, choose a technique, read the reflect card, close
the day — would catch integration regressions that typechecking cannot.

**Bundle size is unmeasured.** Pixi is the bulk of it and is already lazy-loaded, but nothing
tracks the number.

**No replay tooling.** The sim is deterministic and actions are serialisable, so recording an
action log and replaying it would be nearly free — and would make bug reports reproducible.

**Save migrations are untested against real old saves.** `migrate()` has unit coverage for
synthetic v1-shaped objects, but no fixture files captured from actual earlier builds.

**Accessibility beyond the basics.** Controls are real buttons with labels and visible focus, and
reduced-motion and calm mode are respected, but there has been no screen-reader pass and no
contrast audit of the amber-on-cream combinations.

**The `state.flags` write-through pattern.** Three UI surfaces mutate a flag directly and dispatch
a no-op to force a publish, because those flags have no dedicated action. Each site is commented.
If a fourth appears, add real actions instead.

## 6. Open design questions

These were flagged as good first discussions in the concept plan and remain open:

- **Should therapist friction ever produce a resignation the player cannot prevent?** Currently it
  cannot — every departure has a warning and a counter-offer. That is warmer, but it means staff
  retention has no true failure state.
- **Should the player's own therapist retire into a director role in Act 3?** They currently stay
  playable forever, which is simple but slightly undercuts the act structure.
- **Should philosophies be respec-able?** They are permanent per run today.
- **How far can the client-arc writing scale** before it needs a real content pipeline rather than
  hand-authored TypeScript?
- **3× speed with technique cards.** Decision events always pause, which is right, but at 4× a
  busy day becomes a sequence of modals. A "let the team handle routine sessions" threshold —
  auto-resolving only high-confidence picks — might be better than the current all-or-nothing
  `autoTechnique` toggle.
