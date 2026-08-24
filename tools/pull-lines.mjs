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
import { GAMES, TEAMS } from '../assets/js/config.js';
import {
  SPORT, modal, teamKeyFor, eventMatches, readSettings, writeSettings, isMain,
} from './lib.mjs';

const DRY_RUN = process.argv.includes('--dry-run');
const ODDS_KEY = process.env.ODDS_API_KEY;
const MIN_BOOKS = 3;          // below this the "consensus" is just one book's opinion
const MAX_PLAUSIBLE_LINE = 60;

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

export function resolveGame(game, events) {
  const match = events.find((ev) => eventMatches(ev, game));

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
    describe: favorite === ''
      ? `${label}: pick'em`
      : `${label}: ${TEAMS[favorite === 'A' ? game.teamA : game.teamB].abbr} -${line} (${points.length} books)`,
  };
}

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

if (isMain(import.meta.url, pathToFileURL)) {
  main().catch((err) => {
    console.error(`\nFAILED: ${err.message}`);
    // Set the code rather than calling process.exit(), which can tear the
    // runtime down while sockets are still closing.
    process.exitCode = 1;
  });
}
