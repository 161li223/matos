// Communication avec les données. Deux modes, détectés automatiquement :
//
//  • "local"  : l'appli est servie par le serveur Matos du PC (ou en Wi-Fi).
//               Les modifications partent directement au PC.
//  • "remote" : l'appli est installée sur un téléphone (PWA hébergée en ligne).
//               Elle lit l'état publié par le PC dans le Google Sheet, et envoie
//               ses modifications dans la « File d'attente » du Sheet. En attendant
//               que le PC les valide, elles sont appliquées localement (et gardées
//               même hors connexion).
import { uid, applyOps, emptyDb, describe } from './core/model.js';

let db = null;
let mode = 'local';
const listeners = new Set();

export const getDb = () => db;
export const getMode = () => mode;
export const onChange = (fn) => listeners.add(fn);
const emit = () => listeners.forEach((fn) => fn(db));

// --- petit stockage local sûr ------------------------------------------------
function lsGet(k, d = null) {
  try {
    const v = localStorage.getItem(k);
    return v == null ? d : JSON.parse(v);
  } catch {
    return d;
  }
}
function lsSet(k, v) {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {}
}

// Nom de la personne qui utilise cet appareil (pour l'historique)
export function me() {
  try {
    return localStorage.getItem('matos.user') || '';
  } catch {
    return '';
  }
}
export function setMe(name) {
  try {
    localStorage.setItem('matos.user', name);
  } catch {}
}

async function json(res) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) throw new Error(data.error || `Erreur ${res.status}`);
  return data;
}
const post = (url, body) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(json);

function makeOps(list) {
  const at = new Date().toISOString();
  const by = me();
  return list.map(([type, payload]) => ({ id: uid('op_'), type, at, by, payload }));
}

// =============================================================================
// Détection du mode
// =============================================================================
export async function init() {
  try {
    const r = await fetch('/api/rev', { cache: 'no-store', signal: AbortSignal.timeout(2500) });
    if (r.ok && (r.headers.get('content-type') || '').includes('json')) {
      mode = 'local';
      return mode;
    }
  } catch {}
  mode = 'remote';
  return mode;
}

// =============================================================================
// Mode local (PC)
// =============================================================================
let sheetSummary = null;
export const getSheetSummary = () => sheetSummary;

async function localLoad() {
  db = await json(await fetch('/api/db', { cache: 'no-store' }));
  emit();
  return db;
}

// =============================================================================
// Mode distant (téléphone via Google Sheet)
// =============================================================================
const K = { cfg: 'matos.remote', state: 'matos.state', pending: 'matos.pending', info: 'matos.syncinfo' };
let base = null; // dernier état publié par le PC
let pending = lsGet(K.pending, []); // [{ op, label, sent }]
const info = lsGet(K.info, { lastOk: null, lastError: null, stateAt: null });
let refreshing = null;

export const getRemote = () => lsGet(K.cfg, null);
export function setRemote(cfg) {
  lsSet(K.cfg, cfg);
}
export const getSyncInfo = () => ({ ...info, pending: pending.length, unsent: pending.filter((p) => !p.sent).length });

async function call(action, data = {}, cfg = getRemote()) {
  if (!cfg?.url) throw new Error('Appli non connectée au Google Sheet');
  // corps en texte brut = requête "simple" : pas de blocage CORS avec Google
  let res;
  try {
    res = await fetch(cfg.url, { method: 'POST', body: JSON.stringify({ key: cfg.key, action, ...data }), signal: AbortSignal.timeout(30000) });
  } catch {
    throw new Error(navigator.onLine === false ? 'Hors connexion' : 'Relais Google injoignable');
  }
  const out = await res.json().catch(() => {
    throw new Error('Réponse illisible du relais Google (adresse incorrecte ?)');
  });
  if (!out.ok) throw new Error(out.error || 'Erreur du relais Google');
  return out;
}

/** Vérifie une adresse + clé avant de les enregistrer. */
export const testRemote = (cfg) => call('ping', {}, cfg);

function savePending() {
  lsSet(K.pending, pending);
  lsSet(K.info, info);
}

