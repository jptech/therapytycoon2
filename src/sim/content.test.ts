import { describe, it, expect } from 'vitest';
import {
  ARC_BEATS,
  CAMPAIGN_STAGES,
  EVENTS,
  MILESTONES,
  MODALITIES,
  PHILOSOPHIES,
  PROGRAMS,
  TECHNIQUES,
  TRAININGS,
  TRAITS,
  UPGRADES,
  eventById,
  modalityById,
  philosophyById,
  programById,
  techniqueById,
  traitById,
  upgradeById,
} from '../content';
import { CONDITION_LABELS } from './balance';
import type {
  ConditionId,
  EventEffect,
  EventRequirement,
  ModalityId,
  PhilosophyId,
  SnapshotForMilestones,
} from './types';

// ─────────────────────────────────────────────────────────────────────────────
// Reference sets. Everything here is derived from a real registry so adding a
// modality or condition cannot silently desynchronise the checks.
// ─────────────────────────────────────────────────────────────────────────────

const CONDITION_IDS = new Set(Object.keys(CONDITION_LABELS) as ConditionId[]);
const MODALITY_IDS = new Set(MODALITIES.map((m) => m.id as ModalityId));
const PHILOSOPHY_IDS = new Set(PHILOSOPHIES.map((p) => p.id as PhilosophyId));
const PROGRAM_IDS = new Set(PROGRAMS.map((p) => p.id));
const TRAIT_IDS = new Set(TRAITS.map((t) => t.id));
const UPGRADE_IDS = new Set(UPGRADES.map((u) => u.id));
const TECHNIQUE_IDS = new Set(TECHNIQUES.map((t) => t.id));
const EVENT_IDS = new Set(EVENTS.map((e) => e.id));

const REGISTRIES: Record<string, readonly { id: string }[]> = {
  MODALITIES,
  TECHNIQUES,
  TRAITS,
  EVENTS,
  ARC_BEATS,
  PROGRAMS,
  PHILOSOPHIES,
  UPGRADES,
  TRAININGS,
  MILESTONES,
  CAMPAIGN_STAGES,
};

/** Walks every EventRequirement in the content and reports unresolvable ids. */
function requirementProblems(where: string, req: EventRequirement | undefined): string[] {
  if (!req) return [];
  const out: string[] = [];
  for (const id of req.hasUpgrade ?? []) {
    if (!UPGRADE_IDS.has(id)) out.push(`${where}: requires.hasUpgrade "${id}" does not exist`);
  }
  for (const id of req.hasProgram ?? []) {
    if (!PROGRAM_IDS.has(id)) out.push(`${where}: requires.hasProgram "${id}" does not exist`);
  }
  for (const id of req.therapistTrait ?? []) {
    if (!TRAIT_IDS.has(id)) out.push(`${where}: requires.therapistTrait "${id}" does not exist`);
  }
  for (const id of req.philosophy ?? []) {
    if (!PHILOSOPHY_IDS.has(id)) out.push(`${where}: requires.philosophy "${id}" does not exist`);
  }
  return out;
}

function effectProblems(where: string, effect: EventEffect | undefined): string[] {
  if (!effect) return [];
  const out: string[] = [];
  if (effect.grantTechnique && !TECHNIQUE_IDS.has(effect.grantTechnique)) {
    out.push(`${where}: grantTechnique "${effect.grantTechnique}" does not exist`);
  }
  if (effect.grantUpgrade && !UPGRADE_IDS.has(effect.grantUpgrade)) {
    out.push(`${where}: grantUpgrade "${effect.grantUpgrade}" does not exist`);
  }
  if (effect.grantTherapistTrait && !TRAIT_IDS.has(effect.grantTherapistTrait)) {
    out.push(`${where}: grantTherapistTrait "${effect.grantTherapistTrait}" does not exist`);
  }
  if (effect.followUp?.eventId && !EVENT_IDS.has(effect.followUp.eventId)) {
    out.push(`${where}: followUp.eventId "${effect.followUp.eventId}" does not exist`);
  }
  return out;
}

