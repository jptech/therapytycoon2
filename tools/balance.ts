/**
 * Balance harness. Runs many headless playthroughs and reports the curves that
 * matter, so late-game breakdown is measured rather than discovered by players.
 *
 *   bun run tools/balance.ts                       # 60 runs × 200 days, standard
 *   bun run tools/balance.ts --runs 200 --days 260
 *   bun run tools/balance.ts --difficulty cozy,standard,challenge
 *   bun run tools/balance.ts --csv balance-out
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { playRun, type RunReport } from './autoplay';
import type { Difficulty } from '../src/sim/types';

interface Args {
  runs: number;
  days: number;
  difficulties: Difficulty[];
  csvDir?: string;
  skills: number[];
  quiet: boolean;
}

function parseArgs(argv: string[]): Args {
  const get = (flag: string, dflt?: string) => {
    const i = argv.indexOf(flag);
    return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt;
  };
  return {
    runs: Number(get('--runs', '60')),
    days: Number(get('--days', '200')),
    difficulties: (get('--difficulty', 'standard') as string).split(',') as Difficulty[],
    csvDir: get('--csv'),
    skills: (get('--skill', '0.85,0.6') as string).split(',').map(Number),
    quiet: argv.includes('--quiet'),
  };
}

function pct(arr: number[], p: number): number {
  if (!arr.length) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const i = Math.min(sorted.length - 1, Math.max(0, Math.floor((p / 100) * sorted.length)));
  return sorted[i];
}

const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);

function bar(v: number, max: number, width = 24): string {
  const n = max > 0 ? Math.round((v / max) * width) : 0;
  return '█'.repeat(Math.max(0, n)).padEnd(width, '·');
}

function fmt(n: number, digits = 0): string {
  return n.toLocaleString('en-US', { maximumFractionDigits: digits, minimumFractionDigits: digits });
}

function summarise(label: string, reports: RunReport[], days: number): string[] {
  const out: string[] = [];
  const collapsed = reports.filter((r) => r.ended === 'collapsed').length;
  const accredited = reports.filter((r) => r.final.accreditedStages >= 5).length;

  out.push('');
  out.push(`━━ ${label} — ${reports.length} runs × ${days} days ${'━'.repeat(Math.max(0, 46 - label.length))}`);
  out.push('');

  const rows: [string, number[], number][] = [
    ['Final cash', reports.map((r) => r.final.cash), 0],
    ['Reputation', reports.map((r) => r.final.reputation), 1],
    ['Community trust', reports.map((r) => r.final.communityTrust), 1],
    ['Practice level', reports.map((r) => r.final.practiceLevel), 1],
    ['Therapists', reports.map((r) => r.final.therapists), 1],
    ['Active clients', reports.map((r) => r.final.clients), 1],
    ['Avg morale', reports.map((r) => r.final.avgMorale), 1],
    ['Avg quality', reports.map((r) => r.final.avgQuality), 3],
    ['Cures', reports.map((r) => r.totals.cures), 1],
    ['Complex cures', reports.map((r) => r.totals.complexCures), 1],
    ['Dropouts', reports.map((r) => r.totals.dropouts), 1],
    ['Breakthroughs', reports.map((r) => r.totals.breakthroughs), 1],
    ['Regressions', reports.map((r) => r.totals.regressions), 1],
    ['Burnouts', reports.map((r) => r.totals.burnouts), 2],
    ['Departures', reports.map((r) => r.totals.departures), 2],
    ['Sessions run', reports.map((r) => r.totals.sessions), 0],
    ['Milestones', reports.map((r) => r.totals.milestones), 1],
    ['Campaign stages', reports.map((r) => r.final.accreditedStages), 2],
    ['Programs running', reports.map((r) => r.totals.programs), 2],
    ['Upgrades owned', reports.map((r) => r.totals.upgrades), 1],
  ];

  out.push('  metric              p10        median       mean         p90');
  out.push('  ' + '─'.repeat(62));
  for (const [name, vals, d] of rows) {
    out.push(
      `  ${name.padEnd(18)} ${fmt(pct(vals, 10), d).padStart(9)} ${fmt(pct(vals, 50), d).padStart(11)} ${fmt(mean(vals), d).padStart(11)} ${fmt(pct(vals, 90), d).padStart(11)}`,
    );
  }

  out.push('');
  out.push(`  Collapsed: ${collapsed}/${reports.length}   ·   Fully accredited: ${accredited}/${reports.length}`);

  // Grade distribution — the single best signal for "did the game get solved".
  const grades: Record<string, number> = {};
  for (const r of reports) for (const [g, n] of Object.entries(r.grades)) grades[g] = (grades[g] ?? 0) + n;
  const totalGrades = Object.values(grades).reduce((a, b) => a + b, 0) || 1;
  out.push('');
  out.push('  Session grades');
  for (const g of ['breakthrough', 'excellent', 'good', 'mixed', 'poor']) {
    const n = grades[g] ?? 0;
    out.push(`    ${g.padEnd(13)} ${bar(n, totalGrades)} ${((n / totalGrades) * 100).toFixed(1)}%`);
  }

  // Quality histogram.
  const hist = new Array(10).fill(0);
  for (const r of reports) for (let i = 0; i < 10; i++) hist[i] += r.qualityHistogram[i];
  const maxH = Math.max(...hist);
  out.push('');
  out.push('  Quality distribution');
  for (let i = 0; i < 10; i++) {
    out.push(`    ${(i / 10).toFixed(1)}–${((i + 1) / 10).toFixed(1)}  ${bar(hist[i], maxH)} ${fmt(hist[i])}`);
  }

  // The late-game staleness check: is quality still moving after day 120?
  const late = reports.flatMap((r) => r.daily.filter((d) => d.day > 120).map((d) => d.avgQuality)).filter((q) => q > 0);
  const early = reports.flatMap((r) => r.daily.filter((d) => d.day <= 40).map((d) => d.avgQuality)).filter((q) => q > 0);
  if (late.length && early.length) {
    out.push('');
    out.push(
      `  Quality drift  early(≤40d) ${mean(early).toFixed(3)}  →  late(>120d) ${mean(late).toFixed(3)}   (spread p10–p90 late: ${pct(late, 10).toFixed(2)}–${pct(late, 90).toFixed(2)})`,
    );
    const solved = pct(late, 10) > 0.85;
    out.push(
      solved
        ? '  ⚠  Late-game looks SOLVED — even the 10th percentile session is excellent.'
        : '  ✓  Late-game still has spread; sessions are not a solved spreadsheet.',
    );
  }

  // Curve sanity: cash trajectory.
  const byDay = new Map<number, number[]>();
  for (const r of reports) for (const d of r.daily) (byDay.get(d.day) ?? byDay.set(d.day, []).get(d.day)!).push(d.cash);
  const dayKeys = [...byDay.keys()].sort((a, b) => a - b);
  const sampled = dayKeys.filter((_, i) => i % Math.max(1, Math.floor(dayKeys.length / 12)) === 0);
  out.push('');
  out.push('  Median cash by day');
  const maxCash = Math.max(...sampled.map((d) => pct(byDay.get(d)!, 50)), 1);
  for (const d of sampled) {
    const v = pct(byDay.get(d)!, 50);
    out.push(`    d${String(d).padStart(3)}  ${bar(Math.max(0, v), maxCash)} ${fmt(v)}`);
  }

  const notes = reports.flatMap((r) => r.notes);
  if (notes.length) {
    out.push('');
    out.push('  Notes:');
    for (const n of [...new Set(notes)]) out.push(`    · ${n}`);
  }

  return out;
}

function toCsv(reports: RunReport[]): string {
  const header = [
    'seed',
    'difficulty',
    'day',
    'cash',
    'reputation',
    'communityTrust',
    'clients',
    'therapists',
    'avgQuality',
    'avgMorale',
    'avgEnergy',
    'cures',
    'practiceLevel',
    'act',
  ].join(',');
  const rows: string[] = [header];
  for (const r of reports) {
    for (const d of r.daily) {
      rows.push(
        [
          r.seed,
          r.difficulty,
          d.day,
          d.cash,
          d.rep,
          d.trust,
          d.clients,
          d.therapists,
          d.avgQuality.toFixed(4),
          d.avgMorale.toFixed(2),
          d.avgEnergy.toFixed(3),
          d.cures,
          d.level,
          d.act,
        ].join(','),
      );
    }
  }
  return rows.join('\n');
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const started = Date.now();
  const all: RunReport[] = [];
  const lines: string[] = [];

  for (const difficulty of args.difficulties) {
    for (const skill of args.skills) {
      const reports: RunReport[] = [];
      for (let i = 0; i < args.runs; i++) {
        const seed = 1000 + i * 7919 + Math.round(skill * 100) * 13;
        reports.push(
          playRun({ seed, days: args.days, difficulty, skill, trace: true }),
        );
        if (!args.quiet && (i + 1) % 10 === 0) {
          process.stdout.write(`\r  ${difficulty} skill=${skill}: ${i + 1}/${args.runs} runs…   `);
        }
      }
      if (!args.quiet) process.stdout.write('\r' + ' '.repeat(56) + '\r');
      all.push(...reports);
      lines.push(...summarise(`${difficulty} · player skill ${skill}`, reports, args.days));
    }
  }

  const elapsed = ((Date.now() - started) / 1000).toFixed(1);
  lines.push('');
  lines.push(`Done in ${elapsed}s — ${all.length} runs, ${fmt(all.reduce((a, r) => a + r.totals.sessions, 0))} simulated sessions.`);
  lines.push('');

  const text = lines.join('\n');
  console.log(text);

  if (args.csvDir) {
    mkdirSync(args.csvDir, { recursive: true });
    writeFileSync(`${args.csvDir}/runs.csv`, toCsv(all));
    writeFileSync(`${args.csvDir}/summary.txt`, text);
    writeFileSync(`${args.csvDir}/runs.json`, JSON.stringify(all, null, 2));
    console.log(`Wrote ${args.csvDir}/runs.csv, summary.txt, runs.json`);
  }
}

main();
