// Morceaux d'interface réutilisés par plusieurs pages.
import { esc, icon, fmtDate, relDue, since } from './ui.js';
import { byId, available, onLoan, inRepair, isLowStock, isOverdue, REPAIR_STATUS } from './core/model.js';

export const badge = (text, cls = '') => `<span class="badge ${cls}">${esc(text)}</span>`;

export function pageHead(title, sub = '', actions = '') {
  return `<header class="page-head">
    <div><h1>${title}</h1>${sub ? `<p class="muted">${sub}</p>` : ''}</div>
    <div class="head-actions">${actions}</div></header>`;
}

export const btn = (action, label, { id = '', cls = 'ghost', ic = '', disabled = false, extra = '' } = {}) =>
  `<button class="btn ${cls}" data-action="${action}" ${id ? `data-id="${esc(id)}"` : ''} ${extra} ${disabled ? 'disabled' : ''}>${ic ? icon(ic) : ''}<span>${label}</span></button>`;

export const iconBtn = (action, ic, title, id = '', extra = '') =>
  `<button class="icon-btn" data-action="${action}" ${id ? `data-id="${esc(id)}"` : ''} title="${esc(title)}" aria-label="${esc(title)}" ${extra}>${icon(ic)}</button>`;

export const empty = (text, action = '') => `<div class="empty"><p>${text}</p>${action}</div>`;

export const itemLink = (db, id) => {
  const it = byId(db.items, id);
  return it ? `<a href="#/item/${it.id}" class="lnk">${esc(it.name)}</a>` : '<span class="muted">(supprimé)</span>';
};
export const personLink = (db, id) => {
  const p = byId(db.people, id);
  return p ? `<a href="#/person/${p.id}" class="lnk">${esc(p.name)}</a>` : '<span class="muted">?</span>';
};

/** Barre visuelle : disponible / prêté / en réparation */
export function stockBar(db, item) {
  const q = Math.max(item.quantity, 1);
  const lo = onLoan(db, item.id);
  const re = inRepair(db, item.id);
  const av = available(db, item);
  const pct = (n) => `${(n / q) * 100}%`;
  return `<div class="stock">
    <div class="stock-num"><b>${av}</b><span class="muted"> / ${item.quantity}</span></div>
    <div class="bar" title="${av} dispo · ${lo} prêté(s) · ${re} en réparation">
      <i class="seg ok" style="width:${pct(av)}"></i><i class="seg info" style="width:${pct(lo)}"></i><i class="seg warn" style="width:${pct(re)}"></i>
    </div></div>`;
}

export function itemBadges(db, item) {
  if (item.archived) return badge('Archivé', 'muted');
  const out = [];
  const lo = onLoan(db, item.id);
  const re = inRepair(db, item.id);
  const av = available(db, item);
  if (item.quantity === 0) out.push(badge('Épuisé', 'danger'));
  else if (av === 0 && lo > 0) out.push(badge('Tout est prêté', 'info'));
  else if (lo > 0) out.push(badge(`${lo} prêté${lo > 1 ? 's' : ''}`, 'info'));
  if (re > 0) out.push(badge(`${re} en réparation`, 'warn'));
  if (isLowStock(db, item)) out.push(badge('Stock bas', 'danger'));
  if (!out.length) out.push(badge('Disponible', 'ok'));
  return out.join(' ');
}

/** Tableau de prêts. opts : { person, item, actions, compact } */
export function loanTable(db, loans, { person = true, item = true, actions = true, compact = false } = {}) {
  if (!loans.length) return empty('Aucun prêt ici.');
  const rows = loans
    .map((l) => {
      const due = l.returnedAt ? null : relDue(l.dueAt);
      const late = isOverdue(l);
      return `<tr class="${late ? 'row-late' : ''}">
        ${item ? `<td>${itemLink(db, l.itemId)}</td>` : ''}
        <td class="num">${l.qty}</td>
        ${person ? `<td>${personLink(db, l.personId)}</td>` : ''}
        ${compact ? '' : `<td class="nowrap"><span title="${esc(fmtDate(l.outAt))}">${since(l.outAt)}</span></td>`}
        <td>${
          l.returnedAt
            ? `<span class="nowrap">Rendu le ${fmtDate(l.returnedAt)}</span>${l.damaged ? ' ' + badge('abîmé', 'warn') : ''}`
            : compact
              ? `<span class="${due.cls} nowrap" title="${esc(fmtDate(l.dueAt))}">${due.text}</span>`
              : `<span class="nowrap">${fmtDate(l.dueAt)}</span><div class="${due.cls} small">${due.text}</div>`
        }</td>
        ${compact ? '' : `<td class="note-cell">${esc(l.notes)}</td>`}
        ${
          actions
            ? `<td class="row-actions">${
                l.returnedAt
                  ? ''
                  : `${btn('returnLoan', 'Rendu', { id: l.id, ic: 'back', cls: 'primary sm' })}${iconBtn('editLoan', 'edit', 'Modifier (personne, date…)', l.id)}`
              }</td>`
            : ''
        }
      </tr>`;
    })
    .join('');
  return `<div class="table-wrap"><table class="table">
    <thead><tr>${item ? '<th>Matériel</th>' : ''}<th class="num">Qté</th>${person ? '<th>Emprunteur</th>' : ''}${compact ? '' : '<th>Sorti</th>'}<th>Retour</th>${compact ? '' : '<th>Note</th>'}${actions ? '<th></th>' : ''}</tr></thead>
    <tbody>${rows}</tbody></table></div>`;
}

export function repairCard(db, r) {
  const actions = {
    todo: [['doing', 'Commencer', 'ghost'], ['done', 'Réparé', 'primary'], ['scrap', 'Hors service', 'ghost danger-text']],
    doing: [['done', 'Réparé', 'primary'], ['scrap', 'Hors service', 'ghost danger-text'], ['todo', 'Remettre en attente', 'ghost']],
    done: [['todo', 'Rouvrir', 'ghost']],
    scrap: [['todo', 'Rouvrir', 'ghost']],
  }[r.status];
  return `<article class="card repair ${r.status}">
    <div class="card-top"><b>${itemLink(db, r.itemId)}</b> ${r.qty > 1 ? badge('×' + r.qty) : ''}</div>
    <p class="issue">${esc(r.issue)}</p>
    ${r.notes ? `<p class="small muted">${esc(r.notes)}</p>` : ''}
    <p class="small muted">Signalé ${since(r.reportedAt)}${r.personId ? ` · rendu par ${personLink(db, r.personId)}` : ''}</p>
    <div class="card-actions">
      ${actions.map(([s, l, c]) => `<button class="btn sm ${c}" data-action="repairStatus" data-id="${r.id}" data-status="${s}">${l}</button>`).join('')}
      ${iconBtn('editRepair', 'edit', 'Modifier', r.id)}
    </div>
  </article>`;
}

export const repairStatusBadge = (s) =>
  badge(REPAIR_STATUS[s], { todo: 'danger', doing: 'warn', done: 'ok', scrap: 'muted' }[s]);
