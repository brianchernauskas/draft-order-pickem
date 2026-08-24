/**
 * Offline checks for the line puller. No network, no API key.
 *
 *   node tools/pull-lines.test.mjs
 */
import { GAMES, TEAMS } from '../assets/js/config.js';
import { modal, teamKeyFor } from './lib.mjs';
import { resolveGame } from './pull-lines.mjs';
import { finalFor } from './pull-scores.mjs';

let failures = 0;
const check = (name, cond, detail = '') => {
  if (cond) { console.log(`  ok   ${name}`); }
  else { console.log(`  FAIL ${name} ${detail}`); failures += 1; }
};

console.log('\nconsensus');
check('picks the most common number', modal([-3, -3, -3.5, -2.5, -3]) === -3);
check('tie breaks toward the median', modal([-2.5, -3.5]) === -2.5 || modal([-2.5, -3.5]) === -3.5);
check('single outlier cannot set the line', modal([-7, -7, -7, -21]) === -7);
check('handles pick em', modal([0, 0, 1]) === 0);

console.log('\nteam matching');
check('Washington is not Washington State', teamKeyFor('Washington Huskies') === 'WASH');
check('Washington State is not Washington', teamKeyFor('Washington State Cougars') === 'WSU');
check('Miami FL maps to MIA', teamKeyFor('Miami Hurricanes') === 'MIA');
check('Miami OH does not match', teamKeyFor('Miami (OH) RedHawks') === null);
check('Cal alias works', teamKeyFor('Cal Golden Bears') === 'CAL');
check('unknown school returns null', teamKeyFor('Rutgers Scarlet Knights') === null);
check('every configured team resolves', Object.keys(TEAMS).every((k) => {
  const g = GAMES.find((x) => x.teamA === k || x.teamB === k);
  return Boolean(g);
}));

// Build a synthetic Odds API payload for the real ten games.
const NAMES = {
  COLO: 'Colorado Buffaloes', GT: 'Georgia Tech Yellow Jackets', MIA: 'Miami Hurricanes',
  STAN: 'Stanford Cardinal', BC: 'Boston College Eagles', CIN: 'Cincinnati Bearcats',
  BOIS: 'Boise State Broncos', ORE: 'Oregon Ducks', BAY: 'Baylor Bears', AUB: 'Auburn Tigers',
  CLEM: 'Clemson Tigers', LSU: 'LSU Tigers', UCLA: 'UCLA Bruins', CAL: 'California Golden Bears',
  LOU: 'Louisville Cardinals', MISS: 'Ole Miss Rebels', WIS: 'Wisconsin Badgers',
  ND: 'Notre Dame Fighting Irish', WASH: 'Washington Huskies', WSU: 'Washington State Cougars',
};

function fakeEvent(game, pointsForA, commence = '2026-09-05T23:00:00Z') {
  return {
    id: `evt_${game.id}`,
    commence_time: commence,
    home_team: NAMES[game.teamB],   // away listed first in our config
    away_team: NAMES[game.teamA],
    bookmakers: pointsForA.map((p, i) => ({
      key: `book${i}`,
      markets: [{
        key: 'spreads',
        outcomes: [
          { name: NAMES[game.teamA], point: p },
          { name: NAMES[game.teamB], point: -p },
        ],
      }],
    })),
  };
}

console.log('\nresolving games');
const g1 = GAMES[0];
const r1 = resolveGame(g1, [fakeEvent(g1, [-3, -3, -3.5])]);
check('favourite side A when teamA is laying points', r1.favorite === 'A' && r1.line === 3, JSON.stringify(r1));

const r2 = resolveGame(g1, [fakeEvent(g1, [6.5, 6.5, 7])]);
check('favourite side B when teamA is getting points', r2.favorite === 'B' && r2.line === 6.5, JSON.stringify(r2));

const r3 = resolveGame(g1, [fakeEvent(g1, [0, 0, 0])]);
check('pick em resolves to no favourite', r3.favorite === '' && r3.line === 0);

console.log('\nguards');
const thrown = (fn) => { try { fn(); return false; } catch { return true; } };
check('thin book coverage aborts', thrown(() => resolveGame(g1, [fakeEvent(g1, [-3, -3])])));
check('missing event aborts', thrown(() => resolveGame(g1, [])));
check('implausible line aborts', thrown(() => resolveGame(g1, [fakeEvent(g1, [-99, -99, -99])])));
check('game outside the Week 1 window is ignored',
  thrown(() => resolveGame(g1, [fakeEvent(g1, [-3, -3, -3], '2026-11-14T20:00:00Z')])));

// All ten, as a full dress rehearsal.
console.log('\nfull slate');
const slate = GAMES.map((g, i) => fakeEvent(g, [-(i + 1), -(i + 1), -(i + 1) - 0.5]));
let allOk = true;
for (const g of GAMES) {
  try { resolveGame(g, slate); } catch (e) { allOk = false; console.log(`  FAIL ${g.id}: ${e.message}`); }
}
check('all ten games resolve against a full slate', allOk);

console.log('\nscores');
const gW = GAMES.find((g) => g.id === 'g9');   // Wisconsin / Notre Dame
const scoreEvent = (completed, a, b) => ({
  commence_time: '2026-09-06T23:00:00Z',
  completed,
  home_team: NAMES[gW.teamB],
  away_team: NAMES[gW.teamA],
  scores: [
    { name: NAMES[gW.teamA], score: String(a) },
    { name: NAMES[gW.teamB], score: String(b) },
  ],
});
check('records a completed final',
  JSON.stringify(finalFor(scoreEvent(true, 17, 31), gW)) === '{"a":17,"b":31}',
  JSON.stringify(finalFor(scoreEvent(true, 17, 31), gW)));
check('ignores a game still in progress', finalFor(scoreEvent(false, 10, 7), gW) === null);
check('ignores a missing event', finalFor(undefined, gW) === null);
check('ignores an event with no score rows', finalFor({
  commence_time: '2026-09-06T23:00:00Z', completed: true,
  home_team: NAMES[gW.teamB], away_team: NAMES[gW.teamA], scores: [],
}, gW) === null);
check('a 0-0 final is still a final',
  JSON.stringify(finalFor(scoreEvent(true, 0, 0), gW)) === '{"a":0,"b":0}');

console.log(failures ? `\n${failures} failing check(s)\n` : '\nall checks passed\n');
process.exitCode = failures ? 1 : 0;
