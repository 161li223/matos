// Point d'entrée de l'interface : navigation, rendu des pages, gestion des clics.
//
// Pour ajouter une page : créer views/ma-page.js (export default { title, render(db, params, state), actions? })
// puis l'ajouter dans ROUTES (et NAV si elle doit apparaître dans le menu).
import { init, load, getDb, onChange, startPolling, me, getMode, getRemote, setRemote, getSyncInfo, getSheetSummary, syncNow, rejectedListeners } from './api.js';
import { icon, toast, esc, since } from './ui.js';
import connect, { decodeSetup } from './views/connect.js';
import { activeLoans, isOverdue, OPEN_REPAIR, isLowStock, hasOpenOrder, emptyDb } from './core/model.js';
import * as actions from './actions.js';
import { loadDemo } from './demo.js';

import dashboard from './views/dashboard.js';
import inventory from './views/inventory.js';
import item from './views/item.js';
import loans from './views/loans.js';
import people from './views/people.js';
import person from './views/person.js';
import repairs from './views/repairs.js';
import orders from './views/orders.js';
import history from './views/history.js';
import settings from './views/settings.js';

const ROUTES = { dashboard, inventory, item, loans, people, person, repairs, orders, history, settings, connect };
const PARENT = { item: 'inventory', person: 'people' }; // pour surligner le bon menu

const NAV = [
  ['dashboard', 'Accueil', 'home'],
  ['inventory', 'Inventaire', 'box'],
  ['loans', 'Prêts', 'swap'],
  ['people', 'Personnes', 'users'],
  ['repairs', 'Réparations', 'wrench'],
  ['orders', 'Commandes', 'cart'],
  ['history', 'Historique', 'clock'],
  ['settings', 'Paramètres', 'sliders'],
];

const GLOBAL_ACTIONS = { ...actions, loadDemo };
const viewState = {};
const $view = document.getElementById('view');

