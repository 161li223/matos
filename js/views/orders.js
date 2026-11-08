import { esc, icon, fmtDate, money } from '../ui.js';
import { isLowStock, hasOpenOrder, inRepair, ORDER_STATUS } from '../core/model.js';
import { pageHead, btn, iconBtn, empty, itemLink, badge } from '../components.js';

export default {
  title: 'Commandes',
  render(db) {
    const low = db.items.filter((i) => isLowStock(db, i) && !hasOpenOrder(db, i.id));
    const scrapped = db.repairs.filter((r) => r.status === 'scrap' && !hasOpenOrder(db, r.itemId)).slice(-5);
    const by = (s) => db.orders.filter((o) => o.status === s).sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    const sbtn = (o, status, label, cls = 'ghost') =>
      `<button class="btn sm ${cls}" data-action="orderStatus" data-id="${o.id}" data-status="${status}">${label}</button>`;

    const table = (list, status) => {
      if (!list.length) return empty('Rien ici.');
      const total = list.reduce((s, o) => s + (o.price || 0), 0);
      return `<div class="table-wrap"><table class="table">
        <thead><tr><th>Quoi</th><th class="num">Qté</th><th>Fournisseur</th><th class="num">Prix</th><th>Ajouté</th><th>Notes</th><th></th></tr></thead>
        <tbody>${list
          .map(
            (o) => `<tr>
            <td>${o.itemId ? itemLink(db, o.itemId) : `<b>${esc(o.label)}</b> ${badge('nouveau', 'muted')}`}${o.itemId && o.label !== db.items.find((i) => i.id === o.itemId)?.name ? `<div class="small muted">${esc(o.label)}</div>` : ''}</td>
            <td class="num">${o.qty}</td>
            <td>${esc(o.supplier) || '<span class="muted">—</span>'} ${o.url ? `<a href="${esc(o.url)}" target="_blank" rel="noopener" class="icon-link" title="Ouvrir le lien">${icon('link')}</a>` : ''}</td>
            <td class="num">${o.price ? money(o.price) : '—'}</td>
            <td>${fmtDate(status === 'received' ? o.receivedAt : status === 'ordered' ? o.orderedAt : o.createdAt)}</td>
            <td class="note-cell">${esc(o.notes)}</td>
            <td class="row-actions">
              ${status === 'todo' ? sbtn(o, 'ordered', 'Commandé', 'primary') + sbtn(o, 'cancelled', 'Annuler') : ''}
              ${status === 'ordered' ? sbtn(o, 'received', 'Reçu', 'primary') + sbtn(o, 'todo', 'Pas encore') : ''}
              ${status === 'received' || status === 'cancelled' ? sbtn(o, 'todo', 'Remettre dans la liste') : ''}
              ${iconBtn('editOrder', 'edit', 'Modifier', o.id)}
            </td></tr>`,
          )
          .join('')}</tbody>
        ${total ? `<tfoot><tr><td colspan="3">Total estimé</td><td class="num"><b>${money(total)}</b></td><td colspan="3"></td></tr></tfoot>` : ''}
        </table></div>`;
    };

    const suggestions = [
      ...low.map((i) => {
        const qty = Math.max(1, i.minStock * 2 - (i.quantity - inRepair(db, i.id)));
        return `<li><div>${itemLink(db, i.id)} <span class="small muted">stock bas : ${i.quantity - inRepair(db, i.id)} restant(s), seuil ${i.minStock}</span></div>
          ${btn('newOrder', `Ajouter (${qty})`, { id: i.id, cls: 'sm', ic: 'plus', extra: `data-qty="${qty}"` })}</li>`;
      }),
      ...scrapped.map(
        (r) => `<li><div>${itemLink(db, r.itemId)} <span class="small muted">${r.qty} mis hors service : ${esc(r.issue)}</span></div>
          ${btn('newOrder', 'Racheter', { id: r.itemId, cls: 'sm', ic: 'plus', extra: `data-qty="${r.qty}"` })}</li>`,
      ),
    ];

    return `
      ${pageHead('Commandes', `${by('todo').length} à commander · ${by('ordered').length} en attente de livraison`, btn('newOrder', 'Ajouter', { cls: 'primary', ic: 'plus' }))}
      ${suggestions.length ? `<section class="panel suggest"><h2>${icon('alert')} Suggestions</h2><ul class="list">${suggestions.join('')}</ul></section>` : ''}
      <section class="panel"><h2>${ORDER_STATUS.todo}</h2>${table(by('todo'), 'todo')}</section>
      <section class="panel"><h2>${ORDER_STATUS.ordered} — en attente de livraison</h2>${table(by('ordered'), 'ordered')}</section>
      <section class="panel"><h2>${ORDER_STATUS.received}</h2>${table(by('received').slice(0, 20), 'received')}</section>
      ${by('cancelled').length ? `<section class="panel"><h2>${ORDER_STATUS.cancelled}</h2>${table(by('cancelled').slice(0, 10), 'cancelled')}</section>` : ''}`;
  },
};
