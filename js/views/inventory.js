import { esc, icon, download } from '../ui.js';
import { available, onLoan, inRepair, isLowStock } from '../core/model.js';
import { pageHead, btn, iconBtn, stockBar, itemBadges, empty, badge } from '../components.js';

const FILTERS = [
  ['', 'Tout'],
  ['available', 'Disponible'],
  ['loan', 'Prêté'],
  ['repair', 'En réparation'],
  ['low', 'Stock bas'],
  ['archived', 'Archivé'],
];

const norm = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

export function inventoryCsv(db) {
  const head = ['Nom', 'Référence', 'Catégorie', 'Emplacement', 'Quantité', 'Disponible', 'Prêté', 'En réparation', 'Seuil', 'Consommable', ...db.settings.customFields.map((f) => f.label), 'Notes'];
  const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = db.items
    .filter((i) => !i.archived)
    .map((i) =>
      [i.name, i.ref, i.category, i.location, i.quantity, available(db, i), onLoan(db, i.id), inRepair(db, i.id), i.minStock, i.consumable ? 'oui' : 'non', ...db.settings.customFields.map((f) => i.extra?.[f.key]), i.notes]
        .map(q)
        .join(';'),
    );
  return '﻿' + [head.map(q).join(';'), ...lines].join('\r\n');
}

export default {
  title: 'Inventaire',
  initialState: { q: '', cat: '', loc: '', filter: '', sort: 'name' },
  render(db, _params, st) {
    const terms = norm(st.q).split(/\s+/).filter(Boolean);
    const rows = db.items
      .filter((i) => (st.filter === 'archived' ? i.archived : !i.archived))
      .filter((i) => !st.cat || i.category === st.cat)
      .filter((i) => !st.loc || i.location === st.loc)
      .filter((i) => {
        const hay = norm([i.name, i.ref, i.category, i.location, i.notes, ...Object.values(i.extra || {})].join(' '));
        return terms.every((t) => hay.includes(t));
      })
      .map((it) => ({ it, av: available(db, it), lo: onLoan(db, it.id), re: inRepair(db, it.id) }))
      .filter((r) => {
        switch (st.filter) {
          case 'available': return r.av > 0;
          case 'loan': return r.lo > 0;
          case 'repair': return r.re > 0;
          case 'low': return isLowStock(db, r.it);
          default: return true;
        }
      })
      .sort((a, b) =>
        st.sort === 'cat'
          ? (a.it.category || '').localeCompare(b.it.category || '', 'fr') || a.it.name.localeCompare(b.it.name, 'fr')
          : st.sort === 'avail'
            ? a.av - b.av
            : a.it.name.localeCompare(b.it.name, 'fr'),
      );

    const all = db.items.filter((i) => !i.archived);
    const cats = [...new Set([...db.settings.categories, ...all.map((i) => i.category).filter(Boolean)])];
    const locs = [...new Set([...db.settings.locations, ...all.map((i) => i.location).filter(Boolean)])];

    const table = rows.length
      ? `<div class="table-wrap"><table class="table inv">
          <thead><tr><th>Matériel</th><th>Catégorie</th><th>Emplacement</th><th>Dispo</th><th>État</th><th></th></tr></thead>
          <tbody>${rows
            .map(
              ({ it, av }) => `<tr>
              <td><a href="#/item/${it.id}" class="lnk strong">${esc(it.name)}</a>${it.ref ? ` <span class="ref">${esc(it.ref)}</span>` : ''}${it.consumable ? ' ' + badge('conso', 'muted') : ''}</td>
              <td>${esc(it.category) || '<span class="muted">—</span>'}</td>
              <td>${esc(it.location) || '<span class="muted">—</span>'}</td>
              <td>${stockBar(db, it)}</td>
              <td class="badges">${itemBadges(db, it)}</td>
              <td class="row-actions">${
                it.archived
                  ? btn('restoreItem', 'Restaurer', { id: it.id, cls: 'sm' })
                  : `${it.consumable ? btn('consume', 'Sortir', { id: it.id, cls: 'sm', ic: 'out', disabled: av < 1 }) : btn('lend', 'Prêter', { id: it.id, cls: 'sm primary', ic: 'swap', disabled: av < 1 })}
                     ${iconBtn('reportRepair', 'wrench', 'Signaler une panne', it.id)}
                     ${iconBtn('editItem', 'edit', 'Modifier', it.id)}`
              }</td>
            </tr>`,
            )
            .join('')}</tbody></table></div>`
      : all.length
        ? empty('Aucun matériel ne correspond à ta recherche.')
        : empty('L’inventaire est vide.', btn('newItem', 'Ajouter du matériel', { cls: 'primary', ic: 'plus' }));

    return `
      ${pageHead('Inventaire', `${all.length} références · ${all.reduce((s, i) => s + i.quantity, 0)} unités`, `
        ${btn('exportInventory', 'CSV', { ic: 'download' })}
        ${btn('newItem', 'Ajouter du matériel', { cls: 'primary', ic: 'plus' })}`)}
      <div class="toolbar">
        <label class="search">${icon('search')}<input type="search" id="inv-q" data-state="q" value="${esc(st.q)}" placeholder="Rechercher : nom, référence, emplacement…"></label>
        <select id="inv-cat" data-state="cat"><option value="">Toutes catégories</option>${cats.map((c) => `<option ${c === st.cat ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>
        <select id="inv-loc" data-state="loc"><option value="">Tous emplacements</option>${locs.map((c) => `<option ${c === st.loc ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>
        <select id="inv-sort" data-state="sort">${[['name', 'Tri : nom'], ['cat', 'Tri : catégorie'], ['avail', 'Tri : moins dispo']].map(([v, l]) => `<option value="${v}" ${v === st.sort ? 'selected' : ''}>${l}</option>`).join('')}</select>
      </div>
      <div class="chips">${FILTERS.map(([v, l]) => `<button class="chip ${st.filter === v ? 'on' : ''}" data-set="filter=${v}">${l}</button>`).join('')}</div>
      ${table}`;
  },
  actions: {
    exportInventory(_id, _el, db) {
      download(`inventaire-${new Date().toISOString().slice(0, 10)}.csv`, inventoryCsv(db), 'text/csv;charset=utf-8');
    },
  },
};
