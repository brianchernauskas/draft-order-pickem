// ---------------------------------------------------------------------------
// CONFIG — edit this file, commit, done.
// ---------------------------------------------------------------------------

// Paste your Firebase web-app config here (Project settings -> Your apps -> Web).
// Until projectId is filled in, the whole site runs in DEMO MODE against
// localStorage so you can click around without a backend.
export const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyAp1tnKQKXJuE-XZrETMGX6yCM5XxYzOWg',
  authDomain: 'bourbonffldraft.firebaseapp.com',
  projectId: 'bourbonffldraft',
  storageBucket: 'bourbonffldraft.firebasestorage.app',
  messagingSenderId: '993985146902',
  appId: '1:993985146902:web:31441406f152d043f74537',
  measurementId: 'G-T8JQ2F37ZK',
};

// Password players type to reach the board. Obscurity only — the source is
// public, so anyone who views it can read this. It keeps the URL from being
// self-serve if it gets forwarded, nothing more.
export const PICKS_PASSWORD = 'degenerateffl';

// Soft gate on the admin page. Same caveat as above.
// See README for locking admin down properly.
export const ADMIN_PASSPHRASE = 'draftorder2026';

// Emails a receipt of each submitted board to the player and the commissioner.
// Uses EmailJS, which sends straight from the browser — no server needed, which
// is the only way this works on GitHub Pages. Free tier is 200 emails a month.
//
// Leave publicKey blank and the feature stays off: the email field still shows
// up and the address is still saved with the entry, and players get a
// "send a copy from your own mail app" link instead. See README to switch it on.
export const EMAIL_CONFIG = {
  publicKey: '',
  serviceId: '',
  templateId: '',
  commissionerEmail: 'rhelleraz@gmail.com',
};

export const LEAGUE_NAME = 'The Degenerate Bourbon Fantasy Football League';
export const LEAGUE_SHORT = 'DBFFL';           // used in the header on narrow screens
export const SEASON_LABEL = 'Draft Order Pick’Em · CFB Week 1';

// Shown across the top of the picks and standings pages.
export const HONORS = [
  { icon: '🏆', label: '2026 Champs',              names: 'Lance & Phil', tone: 'champ' },
  { icon: '👗', label: 'Last Place / Dress Winner', names: 'Erik',         tone: 'dress' },
];

// The game whose combined final score breaks ties.
export const TIEBREAKER_GAME_ID = 'g9';

// ---------------------------------------------------------------------------
// TEAMS — espn id drives the logo URL, colors drive the card treatment.
// ---------------------------------------------------------------------------
export const TEAMS = {
  COLO: { name: 'Colorado',         mascot: 'Buffaloes',      abbr: 'COLO', espn: 38,   primary: '#CFB87C', secondary: '#000000' },
  GT:   { name: 'Georgia Tech',     mascot: 'Yellow Jackets', abbr: 'GT',   espn: 59,   primary: '#B3A369', secondary: '#003057' },
  MIA:  { name: 'Miami',            mascot: 'Hurricanes',     abbr: 'MIA',  espn: 2390, primary: '#F47321', secondary: '#005030' },
  STAN: { name: 'Stanford',         mascot: 'Cardinal',       abbr: 'STAN', espn: 24,   primary: '#8C1515', secondary: '#4D4F53' },
  BC:   { name: 'Boston College',   mascot: 'Eagles',         abbr: 'BC',   espn: 103,  primary: '#98002E', secondary: '#BC9B6A' },
  CIN:  { name: 'Cincinnati',       mascot: 'Bearcats',       abbr: 'CIN',  espn: 2132, primary: '#E00122', secondary: '#000000' },
  BOIS: { name: 'Boise State',      mascot: 'Broncos',        abbr: 'BSU',  espn: 68,   primary: '#0033A0', secondary: '#D64309' },
  ORE:  { name: 'Oregon',           mascot: 'Ducks',          abbr: 'ORE',  espn: 2483, primary: '#154733', secondary: '#FEE123' },
  BAY:  { name: 'Baylor',           mascot: 'Bears',          abbr: 'BAY',  espn: 239,  primary: '#154734', secondary: '#FFB81C' },
  AUB:  { name: 'Auburn',           mascot: 'Tigers',         abbr: 'AUB',  espn: 2,    primary: '#0C2340', secondary: '#E87722' },
  CLEM: { name: 'Clemson',          mascot: 'Tigers',         abbr: 'CLEM', espn: 228,  primary: '#F66733', secondary: '#522D80' },
  LSU:  { name: 'LSU',              mascot: 'Tigers',         abbr: 'LSU',  espn: 99,   primary: '#461D7C', secondary: '#FDD023' },
  UCLA: { name: 'UCLA',             mascot: 'Bruins',         abbr: 'UCLA', espn: 26,   primary: '#2D68C4', secondary: '#F2A900' },
  CAL:  { name: 'California',       mascot: 'Golden Bears',   abbr: 'CAL',  espn: 25,   primary: '#003262', secondary: '#FDB515' },
  LOU:  { name: 'Louisville',       mascot: 'Cardinals',      abbr: 'LOU',  espn: 97,   primary: '#AD0000', secondary: '#000000' },
  MISS: { name: 'Ole Miss',         mascot: 'Rebels',         abbr: 'MISS', espn: 145,  primary: '#14213D', secondary: '#CE1126' },
  WIS:  { name: 'Wisconsin',        mascot: 'Badgers',        abbr: 'WIS',  espn: 275,  primary: '#C5050C', secondary: '#282728' },
  ND:   { name: 'Notre Dame',       mascot: 'Fighting Irish', abbr: 'ND',   espn: 87,   primary: '#0C2340', secondary: '#C99700' },
  WASH: { name: 'Washington',       mascot: 'Huskies',        abbr: 'UW',   espn: 264,  primary: '#4B2E83', secondary: '#B7A57A' },
  WSU:  { name: 'Washington State', mascot: 'Cougars',        abbr: 'WSU',  espn: 265,  primary: '#981E32', secondary: '#5E6A71' },
};

