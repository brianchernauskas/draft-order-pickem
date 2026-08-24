// ---------------------------------------------------------------------------
// Live standings / draft order.
// ---------------------------------------------------------------------------
import { TEAMS, TIEBREAKER_GAME_ID, MAX_SCORE, logoUrl } from './config.js?v=202608240842';
import { initStore, watchEntries, watchSettings } from './store.js?v=202608240842';
import {
  mergedGames, spreadLabel, sideLine, gameResult, scoreEntries,
  tiebreakerActual, lockState, fmtTime, fmtDay,
} from './scoring.js?v=202608240842';
import { el, teamLogo, renderHeader, renderHonors, demoBanner, fmtStamp } from './ui.js?v=202608240842';

const state = { entries: [], settings: {}, expanded: new Set() };
const $ = (id) => document.getElementById(id);

async function boot() {
  await initStore();
  renderHeader('standings');
  renderHonors($('honors'));
  const demo = demoBanner();
  if (demo) $('banners').append(demo);

  watchSettings((s) => { state.settings = s || {}; render(); });
  watchEntries((e) => { state.entries = e || []; render(); });
}

function render() {
  const games = mergedGames(state.settings);
  const rows = scoreEntries(state.entries, games, state.settings);
  const decided = games.filter((g) => gameResult(g, state.settings) !== null).length;
  const lock = lockState(state.settings, games);

  renderSummary(games, rows, decided, lock);
  renderPodium(rows, decided);
  renderBoard(rows, games, decided);
  renderResults(games);
}

function renderSummary(games, rows, decided, lock) {
  const actual = tiebreakerActual(state.settings);
  const strip = el('div', { class: `lockstrip${lock.locked ? ' locked' : ''}` },
    el('div', { class: 'stat' },
      el('div', { class: 'label' }, 'Entries'),
      el('div', { class: 'clock' }, String(rows.length))),
    el('div', { class: 'stat' },
      el('div', { class: 'label' }, 'Games final'),
      el('div', { class: 'clock' }, `${decided}/${games.length}`)),
    el('div', { class: 'stat' },
      el('div', { class: 'label' }, 'Max score'),
      el('div', { class: 'clock' }, String(MAX_SCORE))),
    el('div', { class: 'spacer' }),
    el('div', { class: 'stat tbsum' },
      el('div', { class: 'label' }, 'Tiebreaker — Wisconsin / Notre Dame total'),
      el('div', { class: 'sub' }, actual === null
        ? 'Not final yet'
        : `Actual combined score: ${actual}`)),
  );
  $('summary').replaceChildren(strip);
}

function renderPodium(rows, decided) {
  const host = $('podium');
  if (rows.length < 3 || decided === 0) { host.replaceChildren(); return; }
  const labels = ['1st pick', '2nd pick', '3rd pick'];
  host.replaceChildren(el('div', { class: 'podium' },
    rows.slice(0, 3).map((r, i) => el('div', { class: `pod p${i + 1}` },
      el('div', { class: 'pick' }, labels[i]),
      el('div', { class: 'who' }, r.name),
      el('div', { class: 'pts' }, `${r.points} pts · ${r.correct}-${r.decided - r.correct} ATS`)))));
}

function renderBoard(rows, games, decided) {
  const host = $('board');
  if (!rows.length) {
    host.replaceChildren(el('div', { class: 'empty' },
      el('h3', {}, 'No entries yet'),
      el('p', {}, 'Once people submit their boards they will show up here. ',
        el('a', { href: 'index.html' }, 'Make your picks →'))));
    return;
  }

  const anyPending = decided < games.length;
  const table = el('table', { class: 'board' },
    el('thead', {}, el('tr', {},
      el('th', {}, '#'),
      el('th', {}, 'Player'),
      el('th', {}, 'Score'),
      el('th', {}, 'ATS'),
      anyPending ? el('th', { class: 'hide-sm' }, 'Max left') : null,
      el('th', { class: 'hide-sm' }, 'WIS/ND total'),
      el('th', { class: 'hide-sm' }, 'Submitted'))));

  const tbody = el('tbody');
  for (const r of rows) {
    const open = state.expanded.has(r.id);
    const tr = el('tr', { class: `expandable r${r.rank}` },
      el('td', { class: 'rank' }, String(r.rank)),
      el('td', { class: 'who' },
        el('span', {}, r.name),
        r.tied ? el('span', { class: 'tiedflag' }, 'tied') : null,
        // same facts as the hide-sm columns, folded under the name on phones
        el('span', { class: 'submeta' },
          r.tbGuess === null ? 'no tiebreaker' : `WIS/ND ${r.tbGuess}`,
          r.tbDiff === null ? '' : r.tbDiff === 0 ? ' · exact' : ` · off by ${r.tbDiff}`,
          anyPending ? ` · ${r.possible} max` : '')),
      el('td', { class: 'pts' }, String(r.points)),
      el('td', { class: 'num' }, r.decided ? `${r.correct}–${r.decided - r.correct}` : '—'),
      anyPending ? el('td', { class: 'num hide-sm' }, String(r.possible)) : null,
      el('td', { class: 'num hide-sm' }, r.tbGuess === null ? '—'
        : r.tbDiff === null ? String(r.tbGuess)
        : r.tbDiff === 0 ? `${r.tbGuess} (exact)`
        : `${r.tbGuess} (off by ${r.tbDiff})`),
      el('td', { class: 'ts hide-sm' }, fmtStamp(r.updatedAt || r.submittedAt)));
    tr.addEventListener('click', () => {
      if (state.expanded.has(r.id)) state.expanded.delete(r.id);
      else state.expanded.add(r.id);
      render();
    });
    tbody.append(tr);

    if (open) {
      const cols = anyPending ? 7 : 6;
      tbody.append(el('tr', { class: 'detail-row' },
        el('td', { colspan: String(cols) }, detailGrid(r, games))));
    }
  }
  table.append(tbody);
  host.replaceChildren(el('div', { class: 'table-wrap' }, table));
}

