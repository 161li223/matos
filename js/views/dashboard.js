import { esc, icon } from '../ui.js';
import { getMode, syncNow } from '../api.js';
import { activeLoans, isOverdue, isLowStock, hasOpenOrder, OPEN_REPAIR, inRepair, dueTime, byId } from '../core/model.js';
import { pageHead, btn, loanTable, empty, itemLink, repairCard } from '../components.js';

export default {
  title: 'Accueil',
  render(db) {
    const items = db.items.filter((i) => !i.archived);
    const loans = activeLoans(db);
    const late = loans.filter((l) => isOverdue(l)).sort((a, b) => dueTime(a) - dueTime(b));
    const repairs = db.repairs.filter((r) => OPEN_REPAIR.includes(r.status));
    const low = items.filter((i) => isLowStock(db, i));
    const toOrder = db.orders.filter((o) => o.status === 'todo');
    const borrowers = new Set(loans.map((l) => l.personId)).size;

    if (!items.length && getMode() === 'remote') {
      return `${pageHead('Accueil')}
        <div class="welcome card"><h2>Pas encore de données</h2>
        <p>Le téléphone est connecté, mais le PC n’a encore rien publié dans le Google Sheet.
        Vérifie que Matos tourne sur le PC et que la synchro est configurée (Paramètres → Synchronisation).</p>
        ${btn('syncNowAction', 'Réessayer', { cls: 'primary' })}</div>`;
    }
    if (!items.length) {
      return `${pageHead(`Bienvenue sur Matos`, esc(db.settings.assoName))}
        <div class="welcome card">
          <h2>On commence ?</h2>
          <p>Ajoute ton premier matériel (perceuse, scie, masse…), ou charge des exemples pour découvrir l’appli.</p>
          <div class="row">${btn('newItem', 'Ajouter du matériel', { cls: 'primary', ic: 'plus' })}
          ${btn('loadDemo', 'Charger des exemples', { ic: 'box' })}</div>
          <p class="small muted">Les exemples pourront être supprimés en réinitialisant depuis Paramètres → Données.</p>
        </div>`;
    }

    const stat = (href, n, label, cls, ic) =>
      `<a class="stat ${cls}" href="${href}">${icon(ic)}<div><b>${n}</b><span>${label}</span></div></a>`;

    return `
      ${pageHead('Accueil', esc(db.settings.assoName), `
        ${btn('lend', 'Prêter', { cls: 'primary', ic: 'swap' })}
        ${btn('reportRepair', 'Signaler une panne', { ic: 'wrench' })}
        ${btn('newItem', 'Matériel', { ic: 'plus' })}`)}
      <section class="stats">
        ${stat('#/inventory', items.reduce((s, i) => s + i.quantity, 0), `outils · ${items.length} réf.`, '', 'box')}
        ${stat('#/loans', loans.reduce((s, l) => s + l.qty, 0), `prêtés · ${borrowers} pers.`, 'info', 'swap')}
        ${stat('#/loans/late', late.length, 'prêts en retard', late.length ? 'danger' : 'ok', 'clock')}
        ${stat('#/repairs', repairs.reduce((s, r) => s + r.qty, 0), 'à réparer', repairs.length ? 'warn' : 'ok', 'wrench')}
        ${stat('#/orders', toOrder.length + low.filter((i) => !hasOpenOrder(db, i.id)).length, 'à commander', toOrder.length || low.length ? 'warn' : 'ok', 'cart')}
      </section>

      <div class="cols">
        <section class="panel">
          <h2>${icon('clock')} En retard</h2>
          ${late.length ? loanTable(db, late, { compact: true }) : empty('Aucun retard 🎉')}
        </section>
        <section class="panel">
          <h2>${icon('swap')} Derniers prêts</h2>
          ${loans.length ? loanTable(db, [...loans].sort((a, b) => b.outAt.localeCompare(a.outAt)).slice(0, 6), { compact: true }) : empty('Rien n’est prêté en ce moment.')}
          ${loans.length > 6 ? `<a class="more" href="#/loans">Voir les ${loans.length} prêts →</a>` : ''}
        </section>
        <section class="panel">
          <h2>${icon('wrench')} À réparer</h2>
          ${repairs.length ? `<div class="cards">${repairs.slice(0, 4).map((r) => repairCard(db, r)).join('')}</div>` : empty('Tout fonctionne.')}
          ${repairs.length > 4 ? `<a class="more" href="#/repairs">Voir les ${repairs.length} réparations →</a>` : ''}
        </section>
        <section class="panel">
          <h2>${icon('alert')} Stock bas</h2>
          ${
            low.length
              ? `<ul class="list">${low
                  .map(
                    (i) => `<li><div>${itemLink(db, i.id)} <span class="muted small">${i.quantity - inRepair(db, i.id)} restant(s) · seuil ${i.minStock}</span></div>
                    ${hasOpenOrder(db, i.id) ? '<span class="badge info">commande en cours</span>' : btn('newOrder', 'Commander', { id: i.id, cls: 'sm', ic: 'cart', extra: `data-qty="${Math.max(1, i.minStock * 2 - i.quantity + inRepair(db, i.id))}"` })}</li>`,
                  )
                  .join('')}</ul>`
              : empty('Rien à signaler.')
          }
        </section>
      </div>`;
  },
  actions: {
    syncNowAction: () => syncNow(),
  },
};
