// ---------------------------------------------------------------------------
// Commissioner console: lines, kickoffs, venues, finals, lock, entries.
// ---------------------------------------------------------------------------
import { TEAMS, GAMES, ADMIN_PASSPHRASE, TIEBREAKER_GAME_ID, logoUrl } from './config.js';
import { initStore, loadSettings, saveSettings, loadEntries, deleteEntry, isDemo } from './store.js';
import { mergedGames, gameResult, lockState, scoreEntries, formatLine, fmtTime } from './scoring.js';
import { el, renderHeader, demoBanner, fmtStamp } from './ui.js';

const SESSION_KEY = 'dop:admin';
const $ = (id) => document.getElementById(id);

let saved = {};    // last persisted settings
let draft = {};    // working copy
let entries = [];

// --- gate ------------------------------------------------------------------

function unlock() {
  const val = $('pass').value;
  if (val !== ADMIN_PASSPHRASE) {
    $('gateStatus').textContent = 'Nope. Try again.';
    return;
  }
  sessionStorage.setItem(SESSION_KEY, '1');
  start();
}

$('enterBtn').addEventListener('click', unlock);
$('pass').addEventListener('keydown', (e) => { if (e.key === 'Enter') unlock(); });

if (sessionStorage.getItem(SESSION_KEY) === '1') start();

// --- boot ------------------------------------------------------------------

async function start() {
  $('gate').hidden = true;
  $('app').hidden = false;
  await initStore();
  renderHeader('admin');

  const demo = demoBanner();
  if (demo) $('banners').append(demo);

  await reload();

  $('saveBtn').addEventListener('click', persist);
  $('revertBtn').addEventListener('click', async () => { await reload(); flash('Reverted to last saved settings.'); });
  $('exportBtn').addEventListener('click', exportJson);
  $('lockMode').addEventListener('change', () => { draft.lockOverride = $('lockMode').value; renderLockNote(); markDirty(); });
  $('pushRule').addEventListener('change', () => { draft.pushRule = $('pushRule').value; markDirty(); });
}

async function reload() {
  saved = await loadSettings();
  draft = structuredClone(saved);
  draft.games = draft.games || {};
  draft.results = draft.results || {};
  draft.lockOverride = draft.lockOverride || 'auto';
  draft.pushRule = draft.pushRule || 'credit';
  entries = await loadEntries();

  $('lockMode').value = draft.lockOverride;
  $('pushRule').value = draft.pushRule;
  renderLockNote();
  renderOdds();
  renderFinals();
  renderEntries();
  $('saveStatus').textContent = '';
}

function markDirty() {
  $('saveStatus').textContent = 'Unsaved changes.';
}

function flash(msg) {
  $('saveStatus').textContent = msg;
}

function renderLockNote() {
  const games = mergedGames(draft);
  const lock = lockState(draft, games);
  $('lockNote').textContent = lock.locked
    ? `Currently LOCKED (${lock.reason}).`
    : lock.lockAt
      ? `Currently open. Auto-lock at ${new Date(lock.lockAt).toLocaleString()}.`
      : 'Currently open.';
}

// --- odds ------------------------------------------------------------------

