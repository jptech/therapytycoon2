/**
 * Replays a recorded run.
 *
 * The sim is a pure function of (state, action, rng), so a log of dispatched
 * actions is a complete description of a run. Hand one of these over with a bug
 * report and the bug arrives with it.
 *
 *   bun run replay run.json                 # replay it and say how it went
 *   bun run replay run.json --verify        # check it reproduces; exit 1 if not
 *   bun run replay run.json --until 40      # stop on day 40 and look around
 *   bun run replay run.json --verify --quiet
 *
 * Produce one with `bun run playtest --record run.json`, or from the browser:
 * the crash screen's "Export the run" writes it, and `__tt.saveReplay()` does
 * the same on demand.
 */
import { readFileSync } from 'node:fs';
import { REPLAY_FORMAT, SAVE_VERSION } from '../src/sim/balance';
import { EventBus } from '../src/sim/bus';
import { capacity, dailyExpenses } from '../src/sim/engine';
import { activeTherapists } from '../src/sim/eventsys';
import { parseReplay, replay, type ReplayLog } from '../src/sim/replay';
import { CONDITION_LABELS } from '../src/sim/balance';
import { formatMoney } from '../src/sim/util';

const argv = process.argv.slice(2);
const flag = (name: string) => argv.includes(name);
const arg = (name: string, dflt?: string) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt;
};

const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
const amber = (s: string) => `\x1b[33m${s}\x1b[0m`;
const sage = (s: string) => `\x1b[32m${s}\x1b[0m`;
const brick = (s: string) => `\x1b[31m${s}\x1b[0m`;

/** Flags that swallow the token after them, so it is not the filename. */
const VALUED = new Set(['--until']);
const positional: string[] = [];
for (let i = 0; i < argv.length; i++) {
  if (argv[i].startsWith('--')) {
    if (VALUED.has(argv[i])) i += 1;
    continue;
  }
  positional.push(argv[i]);
}

const file = positional[0];
if (!file) {
  console.error('  Usage: bun run replay <log.json> [--verify] [--until <day>] [--quiet]');
  process.exit(2);
}

const verify = flag('--verify');
const quiet = flag('--quiet');
const untilDay = arg('--until') ? Number(arg('--until')) : undefined;

let log: ReplayLog | undefined;
try {
  log = parseReplay(readFileSync(file, 'utf8'));
} catch (err) {
  console.error(brick(`  Could not read ${file} — ${(err as Error).message}`));
  process.exit(2);
}
if (!log) {
  console.error(brick(`  ${file} is not a replay log. (A save file is a different thing — it has a "state" key.)`));
  process.exit(2);
}

// ── What we are about to replay ─────────────────────────────────────────────

const totalDispatches = log.entries.reduce((a, e) => a + (e.n ?? 1), 0);
const lastCheckpoint = log.checkpoints[log.checkpoints.length - 1];
const origin =
  log.origin.kind === 'new'
    ? `seed ${log.origin.options.seed} · ${log.origin.options.difficulty ?? 'standard'}`
    : `resumed from a save at day ${log.origin.state.day}`;

console.log(bold(`\n  ${log.label}`));
console.log(
  dim(
    `  ${origin} · ${log.entries.length} entries / ${totalDispatches} actions · ` +
      `${log.checkpoints.length} checkpoints through day ${lastCheckpoint?.day ?? '?'}\n`,
  ),
);

if (log.format !== REPLAY_FORMAT) {
  console.log(
    amber(
      `  ⚠ This log is format ${log.format}; this build records format ${REPLAY_FORMAT}. ` +
        'The entries may not mean what this build thinks they mean — read any drift below as that,\n' +
        '    not as a sim bug.\n',
    ),
  );
}
if (log.saveVersion !== SAVE_VERSION) {
  console.log(
    amber(
      `  ⚠ Recorded on save version ${log.saveVersion}; this build is ${SAVE_VERSION}. ` +
        'A drift below may be the version gap rather than a bug.\n',
    ),
  );
}
if (log.truncated) {
  console.log(amber('  ⚠ This log was truncated while recording — it stops short of where the run did.\n'));
}

// ── The replay ──────────────────────────────────────────────────────────────

const bus = new EventBus();
const started = Date.now();
const result = replay(log, {
  untilDay,
  verify: verify || undefined,
  bus,
  onCheckpoint: quiet
    ? undefined
    : (c) => {
        if (c.day % 25 === 0) console.log(dim(`  ✓ day ${c.day}`));
      },
});
const elapsed = Date.now() - started;
const s = result.state;

