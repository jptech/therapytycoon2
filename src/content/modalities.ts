import type { Modality } from '../sim/types';

/**
 * The eight schools a therapist can practise from.
 *
 * `prop` is the object the office scene puts in their room — the thing a player
 * can point at and say "oh, that one's the somatic therapist". `color` keys the
 * portrait ring, the technique cards and the training aisle, and every hue here
 * sits inside the lamplit palette (ink teal, amber, cream, sage, plum, brick).
 */
export const MODALITIES: readonly Modality[] = [
  {
    id: 'cbt',
    name: 'Cognitive Behavioural Therapy',
    blurb:
      'Catches the thought before the feeling hardens around it — written down, held up to the evidence, revised in ink.',
    strongWith: ['anxiety', 'depression', 'ocd'],
    prop: 'a whiteboard ruled into three columns, half-erased',
    color: '#3F7E8C',
  },
  {
    id: 'dbt',
    name: 'Dialectical Behaviour Therapy',
    blurb:
      'Holds two true things at once — you are doing your best, and you can do better — then teaches the skills for the days that arrive sideways.',
    strongWith: ['identity', 'substance', 'bipolar'],
    prop: 'a fanned deck of laminated skills cards, corners soft from use',
    color: '#4C7FA8',
  },
  {
    id: 'emdr',
    name: 'EMDR',
    blurb:
      'Holds the memory loosely while attention travels left, right, left, until the past stops arriving in the present tense.',
    strongWith: ['trauma', 'grief', 'anxiety'],
    prop: 'a light bar on a low tripod, angled at the empty chair',
    color: '#6A5AA0',
  },
  {
    id: 'somatic',
    name: 'Somatic Therapy',
    blurb:
      'Starts below the neck: breath, feet on floor, and the shoulder that has been braced since a Tuesday four years ago.',
    strongWith: ['trauma', 'burnout', 'anxiety'],
    prop: 'a rolled yoga mat standing in the corner like a patient cat',
    color: '#8FAF8B',
  },
  {
    id: 'psychodynamic',
    name: 'Psychodynamic Therapy',
    blurb:
      'Listens for the old pattern humming under the new complaint, and pays close attention to what the silences are doing.',
    strongWith: ['depression', 'identity', 'relationship', 'grief'],
    prop: 'a low worn couch with the clock turned away from it',
    color: '#8B6B8F',
  },
  {
    id: 'act',
    name: 'Acceptance & Commitment Therapy',
    blurb:
      'Stops wrestling the thought and asks what your hands would be doing if the wrestling stopped — values first, comfort later.',
    strongWith: ['burnout', 'anxiety', 'depression'],
    prop: 'a brass compass on the windowsill, needle never quite still',
    color: '#C9954A',
  },
  {
    id: 'play',
    name: 'Play Therapy',
    blurb:
      "Children tell it sideways — in sand, in small figures, in a long story about somebody else's dragon — and it counts just the same.",
    strongWith: ['behavioral', 'adhd', 'trauma'],
    prop: 'a sand tray and a basket of chipped wooden figures',
    color: '#E0785C',
  },
  {
    id: 'family',
    name: 'Family Systems Therapy',
    blurb:
      'Treats the room rather than the person in it: every household runs a pattern, and patterns can be renegotiated out loud.',
    strongWith: ['relationship', 'behavioral', 'eating', 'psychosis'],
    prop: 'a ring of mismatched chairs, one always pulled slightly back',
    color: '#B5717E',
  },
];
