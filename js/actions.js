// Toutes les actions utilisateur (boutons data-action="…") qui ouvrent une fenêtre.
// Une action reçoit (id, element) où id = data-id du bouton.
import { getDb, send, sendBatch, me, setMe } from './api.js';
import { modal, field, input, textarea, select, checkbox, toast, confirmBox, inDays, esc, icon, fmtDate } from './ui.js';
import { uid, byId, available, REPAIR_STATUS } from './core/model.js';

const db = () => getDb();
const activeItems = () => db().items.filter((i) => !i.archived).sort((a, b) => a.name.localeCompare(b.name, 'fr'));
const activePeople = () => db().people.filter((p) => !p.archived).sort((a, b) => a.name.localeCompare(b.name, 'fr'));

function optionList(values, current) {
  const list = [...new Set([...(values || []), current].filter(Boolean))];
  return [['', '—'], ...list.map((v) => [v, v])];
}

/** Retrouve une personne par son nom, ou prépare sa création. */
function resolvePerson(name, ops) {
  const n = name.trim();
  if (!n) throw new Error('Indique le nom de la personne');
  const found = db().people.find((p) => p.name.toLowerCase() === n.toLowerCase());
  if (found) {
    if (found.archived) ops.push(['person.restore', { id: found.id }]);
    return found.id;
  }
  const id = uid('pe_');
  ops.push(['person.create', { id, name: n }]);
  return id;
}

const peopleDatalist = () =>
  `<datalist id="dl-people">${activePeople()
    .map((p) => `<option value="${esc(p.name)}">${esc(p.group || p.contact || '')}</option>`)
    .join('')}</datalist>`;

// ============================================================================ Matériel
function itemFormBody(it = {}) {
  const s = db().settings;
  const extra = it.extra || {};
  return `
  <div class="grid2">
    ${field('Nom *', input('name', it.name, 'required placeholder="ex. Perceuse-visseuse Bosch 18V"'), '', 'span2')}
    ${field('Catégorie', select('category', optionList(s.categories, it.category), it.category))}
    ${field('Emplacement', select('location', optionList(s.locations, it.location), it.location))}
    ${field('Quantité possédée', input('quantity', it.quantity ?? 1, 'type="number" min="0" required'))}
    ${field('Seuil d’alerte', input('minStock', it.minStock ?? 0, 'type="number" min="0"'), 'Prévenir quand il en reste ≤ ce nombre (0 = jamais)')}
    ${field('Référence / n° d’inventaire', input('ref', it.ref, 'placeholder="ex. PER-01"'))}
    <div class="field">${checkbox('consumable', 'Consommable (vis, lames, disques…)', it.consumable)}<small class="hint">On le « sort du stock » au lieu de le prêter.</small></div>
    ${s.customFields.map((f) => field(esc(f.label), input('extra.' + f.key, extra[f.key] || ''))).join('')}
    ${field('Notes', textarea('notes', it.notes, 'rows="2"'), '', 'span2')}
  </div>`;
}

function readItemForm(d) {
  const extra = {};
  for (const f of db().settings.customFields) extra[f.key] = d['extra.' + f.key] || '';
  return {
    name: d.name,
    category: d.category,
    location: d.location,
    quantity: d.quantity,
    minStock: d.minStock,
    ref: d.ref,
    consumable: d.consumable,
    notes: d.notes,
    extra,
  };
}

export function newItem() {
  modal({
    title: 'Ajouter du matériel',
    body: itemFormBody(),
    submit: 'Ajouter',
    wide: true,
    onSubmit: async (d) => {
      const id = uid('it_');
      await send('item.create', { id, ...readItemForm(d) });
      toast(`« ${d.name} » ajouté`);
    },
  });
}

export function editItem(id) {
  const it = byId(db().items, id);
  modal({
    title: `Modifier « ${it.name} »`,
    body: itemFormBody(it),
    wide: true,
    onSubmit: async (d) => {
      await send('item.update', { id, changes: readItemForm(d) });
      toast('Modifications enregistrées');
    },
  });
}

export async function archiveItem(id) {
  const it = byId(db().items, id);
  if (await confirmBox('Archiver ce matériel ?', `« ${esc(it.name)} » n’apparaîtra plus dans l’inventaire (l’historique est conservé, on peut le restaurer).`, 'Archiver')) {
    await send('item.archive', { id }).then(() => toast('Archivé')).catch((e) => toast(e.message, 'error'));
  }
}
export const restoreItem = (id) => send('item.restore', { id }).then(() => toast('Restauré'));