if (result.divergence) {
  const d = result.divergence;
  const entry = log.entries[d.entryIndex];
  console.log(
    brick(
      `\n  ✕ Diverged on day ${d.day} — ${result.verified} checkpoint${result.verified === 1 ? '' : 's'} matched, ` +
        'then the state stopped agreeing.',
    ),
  );
  console.log(dim(`      after entry ${d.entryIndex} of ${log.entries.length} (${d.dispatched} actions in)`));
  if (entry) console.log(dim(`      last action: ${describe(entry.action)} at day ${entry.day}, minute ${entry.minute}`));
  console.log(dim(`      expected ${d.expected.slice(0, 32)}…`));
  console.log(dim(`      got      ${d.actual.slice(0, 32)}…`));
  console.log(
    dim(
      '\n      Either the log was edited, or something in the sim stopped being a pure\n' +
        '      function of (state, action, rng) between the recording and this build.\n',
    ),
  );
  process.exit(1);
}

// ── The run it rebuilt ──────────────────────────────────────────────────────

if (verify) {
  console.log(
    sage(
      `\n  ✓ Reproduced exactly — ${result.verified} checkpoint${result.verified === 1 ? '' : 's'} through day ${s.day}, ` +
        `${result.dispatched} actions in ${elapsed}ms.\n`,
    ),
  );
} else {
  // Checkpoints are compared whether or not --verify was asked for; the flag
  // only decides whether a clean reproduction is worth saying out loud.
  console.log(
    dim(`\n  Replayed ${result.dispatched} actions in ${elapsed}ms · ${result.verified} checkpoints agreed.\n`),
  );
}

const q = s.stats.qualityCount ? s.stats.qualitySum / s.stats.qualityCount : 0;
console.log(bold(`  ${s.practiceName}, day ${s.day}${untilDay !== undefined ? ` (stopped at --until ${untilDay})` : ''}\n`));
console.log(
  `  ${formatMoney(s.cash)} in the account · level ${s.practiceLevel} · reputation ${Math.round(s.reputation)} · ` +
    `trust ${Math.round(s.communityTrust)} · ${formatMoney(dailyExpenses(s))}/day out`,
);
console.log(`  ${s.stats.sessionsRun} sessions at ${q.toFixed(2)} average quality`);
console.log(
  `  ${s.stats.cures} people finished treatment (${s.stats.complexCures} complex), ${s.stats.dropouts} stopped coming`,
);
console.log(`  ${s.stats.breakthroughs} breakthroughs · ${s.stats.regressions} regressions · ${s.stats.burnouts} sabbaticals`);
console.log(
  `  ${activeTherapists(s).length} staff · ${s.clients.filter((c) => c.status === 'active').length}/${capacity(s)} caseload · ` +
    `${s.milestonesEarned.length} milestones`,
);
if (s.ended) console.log(brick(`  Run ended: ${s.ended.kind} on day ${s.ended.day}`));
if (s.pendingEvents.length) {
  console.log(amber(`  Paused on a decision: ${s.pendingEvents.map((p) => p.def.id).join(', ')}`));
}

if (!quiet) {
  console.log(bold('\n  The team\n'));
  for (const t of activeTherapists(s)) {
    console.log(
      `  ${t.name.padEnd(22)} ${String(t.stage).padEnd(8)} skill ${String(Math.round(t.skill)).padStart(3)} · ` +
        `morale ${String(Math.round(t.morale)).padStart(3)} · strain ${String(Math.round(t.strain)).padStart(3)}`,
    );
  }

  console.log(bold('\n  Still in the room\n'));
  const active = s.clients.filter((c) => c.status === 'active');
  if (!active.length) console.log(dim('  Nobody on the caseload. Quiet practice.'));
  for (const c of active.slice(0, 10)) {
    console.log(
      `  ${c.handle}, ${c.age} · ${CONDITION_LABELS[c.condition]} · ${c.chapter} · ${Math.round(c.progress)}%` +
        `${c.atRisk ? brick(' · at risk') : ''}`,
    );
  }

  console.log(bold('\n  Last thing that happened\n'));
  for (const l of s.log.slice(0, 6)) console.log(dim(`  d${l.day} ${l.text}`));
}
console.log('');

/** One readable line for an action, for the divergence report. */
function describe(action: { type: string } & Record<string, unknown>): string {
  const extras = Object.entries(action)
    .filter(([k]) => k !== 'type')
    .map(([k, v]) => `${k}=${String(v)}`)
    .join(' ');
  return extras ? `${action.type} ${dim(extras)}` : action.type;
}