const ZERO_SNAPSHOT: SnapshotForMilestones = {
  day: 0,
  cash: 0,
  reputation: 0,
  communityTrust: 0,
  practiceLevel: 0,
  therapists: 0,
  cures: 0,
  complexCures: 0,
  breakthroughs: 0,
  programs: 0,
  avgMorale: 0,
  alumni: 0,
  maxStreak: 0,
};

const PLAUSIBLE_SNAPSHOT: SnapshotForMilestones = {
  day: 118,
  cash: 24500,
  reputation: 71,
  communityTrust: 68,
  practiceLevel: 6,
  therapists: 5,
  cures: 62,
  complexCures: 11,
  breakthroughs: 24,
  programs: 2,
  avgMorale: 73,
  alumni: 62,
  maxStreak: 7,
};

// ─────────────────────────────────────────────────────────────────────────────

describe('ids', () => {
  it('every id in each registry is unique', () => {
    const problems: string[] = [];
    for (const [name, registry] of Object.entries(REGISTRIES)) {
      const seen = new Set<string>();
      for (const item of registry) {
        if (seen.has(item.id)) problems.push(`${name}: duplicate id "${item.id}"`);
        seen.add(item.id);
      }
    }
    expect(problems).toEqual([]);
  });

  it('every id is a non-empty string', () => {
    const problems: string[] = [];
    for (const [name, registry] of Object.entries(REGISTRIES)) {
      for (const item of registry) {
        if (typeof item.id !== 'string' || item.id.trim() === '') {
          problems.push(`${name}: entry with a missing id`);
        }
      }
    }
    expect(problems).toEqual([]);
  });

  it('the by-id indexes cover every entry', () => {
    expect(Object.keys(techniqueById)).toHaveLength(TECHNIQUES.length);
    expect(Object.keys(eventById)).toHaveLength(EVENTS.length);
    expect(Object.keys(upgradeById)).toHaveLength(UPGRADES.length);
    expect(Object.keys(programById)).toHaveLength(PROGRAMS.length);
    expect(Object.keys(traitById)).toHaveLength(TRAITS.length);
    expect(Object.keys(modalityById)).toHaveLength(MODALITIES.length);
    expect(Object.keys(philosophyById)).toHaveLength(PHILOSOPHIES.length);
  });
});

describe('techniques', () => {
  it('every modality is a real ModalityId', () => {
    const problems = TECHNIQUES.filter((t) => !MODALITY_IDS.has(t.modality)).map(
      (t) => `${t.id}: modality "${t.modality}"`,
    );
    expect(problems).toEqual([]);
  });

  it('every goodFor and poorFor is a real ConditionId', () => {
    const problems: string[] = [];
    for (const t of TECHNIQUES) {
      for (const c of t.goodFor ?? []) if (!CONDITION_IDS.has(c)) problems.push(`${t.id}: goodFor "${c}"`);
      for (const c of t.poorFor ?? []) if (!CONDITION_IDS.has(c)) problems.push(`${t.id}: poorFor "${c}"`);
    }
    expect(problems).toEqual([]);
  });

  it('no technique both recommends and warns against the same condition', () => {
    const problems: string[] = [];
    for (const t of TECHNIQUES) {
      for (const c of t.goodFor ?? []) {
        if (t.poorFor?.includes(c)) problems.push(`${t.id}: "${c}" is both goodFor and poorFor`);
      }
    }
    expect(problems).toEqual([]);
  });

  it('every technique carries the copy the card face needs', () => {
    const problems: string[] = [];
    for (const t of TECHNIQUES) {
      if (!t.name) problems.push(`${t.id}: no name`);
      if (!t.blurb) problems.push(`${t.id}: no blurb`);
      if (!t.flavor) problems.push(`${t.id}: no flavor`);
      if (![1, 2, 3].includes(t.tier)) problems.push(`${t.id}: tier ${t.tier}`);
    }
    expect(problems).toEqual([]);
  });

  it('effect ranges stay inside the sanity bands', () => {
    const problems: string[] = [];
    for (const t of TECHNIQUES) {
      const { progress, quality, minStability } = { ...t.effects, minStability: t.minStability };
      if (progress !== undefined && (progress < 0.5 || progress > 2)) {
        problems.push(`${t.id}: effects.progress ${progress} outside [0.5, 2]`);
      }
      if (quality !== undefined && (quality < -0.15 || quality > 0.15)) {
        problems.push(`${t.id}: effects.quality ${quality} outside [-0.15, 0.15]`);
      }
      if (minStability !== undefined && (minStability < 0 || minStability > 1)) {
        problems.push(`${t.id}: minStability ${minStability} outside [0, 1]`);
      }
      for (const [key, value] of Object.entries(t.effects)) {
        if (!Number.isFinite(value)) problems.push(`${t.id}: effects.${key} is not finite`);
      }
    }
    expect(problems).toEqual([]);
  });
});

