/**
 * Programs — the Act 3 content engine.
 *
 * Each program is a persistent initiative: you pay to stand it up, you pay every
 * week to keep it running, and you assign real clinicians whose energy it eats.
 * The payoffs are deliberately non-overlapping so that "which programs do we run"
 * is a statement about what kind of practice this is, not a math problem with a
 * single right answer. You cannot run them all well.
 */
import type { ProgramDef } from '../sim/types';

export const PROGRAMS: readonly ProgramDef[] = [
  {
    id: 'group_therapy',
    name: 'Group Therapy Track',
    blurb: 'Eight chairs in a circle, one clinician, Tuesday evenings.',
    detail:
      'A closed twelve-week group, eight members, coffee on at half past six. Group work reaches ' +
      'people who stall one-to-one — hearing a stranger say the thing you have never said out loud ' +
      'does work no worksheet can. It needs a room that seats a circle without anyone ending up ' +
      'face to face with a filing cabinet.',
    setupCost: 2600,
    weeklyUpkeep: 240,
    staffSlots: 1,
    energyPerDay: 6,
    requires: {
      minPracticeLevel: 3,
      hasUpgrade: ['up_group_room'],
    },
    payoff: {
      weeklyCash: 1150,
      weeklyReputation: 1.2,
      weeklyCommunityTrust: 0.6,
    },
    events: ['ev_program_group_empty_chair'],
    icon: '🪑',
    color: '#8FAF8B',
  },
  {
    id: 'workshops',
    name: 'Community Workshops',
    blurb: 'Saturday mornings, twenty folding chairs, no diagnosis required.',
    detail:
      'A rotating weekend series — sleep, panic, parenting a teenager who will not speak to you — ' +
      'open to anyone who signs up. The door fee covers a very good Saturday, and roughly one ' +
      'attendee in six eventually calls to book properly. Whoever runs them comes back tired and ' +
      'slightly famous.',
    setupCost: 1800,
    weeklyUpkeep: 160,
    staffSlots: 1,
    energyPerDay: 5,
    requires: {
      minPracticeLevel: 2,
      minReputation: 28,
    },
    payoff: {
      weeklyCash: 780,
      weeklyReputation: 3.2,
      weeklyCommunityTrust: 0.9,
      weeklyReferrals: 0.6,
    },
    events: ['ev_program_workshop_oversubscribed'],
    icon: '🖍️',
    color: '#E8A94C',
  },
  {
    id: 'school_partnership',
    name: 'School Partnership',
    blurb: 'Two afternoons a week in a borrowed counselor’s office.',
    detail:
      'The district contracts you for two afternoons a week: you carry the referrals the school ' +
      'counselor cannot hold alone, in an office with a window that does not open. The money is ' +
      'modest and the paperwork is not, but families talk, and a practice the schools trust is a ' +
      'practice the neighborhood trusts. The district will not sign without child and adolescent ' +
      'certification on file.',
    setupCost: 2200,
    weeklyUpkeep: 210,
    staffSlots: 1,
    energyPerDay: 6,
    requires: {
      minPracticeLevel: 3,
      minCommunityTrust: 30,
      hasUpgrade: ['up_child_certification'],
    },
    payoff: {
      weeklyCash: 430,
      weeklyReputation: 0.8,
      weeklyCommunityTrust: 3.6,
      weeklyReferrals: 2.4,
    },
    events: ['ev_program_school_year_nine'],
    icon: '🎒',
    color: '#79A08F',
  },
  {
    id: 'crisis_line',
    name: 'Crisis Line',
    blurb: 'Someone picks up at three in the morning. That is the whole job.',
    detail:
      'You take a share of the regional after-hours line — two clinicians on rotation, a quiet room ' +
      'with a good chair, a script they stop needing by the third week. It pays almost nothing and ' +
      'costs a great deal: the calls are heavy, the hours are wrong, and staff need real recovery ' +
      'after a rough shift. It is also the fastest way a town learns your door is a real door.',
    setupCost: 3400,
    weeklyUpkeep: 520,
    staffSlots: 2,
    energyPerDay: 11,
    requires: {
      minPracticeLevel: 4,
      minReputation: 40,
      minCommunityTrust: 45,
      minTherapists: 4,
    },
    payoff: {
      weeklyCash: 330,
      weeklyReputation: 4.4,
      weeklyCommunityTrust: 6.5,
      weeklyReferrals: 0.6,
    },
    events: ['ev_program_crisis_line_long_night'],
    icon: '☎️',
    color: '#C2634F',
  },
  {
    id: 'research_study',
    name: 'Outcome Research Study',
    blurb: 'Four months of clean data, then a paper with your name on it.',
    detail:
      'A university partner funds a modest outcomes study out of your own caseload: consent forms, ' +
      'standardized measures at intake and week twelve, two clinicians giving up an afternoon a week ' +
      'to code sessions nobody enjoys coding. Nothing happens for a long time, and then everything ' +
      'happens at once — publication, a citation trail, and referrers with a reason on paper to send ' +
      'you the cases they cannot place.',
    setupCost: 5200,
    weeklyUpkeep: 300,
    staffSlots: 2,
    energyPerDay: 5,
    requires: {
      minPracticeLevel: 5,
      minReputation: 52,
      minTherapists: 4,
    },
    payoff: {
      weeklyCash: 340,
      weeklyReputation: 0.6,
      completionDays: 120,
      completionReward: {
        cash: 9000,
        reputation: 14,
        communityTrust: 6,
        xp: 900,
        allMorale: 8,
        setFlag: 'published_paper',
        log: 'The study publishes. Someone tapes the first page to the break-room fridge and nobody takes it down.',
      },
    },
    events: ['ev_program_research_finding'],
    icon: '🔬',
    color: '#8B6B8F',
  },
  {
    id: 'training_institute',
    name: 'Training Institute',
    blurb: 'Your veterans teach externs. The good ones stay.',
    detail:
      'You take a cohort from the local graduate programs — group supervision on Friday mornings, ' +
      'tuition paid to the practice, live observation behind a door your seniors slowly learn to ' +
      'leave open. Teaching sharpens the teacher. And every cohort leaves behind one or two people ' +
      'you already know how to work with, already trained the way you train.',
    setupCost: 4600,
    weeklyUpkeep: 430,
    staffSlots: 2,
    energyPerDay: 7,
    requires: {
      minPracticeLevel: 5,
      minReputation: 50,
      minTherapists: 5,
    },
    payoff: {
      weeklyCash: 900,
      weeklyReputation: 1.6,
      weeklyCommunityTrust: 0.5,
      weeklyCandidateChance: 0.55,
    },
    events: ['ev_program_institute_extern'],
    icon: '🎓',
    color: '#4E7C7A',
  },
];
