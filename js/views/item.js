import { esc, fmtDate, fmtDateTime, money } from '../ui.js';
import { byId, available, onLoan, inRepair, describe, entryItemId, ORDER_STATUS } from '../core/model.js';
import { pageHead, btn, itemBadges, stockBar, loanTable, repairStatusBadge, empty, badge } from '../components.js';

export default {
  title: 'Matériel',
  render(db, [id]) {
    const it = byId(db.items, id);
    if (!it) return empty('Ce matériel n’existe pas.', '<a class="btn" href="#/inventory">Retour à l’inventaire</a>');
    const av = available(db, it);
    const loans = db.loans.filter((l) => l.itemId === id);
    const current = loans.filter((l) => !l.returnedAt);
    const past = loans.filter((l) => l.returnedAt).sort((a, b) => b.returnedAt.localeCompare(a.returnedAt));
    const repairs = db.repairs.filter((r) => r.itemId === id).sort((a, b) => b.reportedAt.localeCompare(a.reportedAt));
    const orders = db.orders.filter((o) => o.itemId === id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const hist = db.log.filter((e) => entryItemId(db, e) === id).reverse().slice(0, 50);

    const info = [
      ['Catégorie', esc(it.category) || '—'],
      ['Emplacement', esc(it.location) || '—'],
      ['Référence', esc(it.ref) || '—'],
      ['Quantité possédée', it.quantity],
      ['Disponible', av],
      ['Prêté', onLoan(db, id)],
      ['En réparation', inRepair(db, id)],
      ['Seuil d’alerte', it.minStock || '—'],
      ['Type', it.consumable ? 'Consommable' : 'Outil (se prête)'],
      ...db.settings.customFields.map((f) => [esc(f.label), esc(it.extra?.[f.key]) || '—']),
      ['Ajouté le', fmtDate(it.createdAt)],
    ];

    const actions = it.archived
      ? btn('restoreItem', 'Restaurer', { id, cls: 'primary' })
      : `${it.consumable ? btn('consume', 'Sortir du stock', { id, cls: 'primary', ic: 'out', disabled: av < 1 }) : btn('lend', 'Prêter', { id, cls: 'primary', ic: 'swap', disabled: av < 1 })}
         ${btn('reportRepair', 'Signaler une panne', { id, ic: 'wrench', disabled: av < 1 })}
         ${btn('newOrder', 'Commander', { id, ic: 'cart' })}
         ${btn('editItem', 'Modifier', { id, ic: 'edit' })}
         ${btn('archiveItem', 'Archiver', { id, ic: 'archive' })}`;

    return `
      <a href="#/inventory" class="back">← Inventaire</a>
      ${pageHead(esc(it.name), itemBadges(db, it), actions)}
      <div class="detail">
        <section class="panel">
          <h2>Fiche</h2>
          ${stockBar(db, it)}
          <dl class="info">${info.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>
          ${it.notes ? `<p class="notes">${esc(it.notes)}</p>` : ''}
        </section>
        <div class="stack">
          <section class="panel"><h2>Chez qui en ce moment ?</h2>${current.length ? loanTable(db, current, { item: false }) : empty('Personne ne l’a emprunté.')}</section>
          <section class="panel"><h2>Réparations</h2>${
            repairs.length
              ? `<ul class="list">${repairs.map((r) => `<li><div>${repairStatusBadge(r.status)} ${r.qty > 1 ? badge('×' + r.qty) : ''} ${esc(r.issue)}<div class="small muted">${fmtDate(r.reportedAt)}${r.notes ? ' · ' + esc(r.notes) : ''}</div></div></li>`).join('')}</ul>`
              : empty('Jamais tombé en panne.')
          }</section>
          ${orders.length ? `<section class="panel"><h2>Commandes</h2><ul class="list">${orders.map((o) => `<li><div>${badge(ORDER_STATUS[o.status], o.status === 'received' ? 'ok' : o.status === 'cancelled' ? 'muted' : 'warn')} ${o.qty} × ${esc(o.label)} ${o.price ? `<span class="muted">· ${money(o.price)}</span>` : ''}<div class="small muted">${fmtDate(o.createdAt)}</div></div></li>`).join('')}</ul></section>` : ''}
          <section class="panel"><h2>Anciens prêts</h2>${past.length ? loanTable(db, past.slice(0, 30), { item: false, actions: false }) : empty('Aucun.')}</section>
          <section class="panel"><h2>Historique</h2><ul class="timeline">${hist.map((e) => `<li><span class="when">${fmtDateTime(e.at)}</span> ${esc(describe(db, e))}${e.by ? ` <span class="muted small">— ${esc(e.by)}</span>` : ''}</li>`).join('')}</ul></section>
        </div>
      </div>`;
  },
};