function route() {
  if (getMode() === 'remote' && !getRemote()) return { name: 'connect', params: [] };
  const [, name = 'dashboard', ...params] = location.hash.replace(/^#/, '').split('/');
  return { name: ROUTES[name] ? name : 'dashboard', params: params.map(decodeURIComponent) };
}

/** Petit indicateur de synchro (téléphone ↔ Sheet, ou PC ↔ Sheet). */
function renderSync() {
  const el = document.getElementById('sync');
  let html = '';
  let cls = '';
  if (getMode() === 'remote') {
    const s = getSyncInfo();
    if (s.lastError) {
      cls = 'err';
      html = `${s.lastError}${s.pending ? ` · ${s.pending} modif. gardée(s) sur le téléphone` : ''}`;
    } else if (s.unsent) {
      cls = 'wait';
      html = `Envoi de ${s.unsent} modification(s)…`;
    } else if (s.pending) {
      cls = 'wait';
      html = `${s.pending} modif. en attente de validation par le PC`;
    } else if (s.lastOk) {
      const t = s.stateAt ? new Date(s.stateAt) : null;
      const when = t && (new Date().toDateString() === t.toDateString() ? `à ${t.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}` : since(s.stateAt));
      html = `À jour${t ? ` · dernière modif ${when}` : ''}`;
    }
  } else {
    const s = getSheetSummary();
    if (s?.configured) {
      if (s.lastError) {
        cls = 'err';
        html = `Synchro Sheet : ${s.lastError}`;
      } else if (s.lastOk) {
        html = `Sheet synchronisé à ${new Date(s.lastOk).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`;
      }
    }
  }
  el.className = `sync ${cls}`;
  el.hidden = !html;
  el.innerHTML = html ? `<span class="dot"></span><span>${esc(html)}</span>` : '';
  el.title = 'Cliquer pour synchroniser maintenant';
}

function renderNav(db) {
  const { name } = route();
  const current = PARENT[name] || name;
  const loans = activeLoans(db);
  const late = loans.filter((l) => isOverdue(l)).length;
  const rep = db.repairs.filter((r) => OPEN_REPAIR.includes(r.status)).length;
  const ord = db.orders.filter((o) => o.status === 'todo').length + db.items.filter((i) => isLowStock(db, i) && !hasOpenOrder(db, i.id)).length;
  const badges = { loans: late ? [late, 'danger'] : null, repairs: rep ? [rep, 'warn'] : null, orders: ord ? [ord, 'warn'] : null };
  document.getElementById('nav').innerHTML = NAV.map(([key, label, ic]) => {
    const b = badges[key];
    return `<a href="#/${key}" class="${key === current ? 'active' : ''}">${icon(ic)}<span class="nav-label">${label}</span>${b ? `<span class="nav-badge ${b[1]}">${b[0]}</span>` : ''}</a>`;
  }).join('');
  document.getElementById('asso-name').textContent = db.settings.assoName;
  const who = me();
  document.getElementById('me').innerHTML = `${icon('user')}<span>${who ? esc(who) : 'Qui es-tu ?'}</span>`;
}

function render() {
  const { name, params } = route();
  const db = getDb() || emptyDb();
  if (!getDb() && name !== 'connect') return;
  const view = ROUTES[name];
  const st = (viewState[name] ||= { ...(view.initialState || {}) });

  // garder le focus et le curseur dans un champ de recherche pendant la frappe
  const active = document.activeElement;
  const focusId = active && $view.contains(active) ? active.id : null;
  const caret = focusId && 'selectionStart' in active ? [active.selectionStart, active.selectionEnd] : null;

  try {
    $view.innerHTML = view.render(db, params, st);
    view.mount?.($view, db, st);
  } catch (e) {
    console.error(e);
    $view.innerHTML = `<div class="empty"><p>Oups, cette page a planté : ${esc(e.message)}</p></div>`;
  }
  renderNav(db);
  renderSync();
  document.body.classList.toggle('no-nav', name === 'connect');
  document.title = `${view.title} · Matos`;

  if (focusId) {
    const el = document.getElementById(focusId);
    if (el) {
      el.focus();
      if (caret && el.setSelectionRange) {
        try {
          el.setSelectionRange(...caret);
        } catch {}
      }
    }
  }
}

// --- clics : data-action="nom" (actions) et data-set="clé=valeur" (état de la page)
document.addEventListener('click', async (e) => {
  const setter = e.target.closest('[data-set]');
  if (setter && $view.contains(setter)) {
    const [k, v] = setter.dataset.set.split('=');
    viewState[route().name][k] = v;
    render();
    return;
  }
  const el = e.target.closest('[data-action]');
  if (!el || el.disabled) return;
  const name = el.dataset.action;
  const fn = ROUTES[route().name].actions?.[name] || GLOBAL_ACTIONS[name];
  if (!fn) return console.warn('Action inconnue :', name);
  e.preventDefault();
  try {
    await fn(el.dataset.id || '', el, getDb());
  } catch (err) {
    console.error(err);
    toast(err.message, 'error');
  }
});

// --- champs data-state="clé" : filtres, recherche…
const onStateInput = (e) => {
  const el = e.target.closest('[data-state]');
  if (!el || !$view.contains(el)) return;
  viewState[route().name][el.dataset.state] = el.type === 'checkbox' ? el.checked : el.value;
  render();
};
document.addEventListener('input', onStateInput);

// --- raccourcis clavier : P = prêter, N = nouveau matériel, / = rechercher
document.addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (document.querySelector('dialog[open]') || e.target.matches('input, textarea, select')) return;
  if (e.key === 'p') actions.lend();
  else if (e.key === 'n') actions.newItem();
  else if (e.key === '/') {
    const s = $view.querySelector('input[type=search]');
    if (s) {
      e.preventDefault();
      s.focus();
    }
  }
});

document.getElementById('me').addEventListener('click', () => actions.whoAmI());
document.getElementById('sync').addEventListener('click', async () => {
  try {
    await syncNow();
    toast('Synchronisé');
  } catch (e) {
    toast(e.message, 'error');
  }
});
document.addEventListener('matos:me', render);
onChange(render);
rejectedListeners.add((r) => toast(`Refusé par le PC : ${r.label} — ${r.error}`, 'error'));

/** Lien d'installation scanné depuis le PC : #/connect/<code> */
function handleSetupLink() {
  const m = location.hash.match(/^#\/connect\/(.+)$/);
  if (!m) return false;
  const cfg = decodeSetup(m[1]);
  if (cfg) setRemote(cfg);
  window.history.replaceState(null, '', location.pathname + '#/dashboard');
  return !!cfg;
}

window.addEventListener('hashchange', async () => {
  if (getMode() === 'remote' && handleSetupLink()) {
    await load().catch(() => {});
    toast('Téléphone connecté');
  }
  render();
  window.scrollTo(0, 0);
});

(async () => {
  const mode = await init();
  document.body.classList.add(`mode-${mode}`);
  if (mode === 'remote') {
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
    handleSetupLink();
    if (!getRemote()) {
      render(); // écran de connexion
      startPolling();
      return;
    }
  }
  try {
    await load();
  } catch (e) {
    $view.innerHTML = `<div class="empty"><p>Impossible de joindre le serveur Matos.<br>Lance « Lancer Matos.bat » puis recharge la page.</p><p class="small muted">${esc(e.message)}</p></div>`;
    return;
  }
  startPolling();
  if (!me()) actions.whoAmI();
})();
