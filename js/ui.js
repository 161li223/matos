// Petits outils d'interface : échappement HTML, dates, fenêtres, notifications, icônes.

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

// --- dates -------------------------------------------------------------------
const DAY = 86400000;
export function toDateInput(d) {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
}
export const inDays = (n) => toDateInput(Date.now() + n * DAY);

function parse(iso) {
  return iso.length <= 10 ? new Date(iso + 'T12:00:00') : new Date(iso);
}
export const fmtDate = (iso) =>
  iso ? parse(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
export const fmtDateTime = (iso) =>
  iso ? new Date(iso).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';

/** "aujourd'hui", "dans 3 j", "en retard de 2 j" */
export function relDue(dueAt) {
  if (!dueAt) return { text: 'sans date', cls: 'muted' };
  const today = new Date(toDateInput(Date.now()) + 'T12:00:00');
  const d = Math.round((parse(dueAt.slice(0, 10)) - today) / DAY);
  if (d < 0) return { text: `en retard de ${-d} j`, cls: 'danger' };
  if (d === 0) return { text: "aujourd'hui", cls: 'warn' };
  if (d === 1) return { text: 'demain', cls: 'warn' };
  return { text: `dans ${d} j`, cls: 'muted' };
}
export function since(iso) {
  const d = Math.floor((Date.now() - new Date(iso)) / DAY);
  return d <= 0 ? "aujourd'hui" : d === 1 ? 'hier' : `il y a ${d} j`;
}
export const money = (n) => (n || 0).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });

// --- icônes (SVG en ligne, pas de dépendance) --------------------------------
const ICONS = {
  home: '<path d="M3 10.5 12 3l9 7.5V21h-6v-6H9v6H3z"/>',
  box: '<path d="M21 8 12 3 3 8v8l9 5 9-5z"/><path d="m3 8 9 5 9-5M12 13v8"/>',
  swap: '<path d="M4 7h14l-4-4M20 17H6l4 4"/>',
  users: '<circle cx="9" cy="8" r="4"/><path d="M2 21c0-4 3-7 7-7s7 3 7 7M16 4a4 4 0 0 1 0 8M22 21c0-3-1.5-5.5-4-6.5"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8"/>',
  wrench: '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>',
  cart: '<circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/><path d="M2 3h3l2.5 12h12L22 7H6"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  sliders: '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m14 6 4 4"/>',
  back: '<path d="M9 14 4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/>',
  alert: '<path d="M12 3 2 21h20z"/><path d="M12 10v4M12 17.5v.01"/>',
  archive: '<path d="M3 4h18v4H3zM5 8v12h14V8M10 12h4"/>',
  out: '<path d="M12 3v12M7 10l5 5 5-5M5 21h14"/>',
  check: '<path d="m5 12 5 5 9-10"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
  download: '<path d="M12 3v12M7 10l5 5 5-5M4 21h16"/>',
  upload: '<path d="M12 21V9M7 14l5-5 5 5M4 3h16"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
};
export const icon = (name, cls = '') =>
  `<svg class="ic ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;

// --- champs de formulaire ----------------------------------------------------
export const field = (label, control, hint = '', cls = '') =>
  `<label class="field ${cls}"><span class="field-label">${label}</span>${control}${hint ? `<small class="hint">${hint}</small>` : ''}</label>`;
export const input = (name, value = '', attrs = '') => `<input name="${name}" value="${esc(value)}" ${attrs}>`;
export const textarea = (name, value = '', attrs = '') => `<textarea name="${name}" ${attrs}>${esc(value)}</textarea>`;
export function select(name, options, value = '', attrs = '') {
  const opts = options
    .map((o) => (Array.isArray(o) ? o : [o, o]))
    .map(([v, l]) => `<option value="${esc(v)}" ${String(v) === String(value) ? 'selected' : ''}>${esc(l)}</option>`)
    .join('');
  return `<select name="${name}" ${attrs}>${opts}</select>`;
}
export const checkbox = (name, label, checked = false, attrs = '') =>
  `<label class="check"><input type="checkbox" name="${name}" ${checked ? 'checked' : ''} ${attrs}><span>${label}</span></label>`;

function formData(form) {
  const o = {};
  for (const el of form.elements) {
    if (!el.name) continue;
    o[el.name] = el.type === 'checkbox' ? el.checked : el.value;
  }
  return o;
}

// --- fenêtre modale ----------------------------------------------------------
/**
 * modal({ title, body, submit, danger, onSubmit(data, form), onOpen(form) })
 * Si onSubmit lève une erreur, le message s'affiche dans la fenêtre.
 */
export function modal({ title, body, submit = 'Enregistrer', danger = false, wide = false, onSubmit, onOpen, onClose }) {
  const dlg = document.createElement('dialog');
  dlg.className = `modal ${wide ? 'wide' : ''}`;
  dlg.innerHTML = `
    <form class="modal-form" novalidate>
      <header class="modal-head"><h2>${esc(title)}</h2>
        <button type="button" class="icon-btn" data-close aria-label="Fermer">${icon('x')}</button></header>
      <div class="modal-body">${body}</div>
      <p class="form-error" hidden></p>
      <footer class="modal-foot">
        <button type="button" class="btn ghost" data-close>Annuler</button>
        ${onSubmit ? `<button type="submit" class="btn ${danger ? 'danger' : 'primary'}">${esc(submit)}</button>` : ''}
      </footer>
    </form>`;
  document.getElementById('modal-root').append(dlg);
  const form = dlg.querySelector('form');
  const err = dlg.querySelector('.form-error');
  const close = () => {
    dlg.close();
    dlg.remove();
    onClose?.();
  };
  dlg.addEventListener('click', (e) => {
    if (e.target.closest('[data-close]') || e.target === dlg) close();
  });
  dlg.addEventListener('cancel', (e) => {
    e.preventDefault();
    close();
  });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!form.reportValidity()) return;
    const btn = form.querySelector('[type=submit]');
    btn.disabled = true;
    err.hidden = true;
    try {
      await onSubmit(formData(form), form);
      close();
    } catch (ex) {
      err.textContent = ex.message;
      err.hidden = false;
    } finally {
      btn.disabled = false;
    }
  });
  dlg.showModal();
  onOpen?.(form);
  form.querySelector('.modal-body input:not([type=hidden]), .modal-body select, .modal-body textarea')?.focus();
  return { close, form };
}

export function confirmBox(title, text, submit = 'Confirmer', danger = true) {
  return new Promise((resolve) => {
    let ok = false;
    modal({
      title,
      body: `<p>${text}</p>`,
      submit,
      danger,
      onSubmit: () => {
        ok = true;
      },
      onClose: () => resolve(ok),
    });
  });
}

// --- notifications -----------------------------------------------------------
export function toast(msg, kind = 'ok') {
  const t = document.createElement('div');
  t.className = `toast ${kind}`;
  t.textContent = msg;
  document.getElementById('toasts').append(t);
  const ms = kind === 'error' ? 7000 : 2600;
  t.onclick = () => t.remove();
  setTimeout(() => t.classList.add('out'), ms);
  setTimeout(() => t.remove(), ms + 400);
}

export function download(filename, content, type = 'application/json') {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([content], { type }));
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