/** État affiché = état du PC + modifications pas encore validées. */
function recompute() {
  let d = base ? structuredClone(base) : emptyDb();
  for (const p of pending) {
    try {
      d = applyOps(d, [p.op]).db;
      p.localError = null;
    } catch (e) {
      p.localError = e.message;
    }
  }
  db = d;
  emit();
}

async function flush() {
  const unsent = pending.filter((p) => !p.sent);
  if (!unsent.length) return;
  await call('enqueue', { ops: unsent.map((p) => ({ ...p.op, label: p.label })) });
  unsent.forEach((p) => (p.sent = true));
  savePending();
}

export const rejectedListeners = new Set();

async function remoteRefresh() {
  if (refreshing) return refreshing;
  refreshing = (async () => {
    try {
      await flush();
      const res = await call('state', { ids: pending.map((p) => p.op.id) });
      if (res.state) {
        base = res.state;
        lsSet(K.state, base);
        info.stateAt = base.log.at(-1)?.at || null;
      }
      const applied = new Set((base?.log || []).map((e) => e.id));
      const rejected = [];
      pending = pending.filter((p) => {
        const st = res.statuses?.[p.op.id];
        if (applied.has(p.op.id) || st?.status === 'appliquée') return false; // validée par le PC
        if (st?.status === 'refusée') {
          rejected.push({ label: p.label, error: st.error });
          return false;
        }
        return true;
      });
      info.lastOk = new Date().toISOString();
      info.lastError = null;
      savePending();
      recompute();
      rejected.forEach((r) => rejectedListeners.forEach((fn) => fn(r)));
    } catch (e) {
      info.lastError = navigator.onLine === false ? 'Hors connexion' : e.message;
      savePending();
      emit();
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

// =============================================================================
// API commune aux deux modes
// =============================================================================
export async function load() {
  if (mode === 'local') return localLoad();
  base = lsGet(K.state, null);
  recompute(); // affichage immédiat, même hors connexion
  await remoteRefresh();
  return db;
}

/** Envoie plusieurs opérations d'un coup (tout ou rien). ops = [[type, payload], …] */
export async function sendBatch(list) {
  const ops = makeOps(list);
  if (mode === 'local') {
    const res = await post('/api/ops', ops);
    db = res.db;
    emit();
    return res;
  }
  // distant : on vérifie d'abord avec les règles de l'appli (erreur affichée tout de suite)
  const next = applyOps(db, ops).db;
  for (const op of ops) pending.push({ op, label: describe(next, op), sent: false });
  savePending();
  recompute();
  flush()
    .then(() => emit())
    .catch((e) => {
      info.lastError = navigator.onLine === false ? 'Hors connexion' : e.message;
      emit();
    });
  return { ok: true };
}

export const send = (type, payload) => sendBatch([[type, payload]]);

export async function importDb(data) {
  if (mode !== 'local') throw new Error('Import possible uniquement depuis le PC');
  db = (await post('/api/import', data)).db;
  emit();
}

export async function syncNow() {
  if (mode === 'remote') return remoteRefresh();
  const res = await post('/api/sheet/sync', {});
  db = res.db;
  sheetSummary = { configured: res.configured, lastOk: res.lastOk, lastError: res.lastError };
  emit();
}

export function startPolling() {
  if (mode === 'local') {
    setInterval(async () => {
      if (document.hidden || !db) return;
      try {
        const { rev, sheet } = await (await fetch('/api/rev', { cache: 'no-store' })).json();
        const changedSheet = JSON.stringify(sheet) !== JSON.stringify(sheetSummary);
        sheetSummary = sheet;
        if (rev !== db.rev) await localLoad();
        else if (changedSheet) emit();
      } catch {
        /* serveur arrêté : on réessaiera */
      }
    }, 5000);
    return;
  }
  setInterval(() => !document.hidden && remoteRefresh(), 20000);
  document.addEventListener('visibilitychange', () => !document.hidden && remoteRefresh());
  window.addEventListener('online', () => remoteRefresh());
}

// --- PC : réglages de la synchro Google Sheet -----------------------------------
export const getSheetInfo = () => fetch('/api/sheet', { cache: 'no-store' }).then(json);
export const setSheetConfig = (cfg) => post('/api/sheet/config', cfg);