describe('philosophies', () => {
  it('every philosophy-exclusive technique names a real PhilosophyId', () => {
    const problems = TECHNIQUES.filter((t) => t.philosophy && !PHILOSOPHY_IDS.has(t.philosophy)).map(
      (t) => `${t.id}: philosophy "${t.philosophy}"`,
    );
    expect(problems).toEqual([]);
  });

  it('every philosophy has at least one exclusive technique — otherwise it is unreachable', () => {
    // Exclusive techniques are granted on CHOOSE_PHILOSOPHY; an orphaned
    // philosophy would hand out nothing, and an orphaned technique could never
    // be learned at all.
    const problems: string[] = [];
    for (const p of PHILOSOPHIES) {
      const exclusive = TECHNIQUES.filter((t) => t.philosophy === p.id);
      if (!exclusive.length) problems.push(`philosophy "${p.id}" has no exclusive technique`);
    }
    expect(problems).toEqual([]);
  });

  it('no training grants a philosophy-exclusive technique', () => {
    const exclusive = new Set(TECHNIQUES.filter((t) => t.philosophy).map((t) => t.id));
    const problems: string[] = [];
    for (const tr of TRAININGS) {
      for (const g of tr.grants) {
        if (exclusive.has(g)) problems.push(`${tr.id} grants philosophy-exclusive "${g}"`);
      }
    }
    expect(problems).toEqual([]);
  });

  it('referral bias keys are real conditions and favored programs are real', () => {
    const problems: string[] = [];
    for (const p of PHILOSOPHIES) {
      for (const key of Object.keys(p.referralBias)) {
        if (!CONDITION_IDS.has(key as ConditionId)) problems.push(`${p.id}: referralBias key "${key}"`);
      }
      for (const prog of p.favoredPrograms) {
        if (!PROGRAM_IDS.has(prog)) problems.push(`${p.id}: favoredProgram "${prog}"`);
      }
      if (!(p.trainingDiscount > 0)) problems.push(`${p.id}: trainingDiscount ${p.trainingDiscount}`);
    }
    expect(problems).toEqual([]);
  });
});

