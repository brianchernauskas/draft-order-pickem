/**
 * Shared plumbing for the Odds API jobs: team matching, consensus maths, and
 * Firestore REST access. Kept in one place so the lines job and the scores job
 * can never drift on how they identify a school.
 */
import { FIREBASE_CONFIG } from '../assets/js/config.js';

// Week 1 window. Guards against matching a rematch later in the season.
export const WINDOW_START = Date.parse('2026-09-01T00:00:00Z');
export const WINDOW_END = Date.parse('2026-09-09T00:00:00Z');

// The Odds API uses full school + mascot names. Listed explicitly rather than
// fuzzy-matched: "Washington" vs "Washington State" and "Miami" vs "Miami (OH)"
// are exactly the pairs a substring match gets wrong.
export const ODDS_API_NAMES = {
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

export function teamKeyFor(apiName) {
  const target = norm(apiName);
  for (const [key, names] of Object.entries(ODDS_API_NAMES)) {
    if (names.some((n) => norm(n) === target)) return key;
  }
  return null;
}

// Does this Odds API event correspond to this game on our board?
export function eventMatches(event, game) {
  const t = Date.parse(event.commence_time);
  if (!(t >= WINDOW_START && t < WINDOW_END)) return false;
  const home = teamKeyFor(event.home_team);
  const away = teamKeyFor(event.away_team);
  return (home === game.teamA && away === game.teamB)
      || (home === game.teamB && away === game.teamA);
}

// --- consensus --------------------------------------------------------------

export function median(arr) {
  const s = [...arr].sort((a, b) => a - b);
  const n = s.length;
  return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
}

// Most common value; ties break toward the one nearest the median, so a board of
// -2.5 / -3 / -3.5 reports -3 rather than whichever book was listed first.
export function modal(values) {
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

// --- firestore --------------------------------------------------------------
// Plain REST. The database rules are open, so no service account is needed — the
// public web API key is only there to identify the project.

const BASE = `https://firestore.googleapis.com/v1/projects/${FIREBASE_CONFIG.projectId}`
  + '/databases/(default)/documents/config/settings';

export function toFs(value) {
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

export function fromFs(value) {
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

export async function readSettings() {
  const res = await fetch(`${BASE}?key=${FIREBASE_CONFIG.apiKey}`);
  if (res.status === 404) return {};
  if (!res.ok) throw new Error(`Firestore read failed ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const doc = await res.json();
  const out = {};
  for (const [k, v] of Object.entries(doc.fields || {})) out[k] = fromFs(v);
  return out;
}

export async function writeSettings(settings) {
  const fields = {};
  for (const [k, v] of Object.entries(settings)) fields[k] = toFs(v);
  const res = await fetch(`${BASE}?key=${FIREBASE_CONFIG.apiKey}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields }),
  });
  if (!res.ok) throw new Error(`Firestore write failed ${res.status}: ${(await res.text()).slice(0, 300)}`);
}

// --- misc -------------------------------------------------------------------

export const SPORT = 'americanfootball_ncaaf';

export function isMain(importMetaUrl, pathToFileURL) {
  return Boolean(process.argv[1]) && importMetaUrl === pathToFileURL(process.argv[1]).href;
}
