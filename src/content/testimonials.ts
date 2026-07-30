/**
 * Voices of the practice.
 *
 *  - TESTIMONIALS go on the success-story wall when a client is discharged; the
 *    generator prefers a line keyed to their condition and falls back to the
 *    universal pool. First person, past tense, understated. Nobody is "cured of
 *    themselves" here — they got their week back.
 *  - MENTOR_LINES belong to Dr. Wren Halloway, who has run a clinic for thirty-one
 *    years and has never once said "self-care" without irony.
 *  - AMBIENT_LOG_LINES are filler for the activity feed on quiet minutes: the
 *    building being a building.
 *
 * `conditions` holds ConditionId strings and restricts a quote to those cases.
 */

export const TESTIMONIALS: readonly { text: string; conditions?: string[] }[] = [
  // ── Universal ──────────────────────────────────────────────────────────────
  { text: "I didn't get a new life. I got this one back." },
  { text: 'Nothing dramatic happened. I just stopped bracing.' },
  { text: 'You never told me what to do. That was the annoying part, and the point.' },
  { text: "I can have a bad week now without deciding it's a bad life." },
  { text: 'Turns out I was allowed to say it out loud.' },
  { text: 'That room stopped being the only place I could breathe.' },
  { text: 'I stopped apologising for taking up the hour.' },
  { text: "My wife says I laugh at things again. I hadn't noticed." },
  { text: "I still keep the worksheet in my wallet. I don't need it. It's nice to have." },
  { text: "You remembered my sister's name every single week. Small thing. It wasn't small." },
  { text: 'First time anyone let me finish a sentence about it.' },
  { text: "I thought I'd come out fixed. I'm not fixed. I'm fine, which is better." },
  { text: "It's easier now, and I know what to do on the days it isn't." },
  { text: 'I came in wanting a technique. I left with a way of talking to myself.' },
  { text: "I still don't love Sundays. But Sundays are just a day now." },
  { text: "Halfway through I noticed I'd stopped rehearsing what to tell you." },
  { text: "I don't think I'm brave. You said showing up counts, so I've decided to believe you." },
  { text: "You were the first person who didn't look away." },
  { text: 'My kids got a calmer parent out of this. That is the whole review.' },
  { text: "Ten months. I'd do it again, and I'm glad I don't have to." },

  // ── Keyed ──────────────────────────────────────────────────────────────────
  {
    text: "I still get anxious. It just doesn't get to drive anymore.",
    conditions: ['anxiety'],
  },
  {
    text: "I flew to my sister's wedding. Window seat. Cried a little. Went anyway.",
    conditions: ['anxiety'],
  },
  {
    text: 'I cooked a proper dinner in March. Then I did it again in April.',
    conditions: ['depression'],
  },
  {
    text: "It isn't that I'm happy. It's that the flat feels like somewhere I live.",
    conditions: ['depression'],
  },
  {
    text: "I can drive past the junction now. I don't have to look, and I don't have to not look.",
    conditions: ['trauma'],
  },
  {
    text: "It's a memory now. It used to be a room I was living in.",
    conditions: ['trauma'],
  },
  {
    text: 'I can say her name in the present tense of loving her.',
    conditions: ['grief'],
  },
  {
    text: 'The grief never got smaller. I grew bigger around it, like you said I might.',
    conditions: ['grief'],
  },
  {
    text: "I left the house once without checking. Then a hundred times. It's boring now, which is the miracle.",
    conditions: ['ocd'],
  },
  {
    text: 'The thought still turns up. I let it stand there without feeding it.',
    conditions: ['ocd'],
  },
  {
    text: 'I stopped believing I was lazy. That alone was worth the whole fee.',
    conditions: ['adhd'],
  },
  {
    text: 'The systems help. Understanding why I need them helped more.',
    conditions: ['adhd'],
  },
  {
    text: "Four hundred and six days. I don't count out loud anymore, but I know.",
    conditions: ['substance'],
  },
  {
    text: "You never once made me feel like a case file. That's why I came back after I slipped.",
    conditions: ['substance'],
  },
  {
    text: 'We still argue. We stopped keeping score.',
    conditions: ['relationship'],
  },
  {
    text: 'We came in to decide whether to end it. We decided to start again, properly this time.',
    conditions: ['relationship'],
  },
  {
    text: 'I ate lunch with my colleagues. An ordinary Tuesday. An enormous day.',
    conditions: ['eating'],
  },
  {
    text: "The voice is quieter, and I know now that it was never mine.",
    conditions: ['eating'],
  },
  {
    text: "I know my early signs now, and so does my brother. That's the whole safety net.",
    conditions: ['bipolar'],
  },
  {
    text: 'I mourned the highs for a while. Then I got a life that stays.',
    conditions: ['bipolar'],
  },
  {
    text: 'I stopped translating myself before I spoke.',
    conditions: ['identity'],
  },
  {
    text: 'At forty-three I met myself. Bit late. Very glad.',
    conditions: ['identity'],
  },
  {
    text: 'I love the work again. Not the way I used to — better, with edges on it.',
    conditions: ['burnout'],
  },
  {
    text: 'I took an actual holiday and left the laptop at home. Nothing burned down.',
    conditions: ['burnout'],
  },
  {
    text: "I have language for it now, and people who don't panic when I use it.",
    conditions: ['psychosis'],
  },
  {
    text: 'You talked to me, not about me. Nobody had done that in a while.',
    conditions: ['psychosis'],
  },
  {
    text: 'Mornings used to take ninety minutes of shouting. Today we sang in the car.',
    conditions: ['behavioral'],
  },
  {
    text: "My son isn't the difficult one anymore. He's eight.",
    conditions: ['behavioral'],
  },
];