export function consume(id) {
  const it = byId(db().items, id);
  const av = available(db(), it);
  modal({
    title: `Sortir du stock : ${it.name}`,
    body: `
      <p class="muted">${av} disponible(s). La quantité sortie est retirée définitivement du stock.</p>
      <div class="grid2">
        ${field('Quantité', input('qty', 1, `type="number" min="1" max="${av}" required`))}
        ${field('Pour qui (optionnel)', input('person', '', 'list="dl-people" autocomplete="off"'))}
        ${field('Note', input('note', '', 'placeholder="ex. chantier peinture"'), '', 'span2')}
      </div>${peopleDatalist()}`,
    submit: 'Sortir du stock',
    onSubmit: async (d) => {
      const ops = [];
      const personId = d.person.trim() ? resolvePerson(d.person, ops) : '';
      ops.push(['item.consume', { itemId: id, qty: d.qty, personId, note: d.note }]);
      await sendBatch(ops);
      toast('Stock mis à jour');
    },
  });
}

// ============================================================================ Prêts
function itemOptions(selectedId) {
  const items = activeItems().filter((i) => !i.consumable && (available(db(), i) > 0 || i.id === selectedId));
  const groups = {};
  for (const i of items) (groups[i.category || 'Sans catégorie'] ||= []).push(i);
  return (
    '<option value="">— choisir —</option>' +
    Object.entries(groups)
      .sort(([a], [b]) => a.localeCompare(b, 'fr'))
      .map(
        ([g, list]) =>
          `<optgroup label="${esc(g)}">${list
            .map((i) => `<option value="${i.id}" ${i.id === selectedId ? 'selected' : ''}>${esc(i.name)}${i.ref ? ` (${esc(i.ref)})` : ''} — ${available(db(), i)} dispo</option>`)
            .join('')}</optgroup>`,
      )
      .join('')
  );
}

const lendLine = (itemId = '') => `
  <div class="lend-line">
    <select name="line-item" required>${itemOptions(itemId)}</select>
    <input name="line-qty" type="number" min="1" value="1" class="qty" aria-label="Quantité">
    <button type="button" class="icon-btn" data-remove-line title="Retirer">${icon('x')}</button>
  </div>`;

/** Prêter : un ou plusieurs matériels à une personne. */
export function lend(itemId = '', el) {
  const personId = el?.dataset?.person || '';
  const person = personId ? byId(db().people, personId) : null;
  const s = db().settings;
  modal({
    title: 'Nouveau prêt',
    wide: true,
    body: `
      ${field('Emprunteur *', input('person', person?.name || '', 'list="dl-people" required autocomplete="off" placeholder="Nom — une nouvelle personne est créée automatiquement"'))}
      <div class="field"><span class="field-label">Matériel</span>
        <div class="lend-lines">${lendLine(itemId)}</div>
        <button type="button" class="btn ghost sm add-line">${icon('plus')}<span>Ajouter un autre matériel</span></button>
      </div>
      <div class="grid2">
        ${field('Retour prévu', input('dueAt', s.defaultLoanDays ? inDays(s.defaultLoanDays) : '', 'type="date"'), 'Laisse vide si pas de date')}
        ${field('Note', input('notes', '', 'placeholder="ex. pour le chantier du local"'))}
      </div>${peopleDatalist()}`,
    submit: 'Valider le prêt',
    onOpen: (form) => {
      const lines = form.querySelector('.lend-lines');
      form.querySelector('.add-line').onclick = () => {
        lines.insertAdjacentHTML('beforeend', lendLine());
        lines.lastElementChild.querySelector('select').focus();
      };
      lines.addEventListener('click', (e) => {
        if (e.target.closest('[data-remove-line]') && lines.children.length > 1) e.target.closest('.lend-line').remove();
      });
      if (person) form.querySelector('select').focus();
    },
    onSubmit: async (d, form) => {
      const ops = [];
      const pid = resolvePerson(d.person, ops);
      const lines = [...form.querySelectorAll('.lend-line')].map((l) => ({ itemId: l.querySelector('select').value, qty: l.querySelector('.qty').value }));
      if (lines.some((l) => !l.itemId)) throw new Error('Choisis le matériel sur chaque ligne');
      for (const l of lines) ops.push(['loan.create', { id: uid('lo_'), itemId: l.itemId, personId: pid, qty: l.qty, dueAt: d.dueAt, notes: d.notes }]);
      await sendBatch(ops);
      toast(`Prêt enregistré pour ${d.person.trim()}`);
    },
  });
}

