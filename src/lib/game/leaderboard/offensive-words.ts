// Offensive words that cannot appear in a leaderboard name (13-security: "Names").
// Original list kept short on purpose: names are matched as substrings of a folded form
// (see foldName), so very short or common fragments ("ass", "cock", "rape" ⊂ "grape")
// would block innocent names. Manual moderation (/admin, reports) covers the rest.

export const OFFENSIVE_WORDS: readonly string[] = [
  // English
  'fuck',
  'shit',
  'bitch',
  'cunt',
  'nigger',
  'nigga',
  'faggot',
  'retard',
  'whore',
  'slut',
  'bastard',
  'asshole',
  'dildo',
  'pussy',
  'penis',
  'vagina',
  'wank',
  'twat',
  'porn',
  'jizz',
  'nazi',
  'hitler',
  'pedophile',
  'molest',
  // Spanish
  'puta',
  'mierda',
  'cabron',
  'pendejo',
  'gilipollas',
  'maricon',
  'joder',
  'culero',
  'verga',
  'chingada',
  // Japanese (romaji)
  'chinko',
  'manko',
];
