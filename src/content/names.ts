/**
 * Name and flavour banks for the procedural generator.
 *
 * Nothing here is typed against the sim — these are raw string banks the client
 * and therapist factories draw from. Where a bank carries a `conditions` filter,
 * the strings are ConditionId values and the generator narrows on them.
 *
 * House rules for anything written here:
 *  - Clients are people who have a condition, never the condition itself.
 *  - Concrete objects and small hours beat adjectives. One image, one turn.
 *  - Nothing that makes suffering cute, nothing that makes it a punchline.
 */

export const FIRST_NAMES: readonly string[] = [
  'Amara',
  'Aiden',
  'Priya',
  'Marcus',
  'Noor',
  'Diego',
  'Yuki',
  'Rosa',
  'Tomas',
  'Leila',
  'Kwame',
  'Ingrid',
  'Hassan',
  'Mei',
  'Rafael',
  'Sofia',
  'Jonah',
  'Nadia',
  'Seun',
  'Elena',
  'Bashir',
  'Clara',
  'Dmitri',
  'Farah',
  'Gabriel',
  'Hana',
  'Ismael',
  'Juno',
  'Kenji',
  'Lucia',
  'Malik',
  'Nina',
  'Omar',
  'Paloma',
  'Quinn',
  'Rania',
  'Samir',
  'Tessa',
  'Uma',
  'Viktor',
  'Willa',
  'Xiomara',
  'Yara',
  'Zane',
  'Anya',
  'Ruth',
  'Camille',
  'Dara',
  'Ezra',
  'Fiona',
  'Gideon',
  'Halima',
  'Idris',
  'Jae',
  'Kira',
  'Lior',
  'Mira',
  'Nikhil',
  'Walter',
  'Pia',
  'Rashid',
  'Selin',
  'Theo',
  'Ulises',
  'Vera',
  'Wesley',
  'Ximena',
  'Yosef',
  'Zoya',
  'Adaeze',
  'Bennett',
  'Chidi',
  'Delphine',
  'Harold',
  'Freya',
  'Giulia',
  'Hugo',
  'Imani',
  'Jamal',
  'Keiko',
  'Lars',
  'Maeve',
  'Nia',
  'Oscar',
  'Petra',
  'Rowan',
  'Sasha',
  'Tariq',
  'Ursula',
  'Vikram',
  'Wanjiru',
  'Yusuf',
  'Zara',
  'Alma',
  'Basil',
  'Cyrus',
  'Daniela',
  'Emeka',
  'Fatima',
  'Grigor',
  'Hyun',
  'Ines',
  'June',
  'Karim',
  'Lena',
  'Mateo',
  'Nadir',
  'Odile',
  'Pablo',
  'Ravi',
  'Simone',
  'Tuan',
  'Nancy',
  'Valeria',
  'Winston',
  'Xavier',
  'Yohannes',
  'Zeynep',
  'Aisling',
  'Bilal',
  'Corinne',
  'Devon',
  'Esther',
  'Ferran',
];

export const LAST_NAMES: readonly string[] = [
  'Okonkwo',
  'Alvarez',
  'Nakamura',
  'Petrov',
  'Haddad',
  'Lindqvist',
  'Osei',
  'Bianchi',
  'Nguyen',
  'Delgado',
  'Fitzgerald',
  'Kaur',
  'Mbeki',
  'Rossi',
  'Yamada',
  'Kowalski',
  'Abebe',
  'Silva',
  'Ferreira',
  'Chen',
  'Park',
  'Ibrahim',
  'Novak',
  'Mercado',
  'Kaplan',
  'Duarte',
  'Sinclair',
  'Aliyev',
  'Bhatt',
  'Castellanos',
  'Dunne',
  'Eriksen',
  'Farooq',
  'Gallagher',
  'Hoang',
  'Iversen',
  'Jimenez',
  'Kimura',
  'Lombardi',
  'Mahmoud',
  'Njoku',
  'Ochoa',
  'Pereira',
  'Quintero',
  'Rahman',
  'Sandoval',
  'Tanaka',
  'Ustinov',
  'Vargas',
  'Wallace',
  'Xu',
  'Yildiz',
  'Zamora',
  'Adeyemi',
  'Brennan',
  'Cavanaugh',
  'Dahl',
  'Espinoza',
  'Fournier',
  'Grigoryan',
  'Hollis',
  'Ishikawa',
  'Jelinek',
  'Khoury',
  'Larsen',
  'Moreau',
  'Nakagawa',
  "O'Leary",
  'Prasad',
  'Quan',
  'Reyes',
  'Solberg',
  'Thackeray',
  'Uba',
  'Villanueva',
  'Weaver',
  'Yoon',
  'Zeleny',
  'Amadi',
  'Boateng',
  'Cortez',
  'Devereaux',
  'Ellery',
  'Fontaine',
  'Ganesan',
  'Hartley',
  'Ivanova',
  'Jorgensen',
  'Kirby',
  'Lachance',
];

