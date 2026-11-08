import { esc, fmtDateTime } from '../ui.js';
import { byId, describe, entryPersonId, isOverdue } from '../core/model.js';
import { pageHead, btn, loanTable, empty, badge } from '../components.js';

export default {
  title: 'Personne',
  render(db, [id]) {
    const p = byId(db.people, id);
    if (!p) return empty('Cette personne n’existe pas.', '<a class="btn" href="#/people">Retour</a>');
    const loans = db.loans.filter((l) => l.personId === id);
    const current = loans.filter((l) => !l.returnedAt);
    const past = loans.filter((l) => l.returnedAt).sort((a, b) => b.returnedAt.localeCompare(a.returnedAt));
    const late = current.filter((l) => isOverdue(l)).length;
    const damaged = past.filter((l) => l.damaged).length;
    const hist = db.log.filter((e) => entryPersonId(db, e) === id).reverse().slice(0, 40);

    const sub = [p.group && esc(p.group), p.contact && esc(p.contact), late && badge(`${late} en retard`, 'danger'), damaged && badge(`${damaged} retour(s) abîmé(s)`, 'warn')]
      .filter(Boolean)
      .join(' · ');

    const actions = p.archived
      ? btn('restorePerson', 'Restaurer', { id, cls: 'primary' })
      : `${btn('lend', 'Prêter', { cls: 'primary', ic: 'swap', extra: `data-person="${id}"` })}
         ${current.length ? btn('returnAll', 'Tout rendre', { id, ic: 'back' }) : ''}
         ${btn('editPerson', 'Modifier', { id, ic: 'edit' })}
         ${current.length ? '' : btn('archivePerson', 'Archiver', { id, ic: 'archive' })}`;

    return `
      <a href="#/people" class="back">← Personnes</a>
      ${pageHead(esc(p.name), sub, actions)}
      ${p.notes ? `<p class="notes">${esc(p.notes)}</p>` : ''}
      <section class="panel"><h2>A en ce moment</h2>${current.length ? loanTable(db, current, { person: false }) : empty('Rien.')}</section>
      <section class="panel"><h2>Anciens emprunts (${past.length})</h2>${past.length ? loanTable(db, past.slice(0, 50), { person: false, actions: false }) : empty('Aucun.')}</section>
      <section class="panel"><h2>Historique</h2><ul class="timeline">${hist.map((e) => `<li><span class="when">${fmtDateTime(e.at)}</span> ${esc(describe(db, e))}${e.by ? ` <span class="muted small">— ${esc(e.by)}</span>` : ''}</li>`).join('')}</ul></section>`;
  },
};
