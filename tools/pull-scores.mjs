#!/usr/bin/env node
/**
 * Records final scores as games end, which scores the board automatically.
 *
 * The scores endpoint costs 2 credits per call, so this checks Firestore first
 * (free) and only reaches for the API when a game has actually kicked off and is
 * still missing a result. Once all ten are recorded every later run exits at
 * zero cost, which is what makes an hourly cron affordable on the free tier.
 *
 * Only fills blanks. A score entered by hand on the admin page is never
 * overwritten, so the commissioner always has the last word.
 *
 *   node tools/pull-scores.mjs [--dry-run] [--force]
 */
import { pathToFileURL } from 'node:url';
import { GAMES, TEAMS } from '../assets/js/config.js';
import { SPORT, teamKeyFor, eventMatches, readSettings, writeSettings, isMain } from './lib.mjs';

const DRY_RUN = process.argv.includes('--dry-run');
const FORCE = process.argv.includes('--force');   // skip the elapsed-time gate
const ODDS_KEY = process.env.ODDS_API_KEY;

// A college game runs about three and a half hours. Checking earlier than this
// mostly buys `completed: false` at two credits a look.
//
// Held at 2.5 rather than 3 because the hourly cron is best-effort and has been
// firing every two hours or so: a 3-hour gate let a game that kicked at 23:30
// miss the 02:01 run by 29 minutes and wait for the next one. The looser gate
// costs an occasional wasted look at a game still in the fourth quarter, and
// nothing worse — only events the API reports as completed are ever written.
const MIN_ELAPSED_HOURS = 2.5;

function hasResult(settings, id) {
  const r = (settings.results || {})[id];
  return Boolean(r) && r.a !== undefined && r.a !== '' && r.b !== undefined && r.b !== '';
}

function kickoffOf(settings, game) {
  const override = ((settings.games || {})[game.id] || {}).kickoff;
  return Date.parse(override || game.kickoff);
}

async function fetchScores() {
  if (!ODDS_KEY) throw new Error('ODDS_API_KEY is not set.');
  // daysFrom is required to get completed games, and is what makes this cost 2.
  const url = `https://api.the-odds-api.com/v4/sports/${SPORT}/scores`
    + `?apiKey=${encodeURIComponent(ODDS_KEY)}&daysFrom=3&dateFormat=iso`;

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

// Returns { a, b } or null if the event is not finished or is missing a number.
export function finalFor(event, game) {
  if (!event || event.completed !== true) return null;
  const rows = event.scores || [];
  const pick = (key) => {
    const row = rows.find((s) => teamKeyFor(s.name) === key);
    if (!row) return null;
    const n = Number(row.score);
    return Number.isFinite(n) ? n : null;
  };
  const a = pick(game.teamA);
  const b = pick(game.teamB);
  if (a === null || b === null) return null;
  return { a, b };
}

async function main() {
  // Key is checked at the fetch, not here: a run with nothing to do should
  // succeed without needing it. The workflow guards against a missing secret.
  const settings = await readSettings();
  const now = Date.now();

  const pending = GAMES.filter((g) => {
    if (hasResult(settings, g.id)) return false;
    if (FORCE) return true;
    const kick = kickoffOf(settings, g);
    if (!Number.isFinite(kick)) return false;
    return now - kick >= MIN_ELAPSED_HOURS * 3600 * 1000;
  });

  const recorded = GAMES.filter((g) => hasResult(settings, g.id)).length;
  console.log(`${recorded}/${GAMES.length} games already recorded.`);

  if (!pending.length) {
    // The whole point of the early exit: no API call, no credits spent.
    const waiting = GAMES.filter((g) => !hasResult(settings, g.id)).length;
    console.log(waiting
      ? `${waiting} still to come, none finished long enough to check. No API call made.`
      : 'All games recorded. No API call made.');
    return;
  }

  console.log(`Checking ${pending.length}: ${pending.map((g) => g.id).join(', ')}`);
  const events = await fetchScores();

  const found = [];
  const notYet = [];
  for (const game of pending) {
    const event = events.find((ev) => eventMatches(ev, game));
    const label = `${TEAMS[game.teamA].name} / ${TEAMS[game.teamB].name}`;
    const final = finalFor(event, game);
    if (final) found.push({ game, final, label });
    else notYet.push(label);
  }

  found.forEach(({ label, final, game }) => console.log(
    `  FINAL ${label}: ${TEAMS[game.teamA].abbr} ${final.a} - ${TEAMS[game.teamB].abbr} ${final.b}`));
  notYet.forEach((label) => console.log(`  still in progress or unreported: ${label}`));

  if (!found.length) {
    console.log('\nNothing final yet. Nothing written.');
    return;
  }
  if (DRY_RUN) {
    console.log('\nDry run — nothing written.');
    return;
  }

  settings.results = settings.results || {};
  for (const { game, final } of found) settings.results[game.id] = final;
  settings.scoresUpdatedAt = new Date().toISOString();

  await writeSettings(settings);
  console.log(`\nRecorded ${found.length} final(s). Standings update immediately.`);
}

if (isMain(import.meta.url, pathToFileURL)) {
  main().catch((err) => {
    console.error(`\nFAILED: ${err.message}`);
    process.exitCode = 1;
  });
}
