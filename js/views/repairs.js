import { REPAIR_STATUS } from '../core/model.js';
import { pageHead, btn, repairCard } from '../components.js';

export default {
  title: 'Réparations',
  initialState: { showAll: false },
  render(db, _p, st) {
    const by = (s) => db.repairs.filter((r) => r.status === s).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    const col = (s, limit) => {
      const list = by(s);
      const shown = limit && !st.showAll ? list.slice(0, limit) : list;
      return `<section class="col col-${s}">
        <h2>${REPAIR_STATUS[s]} <span class="count">${list.length}</span></h2>
        <div class="cards">${shown.map((r) => repairCard(db, r)).join('') || '<p class="muted small">Vide</p>'}</div>
        ${shown.length < list.length ? `<button class="btn ghost sm" data-set="showAll=1">Voir tout (${list.length})</button>` : ''}
      </section>`;
    };
    const open = by('todo').length + by('doing').length;
    return `
      ${pageHead('Réparations', `${open} en attente`, btn('reportRepair', 'Signaler une panne', { cls: 'primary', ic: 'plus' }))}
      <div class="board">${col('todo')}${col('doing')}${col('done', 6)}${col('scrap', 6)}</div>`;
  },
};
