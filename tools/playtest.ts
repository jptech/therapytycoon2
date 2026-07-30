/**
 * A narrated single run. Where balance.ts answers "are the curves right across a
 * thousand runs", this answers "what does one run actually feel like" — it
 * prints the story beats, the events chosen, the goodbyes and the crises in
 * order, so design problems that statistics smooth away become visible.
 *
 *   bun run tools/playtest.ts
 *   bun run tools/playtest.ts --seed 7 --days 90 --difficulty challenge
 *   bun run tools/playtest.ts --verbose        # every session, not just notable ones
 */
import { EventBus } from '../src/sim/bus';
import { Game, capacity, dailyExpenses } from '../src/sim/engine';
import { activeTherapists } from '../src/sim/eventsys';
import { autofillSchedule } from '../src/sim/scheduler';
import { CONDITION_LABELS, SEVERITY_LABELS } from '../src/sim/balance';
import { formatMoney } from '../src/sim/util';
import type { Difficulty } from '../src/sim/types';

const argv = process.argv.slice(2);
const arg = (flag: string, dflt: string) => {
  const i = argv.indexOf(flag);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt;
};

const seed = Number(arg('--seed', '2024'));
const days = Number(arg('--days', '60'));
const difficulty = arg('--difficulty', 'standard') as Difficulty;
const verbose = argv.includes('--verbose');

const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
const amber = (s: string) => `\x1b[33m${s}\x1b[0m`;
const sage = (s: string) => `\x1b[32m${s}\x1b[0m`;
const brick = (s: string) => `\x1b[31m${s}\x1b[0m`;
const plum = (s: string) => `\x1b[35m${s}\x1b[0m`;

const bus = new EventBus();
const game = Game.create({ seed, difficulty, skipTutorial: true }, bus);
const s = game.state;

console.log(bold(`\n  ${s.practiceName}`));
console.log(dim(`  seed ${seed} · ${difficulty} · ${days} days\n`));

bus.on('SESSION_COMPLETED', ({ result }) => {
  const c = s.clients.find((x) => x.id === result.clientId);
  const t = s.therapists.find((x) => x.id === result.therapistId);
  if (!c || !t) return;
  const notable = result.breakthrough || result.regression || result.cured || result.grade === 'poor';
  if (!notable && !verbose) return;
  const tag = result.breakthrough
    ? sage('breakthrough')
    : result.regression
      ? brick('regression')
      : result.grade;
  console.log(
    `  ${dim(`d${s.day}`)} ${c.handle} with ${t.name.split(' ')[0]} · ${result.focus} · ${tag} ` +
      dim(`(${result.quality.toFixed(2)}, ${result.progressDelta > 0 ? '+' : ''}${result.progressDelta})`),
  );
  if (result.beat) console.log(dim(`        “${result.beat.text}”`));
  else if (notable) console.log(dim(`        ${result.narrative}`));
});

bus.on('CLIENT_CURED', ({ alumni }) => {
  console.log(
    sage(`  d${s.day} ✿ ${alumni.handle} finished after ${alumni.sessions} sessions with ${alumni.therapistName}.`),
  );
  console.log(dim(`        “${alumni.testimonial}”`));
});

bus.on('CLIENT_DROPPED', ({ clientId }) => {
  const c = s.clients.find((x) => x.id === clientId);
  console.log(brick(`  d${s.day} ✕ ${c?.handle ?? clientId} stopped coming.`));
});

bus.on('THERAPIST_HIRED', ({ therapistId }) => {
  const t = s.therapists.find((x) => x.id === therapistId);
  if (t) console.log(amber(`  d${s.day} ✚ ${t.name} joined — ${t.stage}, skill ${Math.round(t.skill)}, ${t.traits.join(', ')}`));
});

bus.on('THERAPIST_BURNOUT', ({ therapistId }) => {
  const t = s.therapists.find((x) => x.id === therapistId);
  console.log(brick(`  d${s.day} ⚑ ${t?.name} hit the wall and is taking ${t?.statusDays} days.`));
});

bus.on('THERAPIST_DEPARTED', ({ therapistId }) => {
  const t = s.therapists.find((x) => x.id === therapistId);
  console.log(brick(`  d${s.day} ⇠ ${t?.name} left.`));
});

bus.on('PRACTICE_LEVELED', ({ level }) => {
  console.log(amber(`  d${s.day} ▲ Practice level ${level} — capacity ${capacity(s)}.`));
});

bus.on('ACT_CHANGED', ({ act }) => {
  const names = { 1: 'The Therapist', 2: 'The Practice Owner', 3: 'The Director' } as const;
  console.log(bold(plum(`\n  ── Act ${act}: ${names[act]} (day ${s.day}) ──\n`)));
});

bus.on('MILESTONE_EARNED', ({ milestoneId }) => {
  console.log(dim(`  d${s.day} ★ ${milestoneId}`));
});

bus.on('CAMPAIGN_STAGE', ({ stageId }) => {
  console.log(amber(`  d${s.day} 🏛 Accreditation stage: ${stageId}`));
});

bus.on('PROGRAM_LAUNCHED', ({ programId }) => {
  console.log(amber(`  d${s.day} ✧ Launched ${programId}.`));
});

// ── The player ──────────────────────────────────────────────────────────────