describe('trainings', () => {
  it('every grants id exists and matches the training’s modality', () => {
    const problems: string[] = [];
    for (const tr of TRAININGS) {
      if (!MODALITY_IDS.has(tr.modality)) problems.push(`${tr.id}: modality "${tr.modality}"`);
      if (!tr.grants.length) problems.push(`${tr.id}: grants nothing`);
      for (const g of tr.grants) {
        const tech = techniqueById[g];
        if (!tech) {
          problems.push(`${tr.id}: grants "${g}" which does not exist`);
          continue;
        }
        if (tech.modality !== tr.modality) {
          problems.push(`${tr.id} (${tr.modality}) grants "${g}" from ${tech.modality}`);
        }
      }
    }
    expect(problems).toEqual([]);
  });

  it('costs are positive and time away is real', () => {
    const problems: string[] = [];
    for (const tr of TRAININGS) {
      if (!(tr.cost > 0)) problems.push(`${tr.id}: cost ${tr.cost}`);
      if (!(tr.days > 0)) problems.push(`${tr.id}: days ${tr.days}`);
      if (!(tr.skill > 0)) problems.push(`${tr.id}: skill ${tr.skill}`);
      problems.push(...requirementProblems(`training ${tr.id}`, tr.requires));
    }
    expect(problems).toEqual([]);
  });

  it('no technique is granted by two different trainings', () => {
    const owner: Record<string, string> = {};
    const problems: string[] = [];
    for (const tr of TRAININGS) {
      for (const g of tr.grants) {
        if (owner[g]) problems.push(`"${g}" granted by both ${owner[g]} and ${tr.id}`);
        owner[g] = tr.id;
      }
    }
    expect(problems).toEqual([]);
  });
});

describe('upgrades', () => {
  it('costs are positive and requirements resolve', () => {
    const problems: string[] = [];
    for (const u of UPGRADES) {
      if (!(u.cost > 0)) problems.push(`${u.id}: cost ${u.cost}`);
      if (!u.name) problems.push(`${u.id}: no name`);
      if (!u.blurb) problems.push(`${u.id}: no blurb`);
      if (!['office', 'tech', 'certification', 'automation'].includes(u.category)) {
        problems.push(`${u.id}: category "${u.category}"`);
      }
      problems.push(...requirementProblems(`upgrade ${u.id}`, u.requires));
      for (const [key, value] of Object.entries(u.mods ?? {})) {
        if (typeof value === 'number' && !Number.isFinite(value)) {
          problems.push(`${u.id}: mods.${key} is not finite`);
        }
      }
    }
    expect(problems).toEqual([]);
  });
});

describe('events', () => {
  it('every event has at least one choice', () => {
    const problems = EVENTS.filter((e) => !e.choices?.length).map((e) => `${e.id}: no choices`);
    expect(problems).toEqual([]);
  });

  it('every choice has at least one effect key or an outcome string', () => {
    const problems: string[] = [];
    for (const e of EVENTS) {
      for (const ch of e.choices) {
        const effectKeys = Object.entries(ch.effects ?? {}).filter(([, v]) => v !== undefined);
        if (!effectKeys.length && !ch.outcome) {
          problems.push(`${e.id}/${ch.id}: no effects and no outcome — the choice does nothing`);
        }
        if (!ch.label) problems.push(`${e.id}/${ch.id}: no label`);
      }
    }
    expect(problems).toEqual([]);
  });

  it('choice ids are unique within their event', () => {
    const problems: string[] = [];
    for (const e of EVENTS) {
      const seen = new Set<string>();
      for (const ch of e.choices) {
        if (seen.has(ch.id)) problems.push(`${e.id}: duplicate choice id "${ch.id}"`);
        seen.add(ch.id);
      }
    }
    expect(problems).toEqual([]);
  });

  it('every requirement and grant id resolves', () => {
    const problems: string[] = [];
    for (const e of EVENTS) {
      problems.push(...requirementProblems(`event ${e.id}`, e.requires));
      for (const ch of e.choices) {
        problems.push(...requirementProblems(`event ${e.id}/${ch.id}`, ch.requires));
        problems.push(...effectProblems(`event ${e.id}/${ch.id}`, ch.effects));
      }
    }
    expect(problems).toEqual([]);
  });

  it('condition, chapter and scope tags are all real', () => {
    const scopes = new Set(['session', 'day', 'staff', 'practice', 'client', 'program']);
    const chapters = new Set(['trust', 'work', 'consolidation']);
    const problems: string[] = [];
    for (const e of EVENTS) {
      if (!scopes.has(e.scope)) problems.push(`${e.id}: scope "${e.scope}"`);
      if (!(e.weight > 0)) problems.push(`${e.id}: weight ${e.weight}`);
      if (!e.title) problems.push(`${e.id}: no title`);
      if (!e.body) problems.push(`${e.id}: no body`);
      for (const c of e.conditions ?? []) if (!CONDITION_IDS.has(c)) problems.push(`${e.id}: condition "${c}"`);
      for (const ch of e.chapters ?? []) if (!chapters.has(ch)) problems.push(`${e.id}: chapter "${ch}"`);
    }
    expect(problems).toEqual([]);
  });

  it('every trait-attached event id resolves', () => {
    const problems: string[] = [];
    for (const t of TRAITS) {
      for (const id of t.events ?? []) {
        if (!EVENT_IDS.has(id)) problems.push(`trait ${t.id}: event "${id}" does not exist`);
      }
    }
    expect(problems).toEqual([]);
  });

  /**
   * BUG (reported, not fixed here): `raiseEventById` silently no-ops when an id
   * is missing, so an engine-authored beat can be dead without anyone noticing.
   * Two ids the engine raises by name have no definition in the registry:
   *   • ev_staff_burnout_aftermath   (engine.ts, after a burnout sabbatical)
   *   • ev_practice_first_hire_nudge (engine.ts, the Act 1 → 2 nudge)
   * The nudge is worse than silent: because it never fires, it never lands in
   * `firedOnce`, so checkAct retries it every single day of Act 1.
   */
  it('every event id the engine raises by name exists in the registry', () => {
    const engineRaised = [
      'ev_practice_cash_warning',
      'ev_practice_mentor_loan',
      'ev_practice_line_of_credit',
      'ev_practice_insurance_renegotiation',
      'ev_staff_burnout_aftermath',
      'ev_practice_first_hire_nudge',
    ];
    const missing = engineRaised.filter((id) => !EVENT_IDS.has(id));
    expect(missing).toEqual([]);
  });
});