/** Dr. Wren Halloway — mentor, thirty-one years in, still learning. */
export const MENTOR_LINES: readonly string[] = [
  'You look like someone who has been holding their breath since Tuesday. Sit down.',
  'Nobody grows a practice in a straight line. Mine looked like a heart monitor.',
  "You can't pour from an empty cup, and you can't run a clinic on aphorisms either. Take the afternoon.",
  'The waitlist will still be there tomorrow. So will you, if you are sensible about tonight.',
  "Hire someone who disagrees with you well. It's cheaper than a mistake.",
  'When a client leaves early, the story you tell yourself about it matters more than the file note.',
  'Thirty-one years, and I still get the first ten minutes wrong sometimes.',
  "Don't process a fire while it's burning. Get everyone out of the building first.",
  "You will want to be everyone's therapist. Pick a lane, then hire the other lanes.",
  'Good supervision is two people being confused together, on purpose.',
  'A cure is lovely. A person who knows where their exits are is lovelier.',
  "Cash flow is not a moral failing. It's arithmetic with feelings attached.",
  'Your best therapist will tell you they are fine. Look at their calendar instead.',
  'If nobody here is ever slightly bored, you are understaffed.',
  'The neighbourhood remembers who you saw when they could not pay. It remembers a long time.',
  'Say the hard thing kindly and early. Late and gentle is still just late.',
  "I'd take a warm room over a clever technique most days of the week.",
  'You are allowed to be proud of this. Practise it — you will need it later.',
  'Every practice I have admired had one chair everybody fought over. Find yours.',
  "Burnout doesn't announce itself. It reschedules.",
  "Rest isn't a reward for finishing. Nothing is ever finished.",
  'Take the win. Write it down. You will have forgotten it by Thursday otherwise.',
];

/** Small life in the building, for quiet minutes in the activity feed. */
export const AMBIENT_LOG_LINES: readonly string[] = [
  'The radiator clanks twice and settles.',
  "Somebody's kettle clicks off in the kitchen.",
  'The waiting-room clock is ninety seconds fast. Nobody has fixed it.',
  'Rain starts against the north window, then thinks better of it.',
  'A tissue box is replaced without comment.',
  'The lamp in room two flickers once, then behaves.',
  'Two mugs in the sink. Neither belongs to anyone who will admit it.',
  'The front door sticks in the damp and gives with a shove.',
  'Someone waters the fern by the stairs. It has opinions.',
  'A bus sighs at the stop outside.',
  'The printer wakes up, prints nothing, and goes back to sleep.',
  'Late sun crosses the carpet and finds the good chair.',
  'Someone laughs in the corridor, then remembers where they are.',
  "A child's drawing goes up on the noticeboard, corners already curling.",
  'The heating comes on with a knock, like a polite guest.',
  'Fresh coffee. The good bag, not the emergency bag.',
  'A phone buzzes in a coat pocket in the empty cloakroom.',
  'The blinds in room one are stuck at three-quarters again.',
  'A clipboard goes missing and is later found on top of the fridge.',
  'The floorboard by the doorway announces every arrival.',
  'Pigeons on the ledge, conducting their own supervision.',
  'The kettle is refilled by whoever emptied it, for once.',
  'The waiting-room magazines are from a season that has already happened.',
  'A window is opened two inches, against policy, in the good way.',
  'Traffic thins outside and the room gets quieter without anyone noticing.',
  'The boiler begins its afternoon complaint.',
  'Someone straightens the cushions between clients.',
  'The plant on the windowsill has put out a new leaf.',
  'Chalk dust on the noticeboard where the rota was changed again.',
  'The last corridor light is left on for whoever is running late.',
  'A biro is borrowed and will not be coming back.',
  'Dusk reaches the amber lamp before anyone reaches the switch.',
];
