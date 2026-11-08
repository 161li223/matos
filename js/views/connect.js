// Écran de connexion du téléphone au Google Sheet (mode distant uniquement).
import { esc } from '../ui.js';
import { getRemote, setRemote, testRemote, load } from '../api.js';

/** Lien d'installation : <appli>#/connect/<base64 de {u, k}> */
export function encodeSetup(url, key) {
  return encodeURIComponent(btoa(JSON.stringify({ u: url, k: key })));
}
export function decodeSetup(s) {
  try {
    const o = JSON.parse(atob(decodeURIComponent(s)));
    return o.u && o.k ? { url: o.u, key: o.k } : null;
  } catch {
    return null;
  }
}

export default {
  title: 'Connexion',
  render() {
    const cfg = getRemote() || {};
    return `
      <div class="connect">
        <img src="icon.svg" alt="" width="64" height="64">
        <h1>Matos</h1>
        <p class="muted">Pour connecter ce téléphone, scanne le QR code affiché sur le PC
        (Paramètres → Synchronisation), ou colle l’adresse et la clé ci-dessous.</p>
        <form class="panel" id="connect-form" onsubmit="return false">
          <label class="field"><span class="field-label">Adresse du relais Google</span>
            <input name="url" value="${esc(cfg.url || '')}" placeholder="https://script.google.com/macros/s/…/exec" inputmode="url" autocomplete="off"></label>
          <label class="field"><span class="field-label">Clé secrète</span>
            <input name="key" value="${esc(cfg.key || '')}" autocomplete="off"></label>
          <p class="form-error" id="connect-error" hidden></p>
          <button class="btn primary" data-action="connectRemote">Se connecter</button>
        </form>
      </div>`;
  },
  actions: {
    async connectRemote(_id, el) {
      const f = document.getElementById('connect-form');
      const err = document.getElementById('connect-error');
      const cfg = { url: f.elements.url.value.trim(), key: f.elements.key.value.trim() };
      el.disabled = true;
      err.hidden = true;
      try {
        await testRemote(cfg);
        setRemote(cfg);
        location.hash = '#/dashboard';
        await load();
      } catch (e) {
        err.textContent = e.message;
        err.hidden = false;
      } finally {
        el.disabled = false;
      }
    },
  },
};