function resolveEvents(): void {
  let guard = 0;
  while (s.pendingEvents.length && guard++ < 40) {
    const p = s.pendingEvents[0];
    if (p.techniqueCards?.length) {
      const best = [...p.techniqueCards].sort((a, b) => {
        const rank = (h: string) => (h === 'strong' ? 3 : h === 'solid' ? 2 : h === 'risky' ? 1 : 0);
        return (
          rank(b.preview.qualityHint) -
          b.preview.regressionChance * 3 -
          (rank(a.preview.qualityHint) - a.preview.regressionChance * 3)
        );
      })[0];
      game.dispatch({ type: 'CHOOSE_TECHNIQUE', instanceId: p.instanceId, techniqueId: best.techniqueId });
      continue;
    }
    const choice = p.choices[0];
    console.log(plum(`  d${s.day} ◆ ${p.title}`));
    console.log(dim(`        → ${choice.label}${choice.hint ? dim(` (${choice.hint})`) : ''}`));
    game.dispatch({ type: 'RESOLVE_EVENT', instanceId: p.instanceId, choiceId: choice.id });
  }
}

let guard = 0;
while (s.day <= days && !s.ended && guard++ < days * 5000) {
  if (s.dayPhase === 'morning_brief') {
    resolveEvents();
    const cap = capacity(s);
    const serveable = activeTherapists(s).length * 10;
    for (const c of s.clients.filter((x) => x.status === 'waitlist')) {
      if (s.clients.filter((x) => x.status === 'active').length >= Math.min(cap, serveable)) break;
      game.dispatch({ type: 'ACCEPT_CLIENT', clientId: c.id });
    }
    if (s.candidates.length && s.cash > s.candidates[0].askingSalary * 3 + 2500) {
      game.dispatch({ type: 'HIRE', candidateId: s.candidates[0].therapist.id });
    }
    if (s.flags.philosophyAvailable && !s.philosophy) {
      game.dispatch({ type: 'CHOOSE_PHILOSOPHY', philosophy: 'trauma_informed' });
    }
    autofillSchedule(s, game.rng);
    game.dispatch({ type: 'START_DAY' });
  } else if (s.dayPhase === 'running') {
    if (s.pendingEvents.length) resolveEvents();
    else game.dispatch({ type: 'TICK', dtMinutes: 10 });
  } else {
    if (s.day % 14 === 0) {
      const staff = activeTherapists(s);
      console.log(
        dim(
          `  ── d${s.day}: ${formatMoney(s.cash)} · rep ${Math.round(s.reputation)} · trust ${Math.round(s.communityTrust)} · ` +
            `${staff.length} staff · ${s.clients.filter((c) => c.status === 'active').length} clients · ` +
            `${s.stats.cures} cures · ${formatMoney(dailyExpenses(s))}/day out`,
        ),
      );
    }
    game.dispatch({ type: 'END_DAY' });
    resolveEvents();
  }
}

// ── The wrap-up ─────────────────────────────────────────────────────────────

console.log(bold(`\n  After ${Math.min(s.day, days)} days at ${s.practiceName}\n`));
const q = s.stats.qualityCount ? s.stats.qualitySum / s.stats.qualityCount : 0;
console.log(`  ${formatMoney(s.cash)} in the account · level ${s.practiceLevel} · reputation ${Math.round(s.reputation)} · trust ${Math.round(s.communityTrust)}`);
console.log(`  ${s.stats.sessionsRun} sessions at ${q.toFixed(2)} average quality`);
console.log(`  ${s.stats.cures} people finished treatment (${s.stats.complexCures} complex), ${s.stats.dropouts} stopped coming`);
console.log(`  ${s.stats.breakthroughs} breakthroughs · ${s.stats.regressions} regressions · ${s.stats.burnouts} sabbaticals`);
console.log(`  ${s.milestonesEarned.length} milestones · ${s.campaign.completed.length}/5 accreditation stages${s.campaign.accredited ? ' · ACCREDITED' : ''}`);
if (s.ended) console.log(brick(`  Run ended: ${s.ended.kind} on day ${s.ended.day}`));

console.log(bold('\n  The team\n'));
for (const t of activeTherapists(s)) {
  console.log(
    `  ${t.name.padEnd(22)} ${String(t.stage).padEnd(8)} skill ${String(Math.round(t.skill)).padStart(3)} · ` +
      `morale ${String(Math.round(t.morale)).padStart(3)} · strain ${String(Math.round(t.strain)).padStart(3)} · ` +
      `${t.stats.cures} goodbyes · ${t.traits.join(', ')}`,
  );
}

console.log(bold('\n  On the wall\n'));
for (const a of s.alumni.slice(0, 8)) {
  console.log(`  ${a.handle} · ${CONDITION_LABELS[a.condition]} · ${a.sessions} sessions · day ${a.curedDay}`);
  console.log(dim(`     “${a.testimonial}”`));
}

console.log(bold('\n  Still in the room\n'));
for (const c of s.clients.filter((x) => x.status === 'active').slice(0, 10)) {
  console.log(
    `  ${c.handle}, ${c.age} · ${CONDITION_LABELS[c.condition]} (${SEVERITY_LABELS[c.severity]})` +
      `${c.complex ? ' · complex' : ''} · ${c.chapter} · ${Math.round(c.progress)}%` +
      `${c.atRisk ? brick(' · at risk') : ''}`,
  );
  console.log(dim(`     ${c.backstory}`));
}
console.log('');
