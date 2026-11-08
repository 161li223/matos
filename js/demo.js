// Données d'exemple pour découvrir l'appli.
import { sendBatch } from './api.js';
import { uid } from './core/model.js';
import { inDays, toast } from './ui.js';

export async function loadDemo() {
  const ops = [];
  const P = {};
  for (const [k, name, group, contact] of [
    ['lea', 'Léa Martin', 'Pôle déco', '06 12 34 56 78'],
    ['tom', 'Tom Durand', 'Bureau', 'tom.durand@mail.fr'],
    ['ines', 'Inès Benali', 'Pôle chantier', ''],
    ['hugo', 'Hugo Petit', 'Pôle chantier', '07 98 76 54 32'],
  ]) {
    P[k] = uid('pe_');
    ops.push(['person.create', { id: P[k], name, group, contact }]);
  }
  const I = {};
  for (const [k, name, category, quantity, ref, minStock, consumable, location] of [
    ['per', 'Perceuse-visseuse 18V', 'Électroportatif', 3, 'PER', 1, false, 'Armoire A'],
    ['sau', 'Scie sauteuse', 'Électroportatif', 2, 'SAU', 0, false, 'Armoire A'],
    ['meu', 'Meuleuse 125 mm', 'Électroportatif', 1, 'MEU-01', 0, false, 'Armoire A'],
    ['tdv', 'Tournevis (lot)', 'Outillage à main', 12, '', 4, false, 'Caisse bleue'],
    ['mas', 'Masse 2 kg', 'Outillage à main', 2, '', 0, false, 'Local principal'],
    ['egp', 'Scie égoïne', 'Outillage à main', 4, '', 0, false, 'Local principal'],
    ['mtr', 'Mètre ruban 5 m', 'Mesure & traçage', 6, '', 2, false, 'Caisse bleue'],
    ['lun', 'Lunettes de protection', 'Sécurité', 10, '', 4, false, 'Caisse rouge'],
    ['vis', 'Vis bois 4×40 (boîte)', 'Consommables', 3, '', 2, true, 'Étagère conso'],
    ['lam', 'Lames scie sauteuse bois', 'Consommables', 2, '', 3, true, 'Étagère conso'],
  ]) {
    I[k] = uid('it_');
    ops.push(['item.create', { id: I[k], name, category, quantity, ref, minStock, consumable, location }]);
  }
  ops.push(['settings.update', { changes: { locations: ['Local principal', 'Armoire A', 'Caisse bleue', 'Caisse rouge', 'Étagère conso'] } }]);
  ops.push(['loan.create', { id: uid('lo_'), itemId: I.per, personId: P.lea, qty: 1, dueAt: inDays(3), notes: 'Montage étagères' }]);
  ops.push(['loan.create', { id: uid('lo_'), itemId: I.tdv, personId: P.lea, qty: 2, dueAt: inDays(3) }]);
  ops.push(['loan.create', { id: uid('lo_'), itemId: I.mas, personId: P.hugo, qty: 1, dueAt: inDays(-2), notes: 'Démolition cloison' }]);
  ops.push(['loan.create', { id: uid('lo_'), itemId: I.sau, personId: P.ines, qty: 1, dueAt: inDays(0) }]);
  ops.push(['loan.create', { id: uid('lo_'), itemId: I.mtr, personId: P.tom, qty: 1, dueAt: '' }]);
  ops.push(['repair.create', { id: uid('rp_'), itemId: I.per, qty: 1, issue: 'Batterie ne tient plus la charge' }]);
  ops.push(['repair.create', { id: uid('rp_'), itemId: I.meu, qty: 1, issue: 'Câble dénudé près de la poignée' }]);
  ops.push(['order.create', { id: uid('or_'), itemId: I.lam, qty: 5, supplier: 'Leroy Merlin', price: 24.9 }]);
  ops.push(['order.create', { id: uid('or_'), label: 'Serre-joints 300 mm', qty: 4, supplier: 'Brico Dépôt', price: 35, notes: 'Demandé par le pôle déco', addToStock: true }]);
  await sendBatch(ops);
  toast('Exemples chargés');
}