function toLocalInput(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function gameDraft(id) {
  draft.games[id] = draft.games[id] || {};
  return draft.games[id];
}

function matchupLabel(g) {
  const a = TEAMS[g.teamA];
  const b = TEAMS[g.teamB];
  return el('div', { class: 'who' },
    el('img', { src: logoUrl(g.teamA), alt: '' }),
    el('img', { src: logoUrl(g.teamB), alt: '' }),
    el('div', {}, `${a.abbr} / ${b.abbr}`,
      el('small', {}, `${a.name} vs ${b.name}${g.id === TIEBREAKER_GAME_ID ? ' · tiebreaker' : ''}`)));
}

function renderOdds() {
  const games = mergedGames(draft);
  const host = $('odds');
  host.replaceChildren();

  for (const g of games) {
    const d = gameDraft(g.id);

    const fav = el('select', { 'aria-label': 'Favorite' },
      el('option', { value: '' }, 'Pick’em / TBD'),
      el('option', { value: 'A' }, TEAMS[g.teamA].name),
      el('option', { value: 'B' }, TEAMS[g.teamB].name));
    fav.value = g.favorite || '';
    fav.addEventListener('change', () => { d.favorite = fav.value; markDirty(); renderFinals(); });

    const line = el('input', {
      type: 'number', step: '0.5', min: '0', max: '80',
      placeholder: '—', 'aria-label': 'Spread',
    });
    line.value = g.line === null ? '' : formatLine(g.line);
    line.addEventListener('input', () => {
      d.line = line.value === '' ? null : Number(line.value);
      markDirty(); renderFinals();
    });

    const kick = el('input', { type: 'datetime-local', 'aria-label': 'Kickoff' });
    kick.value = toLocalInput(g.kickoff);
    kick.addEventListener('change', () => {
      const parsed = new Date(kick.value);
      d.kickoff = Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
      markDirty(); renderLockNote();
    });

    const venue = el('input', { type: 'text', placeholder: 'Stadium — City, ST', 'aria-label': 'Venue' });
    venue.value = g.venue || '';
    venue.addEventListener('input', () => { d.venue = venue.value; markDirty(); });

    host.append(el('div', { class: 'admin-game' },
      matchupLabel(g),
      el('div', { class: 'field' }, el('label', {}, 'Favorite / line'),
        el('div', { class: 'favrow' }, fav, line)),
      el('div', { class: 'field' }, el('label', {}, 'Kickoff'), kick),
      el('div', { class: 'field' }, el('label', {}, 'Venue'), venue)));
  }
}

// --- finals ----------------------------------------------------------------

function renderFinals() {
  const games = mergedGames(draft);
  const host = $('finals');
  host.replaceChildren();

  for (const g of games) {
    draft.results[g.id] = draft.results[g.id] || {};
    const r = draft.results[g.id];

    const mk = (which) => {
      const input = el('input', {
        type: 'number', min: '0', max: '150', step: '1', placeholder: '—',
        'aria-label': `${TEAMS[which === 'a' ? g.teamA : g.teamB].name} final score`,
      });
      input.value = r[which] ?? '';
      input.addEventListener('input', () => {
        r[which] = input.value === '' ? '' : Number(input.value);
        markDirty();
        updateVerdict(g.id);
      });
      return input;
    };

    host.append(el('div', { class: 'admin-game', id: `fin-${g.id}` },
      matchupLabel(g),
      el('div', { class: 'field' }, el('label', {}, `${TEAMS[g.teamA].abbr} / ${TEAMS[g.teamB].abbr} final`),
        el('div', { class: 'scoreboxes' }, mk('a'), el('span', {}, '–'), mk('b'))),
      el('div', { class: 'field' }, el('label', {}, 'Kickoff'),
        el('div', { style: 'padding:9px 0;font-size:13px;color:var(--ink-dim)' }, fmtTime(g.kickoff))),
      el('div', { class: 'field' }, el('label', {}, 'ATS result'),
        el('div', { class: 'covered pending', id: `verdict-${g.id}`, style: 'padding:9px 0' }, '—'))));

    updateVerdict(g.id);
  }
}

function updateVerdict(gid) {
  const node = document.getElementById(`verdict-${gid}`);
  if (!node) return;
  const g = mergedGames(draft).find((x) => x.id === gid);
  const res = gameResult(g, draft);
  node.className = 'covered ' + (res === null ? 'pending' : res === 'push' ? 'push' : 'result');
  if (res === null) node.textContent = 'awaiting final';
  else if (res === 'push') node.textContent = 'push';
  else node.textContent = `${TEAMS[res === 'A' ? g.teamA : g.teamB].name} covers`;

  if (gid === TIEBREAKER_GAME_ID) {
    const r = draft.results[gid] || {};
    if (r.a !== '' && r.b !== '' && r.a !== undefined && r.b !== undefined) {
      node.textContent += ` · total ${Number(r.a) + Number(r.b)}`;
    }
  }
}

// --- entries ---------------------------------------------------------------

function renderEntries() {
  const host = $('entries');
  if (!entries.length) {
    host.replaceChildren(el('p', {}, 'No entries submitted yet.'));
    return;
  }

  const games = mergedGames(draft);
  const rows = scoreEntries(entries, games, draft);

  const table = el('table', { class: 'board' },
    el('thead', {}, el('tr', {},
      el('th', {}, '#'), el('th', {}, 'Player'), el('th', {}, 'Score'),
      el('th', {}, 'WIS/ND'), el('th', { class: 'hide-sm' }, 'Submitted'),
      el('th', { class: 'hide-sm' }, 'Last edit'), el('th', {}, ''))));

  const tbody = el('tbody');
  for (const r of rows) {
    tbody.append(el('tr', {},
      el('td', { class: 'rank' }, String(r.rank)),
      el('td', { class: 'who' }, r.name),
      el('td', { class: 'pts' }, String(r.points)),
      el('td', { class: 'num' }, r.tbGuess === null ? '—' : String(r.tbGuess)),
      el('td', { class: 'ts hide-sm' }, fmtStamp(r.submittedAt)),
      el('td', { class: 'ts hide-sm' }, fmtStamp(r.updatedAt)),
      el('td', {}, el('button', {
        class: 'btn danger sm', type: 'button',
        onclick: async () => {
          if (!confirm(`Delete the entry for ${r.name}? This cannot be undone.`)) return;
          await deleteEntry(r.id);
          entries = await loadEntries();
          renderEntries();
          flash(`Deleted ${r.name}.`);
        },
      }, 'Delete'))));
  }
  table.append(tbody);
  host.replaceChildren(el('div', { class: 'table-wrap' }, table));
}

// --- persist / export ------------------------------------------------------

async function persist() {
  $('saveBtn').disabled = true;
  flash('Saving…');
  try {
    // strip empty score placeholders so they do not count as finals
    const clean = structuredClone(draft);
    for (const [gid, r] of Object.entries(clean.results || {})) {
      if (r.a === '' || r.a === undefined) delete r.a;
      if (r.b === '' || r.b === undefined) delete r.b;
      if (!Object.keys(r).length) delete clean.results[gid];
    }
    await saveSettings(clean);
    saved = clean;
    entries = await loadEntries();
    renderEntries();
    renderLockNote();
    flash('Saved.');
  } catch (err) {
    console.error(err);
    flash(`Save failed: ${err.message || err}`);
  } finally {
    $('saveBtn').disabled = false;
  }
}

function exportJson() {
  const payload = {
    exportedAt: new Date().toISOString(),
    mode: isDemo() ? 'demo/localStorage' : 'firestore',
    settings: draft,
    schedule: GAMES,
    entries,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = el('a', { href: url, download: `draft-order-pickem-${new Date().toISOString().slice(0, 10)}.json` });
  document.body.append(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
