import type { GameEventDef } from '../sim/types';

/**
 * Life events — the modal dilemmas that make up the practice's texture.
 *
 * Scope 'client' events attach to one person on the caseload and are keyed by
 * condition and treatment chapter. Scope 'day' events are practice-wide: the
 * weather, the landlord, the building, the post.
 *
 * Design contract: NO HIDDEN PUNISHMENTS. Every choice's `hint` names the main
 * cost out loud. If a path costs you the hour, the fee, or the client's trust,
 * the player reads that before they click, not after.
 */
export const LIFE_EVENTS: readonly GameEventDef[] = [
  // ───────────────────────────────────────────────────────────────────────────
  // Client scope — 18
  // ───────────────────────────────────────────────────────────────────────────
  {
    id: 'ev_client_crisis_call',
    scope: 'client',
    title: 'The Phone at 9:40 PM',
    body:
      '{client} calls after hours. Not a plan, not a hospital — just a voice that has ' +
      'been holding on since Tuesday and has run out of grip. Behind you the kettle ' +
      'clicks off in a kitchen that suddenly feels very far from the office.',
    weight: 3,
    mood: 'tense',
    // A 9:40 phone call is not a save-for-later. If she rings twice inside a
    // fortnight, the second call happens — a choice that says "expect a crisis
    // call within the week" has to be able to keep its word.
    urgent: true,
    chapters: ['trust', 'work'],
    conditions: ['depression', 'trauma', 'bipolar', 'substance', 'eating'],
    choices: [
      {
        id: 'stay_on_the_line',
        label: 'Sit on the stairs and stay on the line',
        hint: 'Costs you the evening and most of tomorrow morning’s energy. She will remember who picked up.',
        effects: {
          therapistEnergy: -14,
          therapistMorale: -3,
          clientRapport: 0.12,
          clientStability: 0.12,
          clientPatience: 12,
          log: 'Forty minutes on the phone, sitting on the third stair.',
        },
        outcome:
          'By the end she is describing her flat — the lamp, the blanket, the cat on the radiator. You hang up at 10:22 and do not sleep especially well.',
      },
      {
        id: 'hand_to_night_line',
        label: 'Walk the safety plan with her, then hand off to the night line',
        hint: 'Needs your own crisis line running. Less warmth than answering yourself — and you get to sleep.',
        requires: { hasProgram: ['crisis_line'] },
        effects: {
          therapistEnergy: -5,
          clientStability: 0.14,
          clientRapport: 0.05,
          communityTrust: 2,
          log: 'Handed to the night line at 9:58 with a plan already in her hand.',
        },
        outcome:
          'The plan you wrote together in week three turns out to be the thing she reaches for. The night line takes it from there and rings you at eight to say she was fine by eleven.',
      },
      {
        id: 'hold_the_frame',
        label: 'Hold the frame: emergency number tonight, first slot tomorrow',
        hint: 'Correct, defensible, and colder. Rapport dips and she waits alone; you keep your evening.',
        effects: {
          therapistEnergy: -5,
          therapistMorale: -2,
          clientRapport: -0.07,
          clientStability: 0.05,
          clientPatience: -6,
          log: 'Gave the emergency number and the 8 a.m. slot.',
        },
        outcome:
          'She says of course, sorry, of course. She takes the 8 a.m. slot and arrives at 8:04 with the look of someone who got through it without you.',
      },
    ],
  },
  {
    id: 'ev_client_asks_to_end',
    scope: 'client',
    title: '“I think I’m done.”',
    body:
      '{client} says it in the first two minutes, the way people say things they ' +
      'rehearsed on the bus. Work is better. Sleep is better. The folder of homework ' +
      'is in her bag, unopened, and has been for three weeks.',
    weight: 3,
    mood: 'curious',
    chapters: ['work', 'consolidation'],
    choices: [
      {
        id: 'believe_her',
        label: 'Believe her. Plan a proper last session.',
        hint: 'You give up the remaining fees. A clean ending sends her out well and people notice endings.',
        effects: {
          cash: -150,
          reputation: 3,
          communityTrust: 1,
          clientRapport: 0.1,
          clientPatience: 15,
          log: 'Agreed to end, with one session held back for the goodbye.',
        },
        outcome:
          'She books the last one for a fortnight out and turns up early to it, which tells you most of what you need to know.',
      },
      {
        id: 'three_more',
        label: 'Ask for three more: relapse plan, then goodbye',
        hint: 'She agrees, a little reluctantly. The gains stick better; her patience thins for every one of the three.',
        effects: {
          clientProgress: 7,
          clientStability: 0.07,
          clientRapport: -0.05,
          clientPatience: -12,
          log: 'Negotiated three consolidation sessions before ending.',
        },
        outcome:
          'Two of the three are excellent. One is spent watching her check the clock, and you both know why.',
      },
      {
        id: 'what_done_means',
        label: 'Spend the hour on what “done” means to her',
        hint: 'Costs today’s agenda entirely — no ground gained. You’ll both know what this actually is.',
        effects: {
          therapistEnergy: -6,
          therapistXp: 15,
          clientRapport: 0.12,
          clientStability: 0.05,
          log: 'Spent the session on the ending itself.',
        },
        outcome:
          'Twenty minutes in it turns out “done” means her sister said therapy was self-indulgent. That is now the material.',
      },
      {
        id: 'door_ajar',
        label: 'Offer a check-in slot in six weeks, held open',
        hint: 'Needs a practice with a waiting list to spare. Costs you a sellable hour; she leaves with the door ajar.',
        requires: { minReputation: 45 },
        effects: {
          cash: -200,
          reputation: 2,
          communityTrust: 2,
          clientRapport: 0.1,
          clientPatience: 18,
          log: 'Held a slot open six weeks out.',
        },
        outcome:
          'She writes the date on the back of her hand and then, a bit embarrassed, in her actual calendar.',
      },
    ],
  },
  {
    id: 'ev_client_brings_partner',
    scope: 'client',
    title: 'Two Coats on the Hook',
    body:
      '{client} arrives with her partner, who is already apologising for existing. ' +
      '“He wanted to see the room,” she says, hanging up both coats. “He wanted to ' +
      'see if you were real.”',
    weight: 3,
    mood: 'curious',
    chapters: ['work'],
    conditions: ['relationship', 'anxiety', 'depression', 'burnout', 'substance'],
    choices: [
      {
        id: 'invite_him_in',
        label: 'Invite him in for the hour',
        hint: 'An unplanned couples session. Worth a lot if it lands, and today’s individual work simply does not happen.',
        effects: {
          therapistEnergy: -11,
          reputation: 1,
          clientProgress: 5,
          clientRapport: 0.06,
          clientStability: -0.05,
          log: 'Ran an unplanned joint session.',
        },
        outcome:
          'He talks for eleven minutes straight and then stops mid-sentence and says, “Sorry. This is her hour.” That sentence is worth the whole afternoon.',
      },
      {
        id: 'keep_the_frame',
        label: 'Keep the individual frame — he waits with the magazines',
        hint: 'Protects the work you’ve built. He goes home feeling shut out, and she will hear about it all evening.',
        effects: {
          clientRapport: 0.06,
          clientStability: 0.06,
          clientPatience: -8,
          log: 'Kept the individual frame; partner waited in reception.',
        },
        outcome:
          'The hour is one of your better ones. In the car park he asks her what you said, and she says nothing, and that is a Tuesday evening ruined.',
      },
      {
        id: 'ten_minutes',
        label: 'Give him ten minutes at the top, then send him out',
        hint: 'A compromise: he leaves feeling met, and you lose a fifth of the session.',
        effects: {
          therapistEnergy: -6,
          clientProgress: -2,
          clientRapport: 0.08,
          log: 'Ten minutes with the partner, then back to individual work.',
        },
        outcome:
          'He uses nine of the ten to ask whether she is going to be all right, which is a better question than most people manage.',
      },
      {
        id: 'his_own_hour',
        label: 'Offer him his own hour with a colleague',
        hint: 'Needs a practice big enough to hold two people. Adds a referral; she may read it as being handed off.',
        requires: { act: [2, 3] },
        effects: {
          reputation: 1,
          communityTrust: 2,
          clientRapport: -0.05,
          spawnReferral: { severityBias: -1 },
          log: 'Referred the partner for his own sessions.',
        },
        outcome:
          'He books. She is quieter for a fortnight, and then admits it is strange to not be the only one being helped.',
      },
    ],
  },
  {
    id: 'ev_client_jar_of_jam',
    scope: 'client',
    title: 'Damson, Last September',
    body:
      '{client} puts a jar on the low table — handwritten label, rubber band round the ' +
      'lid, a date in September. “My mum’s recipe. You don’t have to keep it.”',
    weight: 4,
    mood: 'warm',
    chapters: ['work', 'consolidation'],
    choices: [
      {
        id: 'accept_it',
        label: 'Accept it, and say out loud what it means',
        hint: 'A small warm moment, freely given. Nothing lost but the tidiness of the ethics handbook.',
        effects: {
          therapistMorale: 4,
          clientRapport: 0.1,
          clientPatience: 8,
          log: 'Accepted the jam. Said thank you properly.',
        },
        outcome: 'It sits on your desk for two days before you can bring yourself to open it.',
      },
      {
        id: 'decline_kindly',
        label: 'Decline kindly and explain the policy',
        hint: 'A clean boundary, honestly explained. She will be quietly mortified for about a week.',
        effects: {
          therapistMorale: -2,
          clientRapport: -0.06,
          clientStability: 0.05,
          clientPatience: -6,
          log: 'Declined the gift; explained the policy.',
        },
        outcome:
          'She nods, says she completely understands, and puts the jar back in her bag with more care than she took getting it out.',
      },
      {
        id: 'for_the_waiting_room',
        label: 'Accept it for the waiting room, not for you',
        hint: 'Splits the difference — the jar lives by the kettle. A little less warmth than taking it home.',
        effects: {
          therapistMorale: 2,
          communityTrust: 1,
          clientRapport: 0.07,
          log: 'The jam lives on the shelf by the kettle now.',
        },
        outcome:
          'By Friday three people have had some on toast and one has asked for the recipe, which she is delighted to be asked for.',
      },
      {
        id: 'ask_for_the_recipe',
        label: 'Ask for the recipe',
        hint: 'Only lands from a therapist who works this way. The biggest warmth in the room today; nothing else changes.',
        requires: { therapistTrait: ['trait_warm'] },
        effects: {
          therapistMorale: 5,
          clientRapport: 0.13,
          clientPatience: 10,
          log: 'Asked for the recipe. Got it, in her mother’s handwriting.',
        },
        outcome:
          'She brings it copied out the following week. At the bottom, in different ink: “Don’t rush the setting point.”',
      },
    ],
  },
  {
    id: 'ev_client_third_no_show',
    scope: 'client',
    title: 'The Third Empty Chair',
    body:
      '{client} has missed three in a row. The texts get shorter each time — “so sorry”, ' +
      'then “work”, and this morning just a thumbs-up on your reminder. The chair is at ' +
      'the angle you left it.',
    weight: 3,
    mood: 'tense',
    choices: [
      {
        id: 'actually_call',
        label: 'Call. Not a reminder — an actual call.',
        hint: 'Burns the slot you were going to write notes in. Often works; sometimes you just get voicemail.',
        effects: {
          therapistEnergy: -6,
          clientRapport: 0.06,
          clientPatience: 14,
          log: 'Rang instead of texting.',
        },
        outcome:
          'She picks up on the sixth ring, in a stairwell somewhere, and the first thing she says is “I thought you’d have given up.”',
      },
      {
        id: 'hold_the_slot',
        label: 'Send the standard letter and hold the slot one more week',
        hint: 'Cheap and fair. The hour sits empty and the waitlist keeps waiting.',
        effects: {
          cash: -110,
          clientPatience: 5,
          log: 'Standard letter sent; slot held a further week.',
        },
        outcome: 'The letter is polite and slightly institutional, and does about what letters do.',
      },
      {
        id: 'charge_the_fee',
        label: 'Charge the late-cancellation fee she signed for',
        hint: 'You get paid today. She may not come back at all — and either way she will tell people.',
        effects: {
          cash: 180,
          clientRapport: -0.08,
          clientPatience: -18,
          communityTrust: -2,
          followUp: { eventId: 'ev_client_asks_to_end', inDays: 5 },
          log: 'Late-cancellation fee applied.',
        },
        outcome:
          'The payment clears within the hour, which is somehow the worst part. She replies with a single full stop.',
      },
      {
        id: 'waive_and_phone',
        label: 'Waive the fee and offer a phone session on her lunch break',
        hint: 'Needs local goodwill to absorb. You lose the fee; she turns up, on a bench, eating a sandwich.',
        requires: { minCommunityTrust: 40 },
        effects: {
          cash: -90,
          communityTrust: 2,
          clientRapport: 0.1,
          clientPatience: 20,
          log: 'Fee waived; met her on the phone at 12:30.',
        },
        outcome:
          'Twenty-five minutes with traffic behind her voice, and more said in it than in the last two in-person hours.',
      },
    ],
  },
  {
    id: 'ev_client_insurance_lapse',
    scope: 'client',
    title: 'Coverage Ends on the 31st',
    body:
      'The authorisation letter for {client} allows four more sessions, then re-review. ' +
      'She has done nine, and she is about three weeks from the part she has never ' +
      'said out loud to anybody.',
    weight: 3,
    mood: 'tense',
    minDay: 10,
    choices: [
      {
        id: 'write_the_reauth',
        label: 'Write the re-authorisation. Properly.',
        hint: 'Two unpaid hours at the kitchen table tonight. Usually approved.',
        effects: {
          therapistEnergy: -12,
          therapistMorale: -2,
          clientStability: 0.05,
          clientPatience: 6,
          log: 'Re-authorisation drafted after hours.',
        },
        outcome:
          'You find yourself writing the sentence “clinically indicated” about a person you like, which never stops being strange.',
      },
      {
        id: 'sliding_scale',
        label: 'Move her to sliding scale and absorb the difference',
        hint: 'Her rate drops permanently. Real money out, real goodwill in.',
        effects: {
          cash: -240,
          communityTrust: 5,
          clientRapport: 0.1,
          clientPatience: 10,
          log: 'Moved to sliding scale.',
        },
        outcome:
          'She asks twice whether you are sure. You say yes twice. She does not ask a third time, and she does not miss another session.',
      },
      {
        id: 'stretch_fortnightly',
        label: 'Space sessions fortnightly to stretch the authorisation',
        hint: 'The money lasts twice as long. So do the gaps, and she loses her momentum in them.',
        effects: {
          clientProgress: -4,
          clientStability: -0.05,
          clientPatience: -8,
          log: 'Sessions spaced to fortnightly.',
        },
        outcome:
          'Every other Thursday she spends the first fifteen minutes catching you up on a fortnight, and there goes the fifteen minutes.',
      },
      {
        id: 'practice_covers',
        label: 'Cover four sessions from practice funds and never mention it',
        hint: 'Costs the practice up front. She never has to ask, and you never get the credit.',
        requires: { minCash: 1500 },
        effects: {
          cash: -480,
          therapistMorale: 3,
          clientRapport: 0.08,
          clientStability: 0.08,
          log: 'Four sessions quietly written off.',
        },
        outcome:
          'The front desk is told to say the authorisation came through. It is the only lie in the building and nobody minds it.',
      },
    ],
  },
  {
    id: 'ev_client_asks_about_medication',
    scope: 'client',
    title: '“Should I Be On Something?”',
    body:
      '{client} asks at minute forty-one, when asking is safest. “My sister takes ' +
      'something. She says it gave her a floor. I don’t even know what I’d be asking ' +
      'for.”',
    weight: 3,
    mood: 'curious',
    conditions: ['depression', 'bipolar', 'ocd', 'psychosis', 'adhd', 'anxiety'],
    choices: [
      {
        id: 'letter_to_gp',
        label: 'Explain your lane, and offer to write to her GP with her consent',
        hint: 'The right answer and a slow one. Costs an evening of letter-writing.',
        effects: {
          therapistEnergy: -7,
          reputation: 1,
          clientRapport: 0.07,
          clientStability: 0.06,
          log: 'Letter to the GP drafted, with consent.',
        },
        outcome:
          'The GP writes back in nine days. Nine days is fast, which tells you something about the last one you sent.',
      },
      {
        id: 'hold_the_question',
        label: 'Hold the question — ask what a “floor” would mean to her',
        hint: 'Good therapy, no referral. She may ask again in three weeks, still unresolved.',
        effects: {
          therapistXp: 12,
          clientRapport: 0.09,
          clientStability: -0.05,
          log: 'Explored the meaning of the question rather than answering it.',
        },
        outcome:
          'A floor, it turns out, is not for standing on. It is so she stops expecting to keep falling.',
      },
      {
        id: 'walk_her_down',
        label: 'Walk her down the corridor to the prescriber you share a building with',
        hint: 'Needs a practice people return calls for. Fastest route to relief; today’s hour is gone.',
        requires: { minReputation: 40 },
        effects: {
          cash: -140,
          reputation: 1,
          communityTrust: 2,
          clientProgress: 4,
          clientStability: 0.1,
          log: 'Introduced her to the prescriber downstairs.',
        },
        outcome:
          'Twelve minutes standing in a corridor, and a woman who was going to spend four months not making the call has an appointment on Monday.',
      },
    ],
  },
  {
    id: 'ev_client_new_shift_pattern',
    scope: 'client',
    title: 'The Four O’Clock Is Gone',
    body:
      '{client} got the promotion — the one she was too tired to want. It comes with a ' +
      'rota that eats every Thursday afternoon for the next six months, and a lanyard ' +
      'she keeps turning over in her hands.',
    weight: 4,
    mood: 'curious',
    conditions: ['burnout', 'anxiety', 'adhd', 'depression'],
    choices: [
      {
        id: 'seven_am',
        label: 'Give her the 7 a.m. slot before the building wakes up',
        hint: 'Somebody has to unlock at twenty to seven. Costs morning energy for as long as this lasts.',
        effects: {
          therapistEnergy: -9,
          clientRapport: 0.06,
          clientPatience: 12,
          log: 'Moved to the 7 a.m. slot.',
        },
        outcome:
          'The radiators haven’t come on yet at that hour. She keeps her coat on for the first ten minutes and talks better for it.',
      },
      {
        id: 'evening_slot',
        label: 'Take her at seven in the evening',
        hint: 'Your night owl barely notices. She keeps her hour, you keep the fee, nobody loses.',
        requires: { therapistTrait: ['trait_night_owl'] },
        effects: {
          cash: 90,
          therapistEnergy: -5,
          clientRapport: 0.08,
          clientPatience: 14,
          log: 'Evening slot arranged.',
        },
        outcome:
          'Seven o’clock in an empty building suits them both. The traffic outside goes quiet halfway through, every week, like a curtain.',
      },
      {
        id: 'fortnightly_honest',
        label: 'Go fortnightly, and be honest about what that costs',
        hint: 'Halves the momentum and halves the income. No drama, no fix.',
        effects: {
          cash: -120,
          clientProgress: -3,
          clientPatience: 5,
          log: 'Dropped to fortnightly.',
        },
        outcome:
          'She says that’s fine, that’s realistic, that’s life. Two of those three are true.',
      },
      {
        id: 'release_the_slot',
        label: 'Release the slot to the waitlist and offer her the next opening',
        hint: 'Fills the hour with somebody who can come. She is not angry, which is somehow worse.',
        effects: {
          cash: 130,
          clientRapport: -0.08,
          clientPatience: -20,
          spawnReferral: {},
          log: 'Slot released to the waitlist.',
        },
        outcome:
          'She thanks you for being straight with her. The next opening is in five weeks and both of you know what five weeks does.',
      },
    ],
  },
  {
    id: 'ev_client_anniversary_week',
    scope: 'client',
    title: 'The Second September',
    body:
      'It is nearly a year. {client} has booked the day off work without deciding what ' +
      'to do with it, and mentions this the way you would mention weather.',
    weight: 5,
    mood: 'sad',
    conditions: ['grief'],
    choices: [
      {
        id: 'plan_the_day',
        label: 'Plan the day with her, hour by hour',
        hint: 'Uses the whole session on logistics. She gets through the day with a shape to hold on to.',
        effects: {
          clientProgress: 3,
          clientStability: 0.14,
          clientRapport: 0.08,
          log: 'Built an hour-by-hour plan for the anniversary.',
        },
        outcome:
          'The plan has a walk in it, and a phone call, and a specific bench. She writes it on an index card and puts it in her coat.',
      },
      {
        id: 'be_reachable',
        label: 'Offer to be reachable that afternoon',
        hint: 'You give up an afternoon slot you cannot sell. She may not even call.',
        effects: {
          cash: -150,
          therapistEnergy: -6,
          clientRapport: 0.12,
          clientStability: 0.08,
          log: 'Held the afternoon open for her.',
        },
        outcome:
          'She doesn’t call. She texts at ten past four: “didn’t need to. thank you for the room to not need to.”',
      },
      {
        id: 'stay_in_the_room',
        label: 'Let the day be the day, and stay in the room with what’s here',
        hint: 'No scaffolding, just company. Riskier — and sometimes the truest thing available.',
        effects: {
          therapistEnergy: -10,
          clientProgress: 7,
          clientStability: -0.08,
          clientRapport: 0.1,
          log: 'No plan. Just the hour.',
        },
        outcome:
          'Forty minutes in she describes the hospital car park in the kind of detail she has never allowed herself, and then says his name twice.',
      },
    ],
  },
  {
    id: 'ev_client_honest_about_friday',
    scope: 'client',
    title: '“I Should Tell You About Friday.”',
    body:
      '{client} says it standing up, coat still on, before she has decided whether to ' +
      'sit down. Eleven weeks. And now not eleven weeks.',
    weight: 4,
    mood: 'tense',
    conditions: ['substance', 'eating'],
    choices: [
      {
        id: 'telling_is_the_work',
        label: 'Name it: telling you is the work',
        hint: 'Costs today’s plan entirely. Protects the one thing you cannot rebuild — her honesty.',
        effects: {
          therapistEnergy: -6,
          clientRapport: 0.14,
          clientStability: 0.08,
          clientPatience: 10,
          log: 'Met the disclosure with the disclosure, not the relapse.',
        },
        outcome:
          'She sits down about a third of the way through the sentence, which is the first good sign of the day.',
      },
      {
        id: 'chain_analysis',
        label: 'Go straight to the chain: what happened before Friday',
        hint: 'Functional analysis with no comfort first. Excellent data; she will feel examined.',
        effects: {
          therapistXp: 18,
          clientProgress: 8,
          clientRapport: -0.05,
          clientStability: -0.06,
          log: 'Ran a chain analysis on Friday evening.',
        },
        outcome:
          'The chain starts at 2 p.m. with an email. By the time you both see that, she is tired and slightly further away than she was at the door.',
      },
      {
        id: 'group_upstairs',
        label: 'Bring in the group that meets upstairs on Tuesdays',
        hint: 'Needs local relationships to arrange. Adds support you don’t have to provide; she has to be willing to be seen there.',
        requires: { minCommunityTrust: 35 },
        effects: {
          communityTrust: 4,
          clientRapport: 0.05,
          clientStability: 0.1,
          clientPatience: -5,
          log: 'Connected her to the Tuesday group upstairs.',
        },
        outcome:
          'She goes once and hates it, and goes again, and on the third Tuesday she makes the tea, which is how it usually happens.',
      },
    ],
  },
  {
    id: 'ev_client_wants_to_go_faster',
    scope: 'client',
    title: '“Can We Just Do the Memory?”',
    body:
      '{client} has read about the eye-movement thing. Three sessions in, four hours’ ' +
      'sleep a night, she wants to walk into the worst hour of her life on a Tuesday ' +
      'afternoon and be back at work by five.',
    weight: 4,
    mood: 'tense',
    conditions: ['trauma', 'ocd'],
    chapters: ['trust'],
    choices: [
      {
        id: 'build_the_container',
        label: 'Not yet — build the container first, and say exactly why',
        hint: 'Slows this month’s progress. Cuts the odds of the week where everything comes apart.',
        effects: {
          clientProgress: -3,
          clientStability: 0.14,
          clientRapport: 0.06,
          clientPatience: -6,
          log: 'Held the line on pacing; stabilisation first.',
        },
        outcome:
          'She is disappointed and says so. You tell her you would rather she was angry with you in June than in pieces in April.',
      },
      {
        id: 'go_where_she_points',
        label: 'Go where she’s pointing',
        hint: 'Big progress if she holds it. If she doesn’t, expect a crisis call within the week.',
        effects: {
          therapistEnergy: -14,
          clientProgress: 12,
          clientStability: -0.16,
          clientRapport: 0.05,
          followUp: { eventId: 'ev_client_crisis_call', inDays: 3 },
          log: 'Went into the memory early, at her request.',
        },
        outcome:
          'The session itself is extraordinary. It is the Thursday afterwards that you will both be dealing with.',
      },
      {
        id: 'contained_fragment',
        label: 'One contained fragment, ten minutes, then close it down',
        hint: 'A taste with the brakes on. Modest progress, modest cost, no heroics.',
        effects: {
          therapistEnergy: -8,
          clientProgress: 5,
          clientStability: -0.06,
          clientRapport: 0.07,
          log: 'Worked a single contained fragment, then grounded and closed.',
        },
        outcome:
          'You close it at eleven minutes with a timer she can see. She notices the timer. She likes the timer.',
      },
      {
        id: 'joint_session',
        label: 'Bring in a colleague for a joint session',
        hint: 'Needs a colleague free to sit in. Two pairs of hands make the fast route safer; it costs both of them a chunk of the day.',
        requires: { minTherapists: 3 },
        effects: {
          reputation: 1,
          allEnergy: -8,
          clientProgress: 9,
          clientStability: -0.05,
          log: 'Ran the session jointly with a second clinician.',
        },
        outcome:
          'One of you watches the window while the other watches her hands. Nothing gets missed, and everyone is wrung out by four.',
      },
    ],
  },
  {
    id: 'ev_client_asks_about_you',
    scope: 'client',
    title: '“Have You Ever Lost Anyone?”',
    body:
      '{client} asks it plainly, halfway through, and then waits — properly waits, the ' +
      'way people do when the answer is going to change how much they say next.',
    weight: 3,
    mood: 'curious',
    choices: [
      {
        id: 'brief_and_back',
        label: 'Answer briefly, then hand the room back',
        hint: 'One sentence of yourself, well placed. Rapport up; the boundary a little thinner than it was.',
        effects: {
          therapistMorale: 2,
          clientRapport: 0.11,
          clientStability: 0.05,
          log: 'A sentence of self-disclosure, then back to her.',
        },
        outcome:
          'You give her eleven words. She takes them, puts them somewhere safe, and carries on from where she stopped.',
      },
      {
        id: 'what_would_yes_mean',
        label: 'Ask what a yes would mean, and what a no would',
        hint: 'Textbook, and she may experience it as a dodge. Nothing lost, nothing warmed.',
        effects: {
          therapistXp: 15,
          clientProgress: 3,
          clientRapport: -0.05,
          log: 'Turned the question back rather than answering it.',
        },
        outcome:
          '“I knew you’d do that,” she says, not unkindly, and then answers it herself, which is the useful part.',
      },
      {
        id: 'say_yes_and_who',
        label: 'Say yes, and say who',
        hint: 'Only carries from a therapist who can hold it afterwards. Deepest rapport here — and it costs you the rest of the day.',
        requires: { therapistTrait: ['trait_warm'] },
        effects: {
          therapistEnergy: -8,
          therapistMorale: -4,
          clientRapport: 0.15,
          clientStability: 0.05,
          log: 'Answered honestly. Paid for it after.',
        },
        outcome:
          'She says thank you, and then does not speak for a while, and neither do you, and the room is better for it. You sit in the car for ten minutes before driving home.',
      },
    ],
  },
  {
    id: 'ev_client_family_accommodation',
    scope: 'client',
    title: 'Everybody Checks the Hob',
    body:
      '{client}’s husband checks the hob for her now — three times, in a fixed order, so ' +
      'she can get out of the front door. He believes he is helping. He is, and that is ' +
      'precisely the problem.',
    weight: 4,
    mood: 'curious',
    conditions: ['ocd', 'anxiety'],
    choices: [
      {
        id: 'bring_him_in',
        label: 'Bring him in and build a withdrawal plan together',
        hint: 'Costs a session and a fortnight of household peace. Removes the scaffolding the ritual stands on.',
        effects: {
          therapistEnergy: -10,
          clientProgress: 9,
          clientStability: -0.08,
          clientRapport: 0.05,
          log: 'Family accommodation plan agreed with the husband.',
        },
        outcome:
          'He is enormously relieved to be given a job that isn’t checking. Week one is loud. Week three is quiet.',
      },
      {
        id: 'one_hob_at_a_time',
        label: 'Work it with her alone, one hob at a time',
        hint: 'Slower and entirely hers. He goes on checking in the meantime.',
        effects: {
          clientProgress: 5,
          clientStability: 0.05,
          clientRapport: 0.07,
          log: 'Exposure work done individually.',
        },
        outcome:
          'She leaves the house unchecked on a Wednesday and rings her husband from the bus to tell him not to go back in.',
      },
      {
        id: 'one_page_guide',
        label: 'Write the family a one-page guide and let them try it',
        hint: 'An evening of writing. Reaches the whole household; you never get to see how it lands.',
        effects: {
          therapistEnergy: -8,
          communityTrust: 3,
          clientProgress: 4,
          clientStability: 0.05,
          log: 'One-page accommodation guide written for the family.',
        },
        outcome:
          'You keep it to one page by cutting the paragraph you liked most. It is a better page for it.',
      },
      {
        id: 'saturday_workshop',
        label: 'Put them in Saturday’s family workshop',
        hint: 'Needs your workshop programme running. Cheap, effective, and completely impersonal.',
        requires: { hasProgram: ['workshops'] },
        effects: {
          cash: 120,
          communityTrust: 3,
          clientProgress: 6,
          clientRapport: -0.05,
          log: 'Both booked onto the Saturday family workshop.',
        },
        outcome:
          'They sit at the back. He asks two questions. She spends the drive home slightly annoyed at how much it helped.',
      },
    ],
  },
  {
    id: 'ev_client_parent_wants_the_notes',
    scope: 'client',
    title: '“I’m His Mother.”',
    body:
      '{client}’s mum stops you in the corridor. She is not hostile — she is frightened, ' +
      'and she has decided that frightened people are owed information.',
    weight: 3,
    mood: 'tense',
    conditions: ['behavioral', 'adhd', 'identity', 'anxiety'],
    choices: [
      {
        id: 'hold_the_line',
        label: 'Hold the confidentiality line, warmly, in detail',
        hint: 'Twenty minutes in a corridor and some of her goodwill. Keeps the only thing that makes the room usable.',
        effects: {
          therapistEnergy: -6,
          communityTrust: -2,
          clientRapport: 0.12,
          clientStability: 0.06,
          log: 'Explained confidentiality to the parent, at length, in a corridor.',
        },
        outcome:
          'She is not satisfied. He hears about it that evening and says almost nothing, and turns up the next week eight minutes early.',
      },
      {
        id: 'three_way',
        label: 'Offer a three-way session where he decides what she hears',
        hint: 'Gives her something real without breaking the frame. He has to agree — and he might not.',
        effects: {
          communityTrust: 2,
          clientProgress: 5,
          clientRapport: 0.05,
          clientStability: -0.05,
          log: 'Offered a joint session on his terms.',
        },
        outcome:
          'He agrees on the condition that he gets to say when it stops. He uses that condition once, and it works exactly as intended.',
      },
      {
        id: 'broad_shape',
        label: 'Give her the broad shape — themes, no specifics',
        hint: 'She calms down considerably. He will know you spoke to her, and he counts things like that.',
        effects: {
          communityTrust: 2,
          clientRapport: -0.1,
          clientPatience: -10,
          log: 'Shared general themes with the parent.',
        },
        outcome:
          'You say nothing you would not defend. He still spends the following session with his coat on.',
      },
      {
        id: 'parent_support_hour',
        label: 'Hand her the practice’s parent-support hour instead',
        hint: 'Needs a practice with a name locally. Costs you a sellable slot; she gets held, he keeps his room.',
        requires: { minReputation: 45 },
        effects: {
          cash: -140,
          reputation: 1,
          communityTrust: 4,
          clientRapport: 0.06,
          log: 'Parent routed to the practice’s own support hour.',
        },
        outcome:
          'She turns out to have wanted somewhere to put the fear, not somewhere to collect facts. Most people do.',
      },
    ],
  },
  {
    id: 'ev_client_sends_a_friend',
    scope: 'client',
    title: '“I Gave Someone Your Number.”',
    body:
      '{client} says it almost apologetically, halfway into her coat. “She’s been bad ' +
      'since February. I said you were — I said it was all right here.”',
    weight: 3,
    mood: 'warm',
    minDay: 8,
    chapters: ['work', 'consolidation'],
    choices: [
      {
        id: 'take_and_thank',
        label: 'Take the referral, and thank her properly',
        hint: 'A new person onto the waitlist. Also a small blurring — her friend will now be in the building.',
        effects: {
          reputation: 2,
          communityTrust: 2,
          clientRapport: 0.06,
          spawnReferral: {},
          log: 'Referral accepted from a current client.',
        },
        outcome:
          'They pass in the stairwell exactly once, in month two, and neither of them mentions it again.',
      },
      {
        id: 'route_to_colleague',
        label: 'Take the referral, but route the friend to a colleague',
        hint: 'The cleanest version, and it needs somebody else free to hold her.',
        requires: { minTherapists: 2 },
        effects: {
          reputation: 2,
          clientRapport: 0.08,
          clientStability: 0.05,
          spawnReferral: {},
          log: 'Referral routed to a colleague to keep the frames separate.',
        },
        outcome:
          'She is a little offended for about four seconds, and then extremely reassured, in that order.',
      },
      {
        id: 'refer_outside',
        label: 'Explain why you’ll pass her friend to someone outside the practice',
        hint: 'You lose the referral entirely. She will understand eventually, and the neighbourhood notices.',
        effects: {
          reputation: 1,
          communityTrust: 4,
          clientRapport: 0.05,
          log: 'Referral passed to an outside clinician.',
        },
        outcome:
          'You give her two names and a phone number that actually gets answered, which is rarer than it should be.',
      },
    ],
  },
  {
    id: 'ev_client_moving_away',
    scope: 'client',
    title: 'The Job Is in Another City',
    body:
      '{client} took it. She is telling you in the same breath as she is telling you she ' +
      'doesn’t want to stop, and the extraordinary thing is that both of those are ' +
      'entirely true.',
    weight: 3,
    mood: 'sad',
    chapters: ['work', 'consolidation'],
    choices: [
      {
        id: 'six_weeks',
        label: 'Six weeks to land it properly, then a real goodbye',
        hint: 'You keep six sessions and a clean ending. Nothing is left hanging on a station platform.',
        effects: {
          reputation: 2,
          clientProgress: 8,
          clientStability: 0.08,
          clientRapport: 0.07,
          log: 'Agreed a six-week ending plan.',
        },
        outcome:
          'The last session is on a Friday. She brings nothing and says everything, which is the version you always hope for.',
      },
      {
        id: 'video_from_the_new_flat',
        label: 'Continue by video from her new flat',
        hint: 'Available once the practice is set up for it. Keeps the fee and the thread; some of the room does not travel down a wire.',
        requires: { act: [2, 3] },
        effects: {
          cash: 200,
          clientProgress: 4,
          clientStability: 0.05,
          clientRapport: -0.05,
          log: 'Continued remotely after the move.',
        },
        outcome:
          'Behind her, boxes. Then fewer boxes. Then a shelf, and a plant on the shelf, and you never once see the rest of the flat.',
      },
      {
        id: 'warm_handover',
        label: 'Find her someone good there, and write the handover yourself',
        hint: 'An evening’s work and the end of the fee. She arrives somewhere warm instead of starting from cold.',
        effects: {
          cash: -180,
          therapistEnergy: -8,
          reputation: 3,
          communityTrust: 3,
          clientRapport: 0.1,
          log: 'Handover letter written; new clinician found in the new city.',
        },
        outcome:
          'You spend ninety minutes on two pages so that a stranger will already know not to ask about her father in the first month.',
      },
    ],
  },
  {
    id: 'ev_client_letter_to_younger_self',
    scope: 'client',
    title: 'Read It Out Loud',
    body:
      '{client} wrote the letter you suggested and then said nothing about it for a ' +
      'fortnight. Today it is on the table between you, folded twice. “You read it,” ' +
      'she says. “I can’t.”',
    weight: 4,
    mood: 'proud',
    once: true,
    chapters: ['consolidation'],
    choices: [
      {
        id: 'read_it_aloud',
        label: 'Read it aloud, slowly, and let the silence after it stand',
        hint: 'Costs nothing but nerve. A large step — and she will cry, which is entirely fine.',
        effects: {
          therapistMorale: 6,
          clientProgress: 10,
          clientStability: 0.1,
          clientRapport: 0.12,
          log: 'Read her letter aloud in session.',
        },
        outcome:
          'The last line is “none of it was your job.” You get to the full stop and then neither of you says anything for a very long time.',
      },
      {
        id: 'one_line',
        label: 'Ask her to read one line. Just one.',
        hint: 'Harder today, sturdier in a year. It may stall completely if she can’t manage it.',
        effects: {
          therapistXp: 20,
          clientProgress: 7,
          clientStability: -0.06,
          clientRapport: 0.06,
          log: 'She read one line herself.',
        },
        outcome:
          'She picks the shortest line in it, gets four words in, starts again, and finishes. Her voice does not do what she expected.',
      },
      {
        id: 'leave_it_folded',
        label: 'Leave it folded and ask what stopped her',
        hint: 'The letter waits. What she says instead is usually the actual material.',
        effects: {
          clientProgress: 5,
          clientStability: 0.05,
          clientRapport: 0.1,
          log: 'Explored the reluctance rather than the letter.',
        },
        outcome:
          'What stopped her was that reading it would make it true. You put the letter in the drawer and work on that instead.',
      },
    ],
  },
  {
    id: 'ev_client_court_letter_due',
    scope: 'client',
    title: 'The Hearing Is on Thursday',
    body:
      '{client}’s solicitor wants a letter confirming engagement in treatment. The ' +
      'hearing is Thursday. It is Tuesday afternoon, and {client} has attended six of ' +
      'eleven booked sessions.',
    weight: 2,
    mood: 'tense',
    minDay: 12,
    conditions: ['substance', 'behavioral', 'relationship'],
    choices: [
      {
        id: 'exactly_true',
        label: 'Write exactly what is true: six of eleven, and what you have seen change',
        hint: 'Honest, unhelpful to him on Thursday, and the only letter you can put your name to.',
        effects: {
          therapistEnergy: -6,
          reputation: 2,
          clientRapport: -0.06,
          clientPatience: -8,
          log: 'Letter written to the facts.',
        },
        outcome:
          'The paragraph about what has changed is the longest one. Nobody in that courtroom will weigh it as heavily as you do.',
      },
      {
        id: 'warm_framing',
        label: 'Write it warmly and let the numbers sit at the bottom',
        hint: 'Same facts, kinder frame. An extra hour of your evening, and it reads as advocacy — which cuts both ways.',
        effects: {
          therapistEnergy: -8,
          reputation: -1,
          communityTrust: 2,
          clientRapport: 0.08,
          log: 'Letter written with the numbers at the foot of the page.',
        },
        outcome:
          'You reread it twice for anything you could not defend under questioning, and find one adjective, and cut it.',
      },
      {
        id: 'attendance_only',
        label: 'Decline to write anything beyond a bare attendance record',
        hint: 'Safest for the practice by a distance. He experiences it as being dropped at the worst possible moment.',
        effects: {
          reputation: 1,
          clientRapport: -0.12,
          clientPatience: -14,
          log: 'Attendance record only; no clinical letter.',
        },
        outcome:
          'The record is one side of A4 with a table on it. He does not come the following week, or the week after.',
      },
      {
        id: 'ring_the_solicitor',
        label: 'Ring the solicitor yourself and explain what engagement actually looks like',
        hint: 'People take your call now. Costs an afternoon and the slot in it; the letter lands the way it should.',
        requires: { minReputation: 50 },
        effects: {
          cash: -160,
          therapistEnergy: -10,
          reputation: 2,
          communityTrust: 3,
          clientRapport: 0.1,
          log: 'Spoke to the solicitor directly about the case.',
        },
        outcome:
          'Twenty-five minutes explaining why missing five appointments is a symptom and not a verdict. She listens, and takes notes, which is more than you expected.',
      },
    ],
  },

  // ───────────────────────────────────────────────────────────────────────────
  // Day scope — 12
  // ───────────────────────────────────────────────────────────────────────────
  {
    id: 'ev_day_heat_wave',
    scope: 'day',
    title: 'Thirty-One Degrees in the Small Room',
    body:
      '{practice} faces south. By eleven the small consulting room is a greenhouse and ' +
      'the blind does precisely nothing. Four people are booked in there today, and two ' +
      'of them have panic in the notes.',
    weight: 4,
    mood: 'tense',
    minDay: 12,
    choices: [
      {
        id: 'fans_and_water',
        label: 'Buy three fans and a crate of water before the first session',
        hint: 'Money out now; the day then runs completely normally.',
        effects: {
          cash: -180,
          allMorale: 2,
          log: 'Three fans and forty-eight bottles of water.',
        },
        outcome:
          'The fans are loud enough that nobody can whisper, which turns out to matter for exactly one session.',
      },
      {
        id: 'shaded_back_room',
        label: 'Move everything to the shaded back room and stack the schedule',
        hint: 'Free. Everyone works on top of each other and it shows by four o’clock.',
        effects: {
          allEnergy: -10,
          allMorale: -3,
          log: 'Whole day run out of the back room.',
        },
        outcome:
          'Two therapists end up doing notes on the stairs. Somebody’s lunch goes missing and is never spoken of again.',
      },
      {
        id: 'phone_the_afternoon',
        label: 'Move the afternoon to phone sessions',
        hint: 'Cool and quiet, and half the work happens in a room you cannot see.',
        effects: {
          cash: -120,
          allEnergy: 6,
          reputation: -1,
          log: 'Afternoon converted to phone sessions.',
        },
        outcome:
          'Everyone is more comfortable and slightly less useful. Two clients take the call from their own gardens, which helps more than you’d think.',
      },
      {
        id: 'service_the_aircon',
        label: 'Have the ancient air conditioning actually serviced',
        hint: 'Needs real money on hand. Fixes it for the rest of the summer, not just for today.',
        requires: { minCash: 2500 },
        effects: {
          cash: -600,
          allMorale: 5,
          allEnergy: 8,
          setFlag: 'aircon_serviced',
          log: 'Air conditioning serviced and recharged.',
        },
        outcome:
          'The engineer finds a bird’s nest, a 2009 receipt and a filter the colour of tea. It runs like new by three.',
      },
    ],
  },
  {
    id: 'ev_day_quiet_morning',
    scope: 'day',
    title: 'Three Cancellations Before Nine',
    body:
      'A stomach bug, a broken boiler, and one text that just says “can’t today”. ' +
      '{practice} now has a hole in the morning the exact size of three sessions.',
    weight: 4,
    mood: 'curious',
    choices: [
      {
        id: 'fill_from_waitlist',
        label: 'Ring the waitlist and fill it',
        hint: 'Recovers most of the money. Nobody gets the break they were quietly counting on.',
        effects: {
          cash: 260,
          allEnergy: -8,
          log: 'Waitlist rung; morning refilled by 9:40.',
        },
        outcome:
          'Two of the three say yes immediately, which tells you exactly how long they have been waiting.',
      },
      {
        id: 'give_them_the_morning',
        label: 'Give the team the morning: notes, coffee, an actual lunch',
        hint: 'The money is gone. Energy and morale come back up, properly.',
        effects: {
          allMorale: 6,
          allEnergy: 14,
          log: 'Morning given over to notes and coffee.',
        },
        outcome:
          'The backlog of case notes shrinks by nine. Somebody puts music on. Somebody else asks them not to.',
      },
      {
        id: 'impromptu_supervision',
        label: 'Use it for supervision — everyone brings their hardest case',
        hint: 'No income today, and the hardest cases go better next week.',
        effects: {
          xp: 40,
          allMorale: 3,
          allEnergy: -5,
          log: 'Impromptu group supervision.',
        },
        outcome:
          'The hardest case in the room turns out to belong to the person who talks the least. It usually does.',
      },
      {
        id: 'open_the_doors',
        label: 'Open the doors: two hours of free drop-in consultations',
        hint: 'Needs enough staff to cover it. No fees at all, and the neighbourhood remembers it for months.',
        requires: { minTherapists: 3 },
        effects: {
          reputation: 2,
          communityTrust: 6,
          allEnergy: -10,
          spawnReferral: {},
          log: 'Two hours of free drop-in consultations.',
        },
        outcome:
          'Eleven people come. Nine needed twenty minutes and a phone number. Two needed a great deal more, and now have somewhere to start.',
      },
    ],
  },
  {
    id: 'ev_day_journalist_calls',
    scope: 'day',
    title: 'The Local Paper Wants a Quote',
    body:
      'A reporter is writing four hundred words about waiting lists and would like ' +
      'somebody at {practice} to say something about teenagers. Deadline is six o’clock ' +
      'and she is being very pleasant about it.',
    weight: 3,
    mood: 'curious',
    once: true,
    minDay: 20,
    choices: [
      {
        id: 'fifteen_careful_minutes',
        label: 'Give her fifteen careful minutes on the record',
        hint: 'Costs the gap between sessions. Your name in Friday’s paper — and some of it will be edited badly.',
        effects: {
          reputation: 4,
          communityTrust: 3,
          allEnergy: -5,
          log: 'Spoke to the local paper on the record.',
        },
        outcome:
          'They use your third sentence and cut the qualifier off the end of it, which is exactly what you were braced for.',
      },
      {
        id: 'decline_but_useful',
        label: 'Decline politely and send her the crisis line’s number instead',
        hint: 'No exposure, good or bad. She remembers that you were useful.',
        effects: {
          reputation: 1,
          communityTrust: 2,
          log: 'Declined the interview; passed on a better contact.',
        },
        outcome:
          'She rings back three months later about something else entirely, and this time you say yes.',
      },
      {
        id: 'offer_the_programme',
        label: 'Offer her the community programme instead of a quote',
        hint: 'Needs standing locally to pull off. A bigger piece, and it is about the work rather than about you.',
        requires: { minCommunityTrust: 45 },
        effects: {
          reputation: 3,
          communityTrust: 6,
          allEnergy: -8,
          spawnReferral: {},
          log: 'Paper redirected to the community programme.',
        },
        outcome:
          'She spends a Tuesday evening at the back of a group and writes eight hundred words instead of four hundred. The photograph is of the chairs.',
      },
    ],
  },
  {
    id: 'ev_day_hall_repainted',
    scope: 'day',
    title: 'A Colour Nobody Chose',
    body:
      'The landlord has repainted the shared hall in a green that the tin almost ' +
      'certainly called Sage. It is not sage. It also smells, and the smell has ' +
      'opinions.',
    weight: 3,
    mood: 'curious',
    once: true,
    minDay: 15,
    choices: [
      {
        id: 'open_the_windows',
        label: 'Open every window and apologise all day',
        hint: 'Free. Two clients will mention headaches and the day is mildly spoiled throughout.',
        effects: {
          allMorale: -3,
          reputation: -1,
          log: 'Windows open, fumes tolerated.',
        },
        outcome:
          'By four the smell has mostly gone and the colour has not, and the colour was always going to be the bigger problem.',
      },
      {
        id: 'make_it_ours',
        label: 'Buy a rug, two lamps and a large plant, and make the hall yours',
        hint: 'A couple of hundred out. The entrance stops feeling like a corridor and starts feeling like a door.',
        effects: {
          cash: -280,
          reputation: 2,
          communityTrust: 2,
          allMorale: 4,
          log: 'Hall furnished: rug, two lamps, one enormous plant.',
        },
        outcome:
          'The plant is too big for the space and everybody loves it. Three clients ask what it is. Nobody knows.',
      },
      {
        id: 'split_the_repaint',
        label: 'Ask the landlord to repaint and offer to split the cost',
        hint: 'Needs cash to hand. Properly fixed inside a week; you pay half of somebody else’s mistake.',
        requires: { minCash: 1200 },
        effects: {
          cash: -420,
          reputation: 2,
          allMorale: 3,
          setFlag: 'hall_is_ours',
          log: 'Hall repainted, cost split with the landlord.',
        },
        outcome:
          'He picks the second colour with you, which is a small and real change in the relationship. It is called Bone. It is fine.',
      },
    ],
  },
  {
    id: 'ev_day_snow_day',
    scope: 'day',
    title: 'Six Inches and No Buses',
    body:
      'Half the city has decided not to happen today. Two therapists made it in. Four ' +
      'clients have texted, and three of those four are the ones who most need today to ' +
      'not be a day alone in a flat.',
    weight: 3,
    mood: 'warm',
    minDay: 10,
    choices: [
      {
        id: 'open_anyway',
        label: 'Open. Whoever gets here, gets seen.',
        hint: 'Low income and a long cold day. The ones who come will not forget that you were there.',
        effects: {
          cash: -200,
          reputation: 2,
          communityTrust: 5,
          allEnergy: -12,
          log: 'Open through the snow.',
        },
        outcome:
          'Five people make it. Everyone keeps their coat on. Somebody brings a bag of satsumas and they are gone by noon.',
      },
      {
        id: 'close_and_text',
        label: 'Close for the day and text everyone yourself',
        hint: 'No fees at all. Everybody rests, including you, and nobody drives on that road.',
        effects: {
          cash: -320,
          allEnergy: 18,
          allMorale: 4,
          log: 'Closed for the day; every client texted personally.',
        },
        outcome:
          'You write forty-one individual messages rather than one round-robin, and it takes an hour, and it is the right hour.',
      },
      {
        id: 'phone_from_anywhere',
        label: 'Phone sessions from wherever anyone happens to be',
        hint: 'Keeps most of the money and none of the room. Awkward, and it works.',
        effects: {
          cash: 140,
          allEnergy: -6,
          allMorale: -2,
          log: 'Snow day run on phones.',
        },
        outcome:
          'One therapist does three sessions from a kitchen table with a dog under it. The dog is heard exactly twice.',
      },
    ],
  },
  {
    id: 'ev_day_doorbell_complaint',
    scope: 'day',
    title: 'The Bakery Downstairs Has Had Enough',
    body:
      'The chime on {practice}’s door goes off forty times a day and carries straight ' +
      'through the floor into the bakery’s back room. The owner is at reception now, ' +
      'flour on her forearms, being extremely polite about it.',
    weight: 3,
    mood: 'tense',
    minDay: 8,
    choices: [
      {
        id: 'silent_lamp',
        label: 'Replace the chime with a silent lamp on the desk',
        hint: 'A modest cost. The front desk now has to actually watch the door.',
        effects: {
          cash: -140,
          communityTrust: 3,
          allEnergy: -5,
          log: 'Door chime replaced with a desk lamp.',
        },
        outcome:
          'For a fortnight people stand unnoticed in the doorway. Then somebody moves the desk nine inches and it is solved forever.',
      },
      {
        id: 'apologise_change_nothing',
        label: 'Apologise sincerely and change nothing',
        hint: 'Free today. She stops mentioning you to her regulars, and she has a lot of regulars.',
        effects: {
          reputation: -1,
          communityTrust: -4,
          log: 'Apology offered; chime stayed.',
        },
        outcome:
          'She says it’s fine, honestly, it’s fine. The card for {practice} disappears from the board by the till.',
      },
      {
        id: 'pay_for_the_panel',
        label: 'Pay for the acoustic panel her ceiling has needed for years',
        hint: 'Real money for somebody else’s problem. Buys a neighbour who sends people up the stairs.',
        requires: { minCash: 900 },
        effects: {
          cash: -380,
          reputation: 2,
          communityTrust: 6,
          spawnReferral: {},
          log: 'Acoustic panel fitted in the bakery ceiling.',
        },
        outcome:
          'She refuses to let anybody from upstairs pay for coffee again, which over a year costs her considerably more than the panel.',
      },
    ],
  },
  {
    id: 'ev_day_walk_in',
    scope: 'day',
    title: 'Somebody at the Desk with No Appointment',
    body:
      'A man in his fifties is standing in {practice}’s reception holding a folded ' +
      'letter. He has not booked. He says he will wait, and then, after a moment, ' +
      '“How long?”',
    weight: 3,
    mood: 'tense',
    choices: [
      {
        id: 'twenty_minutes',
        label: 'Give him twenty minutes between sessions',
        hint: 'You run late for the rest of the afternoon. Somebody gets seen who was not going to be.',
        effects: {
          reputation: 1,
          communityTrust: 4,
          allEnergy: -8,
          spawnReferral: { severityBias: 1 },
          log: 'Twenty unscheduled minutes given to a walk-in.',
        },
        outcome:
          'The letter is from an employer and is four paragraphs long. He needed somebody to read the second one with him.',
      },
      {
        id: 'book_him_thursday',
        label: 'Take his details properly and book him for Thursday',
        hint: 'Correct and slower. He may well not come on Thursday.',
        effects: {
          communityTrust: 1,
          spawnReferral: {},
          log: 'Walk-in booked in for Thursday.',
        },
        outcome:
          'He writes his own name slightly wrong on the form, corrects it, and apologises for the correction.',
      },
      {
        id: 'the_right_number',
        label: 'Give him the number for the service that can see him this week',
        hint: 'Honest about your capacity. He leaves with a phone number rather than an appointment.',
        effects: {
          communityTrust: 2,
          log: 'Signposted to a service with capacity this week.',
        },
        outcome:
          'You write it on a card rather than a receipt, because a receipt gets thrown away and a card sometimes doesn’t.',
      },
      {
        id: 'someone_free_now',
        label: 'Ask whoever is free to sit with him now',
        hint: 'Needs a colleague with a gap. He is seen today, and that colleague’s afternoon gets very tight.',
        requires: { minTherapists: 3 },
        effects: {
          reputation: 2,
          communityTrust: 5,
          allEnergy: -10,
          spawnReferral: { severityBias: 1, complex: true },
          log: 'Walk-in seen the same hour by an available clinician.',
        },
        outcome:
          'It takes fifty minutes, not twenty. Everything afterwards slides, and nobody in the building argues about it.',
      },
    ],
  },
  {
    id: 'ev_day_records_outage',
    scope: 'day',
    title: 'The Notes System Is Down',
    body:
      'The records provider reports an outage “affecting a subset of customers”. ' +
      '{practice} is the subset. Nine sessions are booked today and not one history can ' +
      'be opened.',
    weight: 3,
    mood: 'tense',
    minDay: 14,
    choices: [
      {
        id: 'paper_and_memory',
        label: 'Run the whole day on paper and memory',
        hint: 'Everything still happens. Tonight’s writing-up is genuinely brutal.',
        effects: {
          allEnergy: -12,
          allMorale: -3,
          log: 'Day run on paper.',
        },
        outcome:
          'It turns out everybody remembers more than they thought, and everybody writes worse notes than they thought.',
      },
      {
        id: 'cancel_the_three',
        label: 'Cancel the three sessions where the history really matters',
        hint: 'Safe. Three people who spent all week psyching themselves up go home again.',
        effects: {
          cash: -330,
          reputation: -1,
          communityTrust: -1,
          allEnergy: 6,
          log: 'Three high-risk sessions cancelled and rebooked.',
        },
        outcome:
          'Two rebook for the same week. One says of course, no problem at all, and does not answer the next two calls.',
      },
      {
        id: 'emergency_support',
        label: 'Pay the emergency support tier and get an export within the hour',
        hint: 'A few hundred out of the account. The day then runs almost normally.',
        requires: { minCash: 800 },
        effects: {
          cash: -260,
          allEnergy: -5,
          allMorale: 1,
          log: 'Emergency data export purchased.',
        },
        outcome:
          'The export arrives in forty minutes as a spreadsheet nobody will ever admit to having found quite useful.',
      },
    ],
  },
  {
    id: 'ev_day_lunch_and_learn',
    scope: 'day',
    title: 'The Warehouse on Mill Road Wants a Talk',
    body:
      'A logistics firm with two hundred staff will pay {practice} to come and talk ' +
      'about stress for forty minutes at lunchtime. They would like it, the email says, ' +
      'to be upbeat.',
    weight: 3,
    mood: 'curious',
    once: true,
    minDay: 25,
    choices: [
      {
        id: 'take_it_straight',
        label: 'Take the booking and give them the real talk anyway',
        hint: 'Good money, a lunch hour gone, and a room of people who did not choose to be there.',
        effects: {
          cash: 520,
          reputation: 1,
          communityTrust: 2,
          allEnergy: -10,
          log: 'Lunchtime talk delivered at the Mill Road warehouse.',
        },
        outcome:
          'Forty people, sandwiches, strip lighting. Eleven of them stay behind. That is eleven more than the email predicted.',
      },
      {
        id: 'tailor_it',
        label: 'Take it and tailor it — sleep, shift work, and where to go next',
        hint: 'Needs a name they already trust. Less fee once you count the prep, and some of them actually ring afterwards.',
        requires: { minReputation: 40 },
        effects: {
          cash: 380,
          reputation: 2,
          communityTrust: 4,
          allEnergy: -12,
          spawnReferral: {},
          log: 'Tailored workplace talk delivered, with signposting.',
        },
        outcome:
          'You spend two evenings learning what a four-on-four-off rota does to a person, and it is the slide they photograph.',
      },
      {
        id: 'decline_the_lunch',
        label: 'Decline. Your lunch hours are load-bearing.',
        hint: 'No money, no goodwill, and a team that eats sitting down.',
        effects: {
          allMorale: 4,
          allEnergy: 8,
          log: 'Corporate talk declined.',
        },
        outcome:
          'Nobody at {practice} argues with the decision, which is itself a fairly loud piece of feedback.',
      },
    ],
  },
  {
    id: 'ev_day_peer_consult_invite',
    scope: 'day',
    title: 'Thursdays at Eight, Above the Library',
    body:
      'A consultation group has been running for eleven years and has one chair free. ' +
      'They would like somebody from {practice} in it. There is no fee, no certificate, ' +
      'and no minutes taken.',
    weight: 3,
    mood: 'warm',
    once: true,
    minDay: 18,
    choices: [
      {
        id: 'send_the_senior',
        label: 'Send your most senior therapist every Thursday',
        hint: 'Costs a working morning a week, permanently. The hard cases get a second brain on them.',
        effects: {
          xp: 50,
          reputation: 2,
          allMorale: 3,
          allEnergy: -8,
          setFlag: 'in_the_consult_group',
          log: 'Joined the Thursday consultation group.',
        },
        outcome:
          'She comes back the first week with one sentence written on the back of a receipt, and that sentence changes two cases.',
      },
      {
        id: 'go_yourself',
        label: 'Go yourself, and bring the practice’s worst week to it',
        hint: 'Costs your energy and a fair amount of pride. It changes how the whole building works.',
        effects: {
          xp: 80,
          allMorale: 6,
          allEnergy: -12,
          setFlag: 'in_the_consult_group',
          log: 'Took the practice’s hardest week to peer consultation.',
        },
        outcome:
          'Eleven years of other people’s mistakes are in that room. Somebody says “oh, we did that in 2019” and then tells you what happened next.',
      },
      {
        id: 'decline_the_chair',
        label: 'Decline — the calendar cannot take it',
        hint: 'Nothing gained and nothing lost, and they will not ask a second time.',
        effects: {
          allEnergy: 5,
          log: 'Consultation group invitation declined.',
        },
        outcome:
          'The chair goes to a practice on the other side of the park. You see them at a conference eighteen months later and they mention it.',
      },
    ],
  },
  {
    id: 'ev_day_fire_drill',
    scope: 'day',
    title: 'Ten Past Two, and the Alarm',
    body:
      'A building-wide drill nobody warned {practice} about. Four sessions are ' +
      'mid-sentence when the sound starts, and one of them was mid-something that took ' +
      'nine weeks to get to.',
    weight: 3,
    mood: 'tense',
    minDay: 6,
    choices: [
      {
        id: 'everyone_out',
        label: 'Everyone out. Reconvene on the pavement, then reset upstairs.',
        hint: 'Costs the back half of four sessions. Nobody is left standing outside holding it alone.',
        effects: {
          reputation: -1,
          allMorale: -2,
          allEnergy: -8,
          log: 'Building evacuated; sessions cut short.',
        },
        outcome:
          'Eleven minutes on a cold pavement making the smallest talk of anyone’s life. Two of the four cannot get back to where they were.',
      },
      {
        id: 'run_late',
        label: 'Add fifteen minutes to each affected session and run late',
        hint: 'You finish at seven this evening. Nothing is left hanging in mid-air.',
        effects: {
          reputation: 2,
          allMorale: -1,
          allEnergy: -14,
          log: 'Ran late to recover the interrupted sessions.',
        },
        outcome:
          'The last one ends at 18:52 and is one of the best hours of the month, because she had already had the hardest part interrupted once and refused to lose it twice.',
      },
      {
        id: 'free_makeups',
        label: 'Offer the four affected clients a free make-up session this week',
        hint: 'Costs four fees outright. Turns a bad afternoon into a story about how this place handles bad afternoons.',
        requires: { minCash: 600 },
        effects: {
          cash: -420,
          reputation: 3,
          communityTrust: 3,
          allEnergy: -6,
          log: 'Four make-up sessions offered free of charge.',
        },
        outcome:
          'Only two take it up. All four tell somebody about it, which was never the point and is entirely the effect.',
      },
    ],
  },
  {
    id: 'ev_day_card_from_an_alumnus',
    scope: 'day',
    title: 'A Card with No Return Address',
    body:
      'It arrives in the ordinary post to {practice}: two lines and a photograph of a ' +
      'dog. The signature is a pair of initials and the dog’s name, and everyone at the ' +
      'desk has now read it twice.',
    weight: 3,
    mood: 'warm',
    once: true,
    minDay: 30,
    choices: [
      {
        id: 'pin_it_up',
        label: 'Pin it inside the staff room door',
        hint: 'Free. It will still be there in a year, and people will still stop and look at it.',
        effects: {
          reputation: 1,
          allMorale: 7,
          log: 'Card pinned inside the staff room door.',
        },
        outcome:
          'Somebody eventually adds a second card next to it, and then a third, and nobody ever decides that this is a wall.',
      },
      {
        id: 'read_it_at_brief',
        label: 'Read it out at the morning brief',
        hint: 'Two minutes of the day. The whole team gets the lift and at least one of them goes quiet.',
        effects: {
          allMorale: 5,
          allEnergy: 6,
          log: 'Card read out at the morning brief.',
        },
        outcome:
          'The second line is “the dog was the eleventh thing, but I got there.” Nobody asks what the first ten were.',
      },
      {
        id: 'ring_them',
        label: 'Track down who sent it and ring them',
        hint: 'Costs a slot, and crosses a line: they ended it cleanly, and this reopens the door.',
        effects: {
          reputation: -1,
          communityTrust: 1,
          allMorale: 3,
          allEnergy: -5,
          log: 'Rang the sender of the card.',
        },
        outcome:
          'She is pleased and a little wrong-footed, and the call is four minutes long. Afterwards you are not certain it was yours to make.',
      },
    ],
  },
];
