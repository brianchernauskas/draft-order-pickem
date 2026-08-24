// ---------------------------------------------------------------------------
// Pure scoring logic. No DOM, no network — shared by picks, standings, admin.
// ---------------------------------------------------------------------------
import { GAMES, TEAMS, TIEBREAKER_GAME_ID } from './config.js?v=202608241014';

// Overlay admin-entered odds / kickoffs / venues onto the static schedule.
export function mergedGames(settings = {}) {
  const over = settings.games || {};
  return GAMES.map((g) => {
    const o = over[g.id] || {};
    return {
      ...g,
      kickoff: o.kickoff || g.kickoff,
      venue: o.venue || g.venue,
      favorite: o.favorite || '',        // 'A' | 'B' | '' (pick'em)
      line: o.line === undefined || o.line === null || o.line === '' ? null : Number(o.line),
    };
  });
}

export function spreadLabel(game) {
  if (!game.favorite || game.line === null) return 'Line TBD';
  const favKey = game.favorite === 'A' ? game.teamA : game.teamB;
  const n = Number(game.line);
  if (n === 0) return 'Pick’em';
  return `${TEAMS[favKey].abbr} -${formatLine(n)}`;
}

export function formatLine(n) {
  return Number(n).toFixed(1).replace(/\.0$/, '');
}

// What a given side is getting, e.g. "+13.5" or "-3".
export function sideLine(game, side) {
  if (!game.favorite || game.line === null) return '';
  const n = Number(game.line);
  if (n === 0) return 'PK';
  return game.favorite === side ? `-${formatLine(n)}` : `+${formatLine(n)}`;
}

export function firstKickoff(games) {
  return games.reduce((min, g) => {
    const t = new Date(g.kickoff).getTime();
    return Number.isNaN(t) ? min : Math.min(min, t);
  }, Infinity);
}

// 'open' | 'closed' — manual override on the admin page beats the clock.
export function lockState(settings, games, now = Date.now()) {
  const override = settings.lockOverride || 'auto';
  if (override === 'open') return { locked: false, reason: 'manually reopened' };
  if (override === 'closed') return { locked: true, reason: 'manually locked' };
  const kick = firstKickoff(games);
  if (!Number.isFinite(kick)) return { locked: false, reason: 'no kickoff set' };
  return { locked: now >= kick, reason: 'first kickoff', lockAt: kick };
}

// 'A' | 'B' | 'push' | null (not final yet)
export function gameResult(game, settings = {}) {
  const r = (settings.results || {})[game.id];
  if (!r || r.a === undefined || r.b === undefined || r.a === '' || r.b === '') return null;
  const a = Number(r.a);
  const b = Number(r.b);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  const line = game.line === null ? 0 : Number(game.line);
  // Margin expressed from the favorite's point of view.
  const favIsA = game.favorite !== 'B'; // default to A when no favorite set (line 0)
  const margin = favIsA ? a - b : b - a;
  if (margin > line) return favIsA ? 'A' : 'B';
  if (margin < line) return favIsA ? 'B' : 'A';
  return 'push';
}

export function tiebreakerActual(settings = {}) {
  const r = (settings.results || {})[TIEBREAKER_GAME_ID];
  if (!r || r.a === '' || r.b === '' || r.a === undefined || r.b === undefined) return null;
  const total = Number(r.a) + Number(r.b);
  return Number.isNaN(total) ? null : total;
}

// entries -> ranked rows with points, live "still possible" ceiling, tiebreaker.
export function scoreEntries(entries, games, settings = {}) {
  const pushCredits = (settings.pushRule || 'credit') === 'credit';
  const actualTotal = tiebreakerActual(settings);

  const rows = entries.map((entry) => {
    const picks = entry.picks || {};
    const weights = entry.weights || {};
    let points = 0;
    let live = 0;      // weight still in play on undecided games
    let correct = 0;
    let decided = 0;
    const detail = {};

    for (const g of games) {
      const w = Number(weights[g.id] || 0);
      const pick = picks[g.id];
      const res = gameResult(g, settings);
      if (res === null) {
        live += w;
        detail[g.id] = { pick, weight: w, status: 'pending' };
        continue;
      }
      decided += 1;
      if (res === 'push') {
        if (pushCredits) points += w;
        detail[g.id] = { pick, weight: w, status: 'push' };
      } else if (pick === res) {
        points += w;
        correct += 1;
        detail[g.id] = { pick, weight: w, status: 'hit' };
      } else {
        detail[g.id] = { pick, weight: w, status: 'miss' };
      }
    }

    const tbGuess = entry.tiebreaker === undefined || entry.tiebreaker === null || entry.tiebreaker === ''
      ? null
      : Number(entry.tiebreaker);
    const tbDiff = actualTotal === null || tbGuess === null ? null : Math.abs(tbGuess - actualTotal);

    return {
      ...entry,
      points,
      possible: points + live,
      correct,
      decided,
      tbGuess,
      tbDiff,
      detail,
    };
  });

  rows.sort((x, y) => {
    if (y.points !== x.points) return y.points - x.points;
    const xd = x.tbDiff === null ? Infinity : x.tbDiff;
    const yd = y.tbDiff === null ? Infinity : y.tbDiff;
    if (xd !== yd) return xd - yd;
    return String(x.submittedAt || '').localeCompare(String(y.submittedAt || ''));
  });

  // Draft order = rank. Ties only survive if points AND tiebreaker diff match.
  let lastKey = null;
  let lastRank = 0;
  rows.forEach((r, i) => {
    const key = `${r.points}|${r.tbDiff}`;
    if (key === lastKey) {
      r.rank = lastRank;
      r.tied = true;
    } else {
      r.rank = i + 1;
      lastRank = r.rank;
      lastKey = key;
      r.tied = false;
    }
  });
  // mark the earlier member of a surviving tie too
  rows.forEach((r, i) => {
    if (i + 1 < rows.length && rows[i + 1].rank === r.rank) r.tied = true;
  });

  return rows;
}

export function fmtKickoff(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'TBD';
  return d.toLocaleString(undefined, {
    weekday: 'short', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
  });
}

export function fmtDay(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'TBD';
  return d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
}

export function fmtTime(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'TBD';
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
}