export const PRONOUN_SETS: readonly string[] = [
  'she/her',
  'he/him',
  'they/them',
  'she/they',
  'he/they',
  'they/she',
];

/**
 * Two-clause client backstories. Standalone sentences — the generator supplies
 * the age and handle around them, so no tokens are needed here.
 *
 * `conditions` restricts a line to those ConditionIds. Undefined means the line
 * fits anybody who walks in.
 */
export const CLIENT_BACKSTORIES: readonly { text: string; conditions?: string[] }[] = [
  // ── Universal ──────────────────────────────────────────────────────────────
  {
    text: 'Moved here for a job that ended after four months. Has not unpacked the last two boxes.',
  },
  {
    text: 'Night-shift baker. Sees more of the ovens than of anyone who knows their name.',
  },
  {
    text: 'Cares for a father who no longer recognises the house he built.',
  },
  {
    text: 'Recently promoted to manage the team they used to eat lunch with.',
  },
  {
    text: "Grew up translating for their parents at doctors' offices. Still finds it hard to say what they need.",
  },
  {
    text: 'Third year of a doctorate nobody in the family can explain to the neighbours.',
  },
  {
    text: 'Drives forty minutes each way to a job that used to be five.',
  },
  {
    text: 'Split custody, alternate weeks. The quiet weeks are the hard ones.',
  },
  {
    text: 'Left the church they were raised in. Misses the singing, not the rest.',
  },
  {
    text: 'Runs a hardware store their grandfather opened. Has never taken a full week off.',
  },
  {
    text: 'Their roommate moved out in June and the flat got loud in a different way.',
  },
  {
    text: 'First in the family to finish university, and the only one living more than an hour away.',
  },
  {
    text: 'Retired in March. Has reorganised the garage twice since.',
  },
  {
    text: 'Works remote, four time zones from the rest of the team. Talks aloud to the cat.',
  },
  {
    text: 'Came in because their partner asked twice, then asked once more.',
  },
  {
    text: 'Rents a room above a laundromat and knows every cycle by sound.',
  },
  {
    text: 'Was the calm one all through the family emergency. Came apart in October, alone.',
  },
  {
    text: 'Twenty-two years in the same building; the company changed names four times around them.',
  },
  {
    text: 'Cancels plans, feels relieved, then feels terrible about the relief.',
  },
  {
    text: 'New baby, no family within a thousand miles, and a kind neighbour they never call.',
  },
  {
    text: 'Coaches an under-12 side on Saturdays and is a different person on the touchline.',
  },
  {
    text: 'Came back from six years abroad and found the friendships had closed over.',
  },
  {
    text: 'Reads two books a week and has not finished a conversation in months.',
  },
  {
    text: 'Discharged from the army four years ago. Still makes the bed like an inspection.',
  },
  {
    text: 'Sold the family house in spring and has not driven down that street since.',
  },
  {
    text: 'Works the hotel front desk. Very good at being pleasant, very tired of it.',
  },
  {
    text: 'Was told they were the easy child and has been trying to stay that way for thirty years.',
  },
  {
    text: 'Started waking at five to have one hour that belongs to nobody else.',
  },
  {
    text: 'Two jobs, one bus route, and a sister who keeps leaving encouraging voicemails.',
  },
  {
    text: 'Everyone assumes they are fine because they always ask about you first.',
  },

  // ── Anxiety ────────────────────────────────────────────────────────────────
  {
    text: 'Rehearses phone calls in the shower and still writes the first line down.',
    conditions: ['anxiety'],
  },
  {
    text: 'Turned down a job they wanted because the interview was in a city they would have to fly to.',
    conditions: ['anxiety'],
  },
  {
    text: 'Sits facing the door in restaurants and knows where every exit is.',
    conditions: ['anxiety'],
  },
  {
    text: 'A CV full of jobs left just before the performance reviews came round.',
    conditions: ['anxiety'],
  },

  // ── Depression ─────────────────────────────────────────────────────────────
  {
    text: 'Has not cooked a proper meal since February. The good pans are still boxed.',
    conditions: ['depression'],
  },
  {
    text: 'Answers messages a week late with three paragraphs of apology.',
    conditions: ['depression'],
  },
  {
    text: 'Used to run half-marathons. The shoes are by the door, still laced.',
    conditions: ['depression'],
  },
  {
    text: 'Says the days are fine; it is the evenings that go on too long.',
    conditions: ['depression'],
  },

  // ── Trauma ─────────────────────────────────────────────────────────────────
  {
    text: 'Sleeps with the hallway light on, and has since the crash on the ring road.',
    conditions: ['trauma'],
  },
  {
    text: 'Left eleven years in emergency dispatch and has not been able to explain why.',
    conditions: ['trauma'],
  },
  {
    text: 'Flinches at a car door slamming, and hates that everyone notices.',
    conditions: ['trauma'],
  },
  {
    text: 'Six good years. Then a smell in a stairwell put them back in the room.',
    conditions: ['trauma'],
  },

  // ── Grief ──────────────────────────────────────────────────────────────────
  {
    text: "Still pays their brother's phone bill so the voicemail greeting stays up.",
    conditions: ['grief'],
  },
  {
    text: 'Widowed in May. Sets the table for two out of habit, then sits down anyway.',
    conditions: ['grief'],
  },
  {
    text: 'Lost the pregnancy at nineteen weeks. People stopped asking sometime in August.',
    conditions: ['grief'],
  },
  {
    text: "Their mother's handwriting is on every jar in the freezer.",
    conditions: ['grief'],
  },

  // ── OCD ────────────────────────────────────────────────────────────────────
  {
    text: 'Leaves an hour early to allow for going back to check the door.',
    conditions: ['ocd'],
  },
  {
    text: 'Cannot let anyone leave the house until a particular sentence has been said correctly.',
    conditions: ['ocd'],
  },
  {
    text: 'Washes until the water runs cold and calls it being careful.',
    conditions: ['ocd'],
  },
  {
    text: 'Rereads their own sent emails four times, hunting for the harm in them.',
    conditions: ['ocd'],
  },

  // ── ADHD ───────────────────────────────────────────────────────────────────
  {
    text: 'Six half-finished projects in the spare room and a very good reason for each.',
    conditions: ['adhd'],
  },
  {
    text: 'Brilliant in a crisis, undone by a form that takes nine minutes.',
    conditions: ['adhd'],
  },
  {
    text: 'Diagnosed at thirty-four, a year after their daughter was. Has feelings about school.',
    conditions: ['adhd'],
  },
  {
    text: 'Sets eleven alarms and is still ambushed by Tuesday.',
    conditions: ['adhd'],
  },

  // ── Substance ──────────────────────────────────────────────────────────────
  {
    text: 'Ninety-one days. Counts them the way other people count savings.',
    conditions: ['substance'],
  },
  {
    text: 'Stopped drinking at home first, which was easy, and then everywhere, which was not.',
    conditions: ['substance'],
  },
  {
    text: 'The wine was for the sleeping, and then the sleeping was for the wine.',
    conditions: ['substance'],
  },
  {
    text: 'Holds down a job, a lease and a secret, and is tired of the third one.',
    conditions: ['substance'],
  },

  // ── Relationship ───────────────────────────────────────────────────────────
  {
    text: 'Eleven years together, two of them spent having the same argument in different clothes.',
    conditions: ['relationship'],
  },
  {
    text: 'They both want to stay. Neither can say out loud what staying would look like.',
    conditions: ['relationship'],
  },
  {
    text: 'Moved in with a partner and quietly lost every friend who was not also theirs.',
    conditions: ['relationship'],
  },
  {
    text: 'Married young, kind to each other, and lonely in the same kitchen.',
    conditions: ['relationship'],
  },

  // ── Eating ─────────────────────────────────────────────────────────────────
  {
    text: 'Knows the canteen menu by heart and has not eaten there since spring.',
    conditions: ['eating'],
  },
  {
    text: 'Rowed at national level until a coach said one sentence that stuck for nine years.',
    conditions: ['eating'],
  },
  {
    text: 'Cooks beautifully for other people, then eats standing at the counter. Or does not.',
    conditions: ['eating'],
  },
  {
    text: 'The whole morning is arranged around one mirror and one set of numbers.',
    conditions: ['eating'],
  },

  // ── Bipolar ────────────────────────────────────────────────────────────────
  {
    text: 'Wrote an entire album in nine days in March and has not opened the laptop since.',
    conditions: ['bipolar'],
  },
  {
    text: 'Two house moves and a business plan last spring. This spring the curtains stay shut.',
    conditions: ['bipolar'],
  },
  {
    text: 'Stopped the medication in July because they missed how bright everything was.',
    conditions: ['bipolar'],
  },
  {
    text: 'The family calls the good months the fun version and has no word for the rest.',
    conditions: ['bipolar'],
  },

  // ── Identity ───────────────────────────────────────────────────────────────
  {
    text: 'Came out at forty-one and is working out what to do with the years before it.',
    conditions: ['identity'],
  },
  {
    text: 'Second generation, fluent in both languages, at home in neither room.',
    conditions: ['identity'],
  },
  {
    text: 'Left the small town at eighteen and still edits their voice on the phone home.',
    conditions: ['identity'],
  },
  {
    text: 'Changed their name in June. Their sister keeps forgetting; their mother keeps trying.',
    conditions: ['identity'],
  },

  // ── Burnout ────────────────────────────────────────────────────────────────
  {
    text: 'Fourteen years in paediatric nursing. Cried in the car park twice before one Tuesday shift.',
    conditions: ['burnout'],
  },
  {
    text: 'Loved teaching. Cannot now open the school email without their jaw setting.',
    conditions: ['burnout'],
  },
  {
    text: 'Runs a small charity on a shoestring and answers the phone at eleven at night.',
    conditions: ['burnout'],
  },
  {
    text: 'Took the promotion and lost the part of the job they actually liked.',
    conditions: ['burnout'],
  },

  // ── Psychosis ──────────────────────────────────────────────────────────────
  {
    text: 'Nineteen, first year away at university, came home in November and stayed.',
    conditions: ['psychosis'],
  },
  {
    text: 'The radio started addressing them by name in April. Their brother noticed first, and said so gently.',
    conditions: ['psychosis'],
  },
  {
    text: 'Bright, guarded, and quietly certain about something they are not ready to say aloud.',
    conditions: ['psychosis'],
  },
  {
    text: 'Back at their parents after a hospital stay, renegotiating what independence means now.',
    conditions: ['psychosis'],
  },

  // ── Child behavioural ──────────────────────────────────────────────────────
  {
    text: 'Third school in two years. The last one used the word defiant in a letter.',
    conditions: ['behavioral'],
  },
  {
    text: 'Funny, quick, and the only one in the family who cannot sit through dinner.',
    conditions: ['behavioral'],
  },
  {
    text: 'Bites at daycare and hugs at pickup like the world is ending.',
    conditions: ['behavioral'],
  },
  {
    text: 'The forty minutes before school now set the temperature of the whole house.',
    conditions: ['behavioral'],
  },
];

