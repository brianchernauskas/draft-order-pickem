#!/usr/bin/env node
/**
 * Pulls Week 1 spreads from the-odds-api.com and writes them into the board.
 *
 * Runs from GitHub Actions so the API key stays in repo secrets — putting it in
 * assets/js/config.js would publish a metered credential on a public repo.
 *
 * Consensus line = the most common number across US books, ties broken toward
 * the median. Same rule Gridiron Edge uses, so both tools quote the same number.
 *
 * Fails loudly rather than writing a half-filled board: any unmatched game, thin
 * book coverage, or implausible number aborts the whole run before it touches
 * Firestore.
 *
 *   node tools/pull-lines.mjs [--dry-run]
 */
import { pathToFileURL } from 'node:url';
import { GAMES, TEAMS, FIREBASE_CONFIG } from '../assets/js/config.js';

const DRY_RUN = process.argv.includes('--dry-run');
const ODDS_KEY = process.env.ODDS_API_KEY;
const SPORT = 'americanfootball_ncaaf';
const MIN_BOOKS = 3;          // below this the "consensus" is just one book's opinion
const MAX_PLAUSIBLE_LINE = 60;
// Week 1 window. Guards against matching a rematch later in the season.
const WINDOW_START = Date.parse('2026-09-01T00:00:00Z');
const WINDOW_END = Date.parse('2026-09-09T00:00:00Z');

// The Odds API uses full school + mascot names. Listed explicitly rather than
// fuzzy-matched: "Washington" vs "Washington State" and "Miami" vs "Miami (OH)"
// are exactly the pairs a substring match gets wrong.
const ODDS_API_NAMES = {
  COLO: ['Colorado Buffaloes'],
  GT:   ['Georgia Tech Yellow Jackets'],
  MIA:  ['Miami Hurricanes', 'Miami (FL) Hurricanes'],
  STAN: ['Stanford Cardinal'],
  BC:   ['Boston College Eagles'],
  CIN:  ['Cincinnati Bearcats'],
  BOIS: ['Boise State Broncos'],
  ORE:  ['Oregon Ducks'],
  BAY:  ['Baylor Bears'],
  AUB:  ['Auburn Tigers'],
  CLEM: ['Clemson Tigers'],
  LSU:  ['LSU Tigers', 'Louisiana State Tigers'],
  UCLA: ['UCLA Bruins'],
  CAL:  ['California Golden Bears', 'Cal Golden Bears'],
  LOU:  ['Louisville Cardinals'],
  MISS: ['Ole Miss Rebels', 'Mississippi Rebels'],
  WIS:  ['Wisconsin Badgers'],
  ND:   ['Notre Dame Fighting Irish'],
  WASH: ['Washington Huskies'],
  WSU:  ['Washington State Cougars'],
};

const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');

function teamKeyFor(apiName) {
  const target = norm(apiName);
  for (const [key, names] of Object.entries(ODDS_API_NAMES)) {
    if (names.some((n) => norm(n) === target)) return key;
  }
  return null;
}

// --- consensus --------------------------------------------------------------

function median(arr) {
  const s = [...arr].sort((a, b) => a - b);
  const n = s.length;
  return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
}

// Most common value; ties break toward the one nearest the median, so a board of
// -2.5 / -3 / -3.5 reports -3 rather than whichever book was listed first.
function modal(values) {
  const counts = new Map();
  for (const v of values) counts.set(v, (counts.get(v) || 0) + 1);
  const med = median(values);
  let best = null;
  let bestN = -1;
  for (const [v, n] of counts) {
    if (n > bestN || (n === bestN && Math.abs(v - med) < Math.abs(best - med))) {
      bestN = n;
      best = v;
    }
  }
  return best;
}

// --- odds fetch -------------------------------------------------------------

async function fetchEvents() {
  const url = `https://api.the-odds-api.com/v4/sports/${SPORT}/odds`
    + `?apiKey=${encodeURIComponent(ODDS_KEY)}`
    + '&regions=us&markets=spreads&oddsFormat=american';

  const res = await fetch(url);
  const remaining = res.headers.get('x-requests-remaining');
  const used = res.headers.get('x-requests-used');

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    if (res.status === 401) throw new Error('Odds API rejected the key (401). Check the ODDS_API_KEY secret.');
    if (res.status === 429) throw new Error('Odds API quota exhausted (429).');
    throw new Error(`Odds API ${res.status}: ${body.slice(0, 300)}`);
  }

  console.log(`Odds API credits — used ${used}, remaining ${remaining}`);
  return res.json();
}

// Pull every book's number for `key` in this event.
function pointsForTeam(event, key) {
  const points = [];
  for (const book of event.bookmakers || []) {
    const market = (book.markets || []).find((m) => m.key === 'spreads');
    if (!market) continue;
    const outcome = (market.outcomes || []).find((o) => teamKeyFor(o.name) === key);
    if (outcome && typeof outcome.point === 'number') points.push(outcome.point);
  }
  return points;
}

