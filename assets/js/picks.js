// ---------------------------------------------------------------------------
// Pick submission page.
// ---------------------------------------------------------------------------
import { TEAMS, GAMES, TIEBREAKER_GAME_ID, PICKS_PASSWORD } from './config.js';
import { initStore, loadSettings, getEntry, saveEntry, slugify, isDemo } from './store.js';
import { mergedGames, spreadLabel, sideLine, lockState, fmtDay, fmtTime } from './scoring.js';
import { el, teamLogo, renderHeader, renderHonors, demoBanner, countdown } from './ui.js';

const NAME_KEY = 'dop:lastName';
const UNLOCK_KEY = 'dop:leagueUnlocked';

const state = {
  picks: {},
  weights: {},
  tiebreaker: '',
  games: [],
  settings: {},
  locked: false,
  loadedId: null,
};

const $ = (id) => document.getElementById(id);

// --- league password gate --------------------------------------------------
// Obscurity only. The password lives in public source; this just stops a
// forwarded link from being self-serve.

function unlocked() {
  return localStorage.getItem(UNLOCK_KEY) === PICKS_PASSWORD;
}

function showGate() {
  $('gate').hidden = false;
  const input = $('leaguePass');
  const tryUnlock = () => {
    if (input.value.trim() !== PICKS_PASSWORD) {
      $('gateStatus').textContent = 'That is not it. Ask in the group chat.';
      input.select();
      return;
    }
    localStorage.setItem(UNLOCK_KEY, PICKS_PASSWORD);
    $('gate').hidden = true;
    openBoard();
  };
  $('gateBtn').addEventListener('click', tryUnlock);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') tryUnlock(); });
  input.focus();
}

async function boot() {
  await initStore();
  renderHeader('picks');
  if (unlocked()) openBoard();
  else showGate();
}

async function openBoard() {
  $('app').hidden = false;
  renderHonors($('honors'));

  const banners = $('banners');
  const demo = demoBanner();
  if (demo) banners.append(demo);

  state.settings = await loadSettings();
  state.games = mergedGames(state.settings);

  const lock = lockState(state.settings, state.games);
  state.locked = lock.locked;

  renderLockStrip(lock);
  renderGames();
  renderTracker();

  const saved = localStorage.getItem(NAME_KEY);
  if (saved) $('playerName').value = saved;

  $('playerName').addEventListener('input', validate);
  $('loadBtn').addEventListener('click', loadMine);
  $('submitBtn').addEventListener('click', submit);

  if (state.locked) {
    banners.append(el('div', { class: 'banner error' },
      el('span', {}, '🔒'),
      el('span', {}, el('b', {}, 'Picks are locked. '),
        'The board closed at first kickoff. Head to ',
        el('a', { href: 'standings.html' }, 'the standings'), ' to watch it play out.')));
  }

  validate();
}

function renderLockStrip(lock) {
  const strip = el('div', { class: `lockstrip${lock.locked ? ' locked' : ''}` });
  const label = el('div', {},
    el('div', { class: 'label' }, lock.locked ? 'Board status' : 'Picks lock in'),
    el('div', { class: 'clock', id: 'clock' }, lock.locked ? 'LOCKED' : '—'));
  strip.append(label, el('div', { class: 'spacer' }));

  if (!lock.locked && lock.lockAt) {
    strip.append(el('div', { style: 'text-align:right' },
      el('div', { class: 'label' }, 'First kickoff'),
      el('div', { class: 'sub' }, new Date(lock.lockAt).toLocaleString(undefined, {
        weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
      }))));
  }

  $('lockstrip').replaceChildren(strip);

  if (!lock.locked && lock.lockAt) {
    countdown(lock.lockAt, (text) => {
      const c = $('clock');
      if (!c) return;
      if (text === null) { c.textContent = 'LOCKED'; strip.classList.add('locked'); state.locked = true; validate(); }
      else c.textContent = text;
    });
  }
}

function renderGames() {
  const host = $('games');
  host.replaceChildren();

  let lastDay = null;
  for (const g of state.games) {
    const day = fmtDay(g.kickoff);
    if (day !== lastDay) {
      host.append(el('div', { class: 'dayhead' }, el('h2', {}, day)));
      lastDay = day;
    }
    host.append(gameCard(g));
  }
}

