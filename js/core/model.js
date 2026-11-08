// =============================================================================
// CŒUR MÉTIER — partagé entre le serveur (Node) et l'interface (navigateur).
//
// Principe : on ne modifie JAMAIS la base directement. Chaque changement est une
// "opération" { id, type, at, by, payload } appliquée par applyOp().
//   -> historique complet gratuit (db.log)
//   -> une opération rejouée deux fois n'a pas d'effet (idempotence via op.id)
//   -> plus tard, un téléphone pourra envoyer des opérations (file d'attente
//      Google Sheet, serveur en ligne…) et le PC les appliquera avec ce même code.
//
// Ajouter une fonctionnalité = ajouter un handler dans HANDLERS + une ligne
// dans describe() pour l'historique.
// =============================================================================

export const SCHEMA_VERSION = 1;

export const REPAIR_STATUS = {
  todo: 'À réparer',
  doing: 'En réparation',
  done: 'Réparé',
  scrap: 'Hors service',
};
export const OPEN_REPAIR = ['todo', 'doing'];

export const ORDER_STATUS = {
  todo: 'À commander',
  ordered: 'Commandé',
  received: 'Reçu',
  cancelled: 'Annulé',
};
export const OPEN_ORDER = ['todo', 'ordered'];

export function emptyDb() {
  return {
    version: SCHEMA_VERSION,
    rev: 0,
    settings: {
      assoName: 'Mon asso',
      defaultLoanDays: 7,
      categories: ['Électroportatif', 'Outillage à main', 'Mesure & traçage', 'Sécurité', 'Consommables', 'Divers'],
      locations: ['Local principal'],
      groups: [],
      // Champs personnalisés ajoutés aux fiches matériel : [{ key, label }]
      customFields: [],
    },
    items: [],
    people: [],
    loans: [],
    repairs: [],
    orders: [],
    log: [],
  };
}

/** Complète une base ancienne avec les clés ajoutées depuis (évolutions de l'app). */
export function migrate(db) {
  const base = emptyDb();
  for (const k of Object.keys(base)) if (db[k] === undefined) db[k] = base[k];
  db.settings = { ...base.settings, ...db.settings };
  db.version = SCHEMA_VERSION;
  return db;
}