describe('arc beats', () => {
  it('every ArcBeatDef.event id resolves', () => {
    const problems: string[] = [];
    for (const b of ARC_BEATS) {
      if (b.event && !EVENT_IDS.has(b.event)) problems.push(`beat ${b.id}: event "${b.event}" does not exist`);
    }
    expect(problems).toEqual([]);
  });

  it('chapters, conditions, severity bands and effect targets are all real', () => {
    const chapters = new Set(['trust', 'work', 'consolidation']);
    const problems: string[] = [];
    for (const b of ARC_BEATS) {
      if (!chapters.has(b.chapter)) problems.push(`${b.id}: chapter "${b.chapter}"`);
      if (!(b.weight > 0)) problems.push(`${b.id}: weight ${b.weight}`);
      if (!b.text) problems.push(`${b.id}: no text`);
      for (const c of b.conditions ?? []) if (!CONDITION_IDS.has(c)) problems.push(`${b.id}: condition "${c}"`);
      if (b.minSeverity !== undefined && (b.minSeverity < 1 || b.minSeverity > 5)) {
        problems.push(`${b.id}: minSeverity ${b.minSeverity}`);
      }
      if (b.maxSeverity !== undefined && (b.maxSeverity < 1 || b.maxSeverity > 5)) {
        problems.push(`${b.id}: maxSeverity ${b.maxSeverity}`);
      }
      if (
        b.minSeverity !== undefined &&
        b.maxSeverity !== undefined &&
        b.minSeverity > b.maxSeverity
      ) {
        problems.push(`${b.id}: severity band is empty (${b.minSeverity}..${b.maxSeverity})`);
      }
      const e = b.effects;
      if (e?.prefersModality && !MODALITY_IDS.has(e.prefersModality)) {
        problems.push(`${b.id}: prefersModality "${e.prefersModality}"`);
      }
      if (e?.addComorbidity && !CONDITION_IDS.has(e.addComorbidity)) {
        problems.push(`${b.id}: addComorbidity "${e.addComorbidity}"`);
      }
    }
    expect(problems).toEqual([]);
  });

  it('every chapter has beats to draw from', () => {
    for (const chapter of ['trust', 'work', 'consolidation'] as const) {
      expect(ARC_BEATS.filter((b) => b.chapter === chapter).length, chapter).toBeGreaterThan(0);
    }
  });
});

