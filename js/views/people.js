import { esc, icon, since } from '../ui.js';
import { isOverdue } from '../core/model.js';
import { pageHead, btn, iconBtn, empty, badge } from '../components.js';

const norm = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

export default {
  title: 'Personnes',
  initialState: { q: '', filter: '' },
  render(db, _p, st) {
    const terms = norm(st.q).split(/\s+/).filter(Boolean);
    const rows = db.people
      .filter((p) => (st.filter === 'archived' ? p.archived : !p.archived))
      .filter((p) => terms.every((t) => norm(`${p.name} ${p.contact} ${p.group}`).includes(t)))
      .map((p) => {
        const loans = db.loans.filter((l) => l.personId === p.id && !l.returnedAt);
        const last = db.loans.filter((l) => l.personId === p.id).sort((a, b) => b.outAt.localeCompare(a.outAt))[0];
        return { p, loans, late: loans.filter((l) => isOverdue(l)).length, units: loans.reduce((s, l) => s + l.qty, 0), last };
      })
      .filter((r) => st.filter !== 'has' || r.loans.length)
      .sort((a, b) => b.late - a.late || b.units - a.units || a.p.name.localeCompare(b.p.name, 'fr'));

    const total = db.people.filter((p) => !p.archived).length;
    const chip = (v, l) => `<button class="chip ${st.filter === v ? 'on' : ''}" data-set="filter=${v}">${l}</button>`;

    return `
      ${pageHead('Personnes', `${total} personne(s)`, btn('newPerson', 'Ajouter', { cls: 'primary', ic: 'plus' }))}
      <div class="toolbar"><label class="search">${icon('search')}<input type="search" id="ppl-q" data-state="q" value="${esc(st.q)}" placeholder="Rechercher : nom, contact, groupe…"></label></div>
      <div class="chips">${chip('', 'Tout le monde')}${chip('has', 'Ont du matériel')}${chip('archived', 'Archivées')}</div>
      ${
        rows.length
          ? `<div class="table-wrap"><table class="table">
              <thead><tr><th>Nom</th><th>Groupe</th><th>Contact</th><th>A en ce moment</th><th>Dernier emprunt</th><th></th></tr></thead>
              <tbody>${rows
                .map(
                  ({ p, loans, late, units, last }) => `<tr>
                  <td><a class="lnk strong" href="#/person/${p.id}">${esc(p.name)}</a></td>
                  <td>${esc(p.group) || '<span class="muted">—</span>'}</td>
                  <td>${esc(p.contact) || '<span class="muted">—</span>'}</td>
                  <td>${loans.length ? `${units} objet(s)` : '<span class="muted">rien</span>'} ${late ? badge(`${late} en retard`, 'danger') : ''}</td>
                  <td>${last ? since(last.outAt) : '<span class="muted">jamais</span>'}</td>
                  <td class="row-actions">${
                    p.archived
                      ? btn('restorePerson', 'Restaurer', { id: p.id, cls: 'sm' })
                      : `${btn('lend', 'Prêter', { cls: 'sm', ic: 'swap', extra: `data-person="${p.id}"` })}${iconBtn('editPerson', 'edit', 'Modifier', p.id)}`
                  }</td></tr>`,
                )
                .join('')}</tbody></table></div>`
          : empty(total ? 'Personne ne correspond.' : 'Aucune personne pour l’instant. Elles sont aussi créées automatiquement au premier prêt.')
      }`;
  },
};