export function uid(prefix = '') {
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

// --- petits utilitaires ------------------------------------------------------
const int = (v, d = 0) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : d;
};
const num = (v) => {
  const n = parseFloat(String(v ?? '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};
const str = (v) => (v == null ? '' : String(v)).trim();
const fail = (msg) => {
  throw new Error(msg);
};
export const byId = (list, id) => list.find((x) => x.id === id);
function need(list, id, what) {
  const x = byId(list, id);
  if (!x) fail(`${what} introuvable`);
  return x;
}
function fresh(list, id) {
  if (!id) fail('Identifiant manquant');
  if (byId(list, id)) fail('Identifiant déjà utilisé');
  return id;
}

// --- calculs -----------------------------------------------------------------
export const onLoan = (db, itemId) =>
  db.loans.reduce((s, l) => s + (l.itemId === itemId && !l.returnedAt ? l.qty : 0), 0);

export const inRepair = (db, itemId) =>
  db.repairs.reduce((s, r) => s + (r.itemId === itemId && OPEN_REPAIR.includes(r.status) ? r.qty : 0), 0);

/** Unités réellement disponibles en rayon. */
export const available = (db, item) => item.quantity - onLoan(db, item.id) - inRepair(db, item.id);

/** Stock bas : seuil défini et (quantité utilisable) ≤ seuil. */
export const isLowStock = (db, item) =>
  !item.archived && item.minStock > 0 && item.quantity - inRepair(db, item.id) <= item.minStock;

export const hasOpenOrder = (db, itemId) =>
  db.orders.some((o) => o.itemId === itemId && OPEN_ORDER.includes(o.status));

export const activeLoans = (db) => db.loans.filter((l) => !l.returnedAt);

export function dueTime(loan) {
  if (!loan.dueAt) return Infinity;
  // date seule "AAAA-MM-JJ" -> fin de journée locale
  return new Date(loan.dueAt.length <= 10 ? loan.dueAt + 'T23:59:59' : loan.dueAt).getTime();
}
export const isOverdue = (loan, now = Date.now()) => !loan.returnedAt && dueTime(loan) < now;

function checkItem(db, item) {
  const av = available(db, item);
  if (av < 0) fail(`Pas assez de « ${item.name} » disponible (il en manque ${-av})`);
}

// --- nettoyage des données entrantes -----------------------------------------
function cleanItem(p, base = {}) {
  const out = { ...base };
  if ('name' in p) {
    out.name = str(p.name);
    if (!out.name) fail('Le nom est obligatoire');
  }
  for (const k of ['category', 'location', 'ref', 'notes']) if (k in p) out[k] = str(p[k]);
  if ('quantity' in p) {
    out.quantity = int(p.quantity, -1);
    if (out.quantity < 0) fail('Quantité invalide');
  }
  if ('minStock' in p) out.minStock = Math.max(0, int(p.minStock, 0));
  if ('consumable' in p) out.consumable = !!p.consumable;
  if ('extra' in p) out.extra = { ...(base.extra || {}), ...(p.extra || {}) };
  return out;
}

function cleanPerson(p, base = {}) {
  const out = { ...base };
  if ('name' in p) {
    out.name = str(p.name);
    if (!out.name) fail('Le nom est obligatoire');
  }
  for (const k of ['contact', 'group', 'notes']) if (k in p) out[k] = str(p[k]);
  return out;
}

function cleanOrder(p, base = {}) {
  const out = { ...base };
  for (const k of ['label', 'supplier', 'url', 'notes']) if (k in p) out[k] = str(p[k]);
  if ('itemId' in p) out.itemId = str(p.itemId) || null;
  if ('qty' in p) {
    out.qty = int(p.qty, 0);
    if (out.qty < 1) fail('Quantité invalide');
  }
  if ('price' in p) out.price = num(p.price);
  if ('addToStock' in p) out.addToStock = !!p.addToStock;
  return out;
}

// --- les opérations ----------------------------------------------------------
const HANDLERS = {
  // ----- Matériel
  'item.create'(db, p, op) {
    const item = cleanItem(
      { name: '', category: '', location: '', ref: '', notes: '', quantity: 1, minStock: 0, consumable: false, extra: {}, ...p },
    );
    db.items.push({ id: fresh(db.items, p.id), ...item, archived: false, createdAt: op.at });
  },
  'item.update'(db, p) {
    const it = need(db.items, p.id, 'Matériel');
    Object.assign(it, cleanItem(p.changes || {}, it));
    checkItem(db, it);
  },
  'item.archive'(db, p) {
    const it = need(db.items, p.id, 'Matériel');
    if (onLoan(db, it.id) > 0) fail('Ce matériel est encore prêté');
    it.archived = true;
  },
  'item.restore'(db, p) {
    need(db.items, p.id, 'Matériel').archived = false;
  },
  /** Sortie définitive de stock (consommables : vis, lames, disques…) */
  'item.consume'(db, p) {
    const it = need(db.items, p.itemId, 'Matériel');
    if (p.personId) need(db.people, p.personId, 'Personne');
    const q = int(p.qty, 0);
    if (q < 1) fail('Quantité invalide');
    it.quantity -= q;
    checkItem(db, it);
  },

  // ----- Personnes
  'person.create'(db, p, op) {
    const person = cleanPerson({ name: '', contact: '', group: '', notes: '', ...p });
    db.people.push({ id: fresh(db.people, p.id), ...person, archived: false, createdAt: op.at });
  },
  'person.update'(db, p) {
    const pe = need(db.people, p.id, 'Personne');
    Object.assign(pe, cleanPerson(p.changes || {}, pe));
  },
  'person.archive'(db, p) {
    const pe = need(db.people, p.id, 'Personne');
    if (db.loans.some((l) => l.personId === pe.id && !l.returnedAt)) fail('Cette personne a encore du matériel');
    pe.archived = true;
  },
  'person.restore'(db, p) {
    need(db.people, p.id, 'Personne').archived = false;
  },

  // ----- Prêts
  'loan.create'(db, p, op) {
    const it = need(db.items, p.itemId, 'Matériel');
    if (it.archived) fail(`« ${it.name} » est archivé`);
    need(db.people, p.personId, 'Personne');
    const q = int(p.qty, 0);
    if (q < 1) fail('Quantité invalide');
    db.loans.push({
      id: fresh(db.loans, p.id),
      itemId: it.id,
      personId: p.personId,
      qty: q,
      outAt: op.at,
      dueAt: str(p.dueAt),
      notes: str(p.notes),
      returnedAt: null,
      damaged: false,
      by: op.by || '',
    });
    checkItem(db, it);
  },
  /** Modifier un prêt en cours : changer qui l'a, la date de retour, la note… */
  'loan.update'(db, p) {
    const l = need(db.loans, p.id, 'Prêt');
    const c = p.changes || {};
    if ('personId' in c) l.personId = need(db.people, c.personId, 'Personne').id;
    if ('dueAt' in c) l.dueAt = str(c.dueAt);
    if ('notes' in c) l.notes = str(c.notes);
  },
  /** Retour (total ou partiel), éventuellement abîmé -> crée une réparation. */
  'loan.return'(db, p, op) {
    const l = need(db.loans, p.id, 'Prêt');
    if (l.returnedAt) fail('Ce prêt est déjà rendu');
    const q = p.qty == null || p.qty === '' ? l.qty : int(p.qty, 0);
    if (q < 1 || q > l.qty) fail('Quantité rendue invalide');
    if (q < l.qty) {
      // retour partiel : on garde le prêt ouvert pour le reste
      l.qty -= q;
      db.loans.push({ ...l, id: fresh(db.loans, p.splitId || `${l.id}_${op.id}`), qty: q, returnedAt: op.at, damaged: !!p.damaged });
    } else {
      l.returnedAt = op.at;
      l.damaged = !!p.damaged;
    }
    if (p.damaged) {
      db.repairs.push({
        id: fresh(db.repairs, p.repairId || `rp_${op.id}`),
        itemId: l.itemId,
        qty: q,
        issue: str(p.issue) || 'Rendu abîmé',
        status: 'todo',
        reportedAt: op.at,
        updatedAt: op.at,
        personId: l.personId,
        notes: '',
      });
    }
  },

  // ----- Réparations
  'repair.create'(db, p, op) {
    const it = need(db.items, p.itemId, 'Matériel');
    const q = int(p.qty, 0);
    if (q < 1) fail('Quantité invalide');
    db.repairs.push({
      id: fresh(db.repairs, p.id),
      itemId: it.id,
      qty: q,
      issue: str(p.issue) || 'Panne',
      status: 'todo',
      reportedAt: op.at,
      updatedAt: op.at,
      personId: p.personId || '',
      notes: str(p.notes),
    });
    checkItem(db, it);
  },
  'repair.update'(db, p, op) {
    const r = need(db.repairs, p.id, 'Réparation');
    const it = need(db.items, r.itemId, 'Matériel');
    if ('issue' in p) r.issue = str(p.issue);
    if ('notes' in p) r.notes = str(p.notes);
    if (p.status && p.status !== r.status) {
      if (!REPAIR_STATUS[p.status]) fail('Statut inconnu');
      // "Hors service" retire les unités du stock (et les remet si on annule)
      if (p.status === 'scrap') it.quantity -= r.qty;
      if (r.status === 'scrap') it.quantity += r.qty;
      r.status = p.status;
      r.updatedAt = op.at;
      if (it.quantity < 0) fail('Quantité négative impossible');
      checkItem(db, it);
    }
  },

  // ----- Commandes
  'order.create'(db, p, op) {
    const o = cleanOrder({ label: '', itemId: null, qty: 1, supplier: '', price: 0, url: '', notes: '', addToStock: true, ...p });
    if (o.itemId) {
      const it = need(db.items, o.itemId, 'Matériel');
      if (!o.label) o.label = it.name;
    }
    if (!o.label) fail('Indique ce qu’il faut commander');
    db.orders.push({ id: fresh(db.orders, p.id), ...o, status: 'todo', createdAt: op.at, orderedAt: null, receivedAt: null, stocked: false });
  },
  'order.update'(db, p, op) {
    const o = need(db.orders, p.id, 'Commande');
    Object.assign(o, cleanOrder(p.changes || {}, o));
    if (p.status && p.status !== o.status) {
      if (!ORDER_STATUS[p.status]) fail('Statut inconnu');
      const it = o.itemId ? byId(db.items, o.itemId) : null;
      if (p.status === 'received' && it && o.addToStock && !o.stocked) {
        it.quantity += o.qty; // la commande reçue rentre dans le stock
        o.stocked = true;
      } else if (p.status !== 'received' && o.stocked && it) {
        it.quantity -= o.qty;
        o.stocked = false;
        checkItem(db, it);
      }
      if (p.status === 'ordered') o.orderedAt = op.at;
      if (p.status === 'received') o.receivedAt = op.at;
      o.status = p.status;
    }
  },

  // ----- Paramètres
  'settings.update'(db, p) {
    const c = p.changes || {};
    const s = db.settings;
    if ('assoName' in c) s.assoName = str(c.assoName) || 'Mon asso';
    if ('defaultLoanDays' in c) s.defaultLoanDays = Math.max(0, int(c.defaultLoanDays, 7));
    for (const k of ['categories', 'locations', 'groups']) {
      if (k in c) s[k] = [...new Set((c[k] || []).map(str).filter(Boolean))];
    }
    if ('customFields' in c) {
      s.customFields = (c.customFields || [])
        .map((f) => ({ key: str(f.key), label: str(f.label) }))
        .filter((f) => f.key && f.label);
    }
  },
};

export const OP_TYPES = Object.keys(HANDLERS);

/**
 * Applique UNE opération en modifiant `db`. Peut lever une erreur après avoir
 * commencé à modifier -> toujours travailler sur une copie (voir applyOps).
 */
export function applyOp(db, op) {
  const h = HANDLERS[op.type];
  if (!h) fail(`Opération inconnue : ${op.type}`);
  h(db, op.payload || {}, op);
  db.log.push({ id: op.id, type: op.type, at: op.at, by: op.by || '', payload: op.payload || {} });
  db.rev = (db.rev || 0) + 1;
}

/** Applique une liste d'opérations "tout ou rien". Retourne la nouvelle base. */
export function applyOps(db, ops) {
  const seen = new Set(db.log.map((e) => e.id));
  const next = structuredClone(db);
  let applied = 0;
  for (const op of ops) {
    if (!op || !op.id || !op.type) fail('Opération mal formée');
    if (seen.has(op.id)) continue; // déjà appliquée (renvoi, synchro…)
    op.at = op.at || new Date().toISOString();
    applyOp(next, op);
    seen.add(op.id);
    applied++;
  }
  return { db: next, applied };
}

// --- historique lisible ------------------------------------------------------
const nameOf = (list, id) => byId(list, id)?.name || '?';

export function describe(db, e) {
  const p = e.payload || {};
  const item = (id) => `« ${nameOf(db.items, id)} »`;
  const person = (id) => nameOf(db.people, id);
  switch (e.type) {
    case 'item.create': return `Ajout de « ${p.name} » (×${p.quantity ?? 1})`;
    case 'item.update': {
      const q = 'quantity' in (p.changes || {}) ? ` — quantité : ${p.changes.quantity}` : '';
      return `Modification de ${item(p.id)}${q}`;
    }
    case 'item.archive': return `Archivage de ${item(p.id)}`;
    case 'item.restore': return `Restauration de ${item(p.id)}`;
    case 'item.consume': return `Sortie de stock : ${p.qty} × ${item(p.itemId)}${p.personId ? ` pour ${person(p.personId)}` : ''}`;
    case 'person.create': return `Nouvelle personne : ${p.name}`;
    case 'person.update': return `Modification de la fiche de ${person(p.id)}`;
    case 'person.archive': return `Archivage de ${person(p.id)}`;
    case 'person.restore': return `Restauration de ${person(p.id)}`;
    case 'loan.create': return `${person(p.personId)} emprunte ${p.qty} × ${item(p.itemId)}`;
    case 'loan.update': {
      const l = byId(db.loans, p.id);
      const c = p.changes || {};
      if (c.personId) return `${item(l?.itemId)} est maintenant chez ${person(c.personId)}`;
      if (c.dueAt) return `Retour de ${item(l?.itemId)} repoussé au ${c.dueAt.split('-').reverse().join('/')}`;
      return `Prêt de ${item(l?.itemId)} modifié`;
    }
    case 'loan.return': {
      const l = byId(db.loans, p.id);
      return `${person(l?.personId)} rend ${p.qty || l?.qty || ''} × ${item(l?.itemId)}${p.damaged ? ' (abîmé)' : ''}`;
    }
    case 'repair.create': return `Panne signalée sur ${item(p.itemId)} : ${p.issue || ''}`;
    case 'repair.update': {
      const r = byId(db.repairs, p.id);
      return p.status ? `${item(r?.itemId)} → ${REPAIR_STATUS[p.status]}` : `Réparation de ${item(r?.itemId)} modifiée`;
    }
    case 'order.create': return `À commander : ${p.qty || 1} × ${p.label || nameOf(db.items, p.itemId)}`;
    case 'order.update': {
      const o = byId(db.orders, p.id);
      return p.status ? `Commande « ${o?.label} » → ${ORDER_STATUS[p.status]}` : `Commande « ${o?.label} » modifiée`;
    }
    case 'settings.update': return 'Paramètres modifiés';
    default: return e.type;
  }
}

/** Matériel concerné par une entrée d'historique (pour la fiche matériel). */
export function entryItemId(db, e) {
  const p = e.payload || {};
  if (e.type.startsWith('item.')) return p.id || p.itemId;
  if (e.type === 'loan.create' || e.type === 'repair.create') return p.itemId;
  if (e.type.startsWith('loan.')) return byId(db.loans, p.id)?.itemId;
  if (e.type.startsWith('repair.')) return byId(db.repairs, p.id)?.itemId;
  if (e.type.startsWith('order.')) return p.itemId || byId(db.orders, p.id)?.itemId;
  return null;
}

/** Personne concernée par une entrée d'historique. */
export function entryPersonId(db, e) {
  const p = e.payload || {};
  if (e.type.startsWith('person.')) return p.id;
  if (e.type === 'loan.create' || e.type === 'item.consume') return p.personId;
  if (e.type === 'loan.update') return p.changes?.personId || byId(db.loans, p.id)?.personId;
  if (e.type === 'loan.return') return byId(db.loans, p.id)?.personId;
  return null;
}
