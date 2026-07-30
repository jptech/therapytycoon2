import type { TrainingDef } from '../sim/types';

/**
 * Continuing education — the money you spend on people rather than furniture.
 *
 * Three tiers per modality, twenty-four courses in all:
 *  • tier 1 — one day away. Grants the modality's two starter cards.
 *  • tier 2 — two days away, practice level 2. Grants the two working cards.
 *  • tier 3 — three days away, practice level 3. Grants the advanced card.
 *
 * The cost is only half the price. The other half is the therapist standing in
 * a hotel conference room while their Tuesday caseload sits unbooked, which is
 * why `days` is the number that actually hurts. Blurbs are written as what the
 * therapist comes back able to *do* — training here changes the cards in their
 * hand, never a hidden multiplier.
 *
 * Philosophy signature techniques are deliberately not granted by any course.
 * Those arrive with the identity you commit the whole practice to.
 */
export const TRAININGS: readonly TrainingDef[] = [
  // ── CBT ───────────────────────────────────────────────────────────────────
  {
    id: 'train_cbt_1',
    name: 'CBT Foundations',
    modality: 'cbt',
    tier: 1,
    cost: 700,
    days: 1,
    blurb:
      'A Saturday of role-play and worksheets. Comes back able to catch a hot thought in writing and to plan a week with something in it.',
    grants: ['cbt_thought_record', 'cbt_activity_scheduling'],
    skill: 5,
  },
  {
    id: 'train_cbt_2',
    name: 'CBT: Working with Beliefs',
    modality: 'cbt',
    tier: 2,
    cost: 1600,
    days: 2,
    blurb:
      'Two days taking beliefs apart on a whiteboard. Comes back able to design an experiment the client actually runs, then hold the belief up to what happened.',
    grants: ['cbt_behavioral_experiment', 'cbt_cognitive_restructuring'],
    skill: 8,
    requires: { minPracticeLevel: 2 },
  },
  {
    id: 'train_cbt_3',
    name: 'Exposure & Response Prevention Intensive',
    modality: 'cbt',
    tier: 3,
    cost: 3400,
    days: 3,
    blurb:
      'Three days on fear curves and the discipline not to rescue. Comes back able to build a ladder and stay in the room while somebody climbs it.',
    grants: ['cbt_exposure_hierarchy'],
    skill: 12,
    requires: { minPracticeLevel: 3 },
  },

  // ── DBT ───────────────────────────────────────────────────────────────────
  {
    id: 'train_dbt_1',
    name: 'DBT Skills Foundations',
    modality: 'dbt',
    tier: 1,
    cost: 800,
    days: 1,
    blurb:
      'A day of cold water, paced breathing and the two-minds diagram. Comes back able to settle a room before trying to talk in it.',
    grants: ['dbt_distress_tolerance', 'dbt_wise_mind'],
    skill: 5,
  },
  {
    id: 'train_dbt_2',
    name: 'DBT: Skills in the Room',
    modality: 'dbt',
    tier: 2,
    cost: 1800,
    days: 2,
    blurb:
      'Two days of interpersonal drills with strangers playing your worst relatives. Comes back able to rehearse the hard ask out loud and to name an urge without obeying it.',
    grants: ['dbt_opposite_action', 'dbt_dear_man'],
    skill: 8,
    requires: { minPracticeLevel: 2 },
  },
  {
    id: 'train_dbt_3',
    name: 'DBT Intensive: Chain Analysis',
    modality: 'dbt',
    tier: 3,
    cost: 3800,
    days: 3,
    blurb:
      'Three days with a consultation team and a very long whiteboard. Comes back able to walk a chain backwards, link by link, without flinching at link nine.',
    grants: ['dbt_chain_analysis'],
    skill: 12,
    requires: { minPracticeLevel: 3 },
  },

  // ── EMDR ──────────────────────────────────────────────────────────────────
  {
    id: 'train_emdr_1',
    name: 'EMDR Part One: Preparation',
    modality: 'emdr',
    tier: 1,
    cost: 900,
    days: 1,
    blurb:
      'Preparation before protocol, which is where the whole model lives. Comes back able to build a calm place and a container that still holds by Thursday.',
    grants: ['emdr_resource_installation', 'emdr_container_exercise'],
    skill: 5,
  },
  {
    id: 'train_emdr_2',
    name: 'EMDR Part Two: Targeting',
    modality: 'emdr',
    tier: 2,
    cost: 2000,
    days: 2,
    blurb:
      'Two days of finding the first address a feeling ever had. Comes back able to float a client back to it, and to offer one question when the processing loops.',
    grants: ['emdr_float_back', 'emdr_cognitive_interweave'],
    skill: 8,
    requires: { minPracticeLevel: 2 },
  },
  {
    id: 'train_emdr_3',
    name: 'EMDR Certification Consultation',
    modality: 'emdr',
    tier: 3,
    cost: 4200,
    days: 3,
    blurb:
      'Three days of taped sets picked over by a consultant. Comes back certified for the full protocol and, harder, able to say nothing while the charge comes down.',
    grants: ['emdr_bilateral_processing'],
    skill: 12,
    requires: { minPracticeLevel: 3 },
  },

  // ── Somatic ───────────────────────────────────────────────────────────────
  {
    id: 'train_somatic_1',
    name: 'Somatic Foundations',
    modality: 'somatic',
    tier: 1,
    cost: 750,
    days: 1,
    blurb:
      'A day spent entirely below the neck. Comes back able to get feet on a floor and eyes around a room until the body agrees the room is only a room.',
    grants: ['somatic_grounding', 'somatic_orienting'],
    skill: 5,
  },
  {
    id: 'train_somatic_2',
    name: 'Somatic Practice: Tracking & Titration',
    modality: 'somatic',
    tier: 2,
    cost: 1650,
    days: 2,
    blurb:
      'Two days of scanning and sipping. Comes back able to read a jaw before a sentence, and to take a memory a teaspoon at a time.',
    grants: ['somatic_body_scan', 'somatic_titration'],
    skill: 8,
    requires: { minPracticeLevel: 2 },
  },
  {
    id: 'train_somatic_3',
    name: 'Advanced Somatic: Pendulation',
    modality: 'somatic',
    tier: 3,
    cost: 3600,
    days: 3,
    blurb:
      'Three days tracking a nervous system with a supervisor at their shoulder. Comes back able to swing a body between the tight place and the easy one until it remembers it can move.',
    grants: ['somatic_pendulation'],
    skill: 12,
    requires: { minPracticeLevel: 3 },
  },

  // ── Psychodynamic ─────────────────────────────────────────────────────────
  {
    id: 'train_psychodynamic_1',
    name: 'Psychodynamic Listening',
    modality: 'psychodynamic',
    tier: 1,
    cost: 680,
    days: 1,
    blurb:
      'A day of listening exercises and silences left deliberately unfilled. Comes back able to follow a drift without steering it, and to map who a person has ever been able to call.',
    grants: ['psychodynamic_free_association', 'psychodynamic_attachment_mapping'],
    skill: 5,
  },
  {
    id: 'train_psychodynamic_2',
    name: 'Dreams & Defences',
    modality: 'psychodynamic',
    tier: 2,
    cost: 1500,
    days: 2,
    blurb:
      'Two days on the moves people make when the subject gets close. Comes back able to take a dream seriously and to name a joke for what it was doing, kindly.',
    grants: ['psychodynamic_dream_material', 'psychodynamic_defense_interpretation'],
    skill: 8,
    requires: { minPracticeLevel: 2 },
  },
  {
    id: 'train_psychodynamic_3',
    name: 'Transference-Focused Supervision',
    modality: 'psychodynamic',
    tier: 3,
    cost: 3900,
    days: 3,
    blurb:
      'Three days of their own sessions read back to them by someone senior. Comes back able to use what happens between the two of them, live in the room, as the material.',
    grants: ['psychodynamic_transference_work'],
    skill: 12,
    requires: { minPracticeLevel: 3 },
  },

  // ── ACT ───────────────────────────────────────────────────────────────────
  {
    id: 'train_act_1',
    name: 'ACT Foundations: Values & Defusion',
    modality: 'act',
    tier: 1,
    cost: 650,
    days: 1,
    blurb:
      'A day of compass metaphors and slightly too many worksheets. Comes back able to ask what a life is meant to be about, and to sing a cruel sentence until it loses teeth.',
    grants: ['act_values_clarification', 'act_cognitive_defusion'],
    skill: 5,
  },
  {
    id: 'train_act_2',
    name: 'ACT: Willingness & Committed Action',
    modality: 'act',
    tier: 2,
    cost: 1450,
    days: 2,
    blurb:
      'Two days of open hands and very small promises. Comes back able to stop the wrestling, then shrink a value down to something doable before Thursday.',
    grants: ['act_acceptance_willingness', 'act_committed_action'],
    skill: 8,
    requires: { minPracticeLevel: 2 },
  },
  {
    id: 'train_act_3',
    name: 'ACT Advanced: The Observing Self',
    modality: 'act',
    tier: 3,
    cost: 3200,
    days: 3,
    blurb:
      'Three days on the part of a person that has watched all of it and is still here. Comes back able to help somebody stand outside their own weather without pretending it is not raining.',
    grants: ['act_self_as_context'],
    skill: 12,
    requires: { minPracticeLevel: 3 },
  },

  // ── Play ──────────────────────────────────────────────────────────────────
  {
    id: 'train_play_1',
    name: 'Play Therapy Foundations',
    modality: 'play',
    tier: 1,
    cost: 620,
    days: 1,
    blurb:
      'A day on the floor with a sand tray and a pack of cards. Comes back able to lose a board game gracefully and let a child say the thing sideways.',
    grants: ['play_sand_tray', 'play_therapeutic_games'],
    skill: 5,
  },
  {
    id: 'train_play_2',
    name: 'Play Therapy: Externalising & Narrative',
    modality: 'play',
    tier: 2,
    cost: 1500,
    days: 2,
    blurb:
      'Two days of felt tips, puppets and no adult chairs anywhere. Comes back able to give a worry a face, a silly name and a much smaller size.',
    grants: ['play_art_externalising', 'play_puppet_narrative'],
    skill: 8,
    requires: { minPracticeLevel: 2 },
  },
  {
    id: 'train_play_3',
    name: 'Parent Coaching Certification',
    modality: 'play',
    tier: 3,
    cost: 3100,
    days: 3,
    blurb:
      'Three days coaching the grown-ups instead of the child. Comes back able to teach labelled praise, one clear instruction at a time, and the same bedtime every night.',
    grants: ['play_parent_coaching'],
    skill: 12,
    requires: { minPracticeLevel: 3 },
  },

  // ── Family systems ────────────────────────────────────────────────────────
  {
    id: 'train_family_1',
    name: 'Family Systems Foundations',
    modality: 'family',
    tier: 1,
    cost: 700,
    days: 1,
    blurb:
      'A day of genograms and questions asked the long way round the circle. Comes back able to fit three generations on one sheet and spot what keeps repeating.',
    grants: ['family_genogram', 'family_circular_questioning'],
    skill: 5,
  },
  {
    id: 'train_family_2',
    name: 'Structure & Reflecting Practice',
    modality: 'family',
    tier: 2,
    cost: 1700,
    days: 2,
    blurb:
      'Two days on hierarchy, and two afternoons behind a one-way mirror. Comes back able to get a child out of the middle, and to speak warmly about a family while they listen.',
    grants: ['family_structural_boundary', 'family_reflecting_team'],
    skill: 8,
    requires: { minPracticeLevel: 2 },
  },
  {
    id: 'train_family_3',
    name: 'Family Sculpting Intensive',
    modality: 'family',
    tier: 3,
    cost: 3500,
    days: 3,
    blurb:
      'Three days of chairs moved on purpose. Comes back able to stand a family the way it actually feels, move one person, and let the room go quiet.',
    grants: ['family_sculpting'],
    skill: 12,
    requires: { minPracticeLevel: 3 },
  },
];