export function logoUrl(key) {
  return `https://a.espncdn.com/i/teamlogos/ncaa/500/${TEAMS[key].espn}.png`;
}

// ---------------------------------------------------------------------------
// GAMES — teamA/teamB follow the order you listed them in.
// kickoff times and venues are placeholders; overwrite them on the admin page
// once the real TV windows are announced.
// ---------------------------------------------------------------------------
export const GAMES = [
  { id: 'g1',  teamA: 'COLO', teamB: 'GT',   kickoff: '2026-09-03T19:30:00-04:00', venue: 'Venue TBD',                              neutral: false },
  { id: 'g2',  teamA: 'MIA',  teamB: 'STAN', kickoff: '2026-09-04T20:00:00-04:00', venue: 'Venue TBD',                              neutral: false },
  { id: 'g3',  teamA: 'BC',   teamB: 'CIN',  kickoff: '2026-09-05T12:00:00-04:00', venue: 'Venue TBD',                              neutral: false },
  { id: 'g4',  teamA: 'BOIS', teamB: 'ORE',  kickoff: '2026-09-05T15:30:00-04:00', venue: 'Venue TBD',                              neutral: false },
  { id: 'g5',  teamA: 'BAY',  teamB: 'AUB',  kickoff: '2026-09-05T19:00:00-04:00', venue: 'Mercedes-Benz Stadium — Atlanta, GA', neutral: true  },
  { id: 'g6',  teamA: 'CLEM', teamB: 'LSU',  kickoff: '2026-09-05T19:30:00-04:00', venue: 'Venue TBD',                              neutral: false },
  { id: 'g7',  teamA: 'UCLA', teamB: 'CAL',  kickoff: '2026-09-05T22:30:00-04:00', venue: 'Venue TBD',                              neutral: false },
  { id: 'g8',  teamA: 'LOU',  teamB: 'MISS', kickoff: '2026-09-06T15:00:00-04:00', venue: 'Nissan Stadium — Nashville, TN',     neutral: true  },
  { id: 'g9',  teamA: 'WIS',  teamB: 'ND',   kickoff: '2026-09-06T19:00:00-04:00', venue: 'Lambeau Field — Green Bay, WI',      neutral: true  },
  { id: 'g10', teamA: 'WSU',  teamB: 'WASH', kickoff: '2026-09-06T22:00:00-04:00', venue: 'Venue TBD',                              neutral: false },
];

export const MAX_SCORE = GAMES.reduce((sum, _, i) => sum + i + 1, 0); // 55
