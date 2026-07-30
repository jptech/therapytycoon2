import type { CampaignStageDef, SnapshotForMilestones } from '../sim/types';

/**
 * The Center of Excellence campaign — the run's long spine.
 *
 * Five stages of a real-feeling accreditation process, paced to span roughly
 * day 25 (a letter posted by a practice that barely exists yet) to day 180
 * (a brass plate beside the door). Between them the requirements walk across
 * every system in the game — cures and complex cures, staffing, morale,
 * community trust, reputation, practice level, programs, and the alumni you
 * can still reach for follow-up data.
 *
 * Design rules for this file:
 *  - Requirements are always visible and always readable as a checklist line.
 *    No stage should ever leave the player wondering what the board wants.
 *  - Every stage is satisfiable by more than one kind of practice. A
 *    trauma-heavy clinic and a family-and-community clinic reach stage 4 by
 *    different routes and both routes are legitimate.
 *  - Rewards are real but never a substitute for running the place well. The
 *    final award is the exception: it is meant to be a ceremony.
 *
 * `measure` reads ONLY SnapshotForMilestones and returns the raw current value
 * beside its target so the UI can render "18 / 20" and a progress bar without
 * knowing anything about the requirement.
 */
export const CAMPAIGN_STAGES: readonly CampaignStageDef[] = [
  {
    id: 'camp_1_letter_of_intent',
    name: 'Letter of Intent',
    blurb:
      'The regional board keeps a list of practices worth watching, and getting onto it costs one honest letter and two references. Nobody is coming to visit yet — they only want to know you exist and intend to be good at this.',
    requirements: [
      {
        id: 'req_1_days_open',
        label: 'Days in continuous operation',
        measure: (s: SnapshotForMilestones) => ({ value: s.day, target: 20 }),
      },
      {
        id: 'req_1_cures',
        label: 'Completed courses of care on file',
        measure: (s: SnapshotForMilestones) => ({ value: s.cures, target: 6 }),
      },
      {
        id: 'req_1_therapists',
        label: 'Licensed clinicians on the roster',
        measure: (s: SnapshotForMilestones) => ({ value: s.therapists, target: 2 }),
      },
      {
        id: 'req_1_reputation',
        label: 'Professional standing in the region',
        measure: (s: SnapshotForMilestones) => ({ value: s.reputation, target: 30 }),
      },
      {
        id: 'req_1_practice_level',
        label: 'Practice level',
        measure: (s: SnapshotForMilestones) => ({ value: s.practiceLevel, target: 2 }),
      },
    ],
    reward: {
      cash: 800,
      reputation: 3,
      xp: 250,
      log: 'The letter goes into the box on the corner. You check twice that it went all the way in.',
    },
  },

  {
    id: 'camp_2_provisional_registration',
    name: 'Provisional Registration',
    blurb:
      'Your name in small type on the public register — renewable yearly, revocable at any time. It is the first stage a referring physician can actually look you up in, and the referrals change the week it lands.',
    requirements: [
      {
        id: 'req_2_cures',
        label: 'Completed courses of care',
        measure: (s: SnapshotForMilestones) => ({ value: s.cures, target: 20 }),
      },
      {
        id: 'req_2_complex_cures',
        label: 'Complex cases carried to completion',
        measure: (s: SnapshotForMilestones) => ({ value: s.complexCures, target: 2 }),
      },
      {
        id: 'req_2_therapists',
        label: 'Clinicians on staff',
        measure: (s: SnapshotForMilestones) => ({ value: s.therapists, target: 3 }),
      },
      {
        id: 'req_2_morale',
        label: 'Average staff morale',
        measure: (s: SnapshotForMilestones) => ({ value: s.avgMorale, target: 60 }),
      },
      {
        id: 'req_2_practice_level',
        label: 'Practice level',
        measure: (s: SnapshotForMilestones) => ({ value: s.practiceLevel, target: 3 }),
      },
    ],
    reward: {
      cash: 2200,
      reputation: 5,
      xp: 500,
      allMorale: 3,
      log: 'Provisional registration granted. The certificate goes up slightly crooked and everyone agrees to leave it.',
    },
  },

  {
    id: 'camp_3_self_study',
    name: 'The Self-Study',
    blurb:
      'Eighty pages about yourselves, written by yourselves, with outcome data attached and nowhere to hide. The hard part is not the writing — it is finding out whether the numbers say what you hoped they would.',
    requirements: [
      {
        id: 'req_3_cures',
        label: 'Completed courses of care',
        measure: (s: SnapshotForMilestones) => ({ value: s.cures, target: 45 }),
      },
      {
        id: 'req_3_complex_cures',
        label: 'Complex cases carried to completion',
        measure: (s: SnapshotForMilestones) => ({ value: s.complexCures, target: 6 }),
      },
      {
        id: 'req_3_alumni',
        label: 'Alumni reachable for outcome follow-up',
        measure: (s: SnapshotForMilestones) => ({ value: s.alumni, target: 40 }),
      },
      {
        id: 'req_3_community_trust',
        label: 'Community trust index',
        measure: (s: SnapshotForMilestones) => ({ value: s.communityTrust, target: 55 }),
      },
      {
        id: 'req_3_programs',
        label: 'Community programs in operation',
        measure: (s: SnapshotForMilestones) => ({ value: s.programs, target: 1 }),
      },
    ],
    reward: {
      cash: 4000,
      reputation: 7,
      xp: 900,
      log: 'The self-study is bound, couriered, and acknowledged by email eleven days later. Eleven days is a long time to look at a printer.',
    },
  },

  {
    id: 'camp_4_site_visit',
    name: 'The Site Visit',
    blurb:
      'Two surveyors, two days, and unannounced access to every room and every clinician who will talk to them. They are not looking for a perfect practice — they are looking for one that tells the truth about itself.',
    requirements: [
      {
        id: 'req_4_therapists',
        label: 'Clinicians on staff',
        measure: (s: SnapshotForMilestones) => ({ value: s.therapists, target: 5 }),
      },
      {
        id: 'req_4_morale',
        label: 'Average staff morale',
        measure: (s: SnapshotForMilestones) => ({ value: s.avgMorale, target: 70 }),
      },
      {
        id: 'req_4_reputation',
        label: 'Professional standing in the region',
        measure: (s: SnapshotForMilestones) => ({ value: s.reputation, target: 65 }),
      },
      {
        id: 'req_4_programs',
        label: 'Community programs in operation',
        measure: (s: SnapshotForMilestones) => ({ value: s.programs, target: 2 }),
      },
      {
        id: 'req_4_practice_level',
        label: 'Practice level',
        measure: (s: SnapshotForMilestones) => ({ value: s.practiceLevel, target: 5 }),
      },
    ],
    reward: {
      cash: 6500,
      reputation: 10,
      xp: 1400,
      allMorale: 5,
      log: 'The surveyors leave at four. One of them stops in the doorway to say the waiting room is the kindest she has stood in all year.',
    },
  },

  {
    id: 'camp_5_designation',
    name: 'Designation',
    blurb:
      'The commission meets quarterly and votes without you in the room. If it carries, the Center of Excellence designation arrives by letter, and the brass plate arrives six weeks after that.',
    requirements: [
      {
        id: 'req_5_days_open',
        label: 'Days in continuous operation',
        measure: (s: SnapshotForMilestones) => ({ value: s.day, target: 150 }),
      },
      {
        id: 'req_5_cures',
        label: 'Completed courses of care',
        measure: (s: SnapshotForMilestones) => ({ value: s.cures, target: 120 }),
      },
      {
        id: 'req_5_complex_cures',
        label: 'Complex cases carried to completion',
        measure: (s: SnapshotForMilestones) => ({ value: s.complexCures, target: 18 }),
      },
      {
        id: 'req_5_reputation',
        label: 'Professional standing in the region',
        measure: (s: SnapshotForMilestones) => ({ value: s.reputation, target: 82 }),
      },
      {
        id: 'req_5_community_trust',
        label: 'Community trust index',
        measure: (s: SnapshotForMilestones) => ({ value: s.communityTrust, target: 80 }),
      },
    ],
    reward: {
      cash: 25000,
      reputation: 25,
      communityTrust: 12,
      xp: 4000,
      allMorale: 12,
      setFlag: 'accredited',
      log: 'Center of Excellence. The plate goes up beside the door, slightly too low — at exactly the height a child can read.',
    },
  },
];