function resolveGame(game, events) {
  const match = events.find((ev) => {
    const t = Date.parse(ev.commence_time);
    if (!(t >= WINDOW_START && t < WINDOW_END)) return false;
    const home = teamKeyFor(ev.home_team);
    const away = teamKeyFor(ev.away_team);
    return (home === game.teamA && away === game.teamB)
        || (home === game.teamB && away === game.teamA);
  });

  const label = `${TEAMS[game.teamA].name} / ${TEAMS[game.teamB].name}`;
  if (!match) throw new Error(`No Odds API event found for ${label} in the Week 1 window.`);

  const points = pointsForTeam(match, game.teamA);
  if (points.length < MIN_BOOKS) {
    throw new Error(`Only ${points.length} book(s) priced ${label}; need at least ${MIN_BOOKS}.`);
  }

  // Spread quoted from teamA's side: negative means teamA is favoured.
  const consensus = modal(points);
  if (Math.abs(consensus) > MAX_PLAUSIBLE_LINE) {
    throw new Error(`Implausible line ${consensus} for ${label}.`);
  }

  const favorite = consensus < 0 ? 'A' : consensus > 0 ? 'B' : '';
  const line = Math.abs(consensus);

  return {
    id: game.id,
    label,
    favorite,
    line,
    books: points.length,
    commence: match.commence_time,
    describe: favorite === ''
      ? `${label}: pick'em`
      : `${label}: ${TEAMS[favorite === 'A' ? game.teamA : game.teamB].abbr} -${line} (${points.length} books)`,
  };
}

// --- firestore --------------------------------------------------------------
// Plain REST. The database rules are open, so no service account is needed — the
// public web API key is only there to identify the project.

const BASE = `https://firestore.googleapis.com/v1/projects/${FIREBASE_CONFIG.projectId}`
  + '/databases/(default)/documents/config/settings';

function toFs(value) {
  if (value === null || value === undefined) return { nullValue: null };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') {
    return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  }
  if (Array.isArray(value)) return { arrayValue: { values: value.map(toFs) } };
  if (typeof value === 'object') {
    const fields = {};
    for (const [k, v] of Object.entries(value)) fields[k] = toFs(v);
    return { mapValue: { fields } };
  }
  return { stringValue: String(value) };
}

function fromFs(value) {
  if (!value || typeof value !== 'object') return value;
  if ('nullValue' in value) return null;
  if ('booleanValue' in value) return value.booleanValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return value.doubleValue;
  if ('stringValue' in value) return value.stringValue;
  if ('arrayValue' in value) return (value.arrayValue.values || []).map(fromFs);
  if ('mapValue' in value) {
    const out = {};
    for (const [k, v] of Object.entries(value.mapValue.fields || {})) out[k] = fromFs(v);
    return out;
  }
  return null;
}

async function readSettings() {
  const res = await fetch(`${BASE}?key=${FIREBASE_CONFIG.apiKey}`);
  if (res.status === 404) return {};
  if (!res.ok) throw new Error(`Firestore read failed ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const doc = await res.json();
  const out = {};
  for (const [k, v] of Object.entries(doc.fields || {})) out[k] = fromFs(v);
  return out;
}

async function writeSettings(settings) {
  const fields = {};
  for (const [k, v] of Object.entries(settings)) fields[k] = toFs(v);
  const res = await fetch(`${BASE}?key=${FIREBASE_CONFIG.apiKey}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields }),
  });
  if (!res.ok) throw new Error(`Firestore write failed ${res.status}: ${(await res.text()).slice(0, 300)}`);
}

// --- main -------------------------------------------------------------------

async function main() {
  if (!ODDS_KEY) throw new Error('ODDS_API_KEY is not set.');

  const events = await fetchEvents();
  console.log(`Fetched ${events.length} NCAAF events.\n`);

  // Resolve every game before writing anything — a partial board is worse than
  // none, because nobody can tell which numbers are real.
  const resolved = GAMES.map((g) => resolveGame(g, events));
  resolved.forEach((r) => console.log(`  ${r.describe}`));

  if (DRY_RUN) {
    console.log('\nDry run — nothing written.');
    return;
  }

  const settings = await readSettings();
  settings.games = settings.games || {};
  for (const r of resolved) {
    // Preserve venue and kickoff; only the odds fields are ours to set.
    settings.games[r.id] = { ...(settings.games[r.id] || {}), favorite: r.favorite, line: r.line };
  }
  settings.linesUpdatedAt = new Date().toISOString();
  settings.linesSource = 'the-odds-api consensus (us books)';

  await writeSettings(settings);
  console.log(`\nWrote ${resolved.length} lines to Firestore.`);
}

// Only run when invoked directly, so the pure helpers above can be imported by
// tools/pull-lines.test.mjs without firing a live fetch.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(`\nFAILED: ${err.message}`);
    // Set the code rather than calling process.exit(), which can tear the
    // runtime down while sockets are still closing.
    process.exitCode = 1;
  });
}

export { modal, median, teamKeyFor, resolveGame, toFs, fromFs };