/** One-line hiring blurbs shown on candidate cards. */
export const THERAPIST_BIOS: readonly string[] = [
  'Came to therapy after ten years in emergency nursing.',
  'Trained in a community clinic where the waiting room was also the hallway.',
  'Second career. The first was structural engineering, and it shows in the notes.',
  'Ran a school counselling office single-handed for six years.',
  'Writes better than they talk, and talks very well.',
  'Keeps a kettle in the office and a spare cardigan for clients who run cold.',
  'Did their practicum four hours out of town and still drives back twice a year.',
  'Has never once run a session over, and is quietly proud of it.',
  'Left a hospital system that measured them in units.',
  'Learned to listen behind a bar for eleven years before learning it in a classroom.',
  'Bilingual, and says the truer sentences arrive in the second language.',
  'Supervised twelve externs and can still name what each of them was afraid of.',
  'Fresh out of licensure: painfully well-read, unbearably earnest, in the best way.',
  'Four years on a crisis line. Can hear a change in breathing over the phone.',
  'Believes in ending on time and in walking clients to the door.',
  'Was the family peacekeeper and made a career of it, deliberately.',
  'Takes notes on index cards and remembers everything anyway.',
  'Retrained at fifty-two. Best decision, they say, of a fairly good life.',
  'Runs on tea, bad puns and an alarming amount of unpaid consultation.',
  'Comes from social work, and still thinks about housing before insight.',
  'Carries a dog-eared copy of the same book in every bag they own.',
  'Grew up in foster care and never mentions it unless it would help.',
  'Former military chaplain. Very hard to shock, very easy to talk to.',
  'Ten years in addiction services. Keeps a sobriety chip that is not theirs.',
  'Trained abroad, requalified here, lost two years to paperwork with good humour.',
  'Known throughout the region for the least judgmental eyebrow in the profession.',
  'Prefers Fridays, plants, and clients other people found difficult.',
  'Was a music teacher, and still hears the rhythm in how people talk.',
  'Does the intake paperwork properly, which is rarer than it ought to be.',
  'Left private practice because the silence got too clean.',
  'Can sit with a crying stranger without flinching and without fixing.',
  'Wrote a dissertation on rupture and repair, then learned it the hard way.',
  'Coaches junior staff by asking three questions and then waiting.',
  'Has worked every winter holiday for nine years so somebody else did not have to.',
  'Grew up in the restaurant business. Knows how to keep a room fed and calm.',
  'Practical, direct, and slightly allergic to jargon.',
  'Started in occupational therapy and never lost the interest in hands.',
  'Keeps a running list of every client who came back to say thank you.',
  'Trained in three modalities and defends none of them at parties.',
  'Speaks softly and holds a boundary like a fence post.',
  'Their final supervision note read, in full: unusually unhurried.',
  'Spent a decade in refugee resettlement and learned to work through interpreters.',
];

