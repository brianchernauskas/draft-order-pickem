// ---------------------------------------------------------------------------
// Small shared view helpers.
// ---------------------------------------------------------------------------
import { TEAMS, logoUrl, LEAGUE_NAME, LEAGUE_SHORT, SEASON_LABEL, HONORS } from './config.js?v=202608240842';
import { isDemo } from './store.js?v=202608240842';

export function el(tag, attrs = {}, ...kids) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'style') node.setAttribute('style', v);
    else if (k.startsWith('on')) node.addEventListener(k.slice(2).toLowerCase(), v);
    else node.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) {
    if (kid === null || kid === undefined || kid === false) continue;
    node.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
  return node;
}

// Logo with a colored-initials fallback if ESPN's CDN is unreachable.
export function teamLogo(key, size = 54) {
  const t = TEAMS[key];
  const box = el('div', { class: 'logo', style: `--tc:${t.primary};width:${size}px;height:${size}px` });
  const img = el('img', { src: logoUrl(key), alt: `${t.name} logo` });
  img.addEventListener('error', () => {
    box.replaceChildren(el('div', { class: 'fallback' }, t.abbr));
  }, { once: true });
  box.append(img);
  return box;
}

export function renderHeader(active) {
  const header = el('header', { class: 'site-header' },
    el('div', { class: 'wrap' },
      el('a', { class: 'brand', href: 'index.html' },
        el('b', { class: 'full' }, LEAGUE_NAME),
        el('b', { class: 'short' }, LEAGUE_SHORT),
        el('span', {}, SEASON_LABEL)),
      el('nav', { class: 'main' },
        el('a', { href: 'index.html', class: active === 'picks' ? 'active' : null }, 'Picks'),
        el('a', { href: 'standings.html', class: active === 'standings' ? 'active' : null }, 'Standings'),
        el('a', { href: 'admin.html', class: active === 'admin' ? 'active' : null }, 'Admin'))));
  document.body.prepend(header);
}

// Honor roll: reigning champs and whoever wears the dress.
export function renderHonors(host) {
  if (!host || !HONORS.length) return;
  host.replaceChildren(el('div', { class: 'honors' },
    HONORS.map((h) => el('div', { class: `honor ${h.tone}` },
      el('span', { class: 'ico', 'aria-hidden': 'true' }, h.icon),
      el('div', { class: 'htext' },
        el('div', { class: 'hlabel' }, h.label),
        el('div', { class: 'hnames' }, h.names))))));
}

export function demoBanner() {
  if (!isDemo()) return null;
  return el('div', { class: 'banner warn' },
    el('span', {}, '⚠️'),
    el('span', {}, el('b', {}, 'Demo mode. '),
      'No Firebase config detected, so everything is saved to this browser only — other people will not see it. ',
      'Add your Firebase keys to ', el('code', {}, 'assets/js/config.js'), ' to go live. See the README for the 5-minute setup.'));
}

export function countdown(targetMs, onTick) {
  const tick = () => {
    const diff = targetMs - Date.now();
    if (diff <= 0) { onTick(null); return; }
    const d = Math.floor(diff / 86400000);
    const h = Math.floor(diff / 3600000) % 24;
    const m = Math.floor(diff / 60000) % 60;
    const s = Math.floor(diff / 1000) % 60;
    onTick(d > 0 ? `${d}d ${h}h ${m}m` : `${h}h ${m}m ${String(s).padStart(2, '0')}s`);
  };
  tick();
  const id = setInterval(tick, 1000);
  return () => clearInterval(id);
}

export function fmtStamp(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}