export function returnLoan(id) {
  const l = byId(db().loans, id);
  const it = byId(db().items, l.itemId);
  const pe = byId(db().people, l.personId);
  modal({
    title: 'Retour de matériel',
    body: `
      <p><b>${esc(pe?.name)}</b> rend <b>${esc(it?.name)}</b> (emprunté le ${fmtDate(l.outAt)}).</p>
      ${l.qty > 1 ? field(`Quantité rendue (sur ${l.qty})`, input('qty', l.qty, `type="number" min="1" max="${l.qty}"`)) : ''}
      ${checkbox('damaged', 'Rendu abîmé / ne fonctionne plus → à réparer', false, 'id="chk-damaged"')}
      <div class="damage" hidden>${field('Qu’est-ce qui ne va pas ?', textarea('issue', '', 'rows="2" placeholder="ex. mandrin qui patine, batterie HS…"'))}</div>`,
    submit: 'Valider le retour',
    onOpen: (form) => {
      const chk = form.querySelector('#chk-damaged');
      chk.onchange = () => (form.querySelector('.damage').hidden = !chk.checked);
    },
    onSubmit: async (d) => {
      await send('loan.return', { id, qty: d.qty || l.qty, damaged: d.damaged, issue: d.issue });
      toast(d.damaged ? 'Retour enregistré — ajouté aux réparations' : 'Retour enregistré');
    },
  });
}

/** Rendre tout ce qu'une personne a encore. */
export async function returnAll(personId) {
  const pe = byId(db().people, personId);
  const loans = db().loans.filter((l) => l.personId === personId && !l.returnedAt);
  if (!loans.length) return;
  if (await confirmBox(`Tout rendre ?`, `${esc(pe.name)} rend ses ${loans.length} prêt(s) en cours, en bon état.`, 'Tout rendre', false)) {
    await sendBatch(loans.map((l) => ['loan.return', { id: l.id }]));
    toast('Tout est rendu');
  }
}

export function editLoan(id) {
  const l = byId(db().loans, id);
  const it = byId(db().items, l.itemId);
  const pe = byId(db().people, l.personId);
  modal({
    title: `Modifier le prêt : ${it?.name}`,
    body: `
      ${field('Chez qui ?', input('person', pe?.name, 'list="dl-people" required autocomplete="off"'), 'Change le nom si le matériel est passé à quelqu’un d’autre')}
      <div class="grid2">
        ${field('Retour prévu', input('dueAt', l.dueAt, 'type="date"'))}
        ${field('Note', input('notes', l.notes))}
      </div>${peopleDatalist()}`,
    onSubmit: async (d) => {
      const ops = [];
      const pid = resolvePerson(d.person, ops);
      const changes = {};
      if (pid !== l.personId) changes.personId = pid;
      if (d.dueAt !== l.dueAt) changes.dueAt = d.dueAt;
      if (d.notes !== l.notes) changes.notes = d.notes;
      if (!Object.keys(changes).length) return;
      ops.push(['loan.update', { id, changes }]);
      await sendBatch(ops);
      toast('Prêt modifié');
    },
  });
}

// ============================================================================ Réparations
export function reportRepair(itemId = '') {
  const items = activeItems().filter((i) => available(db(), i) > 0 || i.id === itemId);
  modal({
    title: 'Signaler une panne',
    body: `
      ${field('Matériel *', select('itemId', [['', '— choisir —'], ...items.map((i) => [i.id, `${i.name} — ${available(db(), i)} dispo`])], itemId, 'required'))}
      <div class="grid2">
        ${field('Quantité concernée', input('qty', 1, 'type="number" min="1"'))}
      </div>
      ${field('Problème *', textarea('issue', '', 'rows="3" required placeholder="ex. lame émoussée, câble dénudé…"'))}`,
    submit: 'Signaler',
    onSubmit: async (d) => {
      if (!d.itemId) throw new Error('Choisis le matériel');
      await send('repair.create', { id: uid('rp_'), itemId: d.itemId, qty: d.qty, issue: d.issue });
      toast('Ajouté aux réparations');
    },
  });
}

export async function repairStatus(id, el) {
  const status = el.dataset.status;
  const r = byId(db().repairs, id);
  if (status === 'scrap') {
    const it = byId(db().items, r.itemId);
    const ok = await confirmBox('Hors service ?', `${r.qty} × « ${esc(it.name)} » sera retiré du stock. Pense à le racheter si besoin (page Commandes).`, 'Mettre hors service');
    if (!ok) return;
  }
  await send('repair.update', { id, status }).catch((e) => toast(e.message, 'error'));
  toast(REPAIR_STATUS[status]);
}

export function editRepair(id) {
  const r = byId(db().repairs, id);
  modal({
    title: 'Modifier la réparation',
    body: `${field('Problème', textarea('issue', r.issue, 'rows="2"'))}
           ${field('Notes de réparation', textarea('notes', r.notes, 'rows="3" placeholder="pièce commandée, qui s’en occupe…"'))}`,
    onSubmit: async (d) => {
      await send('repair.update', { id, issue: d.issue, notes: d.notes });
    },
  });
}