/** Practice-name suggester: one from each column, shuffled by the RNG. */
export const PRACTICE_NAME_PARTS: { first: readonly string[]; second: readonly string[] } = {
  first: [
    'Lamplight',
    'Lamplit',
    'Willow',
    'Northgate',
    'Cedar',
    'Harbour',
    'Quiet Hour',
    'Open Door',
    'Fieldstone',
    'Bright Morning',
    'Kestrel',
    'Hearth',
    'Riverbend',
    'Common Ground',
    'Foxglove',
    'Stillwater',
    'Alder',
    'Copperleaf',
    'Waypoint',
    'Elm Street',
    'Sunroom',
    'Blue Door',
    'Meadowlark',
    'Second Story',
    'Long Meadow',
    'Anchor',
    'Threshold',
    'Wintergreen',
    'Marigold',
    'Old Bakery',
  ],
  second: [
    'Counseling',
    'Counseling Center',
    'Therapy Collective',
    'Psychological Services',
    'Practice',
    'Clinic',
    'Consulting Rooms',
    'Wellness Group',
    'Family Center',
    'Therapy Studio',
    'Care Collaborative',
    'Associates',
    'Therapy Practice',
    'Community Clinic',
    'Psychotherapy',
    'Counseling Rooms',
  ],
};

/** Rivals who make poach offers and turn up at conferences. */
export const RIVAL_PRACTICES: readonly string[] = [
  'Meridian Behavioral Group',
  'Northline Psychology Partners',
  'Ashcroft & Vale Therapy',
  'Summit Path Counseling',
  'The Glasshouse Practice',
  'Peregrine Mental Health',
  'Bright Harbor Associates',
  'Verity Clinical Group',
  'Ridgeway Family Services',
  'The Ellery Institute',
  'Fairmount Counseling Center',
  'Halcyon Wellness Collective',
  'Orchard Street Psychology',
  'Kestrel & Finch Associates',
];
