import { esc, icon, download, fmtDate } from '../ui.js';
import { byId, isOverdue, dueTime } from '../core/model.js';
import { pageHead, btn, loanTable } from '../components.js';

const norm = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

export default {
  title: 'Prêts',
  initialState: { q: '', tab: 'current' },
  render(db, [tabParam], st) {
    if (tabParam && st._fromUrl !== tabParam) {
      st.tab = tabParam === 'late' ? 'late' : tabParam === 'done' ? 'done' : 'current';
      st._fromUrl = tabParam;
    }
    const terms = norm(st.q).split(/\s+/).filter(Boolean);
    const match = (l) => {
      const hay = norm(`${byId(db.items, l.itemId)?.name} ${byId(db.people, l.personId)?.name} ${l.notes}`);
      return terms.every((t) => hay.includes(t));
    };
    const current = db.loans.filter((l) => !l.returnedAt);
    const late = current.filter((l) => isOverdue(l));
    const done = db.loans.filter((l) => l.returnedAt);
    const list = { current, late, done }[st.tab]
      .filter(match)
      .sort((a, b) => (st.tab === 'done' ? b.returnedAt.localeCompare(a.returnedAt) : dueTime(a) - dueTime(b)));

    const tab = (v, l, n, cls = '') => `<button class="chip ${st.tab === v ? 'on' : ''} ${cls}" data-set="tab=${v}">${l} <b>${n}</b></button>`;
    return `
      ${pageHead('Prêts', `${current.length} prêt(s) en cours`, `${btn('exportLoans', 'CSV', { ic: 'download' })}${btn('lend', 'Nouveau prêt', { cls: 'primary', ic: 'plus' })}`)}
      <div class="toolbar">
        <label class="search">${icon('search')}<input type="search" id="loan-q" data-state="q" value="${esc(st.q)}" placeholder="Rechercher : personne, matériel…"></label>
      </div>
      <div class="chips">${tab('current', 'En cours', current.length)}${tab('late', 'En retard', late.length, late.length ? 'danger' : '')}${tab('done', 'Rendus', done.length)}</div>
      ${loanTable(db, st.tab === 'done' ? list.slice(0, 300) : list, { actions: st.tab !== 'done' })}`;
  },
  actions: {
    exportLoans(_id, _el, db) {
      const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
      const head = ['Matériel', 'Quantité', 'Emprunteur', 'Contact', 'Sorti le', 'Retour prévu', 'Rendu le', 'Abîmé', 'Note'];
      const lines = db.loans.map((l) => {
        const p = byId(db.people, l.personId);
        return [byId(db.items, l.itemId)?.name, l.qty, p?.name, p?.contact, fmtDate(l.outAt), l.dueAt ? fmtDate(l.dueAt) : '', l.returnedAt ? fmtDate(l.returnedAt) : '', l.damaged ? 'oui' : '', l.notes].map(q).join(';');
      });
      download(`prets-${new Date().toISOString().slice(0, 10)}.csv`, '﻿' + [head.map(q).join(';'), ...lines].join('\r\n'), 'text/csv;charset=utf-8');
    },
  },
};