describe('programs', () => {
  it('every ProgramDef.events id resolves', () => {
    const problems: string[] = [];
    for (const p of PROGRAMS) {
      for (const id of p.events ?? []) {
        if (!EVENT_IDS.has(id)) problems.push(`program ${p.id}: event "${id}" does not exist`);
      }
    }
    expect(problems).toEqual([]);
  });

  it('costs, upkeep and requirements are sane', () => {
    const problems: string[] = [];
    for (const p of PROGRAMS) {
      if (!(p.setupCost > 0)) problems.push(`${p.id}: setupCost ${p.setupCost}`);
      if (p.weeklyUpkeep < 0) problems.push(`${p.id}: weeklyUpkeep ${p.weeklyUpkeep}`);
      if (!(p.staffSlots > 0)) problems.push(`${p.id}: staffSlots ${p.staffSlots}`);
      if (p.energyPerDay < 0) problems.push(`${p.id}: energyPerDay ${p.energyPerDay}`);
      problems.push(...requirementProblems(`program ${p.id}`, p.requires));
      problems.push(...effectProblems(`program ${p.id} completionReward`, p.payoff.completionReward));
      for (const [key, value] of Object.entries(p.payoff)) {
        if (typeof value === 'number' && !Number.isFinite(value)) {
          problems.push(`${p.id}: payoff.${key} is not finite`);
        }
      }
    }
    expect(problems).toEqual([]);
  });
});

describe('milestones', () => {
  it('every check runs without throwing on a plausible snapshot and on a zeroed one', () => {
    const problems: string[] = [];
    for (const m of MILESTONES) {
      for (const [label, snap] of [
        ['zeroed', ZERO_SNAPSHOT],
        ['plausible', PLAUSIBLE_SNAPSHOT],
      ] as const) {
        try {
          const result = m.check(snap);
          if (typeof result !== 'boolean') {
            problems.push(`${m.id} (${label}): check returned ${typeof result}, not a boolean`);
          }
        } catch (err) {
          problems.push(`${m.id} (${label}): check threw — ${String(err)}`);
        }
      }
    }
    expect(problems).toEqual([]);
  });

  it('nothing is already earned on a zeroed snapshot', () => {
    const alreadyTrue = MILESTONES.filter((m) => m.check(ZERO_SNAPSHOT)).map((m) => m.id);
    expect(alreadyTrue).toEqual([]);
  });

  it('rewards resolve and carry presentation copy', () => {
    const problems: string[] = [];
    for (const m of MILESTONES) {
      if (!m.name) problems.push(`${m.id}: no name`);
      if (!m.blurb) problems.push(`${m.id}: no blurb`);
      if (!m.icon) problems.push(`${m.id}: no icon`);
      if (![1, 2, 3].includes(m.tier)) problems.push(`${m.id}: tier ${m.tier}`);
      problems.push(...effectProblems(`milestone ${m.id}`, m.reward));
    }
    expect(problems).toEqual([]);
  });

  it('checks are pure — they do not mutate the snapshot they are handed', () => {
    const snap = { ...PLAUSIBLE_SNAPSHOT };
    for (const m of MILESTONES) m.check(snap);
    expect(snap).toEqual(PLAUSIBLE_SNAPSHOT);
  });
});