function gameCard(g) {
  const a = TEAMS[g.teamA];
  const b = TEAMS[g.teamB];
  const isTB = g.id === TIEBREAKER_GAME_ID;

  const card = el('div', {
    class: 'game',
    id: `card-${g.id}`,
    style: `--ca:${a.primary};--cb:${b.primary}`,
  });

  const spread = spreadLabel(g);
  card.append(el('div', { class: 'game-top' },
    el('span', { class: 'time' }, fmtTime(g.kickoff)),
    el('span', { class: `venue${g.neutral ? ' neutral' : ''}` }, g.venue),
    isTB ? el('span', { class: 'tb-flag' }, 'Tiebreaker game') : null,
    el('span', { class: `spread${spread === 'Line TBD' ? ' tbd' : ''}` }, spread)));

  card.append(el('div', { class: 'matchup' },
    teamButton(g, 'A'),
    el('div', { class: 'vs' }, 'vs'),
    teamButton(g, 'B')));

  // confidence row
  const sel = el('select', { id: `w-${g.id}`, 'aria-label': `Confidence weight for ${a.name} vs ${b.name}` },
    el('option', { value: '' }, '—'),
    Array.from({ length: 10 }, (_, i) => el('option', { value: String(i + 1) }, String(i + 1))));
  sel.disabled = state.locked;
  sel.addEventListener('change', () => {
    const v = sel.value;
    if (v === '') delete state.weights[g.id];
    else state.weights[g.id] = Number(v);
    renderTracker();
    validate();
  });

  const conf = el('div', { class: 'conf' },
    el('label', { for: `w-${g.id}` }, 'Confidence'),
    sel,
    el('span', { class: 'hint' }, '10 = most sure'));

  if (isTB) {
    const tb = el('input', {
      id: 'tiebreaker', type: 'number', min: '0', max: '150', step: '1',
      inputmode: 'numeric', placeholder: '52', 'aria-label': 'Combined total points',
    });
    tb.disabled = state.locked;
    tb.addEventListener('input', () => { state.tiebreaker = tb.value; validate(); });
    conf.append(el('div', { class: 'tbtotal' },
      el('label', { for: 'tiebreaker' }, 'Total points, both teams'),
      tb));
  }

  card.append(conf);
  return card;
}

function teamButton(g, side) {
  const key = side === 'A' ? g.teamA : g.teamB;
  const t = TEAMS[key];
  const line = sideLine(g, side);
  const isFav = g.favorite === side;

  const btn = el('button', {
    type: 'button',
    class: `team${side === 'B' ? ' right' : ''}`,
    style: `--tc:${t.primary}`,
    'data-game': g.id,
    'data-side': side,
    'aria-pressed': String(state.picks[g.id] === side),
  },
    teamLogo(key),
    el('div', { class: 'tmeta' },
      el('div', { class: 'tname' }, t.name),
      el('div', { class: 'tmascot' }, t.mascot),
      line ? el('div', { class: `tline${isFav ? '' : ' dog'}` }, line) : null));

  btn.disabled = state.locked;
  btn.addEventListener('click', () => {
    state.picks[g.id] = side;
    syncCard(g.id);
    validate();
  });
  return btn;
}

function syncCard(gid) {
  const card = document.getElementById(`card-${gid}`);
  if (!card) return;
  card.querySelectorAll('.team').forEach((b) => {
    const on = b.dataset.side === state.picks[gid];
    b.classList.toggle('picked', on);
    b.setAttribute('aria-pressed', String(on));
  });
  card.classList.toggle('answered', Boolean(state.picks[gid]) && Boolean(state.weights[gid]));
}

function weightCounts() {
  const counts = {};
  for (const v of Object.values(state.weights)) counts[v] = (counts[v] || 0) + 1;
  return counts;
}

