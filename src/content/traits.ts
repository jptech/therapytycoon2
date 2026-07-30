/**
 * Therapist traits.
 *
 * Two or three of these are stamped onto every hire, and they are the main
 * reason one clinician feels different from another across a whole run. A
 * trait should read like a person before it reads like a stat block: the
 * numbers are small, the working style is loud.
 *
 * Convention: mods ending in *Mult are multiplicative (1 = neutral); every
 * other field is additive. 'quirk' traits are trade-offs, never pure taxes —
 * each one buys the player something, even if it is only a cheaper salary.
 *
 * The `events` field points at staff-scope events in events-practice.ts that
 * only make sense for this kind of person. Most traits leave it empty — a trait
 * earns an event only when the event would read as flat without it.
 */
import type { TraitDef } from '../sim/types';

export const TRAITS: readonly TraitDef[] = [
  // ── Boons ─────────────────────────────────────────────────────────────────

  {
    id: 'trait_warm',
    name: 'Warm',
    blurb: 'Remembers the name of your dog, your sister, and your terrible boss.',
    tone: 'boon',
    mods: {
      rapportGain: 0.035,
      moraleDrift: 0.2,
    },
  },

  {
    id: 'trait_mentor_at_heart',
    name: 'Mentor at Heart',
    blurb: 'Keeps a spare chair in her office for whoever needs to think out loud.',
    tone: 'boon',
    mods: {
      mentorBonus: 0.55,
      moraleDrift: 0.4,
      xpMult: 1.05,
    },
    events: ['ev_staff_supervision_role', 'ev_staff_supervisee_outgrows_mentor'],
  },

  {
    id: 'trait_unflappable',
    name: 'Unflappable',
    blurb: 'The louder the room gets, the slower he talks.',
    tone: 'boon',
    mods: {
      burnoutMult: 0.82,
      conditionAffinity: {
        psychosis: 0.06,
        bipolar: 0.05,
        substance: 0.05,
        trauma: 0.04,
      },
    },
  },

  {
    id: 'trait_grief_companion',
    name: 'Grief Companion',
    blurb: 'Has never once said "at least" to someone who was grieving.',
    tone: 'boon',
    mods: {
      rapportGain: 0.02,
      conditionAffinity: {
        grief: 0.08,
        trauma: 0.05,
        depression: 0.03,
      },
    },
  },

  {
    id: 'trait_teen_whisperer',
    name: 'Teen Whisperer',
    blurb: 'Lets them keep the hood up. They talk anyway.',
    tone: 'boon',
    mods: {
      rapportGain: 0.02,
      conditionAffinity: {
        behavioral: 0.07,
        identity: 0.06,
        adhd: 0.05,
      },
    },
  },

  {
    id: 'trait_quick_study',
    name: 'Quick Study',
    blurb: 'Read the whole protocol manual on the train home. Twice.',
    tone: 'boon',
    mods: {
      xpMult: 1.25,
      salaryMult: 1.05,
    },
    events: ['ev_staff_specialisation_ask'],
  },

  {
    id: 'trait_leaves_it_at_work',
    name: 'Leaves It at Work',
    blurb: 'Locks the notes in the drawer at six, and means it.',
    tone: 'boon',
    mods: {
      energyRegenMult: 1.18,
      burnoutMult: 0.85,
    },
  },

  {
    id: 'trait_bilingual',
    name: 'Bilingual',
    blurb: "Switches languages mid-sentence when someone can't find the word.",
    tone: 'boon',
    mods: {
      rapportGain: 0.03,
      salaryMult: 1.06,
      conditionAffinity: {
        identity: 0.05,
        relationship: 0.03,
      },
    },
  },

  {
    id: 'trait_long_distance_runner',
    name: 'Long-Distance Runner',
    blurb: 'Runs the river loop before work and has strong opinions about socks.',
    tone: 'boon',
    mods: {
      energyCostMult: 0.9,
      energyRegenMult: 1.12,
    },
  },

  {
    id: 'trait_notes_by_five',
    name: 'Notes by Five',
    blurb: 'Progress notes finished by 5:10. This is not up for discussion.',
    tone: 'boon',
    mods: {
      quality: 0.025,
      moraleDrift: 0.25,
      salaryMult: 1.08,
    },
  },

  {
    id: 'trait_here_for_the_work',
    name: 'Here for the Work',
    blurb: "Turned down the downtown offer twice. Didn't mention it either time.",
    tone: 'boon',
    mods: {
      salaryMult: 0.88,
      moraleDrift: 0.3,
    },
    events: ['ev_staff_rival_flowers'],
  },

  // ── Quirks ────────────────────────────────────────────────────────────────

  {
    id: 'trait_night_owl',
    name: 'Night Owl',
    blurb: 'Does her best thinking after four. Mornings are a formality.',
    tone: 'quirk',
    mods: {
      eveningShift: 0.055,
      morningShift: -0.05,
      salaryMult: 0.96,
    },
    events: ['ev_staff_night_owl_hours'],
  },

  {
    id: 'trait_early_bird',
    name: 'Early Bird',
    blurb: "In by seven with the kettle on. By five he's answering in nods.",
    tone: 'quirk',
    mods: {
      morningShift: 0.055,
      eveningShift: -0.05,
      energyRegenMult: 1.06,
    },
  },

  {
    id: 'trait_blunt',
    name: 'Blunt',
    blurb: "Will say the thing everyone's been circling for three weeks.",
    tone: 'quirk',
    mods: {
      quality: 0.02,
      rapportGain: -0.03,
      conditionAffinity: {
        substance: 0.06,
        behavioral: 0.05,
        ocd: 0.04,
      },
    },
  },

  {
    id: 'trait_perfectionist',
    name: 'Perfectionist',
    blurb: 'Rewrites the treatment plan a fourth time, for the margins.',
    tone: 'quirk',
    mods: {
      quality: 0.05,
      energyCostMult: 1.2,
      burnoutMult: 1.2,
    },
    events: ['ev_staff_perfectionist_notes'],
  },

  {
    id: 'trait_paperwork_averse',
    name: 'Paperwork Averse',
    blurb: 'Would sooner work an hour for free than fight the insurance portal again.',
    tone: 'quirk',
    mods: {
      quality: -0.02,
      rapportGain: 0.02,
      salaryMult: 0.86,
    },
    events: ['ev_staff_paperwork_drawer'],
  },

  {
    id: 'trait_burned_before',
    name: 'Burned Before',
    blurb: 'Left the crisis unit in year six. Knows exactly what the work costs now.',
    tone: 'quirk',
    mods: {
      quality: 0.05,
      mentorBonus: 0.3,
      energyRegenMult: 0.85,
      burnoutMult: 1.22,
    },
    events: ['ev_staff_four_day_week'],
  },

  {
    id: 'trait_takes_it_home',
    name: 'Takes It Home',
    blurb: "Thinks about the four o'clock while doing the dishes.",
    tone: 'quirk',
    mods: {
      rapportGain: 0.03,
      moraleDrift: -0.35,
      burnoutMult: 1.2,
    },
    events: ['ev_staff_quiet_struggle'],
  },

  {
    id: 'trait_runs_over',
    name: 'Runs Over',
    blurb: "Her four o'clock has never once ended at four fifty.",
    tone: 'quirk',
    mods: {
      quality: 0.02,
      rapportGain: 0.03,
      energyCostMult: 1.15,
    },
  },

  {
    id: 'trait_by_the_manual',
    name: 'By the Manual',
    blurb: 'Session ten is session ten. The protocol works because you follow it.',
    tone: 'quirk',
    mods: {
      xpMult: 1.1,
      conditionAffinity: {
        ocd: 0.06,
        anxiety: 0.05,
        adhd: 0.04,
        grief: -0.04,
        identity: -0.04,
      },
    },
  },

  {
    id: 'trait_lone_wolf',
    name: 'Lone Wolf',
    blurb: 'Wonderful in the room. Says maybe nine words in a staff meeting.',
    tone: 'quirk',
    mods: {
      quality: 0.03,
      moraleDrift: -0.4,
      salaryMult: 0.85,
    },
  },

  {
    id: 'trait_new_grad_energy',
    name: 'New-Grad Energy',
    blurb: 'Highlighters in four colours, and genuinely thrilled to be here.',
    tone: 'quirk',
    mods: {
      quality: -0.03,
      moraleDrift: 0.2,
      xpMult: 1.25,
      salaryMult: 0.85,
    },
  },
];