describe('campaign', () => {
  it('every requirement measure returns finite numbers with a positive target', () => {
    const problems: string[] = [];
    for (const stage of CAMPAIGN_STAGES) {
      if (!stage.requirements.length) problems.push(`${stage.id}: no requirements`);
      for (const req of stage.requirements) {
        for (const [label, snap] of [
          ['zeroed', ZERO_SNAPSHOT],
          ['plausible', PLAUSIBLE_SNAPSHOT],
        ] as const) {
          let measured: { value: number; target: number };
          try {
            measured = req.measure(snap);
          } catch (err) {
            problems.push(`${stage.id}/${req.id} (${label}): measure threw — ${String(err)}`);
            continue;
          }
          if (!Number.isFinite(measured.value)) {
            problems.push(`${stage.id}/${req.id} (${label}): value ${measured.value} is not finite`);
          }
          if (!Number.isFinite(measured.target)) {
            problems.push(`${stage.id}/${req.id} (${label}): target ${measured.target} is not finite`);
          }
          if (!(measured.target > 0)) {
            problems.push(`${stage.id}/${req.id} (${label}): target ${measured.target} is not > 0`);
          }
        }
        if (!req.label) problems.push(`${stage.id}/${req.id}: no label`);
      }
    }
    expect(problems).toEqual([]);
  });

  it('no stage is already complete on a zeroed snapshot', () => {
    for (const stage of CAMPAIGN_STAGES) {
      const done = stage.requirements.every((r) => {
        const { value, target } = r.measure(ZERO_SNAPSHOT);
        return value >= target;
      });
      expect(done, stage.id).toBe(false);
    }
  });

  it('stages get harder, and every reward resolves', () => {
    const problems: string[] = [];
    let previousCures = -1;
    for (const stage of CAMPAIGN_STAGES) {
      if (!stage.name) problems.push(`${stage.id}: no name`);
      if (!stage.blurb) problems.push(`${stage.id}: no blurb`);
      problems.push(...effectProblems(`campaign ${stage.id}`, stage.reward));

      const cures = stage.requirements.find((r) => r.id.includes('cures') && !r.id.includes('complex'));
      if (cures) {
        const target = cures.measure(ZERO_SNAPSHOT).target;
        if (target <= previousCures) {
          problems.push(`${stage.id}: cure target ${target} does not exceed the previous stage's ${previousCures}`);
        }
        previousCures = target;
      }
    }
    expect(problems).toEqual([]);
    expect(previousCures).toBeGreaterThan(0);
  });
});

describe('modalities and traits', () => {
  it('every modality is strong with real conditions and carries presentation data', () => {
    const problems: string[] = [];
    for (const m of MODALITIES) {
      if (!m.strongWith.length) problems.push(`${m.id}: strongWith is empty`);
      for (const c of m.strongWith) if (!CONDITION_IDS.has(c)) problems.push(`${m.id}: strongWith "${c}"`);
      if (!/^#[0-9a-fA-F]{6}$/.test(m.color)) problems.push(`${m.id}: color "${m.color}"`);
      if (!m.name || !m.blurb || !m.prop) problems.push(`${m.id}: missing copy`);
    }
    expect(problems).toEqual([]);
  });

  it('every modality has techniques to teach', () => {
    for (const m of MODALITIES) {
      expect(TECHNIQUES.filter((t) => t.modality === m.id).length, m.id).toBeGreaterThan(0);
      expect(TRAININGS.filter((t) => t.modality === m.id).length, m.id).toBeGreaterThan(0);
    }
  });

  it('trait modifiers are finite and conditionAffinity keys are real', () => {
    const problems: string[] = [];
    for (const t of TRAITS) {
      if (!['boon', 'quirk'].includes(t.tone)) problems.push(`${t.id}: tone "${t.tone}"`);
      if (!t.name || !t.blurb) problems.push(`${t.id}: missing copy`);
      for (const [key, value] of Object.entries(t.mods ?? {})) {
        if (key === 'conditionAffinity') {
          for (const [cond, v] of Object.entries(value as Record<string, number>)) {
            if (!CONDITION_IDS.has(cond as ConditionId)) problems.push(`${t.id}: conditionAffinity "${cond}"`);
            if (!Number.isFinite(v)) problems.push(`${t.id}: conditionAffinity.${cond} is not finite`);
          }
        } else if (typeof value === 'number' && !Number.isFinite(value)) {
          problems.push(`${t.id}: mods.${key} is not finite`);
        }
      }
    }
    expect(problems).toEqual([]);
  });
});
