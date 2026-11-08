import { esc, icon, download, toast, confirmBox, fmtDateTime } from '../ui.js';
import { emptyDb } from '../core/model.js';
import { send, importDb, me, getMode, getRemote, setRemote, getSyncInfo, syncNow, getSheetInfo, setSheetConfig } from '../api.js';
import { pageHead, btn } from '../components.js';
import { encodeSetup } from './connect.js';

/** Synchro côté PC : formulaire rempli après chargement (mount). */
const pcSyncPanel = () => `
  <section class="panel" id="sync-panel">
    <h2>Synchronisation téléphones (Google Sheet)</h2>
    <p class="muted">Les téléphones envoient leurs modifications dans un Google Sheet ; ce PC les valide et y publie l’état à jour.
    Mode d’emploi : fichier <code>TELEPHONE.md</code> dans le dossier Matos.</p>
    <form id="sheet-form" onsubmit="return false">
      <div class="grid2">
        <label class="field span2"><span class="field-label">Adresse du relais (Apps Script)</span><input name="url" placeholder="https://script.google.com/macros/s/…/exec" autocomplete="off"></label>
        <label class="field"><span class="field-label">Clé secrète</span><input name="key" autocomplete="off"></label>
        <label class="field"><span class="field-label">Vérifier toutes les … secondes</span><input name="interval" type="number" min="10" value="30"></label>
        <label class="field span2"><span class="field-label">Adresse de l’appli téléphone (PWA en ligne)</span><input name="appUrl" placeholder="https://ton-pseudo.github.io/matos/" autocomplete="off"><small class="hint">Sert à fabriquer le QR code d’installation.</small></label>
      </div>
      <div class="row">${btn('saveSheet', 'Enregistrer et tester', { cls: 'primary', ic: 'check' })}${btn('syncNowAction', 'Synchroniser maintenant', { ic: 'swap' })}</div>
    </form>
    <p id="sheet-status" class="small" style="margin-top:12px"></p>
    <div id="phone-setup" hidden>
      <h2 style="margin-top:18px">Installer sur un téléphone</h2>
      <div class="sync-grid">
        <div>
          <ol class="steps">
            <li>Scanne ce QR code avec l’appareil photo du téléphone.</li>
            <li><b>Android (Chrome)</b> : menu ⋮ → « Installer l’application ».<br><b>iPhone (Safari)</b> : bouton Partager → « Sur l’écran d’accueil ».</li>
            <li>C’est tout : le téléphone est connecté.</li>
          </ol>
          <p class="small muted">Ou envoie ce lien (il contient la clé : ne le partage qu’aux membres de l’asso) :</p>
          <p class="setup-link"><a id="setup-link" target="_blank" rel="noopener"></a></p>
          ${btn('copySetup', 'Copier le lien', { cls: 'sm', ic: 'link' })}
        </div>
        <div class="qr" id="qr"></div>
      </div>
    </div>
  </section>`;

/** Synchro côté téléphone. */
function phoneSyncPanel() {
  const s = getSyncInfo();
  const cfg = getRemote() || {};
  return `<section class="panel">
    <h2>Synchronisation</h2>
    <dl class="info">
      <dt>Relais</dt><dd class="setup-link">${esc(cfg.url || '—')}</dd>
      <dt>Dernière synchro</dt><dd>${s.lastOk ? fmtDateTime(s.lastOk) : '—'}</dd>
      <dt>État publié par le PC</dt><dd>${s.stateAt ? fmtDateTime(s.stateAt) : '—'}</dd>
      <dt>En attente</dt><dd>${s.pending} modification(s)${s.unsent ? ` dont ${s.unsent} pas encore envoyée(s)` : ''}</dd>
      ${s.lastError ? `<dt>Erreur</dt><dd class="danger">${esc(s.lastError)}</dd>` : ''}
    </dl>
    <div class="row" style="margin-top:14px">${btn('syncNowAction', 'Synchroniser maintenant', { cls: 'primary', ic: 'swap' })}${btn('disconnect', 'Déconnecter ce téléphone', { cls: 'ghost danger-text' })}</div>
  </section>`;
}

let qrLib = null;
function loadQrLib() {
  qrLib ||= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';
    s.onload = () => resolve(window.QRCode);
    s.onerror = () => {
      qrLib = null;
      reject(new Error('QR code indisponible (pas d’internet ?)'));
    };
    document.head.append(s);
  });
  return qrLib;
}

