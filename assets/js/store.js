// ---------------------------------------------------------------------------
// Storage adapter. Talks to Firestore when configured, otherwise falls back to
// localStorage so the site is fully clickable before any backend exists.
// ---------------------------------------------------------------------------
import { FIREBASE_CONFIG } from './config.js';

const SETTINGS_KEY = 'dop:settings';
const ENTRIES_KEY = 'dop:entries';

let mode = 'demo';
let db = null;
let fs = null; // firestore module namespace

export function isDemo() {
  return mode === 'demo';
}

function configured() {
  const p = FIREBASE_CONFIG && FIREBASE_CONFIG.projectId;
  return Boolean(p) && !p.startsWith('YOUR_');
}

export async function initStore() {
  if (!configured()) {
    mode = 'demo';
    return mode;
  }
  try {
    const appMod = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js');
    fs = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js');
    const app = appMod.initializeApp(FIREBASE_CONFIG);
    db = fs.getFirestore(app);
    mode = 'firestore';
  } catch (err) {
    console.error('Firebase init failed, falling back to demo mode:', err);
    mode = 'demo';
  }
  return mode;
}

export function slugify(name) {
  return String(name).trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

// --- settings --------------------------------------------------------------

export async function loadSettings() {
  if (mode === 'demo') {
    try {
      return JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {};
    } catch {
      return {};
    }
  }
  const snap = await fs.getDoc(fs.doc(db, 'config', 'settings'));
  return snap.exists() ? snap.data() : {};
}

export async function saveSettings(settings) {
  if (mode === 'demo') {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    return;
  }
  await fs.setDoc(fs.doc(db, 'config', 'settings'), settings, { merge: false });
}

// --- entries ---------------------------------------------------------------

export async function loadEntries() {
  if (mode === 'demo') {
    try {
      return JSON.parse(localStorage.getItem(ENTRIES_KEY)) || [];
    } catch {
      return [];
    }
  }
  const snap = await fs.getDocs(fs.collection(db, 'entries'));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function getEntry(id) {
  if (mode === 'demo') {
    const all = await loadEntries();
    return all.find((e) => e.id === id) || null;
  }
  const snap = await fs.getDoc(fs.doc(db, 'entries', id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function saveEntry(entry) {
  const id = entry.id || slugify(entry.name);
  const now = new Date().toISOString();
  if (mode === 'demo') {
    const all = await loadEntries();
    const existing = all.find((e) => e.id === id);
    const record = {
      ...entry,
      id,
      submittedAt: existing?.submittedAt || now,
      updatedAt: now,
    };
    const next = all.filter((e) => e.id !== id).concat(record);
    localStorage.setItem(ENTRIES_KEY, JSON.stringify(next));
    return record;
  }
  const ref = fs.doc(db, 'entries', id);
  const prior = await fs.getDoc(ref);
  const record = {
    ...entry,
    id,
    submittedAt: prior.exists() ? prior.data().submittedAt : now,
    updatedAt: now,
  };
  await fs.setDoc(ref, record, { merge: false });
  return record;
}

export async function deleteEntry(id) {
  if (mode === 'demo') {
    const all = await loadEntries();
    localStorage.setItem(ENTRIES_KEY, JSON.stringify(all.filter((e) => e.id !== id)));
    return;
  }
  await fs.deleteDoc(fs.doc(db, 'entries', id));
}

// --- live updates ----------------------------------------------------------

// Fires cb(entries) now and again on every remote change. Returns unsubscribe.
export function watchEntries(cb) {
  if (mode === 'demo') {
    loadEntries().then(cb);
    const onStorage = (e) => {
      if (e.key === ENTRIES_KEY) loadEntries().then(cb);
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }
  return fs.onSnapshot(fs.collection(db, 'entries'), (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  });
}

export function watchSettings(cb) {
  if (mode === 'demo') {
    loadSettings().then(cb);
    const onStorage = (e) => {
      if (e.key === SETTINGS_KEY) loadSettings().then(cb);
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }
  return fs.onSnapshot(fs.doc(db, 'config', 'settings'), (snap) => {
    cb(snap.exists() ? snap.data() : {});
  });
}
