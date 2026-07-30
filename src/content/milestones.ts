import type { MilestoneDef, SnapshotForMilestones } from '../sim/types';

/**
 * Milestones — the practice's scrapbook.
 *
 * These are celebrations, not an economy. Every reward here is deliberately
 * small: a milestone should feel like someone taping a photo to the fridge,
 * not like a payday you optimise toward. The player should never reroute a
 * run to farm one.
 *
 * Each `check` reads ONLY the fields on SnapshotForMilestones — the sim hands
 * that snapshot in once a day and after significant beats, so checks must be
 * cheap, pure, and free of side effects.
 *
 * Tiers: 1 = the first fortnight's worth of firsts, 2 = a practice finding its
 * feet, 3 = the long haul. Names are written to be screenshot-worthy; blurbs
 * are one line and carry a concrete image, never a stat restated in prose.
 */
export const MILESTONES: readonly MilestoneDef[] = [
  // ── Endings ───────────────────────────────────────────────────────────────
  {
    id: 'ms_first_cure',
    name: 'The First Goodbye',
    blurb:
      'They said the thing they arrived unable to say, and then asked whether the bus outside still runs at six.',
    check: (s: SnapshotForMilestones) => s.cures >= 1,
    reward: { cash: 250, xp: 60, reputation: 2 },
    icon: '🌱',
    tier: 1,
  },
  {
    id: 'ms_five_cures',
    name: 'Five Good Endings',
    blurb:
      'Five people finished. Not one of them finished the same way, which is the part nobody warns you about.',
    check: (s: SnapshotForMilestones) => s.cures >= 5,
    reward: { cash: 300, xp: 80, reputation: 2 },
    icon: '🍃',
    tier: 1,
  },
  {
    id: 'ms_twenty_five_cures',
    name: 'The Photo Wall Fills',
    blurb:
      'Twenty-five frames down the corridor. New clients slow to read them and reach the room a little braver.',
    check: (s: SnapshotForMilestones) => s.cures >= 25,
    reward: { cash: 900, xp: 200, reputation: 3 },
    icon: '🖼️',
    tier: 2,
  },
  {
    id: 'ms_hundred_cures',
    name: 'The Hundredth Goodbye',
    blurb:
      'A hundred people have finished here. You stopped counting somewhere in the sixties and started again tonight.',
    check: (s: SnapshotForMilestones) => s.cures >= 100,
    reward: { cash: 2500, xp: 400, reputation: 4 },
    icon: '🕯️',
    tier: 3,
  },
  {
    id: 'ms_first_week_cure',
    name: 'Brief, and Done Properly',
    blurb:
      'Someone finished inside the first week. Short work is not a shortcut — it is a skill, and you have it.',
    check: (s: SnapshotForMilestones) => s.day <= 7 && s.cures >= 1,
    reward: { cash: 600, xp: 140, reputation: 3 },
    icon: '⚡',
    tier: 2,
  },

  // ── The hard cases ────────────────────────────────────────────────────────
  {
    id: 'ms_first_complex_cure',
    name: 'The File Nobody Wanted',
    blurb:
      'Two conditions, three previous therapists, and a referral letter that read like an apology. It ended well anyway.',
    check: (s: SnapshotForMilestones) => s.complexCures >= 1,
    reward: { cash: 850, xp: 220, reputation: 3 },
    icon: '🪢',
    tier: 2,
  },
  {
    id: 'ms_ten_complex_cures',
    name: 'Where the Hard Cases Land',
    blurb:
      'Ten of the referrals other clinics called ‘not a good fit’. Ten endings on your side of the ledger.',
    check: (s: SnapshotForMilestones) => s.complexCures >= 10,
    reward: { cash: 2200, xp: 380, reputation: 4 },
    icon: '📚',
    tier: 3,
  },

  // ── The team ──────────────────────────────────────────────────────────────
  {
    id: 'ms_first_hire',
    name: 'No Longer the Only One',
    blurb:
      'A second coat on the hook by the door. The kettle goes on twice as often and the quiet between sessions has company.',
    check: (s: SnapshotForMilestones) => s.therapists >= 2,
    reward: { cash: 350, xp: 70, reputation: 1 },
    icon: '🤝',
    tier: 1,
  },
  {
    id: 'ms_three_therapists',
    name: 'A Team, Not a Rota',
    blurb:
      'Three clinicians, three ways of hearing the same story. Case consult stops being a formality on Thursday.',
    check: (s: SnapshotForMilestones) => s.therapists >= 3,
    reward: { cash: 700, xp: 160, reputation: 2 },
    icon: '👥',
    tier: 2,
  },
  {
    id: 'ms_six_therapists',
    name: 'The Long Table',
    blurb:
      'Six of you at Monday handover. Someone brings pastries now and nobody can remember who started it.',
    check: (s: SnapshotForMilestones) => s.therapists >= 6,
    reward: { cash: 1800, xp: 300, reputation: 3 },
    icon: '🥐',
    tier: 3,
  },
  {
    id: 'ms_morale_high',
    name: 'A Place People Want to Work',
    blurb:
      'Five clinicians or more, and not one of them counting the minutes to five o’clock.',
    check: (s: SnapshotForMilestones) => s.therapists >= 5 && s.avgMorale >= 85,
    reward: { cash: 1700, xp: 280, reputation: 3 },
    icon: '☕',
    tier: 3,
  },

  // ── The building ──────────────────────────────────────────────────────────
  {
    id: 'ms_level_two',
    name: 'Room Two',
    blurb: 'The storage cupboard becomes an office. The mop finds somewhere else to live.',
    check: (s: SnapshotForMilestones) => s.practiceLevel >= 2,
    reward: { cash: 300, xp: 60, reputation: 1 },
    icon: '🚪',
    tier: 1,
  },
  {
    id: 'ms_level_four',
    name: 'A Practice with a Corridor',
    blurb:
      'Enough rooms that you point people toward the right door, and enough doors that you sometimes get it wrong.',
    check: (s: SnapshotForMilestones) => s.practiceLevel >= 4,
    reward: { cash: 1000, xp: 200, reputation: 2 },
    icon: '🧭',
    tier: 2,
  },
  {
    id: 'ms_level_six',
    name: 'Someone Else Answers the Phone',
    blurb:
      'A real front desk, a real diary, and a calendar that no longer lives entirely inside your head.',
    check: (s: SnapshotForMilestones) => s.practiceLevel >= 6,
    reward: { cash: 1200, xp: 240, reputation: 2 },
    icon: '☎️',
    tier: 2,
  },
  {
    id: 'ms_level_eight',
    name: 'An Institution',
    blurb: 'Eight rooms lit until seven in the evening. People give directions using your building.',
    check: (s: SnapshotForMilestones) => s.practiceLevel >= 8,
    reward: { cash: 2400, xp: 380, reputation: 3 },
    icon: '🏛️',
    tier: 3,
  },

  // ── Money, which is only ever a means ─────────────────────────────────────
  {
    id: 'ms_cash_ten_k',
    name: 'A Cushion Under the Practice',
    blurb: 'Ten thousand banked. A bad month becomes a bad month instead of a catastrophe.',
    check: (s: SnapshotForMilestones) => s.cash >= 10000,
    reward: { cash: 600, xp: 150, reputation: 2 },
    icon: '🪙',
    tier: 2,
  },
  {
    id: 'ms_cash_fifty_k',
    name: 'Money Enough to Say No',
    blurb:
      'Fifty thousand in reserve. You can decline work that would be wrong for you — the only real use of money in this trade.',
    check: (s: SnapshotForMilestones) => s.cash >= 50000,
    reward: { cash: 1500, xp: 300, reputation: 3 },
    icon: '🏦',
    tier: 3,
  },

  // ── Standing ──────────────────────────────────────────────────────────────
  {
    id: 'ms_reputation_fifty',
    name: 'Word of Mouth',
    blurb:
      'Half the neighbourhood could name your practice. People arrive already trusting you a little, which is a gift and a weight.',
    check: (s: SnapshotForMilestones) => s.reputation >= 50,
    reward: { cash: 800, xp: 180, reputation: 2 },
    icon: '🗣️',
    tier: 2,
  },
  {
    id: 'ms_reputation_seventy_five',
    name: 'The First Number They Give',
    blurb:
      'When a physician runs out of ideas, yours is the number they read out from memory.',
    check: (s: SnapshotForMilestones) => s.reputation >= 75,
    reward: { cash: 2000, xp: 320, reputation: 3 },
    icon: '📇',
    tier: 3,
  },
  {
    id: 'ms_reputation_ninety',
    name: 'Best in the Region',
    blurb: 'Clinics three counties over ring to ask how you did it. You are still not entirely sure.',
    check: (s: SnapshotForMilestones) => s.reputation >= 90,
    reward: { cash: 2500, xp: 400, reputation: 4 },
    icon: '🌟',
    tier: 3,
  },

  // ── The neighbourhood ─────────────────────────────────────────────────────
  {
    id: 'ms_trust_sixty',
    name: 'Nobody Turned Away',
    blurb:
      'Sliding scale honoured, waiting list honest, hard calls answered. The neighbourhood noticed before you did.',
    check: (s: SnapshotForMilestones) => s.communityTrust >= 60,
    reward: { cash: 750, xp: 170, reputation: 2 },
    icon: '🫂',
    tier: 2,
  },
  {
    id: 'ms_trust_eighty_five',
    name: 'Ours, Not Yours',
    blurb:
      'People have stopped calling it your clinic. They call it the clinic, and they mean theirs.',
    check: (s: SnapshotForMilestones) => s.communityTrust >= 85,
    reward: { cash: 2100, xp: 340, reputation: 4 },
    icon: '🧶',
    tier: 3,
  },

  // ── The work itself ───────────────────────────────────────────────────────
  {
    id: 'ms_ten_breakthroughs',
    name: 'Ten Times the Room Went Quiet',
    blurb:
      'Ten sessions where something finally moved. You cannot schedule these; you can only be ready when they arrive.',
    check: (s: SnapshotForMilestones) => s.breakthroughs >= 10,
    reward: { cash: 700, xp: 190, reputation: 2 },
    icon: '✨',
    tier: 2,
  },
  {
    id: 'ms_fifty_breakthroughs',
    name: 'A Building That Makes Room for Them',
    blurb:
      'Fifty breakthroughs is not luck. It is a place where people feel safe enough to arrive at one.',
    check: (s: SnapshotForMilestones) => s.breakthroughs >= 50,
    reward: { cash: 2300, xp: 390, reputation: 4 },
    icon: '🌠',
    tier: 3,
  },
  {
    id: 'ms_quality_streak_ten',
    name: 'Ten in a Row',
    blurb:
      'Ten consecutive sessions that landed. Rested staff, right rooms, honest pacing — dull on paper, lovely in the doing.',
    check: (s: SnapshotForMilestones) => s.maxStreak >= 10,
    reward: { cash: 650, xp: 160, reputation: 2 },
    icon: '🎯',
    tier: 2,
  },
  {
    id: 'ms_alumni_twenty_five',
    name: 'The Postcard Drawer',
    blurb:
      'Twenty-five people finished and stayed in touch. A wedding photo, a graduation, one thank-you card two years late.',
    check: (s: SnapshotForMilestones) => s.alumni >= 25,
    reward: { cash: 950, xp: 210, reputation: 3 },
    icon: '📮',
    tier: 2,
  },
  {
    id: 'ms_three_programs',
    name: 'Three Things at Once',
    blurb: 'Three programs running beside the caseload, and the caseload has not noticed a thing.',
    check: (s: SnapshotForMilestones) => s.programs >= 3,
    reward: { cash: 1900, xp: 320, reputation: 3 },
    icon: '🧩',
    tier: 3,
  },

  // ── Time served ───────────────────────────────────────────────────────────
  {
    id: 'ms_day_thirty',
    name: 'One Month Open',
    blurb: 'Thirty days. Rent paid, plants alive, and whoever signed the lease is still here.',
    check: (s: SnapshotForMilestones) => s.day >= 30,
    reward: { cash: 400, xp: 90, reputation: 1 },
    icon: '📆',
    tier: 1,
  },
  {
    id: 'ms_day_hundred',
    name: 'One Hundred Days',
    blurb:
      'A hundred mornings unlocking the same door. Somewhere in there it stopped being a rented room.',
    check: (s: SnapshotForMilestones) => s.day >= 100,
    reward: { cash: 1300, xp: 230, reputation: 2 },
    icon: '🗓️',
    tier: 2,
  },
  {
    id: 'ms_day_two_hundred',
    name: 'Two Hundred Days',
    blurb: 'Two seasons and change. The sapling on the windowsill needs a bigger pot and a proper name.',
    check: (s: SnapshotForMilestones) => s.day >= 200,
    reward: { cash: 2500, xp: 400, reputation: 3 },
    icon: '🌳',
    tier: 3,
  },
];