function renderTracker() {
  const counts = weightCounts();
  const chips = Array.from({ length: 10 }, (_, i) => {
    const n = i + 1;
    const c = counts[n] || 0;
    return el('div', { class: `chip${c > 1 ? ' dupe' : c === 1 ? ' used' : ''}` }, String(n));
  });

  const used = Object.keys(state.weights).length;
  $('tracker').replaceChildren(el('div', { class: 'tracker' },
    el('div', { class: 'row' },
      el('span', { class: 'label' }, 'Weights used'),
      el('div', { class: 'chips' }, chips),
      el('span', { class: 'hint', style: 'font-size:12px;color:var(--ink-faint);margin-left:auto' },
        `${used} of 10 assigned`))));

  // flag duplicate selects
  for (const g of state.games) {
    const sel = document.getElementById(`w-${g.id}`);
    if (!sel) continue;
    const v = state.weights[g.id];
    sel.classList.toggle('dupe', Boolean(v) && counts[v] > 1);
    syncCard(g.id);
  }
}

function problems() {
  const out = [];
  const name = $('playerName').value.trim();
  if (!name) out.push('enter your name');

  const missingPicks = state.games.filter((g) => !state.picks[g.id]).length;
  if (missingPicks) out.push(`pick ${missingPicks} more game${missingPicks > 1 ? 's' : ''}`);

  const counts = weightCounts();
  const assigned = Object.keys(state.weights).length;
  const dupes = Object.entries(counts).filter(([, c]) => c > 1).map(([n]) => n);
  if (dupes.length) out.push(`weight${dupes.length > 1 ? 's' : ''} ${dupes.join(', ')} used more than once`);
  else if (assigned < 10) out.push(`assign ${10 - assigned} more weight${10 - assigned > 1 ? 's' : ''}`);

  const tb = String(state.tiebreaker).trim();
  if (tb === '' || Number.isNaN(Number(tb))) out.push('enter the Wisconsin–Notre Dame total');
  else if (Number(tb) < 0) out.push('total points cannot be negative');

  return out;
}

function validate() {
  const btn = $('submitBtn');
  const status = $('status');
  if (state.locked) {
    btn.disabled = true;
    status.textContent = 'Picks are locked.';
    return;
  }
  const errs = problems();
  btn.disabled = errs.length > 0;
  status.textContent = errs.length
    ? `Still to do: ${errs.join(' · ')}`
    : 'Board complete — you are good to submit.';
}

async function loadMine() {
  const name = $('playerName').value.trim();
  const status = $('status');
  if (!name) { status.textContent = 'Type your name first, then load.'; return; }
  status.textContent = 'Looking for your card…';
  const entry = await getEntry(slugify(name));
  if (!entry) { status.textContent = `No saved picks found for “${name}”.`; return; }

  state.picks = { ...(entry.picks || {}) };
  state.weights = { ...(entry.weights || {}) };
  state.tiebreaker = entry.tiebreaker ?? '';
  state.loadedId = entry.id;

  for (const g of state.games) {
    const sel = document.getElementById(`w-${g.id}`);
    if (sel) sel.value = state.weights[g.id] ? String(state.weights[g.id]) : '';
  }
  const tb = document.getElementById('tiebreaker');
  if (tb) tb.value = state.tiebreaker;

  renderTracker();
  validate();
  status.textContent = `Loaded your card from ${new Date(entry.updatedAt || entry.submittedAt).toLocaleString()}. Edit and resubmit.`;
}

async function submit() {
  const btn = $('submitBtn');
  const status = $('status');
  const name = $('playerName').value.trim();
  if (problems().length) { validate(); return; }

  btn.disabled = true;
  status.textContent = 'Submitting…';
  try {
    const record = await saveEntry({
      name,
      picks: { ...state.picks },
      weights: { ...state.weights },
      tiebreaker: Number(state.tiebreaker),
    });
    localStorage.setItem(NAME_KEY, name);
    $('banners').prepend(el('div', { class: 'banner good' },
      el('span', {}, '✅'),
      el('span', {}, el('b', {}, 'Picks are in. '),
        `Recorded for ${record.name}. You can edit until first kickoff — just reload this page and hit “Load my picks to edit.” `,
        el('a', { href: 'standings.html' }, 'See the standings →'))));
    window.scrollTo({ top: 0, behavior: 'smooth' });
    status.textContent = 'Submitted.';
  } catch (err) {
    console.error(err);
    status.textContent = 'Submit failed — see the console. Your picks are still on screen.';
    $('banners').prepend(el('div', { class: 'banner error' },
      el('span', {}, '⚠️'),
      el('span', {}, el('b', {}, 'Could not save. '), String(err.message || err))));
  } finally {
    validate();
  }
}

boot();
