// ---------------------------------------------------------------------------
// Emailing a copy of a submitted board.
//
// Two paths, depending on whether EMAIL_CONFIG has been filled in:
//   configured  -> EmailJS sends it automatically to the player
//   not set up  -> we hand the player a mailto: link they can send themselves
// The receipt goes to the player and nobody else: copying a commissioner would
// expose everyone's picks before the lock. The address is still saved on the
// entry so it shows on the admin page.
// ---------------------------------------------------------------------------
import { EMAIL_CONFIG, TEAMS, LEAGUE_NAME, TIEBREAKER_GAME_ID } from './config.js?v=202609040625';
import { sideLine } from './scoring.js?v=202609040625';

export function emailConfigured() {
  const c = EMAIL_CONFIG;
  return Boolean(c.publicKey && c.serviceId && c.templateId);
}

export function validEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value).trim());
}

// Plain-text receipt, highest confidence first — the order people actually
// want to reread later.
export function picksSummary({ name, games, picks, weights, tiebreaker }) {
  const ordered = [...games].sort((a, b) => (weights[b.id] || 0) - (weights[a.id] || 0));

  const lines = ordered.map((g) => {
    const side = picks[g.id];
    const key = side === 'A' ? g.teamA : g.teamB;
    const other = side === 'A' ? g.teamB : g.teamA;
    const w = String(weights[g.id] ?? '').padStart(2, ' ');
    const spread = sideLine(g, side);
    return `  ${w}  ${TEAMS[key].name}${spread ? ` ${spread}` : ''}  (over ${TEAMS[other].name})`;
  });

  const tbGame = games.find((g) => g.id === TIEBREAKER_GAME_ID);
  const tbName = tbGame ? `${TEAMS[tbGame.teamA].name}-${TEAMS[tbGame.teamB].name}` : 'tiebreaker';

  return [
    `${LEAGUE_NAME} — draft order picks`,
    '',
    `Player: ${name}`,
    `Submitted: ${new Date().toLocaleString()}`,
    '',
    'Confidence  Pick',
    ...lines,
    '',
    `Tiebreaker (${tbName} combined score): ${tiebreaker}`,
    `Total confidence points in play: 55`,
    '',
    'Standings: https://brianchernauskas.github.io/draft-order-pickem/standings.html',
  ].join('\n');
}

// Sends via EmailJS. Throws on failure so the caller can tell the player the
// picks saved but the email did not.
export async function sendPicksEmail({ name, email, summary }) {
  if (!emailConfigured()) throw new Error('Email is not configured yet.');

  const mod = await import('https://cdn.jsdelivr.net/npm/@emailjs/browser@4/+esm');
  const emailjs = mod.default || mod;

  // v4 signature is send(serviceId, templateId, params, options). Passing the
  // public key in options rather than calling init() first keeps this free of
  // module-level state, so it cannot fail on call ordering.
  return emailjs.send(
    EMAIL_CONFIG.serviceId,
    EMAIL_CONFIG.templateId,
    {
      to_email: email,
      player_name: name,
      picks_text: summary,
      submitted_at: new Date().toLocaleString(),
      subject: `${name} — DBFFL draft order picks`,
    },
    { publicKey: EMAIL_CONFIG.publicKey },
  );
}

// Exercises the exact same template variables as a real submission, so a
// successful test means real receipts will work too.
export function sampleSummary(games) {
  const picks = {};
  const weights = {};
  games.forEach((g, i) => { picks[g.id] = i % 2 ? 'B' : 'A'; weights[g.id] = games.length - i; });
  return picksSummary({ name: 'Test Run', games, picks, weights, tiebreaker: 51 });
}

// Zero-setup fallback: opens the player's own mail app with everything filled
// in and addressed to themselves. They just hit send.
export function mailtoLink({ name, email, summary }) {
  const to = encodeURIComponent(email || '');
  const subject = encodeURIComponent(`${name} — DBFFL draft order picks`);
  const body = encodeURIComponent(summary);
  return `mailto:${to}?subject=${subject}&body=${body}`;
}
