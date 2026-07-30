/**
 * Practice philosophies — the mid-game identity commitment.
 *
 * Around practice level 3 the player picks one and lives with it for the run.
 * A philosophy is deliberately a *lean*, not a build: it tilts who walks through
 * the door, cheapens the trainings you were going to buy anyway, and nudges a
 * handful of practice-wide numbers by a few percent. The flavor does the heavy
 * lifting; the math stays polite.
 */
import type { PhilosophyDef } from '../sim/types';

export const PHILOSOPHIES: readonly PhilosophyDef[] = [
  {
    id: 'trauma_informed',
    name: 'Trauma-Informed Center',
    tagline: 'Safety first, always. The work waits for readiness.',
    detail:
      'You rebuild the practice around the pace of a nervous system: intake asks what happened to ' +
      'you instead of what is wrong with you, every room gets a lamp instead of an overhead and a ' +
      'clear line to the door, and Process stops being anyone’s default. Referrers begin sending the ' +
      'cases other clinics decline — comorbid, long, court-adjacent — and they pay accordingly. ' +
      'Trauma and somatic trainings run cheap because your own supervisors already teach them. The ' +
      'work is slower, and the wins land considerably harder.',
    referralBias: {
      trauma: 1.8,
      substance: 1.4,
      grief: 1.3,
      identity: 1.2,
      anxiety: 1.05,
      relationship: 0.75,
      behavioral: 0.65,
      adhd: 0.6,
    },
    trainingDiscount: 0.82,
    favoredPrograms: ['crisis_line', 'group_therapy'],
    mods: {
      quality: 0.02,
      communityTrustDrift: 0.15,
      reputationMult: 1.05,
      complexCaseAffinity: 0.18,
    },
    accentColor: '#8B6B8F',
    icon: '🕯️',
  },
  {
    id: 'family_community',
    name: 'Family & Community Clinic',
    tagline: 'Nobody heals alone. Bring the whole kitchen table.',
    detail:
      'The waiting room grows a toy bin and a coffee urn, and sessions stop ending at the client — ' +
      'you start asking who else is in the house. Schools, pediatricians and the parish hall learn ' +
      'your number, so referrals arrive in clusters: a sibling, then a cousin, then the family two ' +
      'doors down. Community trust climbs on its own and stays climbed, though prestige comes slower ' +
      'than it would in a boutique practice. You will run far more child and family work than you ' +
      'planned, and be better at it than you expected.',
    referralBias: {
      relationship: 1.7,
      behavioral: 1.65,
      adhd: 1.4,
      grief: 1.2,
      identity: 1.1,
      trauma: 0.75,
      eating: 0.7,
      psychosis: 0.6,
    },
    trainingDiscount: 0.85,
    favoredPrograms: ['school_partnership', 'workshops'],
    mods: {
      quality: 0.01,
      communityTrustDrift: 0.25,
      reputationMult: 0.97,
      complexCaseAffinity: 0.06,
    },
    accentColor: '#8FAF8B',
    icon: '🏡',
  },
  {
    id: 'integrative_wellness',
    name: 'Integrative Wellness Studio',
    tagline: 'Body, breath and mind treated as one system.',
    detail:
      'You take the lease next door, put down a floor that welcomes bare feet, and start scheduling ' +
      'breathwork and movement alongside the fifty-minute hour. Clients arrive self-referred and ' +
      'articulate — burnout, low-grade dread, the sleep that quietly stopped working — and they pay ' +
      'full fee and tell their colleagues on Monday. Reputation compounds faster here than anywhere ' +
      'else in town. The trade is depth: the acute end of the caseload goes to somebody else, and ' +
      'your team gets fewer chances to learn the hard cases.',
    referralBias: {
      burnout: 1.75,
      anxiety: 1.45,
      depression: 1.3,
      eating: 1.2,
      adhd: 1.1,
      trauma: 0.85,
      substance: 0.75,
      psychosis: 0.6,
    },
    trainingDiscount: 0.88,
    favoredPrograms: ['workshops', 'research_study'],
    mods: {
      quality: 0.03,
      communityTrustDrift: -0.1,
      reputationMult: 1.12,
      complexCaseAffinity: 0.05,
    },
    accentColor: '#D98E3C',
    icon: '🌿',
  },
];