// ============================================================================ Commandes
function orderFormBody(o = {}) {
  return `
    ${field('Matériel lié', select('itemId', [['', '— aucun (nouveau matériel) —'], ...activeItems().map((i) => [i.id, i.name])], o.itemId || ''), 'Si lié, la quantité reçue s’ajoutera au stock')}
    <div class="grid2">
      ${field('Quoi ? *', input('label', o.label, 'placeholder="ex. Lames de scie sauteuse bois"'), 'Rempli automatiquement si matériel lié', 'span2')}
      ${field('Quantité', input('qty', o.qty ?? 1, 'type="number" min="1" required'))}
      ${field('Prix total estimé (€)', input('price', o.price || '', 'inputmode="decimal" placeholder="0"'))}
      ${field('Fournisseur', input('supplier', o.supplier, 'placeholder="ex. Leroy Merlin"'))}
      ${field('Lien', input('url', o.url, 'type="url" placeholder="https://…"'))}
      ${field('Pourquoi / notes', textarea('notes', o.notes, 'rows="2"'), '', 'span2')}
      <div class="span2">${checkbox('addToStock', 'Ajouter au stock à la réception', o.addToStock ?? true)}</div>
    </div>`;
}

export function newOrder(itemId = '', el) {
  const qty = el?.dataset?.qty || 1;
  modal({
    title: 'Ajouter à la liste de commandes',
    wide: true,
    body: orderFormBody({ itemId, qty }),
    submit: 'Ajouter',
    onSubmit: async (d) => {
      await send('order.create', { id: uid('or_'), ...d });
      toast('Ajouté à la liste de commandes');
    },
  });
}

export function editOrder(id) {
  const o = byId(db().orders, id);
  modal({
    title: 'Modifier la commande',
    wide: true,
    body: orderFormBody(o),
    onSubmit: async (d) => {
      await send('order.update', { id, changes: d });
    },
  });
}

export async function orderStatus(id, el) {
  await send('order.update', { id, status: el.dataset.status })
    .then(() => toast(el.dataset.status === 'received' ? 'Reçu — stock mis à jour' : 'Commande mise à jour'))
    .catch((e) => toast(e.message, 'error'));
}

// ============================================================================ Personnes
function personFormBody(p = {}) {
  return `<div class="grid2">
    ${field('Nom *', input('name', p.name, 'required'), '', 'span2')}
    ${field('Contact', input('contact', p.contact, 'placeholder="téléphone, mail…"'))}
    ${field('Groupe / promo / pôle', input('group', p.group, 'list="dl-groups"'))}
    ${field('Notes', textarea('notes', p.notes, 'rows="2"'), '', 'span2')}
  </div>
  <datalist id="dl-groups">${[...new Set(db().people.map((x) => x.group).filter(Boolean))].map((g) => `<option value="${esc(g)}">`).join('')}</datalist>`;
}

export function newPerson() {
  modal({
    title: 'Nouvelle personne',
    body: personFormBody(),
    submit: 'Ajouter',
    onSubmit: async (d) => {
      if (db().people.some((p) => p.name.toLowerCase() === d.name.trim().toLowerCase())) throw new Error('Cette personne existe déjà');
      await send('person.create', { id: uid('pe_'), ...d });
      toast(`${d.name} ajouté(e)`);
    },
  });
}

export function editPerson(id) {
  const p = byId(db().people, id);
  modal({
    title: `Modifier ${p.name}`,
    body: personFormBody(p),
    onSubmit: async (d) => {
      await send('person.update', { id, changes: d });
    },
  });
}

export async function archivePerson(id) {
  const p = byId(db().people, id);
  if (await confirmBox('Archiver cette personne ?', `${esc(p.name)} n’apparaîtra plus dans les listes. L’historique est conservé.`, 'Archiver')) {
    await send('person.archive', { id }).then(() => toast('Archivé')).catch((e) => toast(e.message, 'error'));
  }
}
export const restorePerson = (id) => send('person.restore', { id });

// ============================================================================ Utilisateur de l'appareil
export function whoAmI() {
  modal({
    title: 'Qui utilise cet ordinateur ?',
    body: `${field('Ton prénom', input('name', me(), 'required placeholder="ex. Vincent"'), 'Il apparaîtra dans l’historique à côté de chaque modification.')}`,
    onSubmit: (d) => {
      setMe(d.name.trim());
      document.dispatchEvent(new Event('matos:me'));
    },
  });
}