function showSheetInfo(info) {
  const f = document.getElementById('sheet-form');
  if (!f) return;
  const status = document.getElementById('sheet-status');
  if (info.configured) {
    status.innerHTML = info.lastError
      ? `<span class="danger">⚠ ${esc(info.lastError)}</span>`
      : info.lastOk
        ? `<span style="color:var(--ok)">● Connecté</span> — dernière synchro ${fmtDateTime(info.lastOk)} · ${info.received} modif. reçue(s) des téléphones${info.rejected ? `, ${info.rejected} refusée(s)` : ''}`
        : 'Synchro en cours…';
  } else status.innerHTML = '<span class="muted">Pas encore configurée.</span>';

  const setup = document.getElementById('phone-setup');
  const c = info.config;
  if (!(info.configured && c.appUrl)) {
    setup.hidden = true;
    return;
  }
  const link = c.appUrl.replace(/#.*$/, '') + '#/connect/' + encodeSetup(c.url, c.key);
  setup.hidden = false;
  const a = document.getElementById('setup-link');
  a.href = link;
  a.textContent = link.length > 90 ? link.slice(0, 90) + '…' : link;
  a.dataset.full = link;
  const qr = document.getElementById('qr');
  loadQrLib()
    .then((QRCode) => {
      qr.innerHTML = '';
      new QRCode(qr, { text: link, width: 200, height: 200, correctLevel: QRCode.CorrectLevel.M });
    })
    .catch((e) => (qr.innerHTML = `<span class="small" style="color:#333">${esc(e.message)}</span>`));
}

const drafts = {};
const lines = (s) => s.split('\n').map((x) => x.trim()).filter(Boolean);
const slug = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

export default {
  title: 'Paramètres',
  render(db) {
    const s = db.settings;
    return `
      ${pageHead('Paramètres')}
      <form class="panel settings" id="settings-form" onsubmit="return false">
        <h2>Général</h2>
        <div class="grid2">
          <label class="field"><span class="field-label">Nom de l’asso</span><input name="assoName" value="${esc(s.assoName)}"></label>
          <label class="field"><span class="field-label">Durée de prêt par défaut (jours)</span><input name="defaultLoanDays" type="number" min="0" value="${s.defaultLoanDays}"><small class="hint">0 = pas de date de retour proposée</small></label>
          <label class="field"><span class="field-label">Catégories</span><textarea name="categories" rows="7">${esc(s.categories.join('\n'))}</textarea><small class="hint">Une par ligne</small></label>
          <label class="field"><span class="field-label">Emplacements</span><textarea name="locations" rows="7">${esc(s.locations.join('\n'))}</textarea><small class="hint">Une par ligne (local, armoire, caisse…)</small></label>
          <label class="field span2"><span class="field-label">Champs personnalisés sur les fiches matériel</span><textarea name="customFields" rows="3" placeholder="ex.&#10;Marque&#10;Numéro de série&#10;Date d’achat">${esc(s.customFields.map((f) => f.label).join('\n'))}</textarea><small class="hint">Un par ligne. Ils apparaissent dans le formulaire de chaque matériel.</small></label>
        </div>
        <div class="row">${btn('saveSettings', 'Enregistrer', { cls: 'primary', ic: 'check' })}</div>
      </form>

      <section class="panel">
        <h2>Cet appareil</h2>
        <p>Utilisateur : <b>${esc(me()) || '<span class="muted">non défini</span>'}</b> ${btn('whoAmI', 'Changer', { cls: 'sm' })}</p>
      </section>

      ${getMode() === 'local' ? pcSyncPanel() : phoneSyncPanel()}

      <section class="panel">
        <h2>Données</h2>
        ${
          getMode() === 'local'
            ? `<p class="muted">Tout est enregistré dans <code>data/db.json</code> à côté de l’appli, avec une copie automatique par jour dans <code>data/backups/</code>.</p>
        <div class="row">
          ${btn('exportJson', 'Exporter une sauvegarde', { ic: 'download' })}
          <label class="btn ghost">${icon('upload')}<span>Importer une sauvegarde</span><input type="file" accept=".json,application/json" id="import-file" hidden></label>
          ${btn('loadDemo', 'Charger des exemples', { ic: 'box' })}
          ${btn('resetAll', 'Tout effacer', { cls: 'ghost danger-text', ic: 'archive' })}
        </div>`
            : `<p class="muted">Sur téléphone, les données de référence sont celles du PC. Import et effacement se font depuis le PC.</p>
        <div class="row">${btn('exportJson', 'Exporter une copie', { ic: 'download' })}</div>`
        }
      </section>
      <p class="small muted">Matos · révision ${db.rev} · ${db.log.length} opérations</p>`;
  },
  mount(root) {
    // garder ce qui est en cours de frappe si la page se redessine (synchro en arrière-plan)
    for (const form of root.querySelectorAll('form[id]')) {
      const d = (drafts[form.id] ||= {});
      for (const [k, v] of Object.entries(d)) if (form.elements[k]) form.elements[k].value = v;
      form.addEventListener('input', (e) => e.target.name && (d[e.target.name] = e.target.value));
    }
    if (getMode() === 'local') {
      getSheetInfo()
        .then((info) => {
          const f = document.getElementById('sheet-form');
          if (!f) return;
          for (const k of ['url', 'key', 'appUrl', 'interval']) if (!(k in (drafts['sheet-form'] || {}))) f.elements[k].value = info.config[k] ?? '';
          showSheetInfo(info);
        })
        .catch(() => {});
    }
    root.querySelector('#import-file')?.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const data = JSON.parse(await file.text());
        if (await confirmBox('Importer cette sauvegarde ?', 'Les données actuelles seront remplacées (une copie est gardée dans data/backups/).', 'Importer')) {
          await importDb(data);
          toast('Sauvegarde importée');
        }
      } catch (err) {
        toast(err.message, 'error');
      }
      e.target.value = '';
    });
  },
  actions: {
    async saveSettings(_id, _el, db) {
      const f = document.getElementById('settings-form');
      const v = (n) => f.elements[n].value;
      const existing = Object.fromEntries(db.settings.customFields.map((x) => [x.label, x.key]));
      await send('settings.update', {
        changes: {
          assoName: v('assoName'),
          defaultLoanDays: v('defaultLoanDays'),
          categories: lines(v('categories')),
          locations: lines(v('locations')),
          customFields: lines(v('customFields')).map((label) => ({ label, key: existing[label] || slug(label) })),
        },
      });
      delete drafts['settings-form'];
      toast('Paramètres enregistrés');
    },
    async saveSheet(_id, el) {
      const f = document.getElementById('sheet-form');
      const cfg = Object.fromEntries(['url', 'key', 'appUrl', 'interval'].map((k) => [k, f.elements[k].value.trim()]));
      el.disabled = true;
      try {
        const info = await setSheetConfig(cfg);
        delete drafts['sheet-form'];
        showSheetInfo(info);
        toast(cfg.url ? 'Connecté au Google Sheet' : 'Synchro désactivée');
      } catch (e) {
        document.getElementById('sheet-status').innerHTML = `<span class="danger">⚠ ${esc(e.message)}</span>`;
        toast(e.message, 'error');
      } finally {
        el.disabled = false;
      }
    },
    async syncNowAction() {
      await syncNow();
      if (getMode() === 'local') showSheetInfo(await getSheetInfo());
      toast('Synchronisé');
    },
    async copySetup() {
      const link = document.getElementById('setup-link')?.dataset.full;
      try {
        await navigator.clipboard.writeText(link);
        toast('Lien copié');
      } catch {
        toast('Copie impossible : sélectionne le lien à la main', 'error');
      }
    },
    async disconnect() {
      const s = getSyncInfo();
      const warn = s.unsent ? ` Attention : ${s.unsent} modification(s) pas encore envoyée(s) seront perdues.` : '';
      if (await confirmBox('Déconnecter ce téléphone ?', `Il faudra rescanner le QR code pour le reconnecter.${warn}`, 'Déconnecter')) {
        setRemote(null);
        try {
          localStorage.removeItem('matos.state');
          localStorage.removeItem('matos.pending');
        } catch {}
        location.reload();
      }
    },
    exportJson(_id, _el, db) {
      download(`matos-sauvegarde-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(db, null, 2));
    },
    async resetAll() {
      if (await confirmBox('Tout effacer ?', 'Inventaire, prêts, personnes, historique… tout repart à zéro. Une copie est gardée dans data/backups/.', 'Tout effacer')) {
        await importDb(emptyDb());
        toast('Données effacées');
      }
    },
  },
};
