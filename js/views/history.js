import { esc, icon, fmtDateTime } from '../ui.js';
import { describe } from '../core/model.js';
import { pageHead, empty } from '../components.js';

const norm = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const KINDS = [
  ['', 'Tout'],
  ['loan', 'Prêts'],
  ['item', 'Matériel'],
  ['repair', 'Réparations'],
  ['order', 'Commandes'],
  ['person', 'Personnes'],
];

export default {
  title: 'Historique',
  initialState: { q: '', kind: '', limit: 200 },
  render(db, _p, st) {
    const terms = norm(st.q).split(/\s+/).filter(Boolean);
    const all = db.log
      .filter((e) => !st.kind || e.type.startsWith(st.kind + '.'))
      .map((e) => ({ e, text: describe(db, e) }))
      .filter(({ e, text }) => terms.every((t) => norm(text + ' ' + e.by).includes(t)))
      .reverse();
    const list = all.slice(0, Number(st.limit));
    let lastDay = '';
    const rows = list
      .map(({ e, text }) => {
        const day = new Date(e.at).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
        const head = day !== lastDay ? `<li class="day">${day}</li>` : '';
        lastDay = day;
        return `${head}<li><span class="when">${new Date(e.at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</span> <span class="kind k-${e.type.split('.')[0]}"></span>${esc(text)}${e.by ? ` <span class="muted small">— ${esc(e.by)}</span>` : ''}</li>`;
      })
      .join('');
    return `
      ${pageHead('Historique', `${db.log.length} modification(s) enregistrée(s)`)}
      <div class="toolbar"><label class="search">${icon('search')}<input type="search" id="hist-q" data-state="q" value="${esc(st.q)}" placeholder="Rechercher dans l’historique…"></label></div>
      <div class="chips">${KINDS.map(([v, l]) => `<button class="chip ${st.kind === v ? 'on' : ''}" data-set="kind=${v}">${l}</button>`).join('')}</div>
      <section class="panel">${list.length ? `<ul class="timeline big">${rows}</ul>` : empty('Rien à afficher.')}
      ${all.length > list.length ? `<button class="btn ghost" data-set="limit=${Number(st.limit) + 300}">Voir plus</button>` : ''}</section>
      <p class="small muted">Dernière modif : ${db.log.length ? fmtDateTime(db.log[db.log.length - 1].at) : '—'}</p>`;
  },
};