function detailGrid(row, games) {
  const ordered = [...games].sort((a, b) =>
    (row.weights?.[b.id] || 0) - (row.weights?.[a.id] || 0));

  return el('div', { class: 'detail' },
    ordered.map((g) => {
      const d = row.detail[g.id] || {};
      const key = d.pick === 'A' ? g.teamA : d.pick === 'B' ? g.teamB : null;
      const status = d.status || 'pending';
      const img = key ? el('img', { src: logoUrl(key), alt: '' }) : null;
      return el('div', { class: `dpick ${status}` },
        el('span', { class: 'w' }, String(d.weight ?? '–')),
        img,
        el('span', { class: 'team-nm' }, key ? TEAMS[key].name : 'no pick'),
        el('span', { style: 'margin-left:auto;font-size:11px;color:var(--ink-faint)' },
          status === 'hit' ? 'covered' : status === 'miss' ? 'lost' : status === 'push' ? 'push' : sideLine(g, d.pick) || ''));
    }));
}

function renderResults(games) {
  const host = $('results');
  host.replaceChildren();
  let lastDay = null;

  for (const g of games) {
    const day = fmtDay(g.kickoff);
    if (day !== lastDay) {
      host.append(el('div', { class: 'dayhead' }, el('h2', {}, day)));
      lastDay = day;
    }

    const a = TEAMS[g.teamA];
    const b = TEAMS[g.teamB];
    const res = gameResult(g, state.settings);
    const scores = (state.settings.results || {})[g.id] || {};
    const hasScore = res !== null;

    const card = el('div', { class: 'game', style: `--ca:${a.primary};--cb:${b.primary}` });
    card.append(el('div', { class: 'game-top' },
      el('span', { class: 'time' }, fmtTime(g.kickoff)),
      el('span', { class: `venue${g.neutral ? ' neutral' : ''}` }, g.venue),
      g.id === TIEBREAKER_GAME_ID ? el('span', { class: 'tb-flag' }, 'Tiebreaker game') : null,
      el('span', { class: `spread${spreadLabel(g) === 'Line TBD' ? ' tbd' : ''}` }, spreadLabel(g))));

    card.append(el('div', { class: 'matchup' },
      resultSide(g, 'A', res, scores),
      el('div', { class: 'vs' }, hasScore ? 'final' : g.neutral ? 'vs' : 'at'),
      resultSide(g, 'B', res, scores)));

    host.append(card);
  }
}

function resultSide(g, side, res, scores) {
  const key = side === 'A' ? g.teamA : g.teamB;
  const t = TEAMS[key];
  const score = side === 'A' ? scores.a : scores.b;
  const line = sideLine(g, side);
  const verdict = res === null ? null
    : res === 'push' ? el('span', { class: 'verdict push' }, 'push')
    : res === side ? el('span', { class: 'verdict cover' }, 'covered')
    : el('span', { class: 'verdict nocover' }, 'no cover');

  return el('div', {
    class: `team${side === 'B' ? ' right' : ''}${res === side ? ' picked' : ''}`,
    style: `--tc:${t.primary}`,
  },
    teamLogo(key, 46),
    el('div', { class: 'tmeta' },
      el('div', { class: 'tname' }, t.name),
      line ? el('div', { class: `tline${g.favorite === side ? '' : ' dog'}` }, line) : null),
    score !== undefined && score !== '' ? el('span', { class: 'finalscore', style: 'margin-left:auto' }, String(score)) : null,
    verdict);
}

boot();
