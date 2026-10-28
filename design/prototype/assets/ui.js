/* UI primitives: icons, dialogs, menus, popovers, toasts, event dispatch, utilities */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ACT = {}, INP = {}, CHG = {}, CTX = {};
const VIEWS = {};
let _uid = 0; const uid = () => 'u' + (++_uid);
const plural = (n, w) => `${n.toLocaleString('en-US')} ${w}${n === 1 ? '' : 's'}`;
const fmtAgo = t => {
  if (!t) return 'never';
  const d = Date.now() - t;
  if (d < MIN) return 'just now';
  if (d < HOUR) return Math.round(d / MIN) + ' min ago';
  if (d < DAY) return Math.round(d / HOUR) + ' h ago';
  if (d < 2 * DAY) return 'yesterday';
  return Math.round(d / DAY) + ' days ago';
};
const wordCount = s => (s.trim().match(/\S+/g) || []).length;
const basename = p => p.split('/').pop().replace(/\.md$/, '');
const dirname = p => (p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '');
const isMobile = () => innerWidth < 700;

const ICONS = {
  file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/>',
  folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  star: '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2-4.5-4.4 6.2-.9z"/>',
  today: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  tasks: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="m8 12 3 3 5-6"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  tag: '<path d="M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9z"/><circle cx="8" cy="8" r="1.5"/>',
  outline: '<path d="M4 6h10M4 12h16M4 18h12"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.4-2.4 1a7 7 0 0 0-2-1.2L14 3h-4l-.5 2.7a7 7 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.5A7 7 0 0 0 5 12a7 7 0 0 0 .1 1.2l-2 1.5 2 3.4 2.4-1a7 7 0 0 0 2 1.2L10 21h4l.5-2.7a7 7 0 0 0 2-1.2l2.4 1 2-3.4-2-1.5c.1-.4.1-.8.1-1.2z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  chevR: '<path d="m9 6 6 6-6 6"/>',
  chevD: '<path d="m6 9 6 6 6-6"/>',
  pin: '<path d="M12 17v5M9 3h6l-1 6 3 3H7l3-3z"/>',
  warn: '<path d="M12 3 2 20h20z"/><path d="M12 10v4M12 17h.01"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  copy: '<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M4 16V4h12"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  bolt: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
  terminal: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="m7 9 3 3-3 3M13 15h4"/>',
  plug: '<path d="M9 2v6M15 2v6M6 8h12v4a6 6 0 0 1-12 0z"/><path d="M12 18v4"/>',
  play: '<path d="m7 4 13 8-13 8z"/>',
  refresh: '<path d="M20 11a8 8 0 0 0-14.9-3.5L4 9M4 4v5h5M4 13a8 8 0 0 0 14.9 3.5L20 15M20 20v-5h-5"/>',
  eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>',
  keyboard: '<rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  dots: '<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>',
  check: '<path d="m5 12 5 5 9-10"/>',
  grid: '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  sparkle: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
  send: '<path d="M22 2 11 13M22 2l-7 20-4-9-9-4z"/>',
  download: '<path d="M12 4v12M7 11l5 5 5-5M4 20h16"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  error: '<circle cx="12" cy="12" r="9"/><path d="m9 9 6 6M15 9l-6 6"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
  split: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M12 4v16"/>',
  book: '<path d="M4 4h6a3 3 0 0 1 3 3v13a2 2 0 0 0-2-2H4zM20 4h-6a3 3 0 0 0-3 3v13a2 2 0 0 1 2-2h7z"/>',
  bot: '<rect x="4" y="8" width="16" height="12" rx="3"/><path d="M12 4v4M9 13h.01M15 13h.01"/>',
  focus: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
  sort: '<path d="M7 4v16M3 16l4 4 4-4M17 20V4M13 8l4-4 4 4"/>',
  heading: '<path d="M6 4v16M18 4v16M6 12h12"/>',
  list2: '<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5-8 8"/>',
  bold: '<path d="M7 4h7a4 4 0 0 1 0 8H7zM7 12h8a4 4 0 0 1 0 8H7z"/>',
  hash: '<path d="M4 9h16M4 15h16M10 3 8 21M16 3l-2 18"/>',
  shield: '<path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z"/>',
  cloud: '<path d="M7 18a5 5 0 0 1-.9-9.9A6 6 0 0 1 18 9a4 4 0 0 1 1 7.9H7z"/>',
  upload: '<path d="M12 16V4M7 9l5-5 5 5M4 20h16"/>',
  graph: '<circle cx="6" cy="6" r="2.5"/><circle cx="18" cy="8" r="2.5"/><circle cx="12" cy="18" r="2.5"/><path d="m8 7 8 0M7.5 8 11 16M16 10l-3 6"/>',
  canvas: '<rect x="3" y="3" width="8" height="6" rx="1"/><rect x="13" y="12" width="8" height="8" rx="1"/><path d="M11 6h4a2 2 0 0 1 2 2v4"/>',
  table: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M3 15h18M9 4v16"/>',
  arrowUp: '<path d="m6 15 6-6 6 6"/>',
};
const icon = (n, cls = '') => `<svg class="ic ${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[n] || ICONS.file}</svg>`;

/* Empty-state line illustrations, token colours only */
const ART = {
  notes: '<rect x="30" y="18" width="80" height="54" rx="6"/><path d="M42 36h56M42 48h44M42 60h30"/>',
  search: '<circle cx="62" cy="44" r="20"/><path d="m77 59 16 16"/><path d="M54 44h16"/>',
  tasks: '<rect x="36" y="20" width="68" height="50" rx="8"/><path d="m48 44 6 6 10-12M68 46h22M48 62h42"/>',
  tags: '<path d="M30 40 60 14h40v38L70 78 30 40z"/><circle cx="84" cy="30" r="4"/>',
  agents: '<rect x="44" y="30" width="52" height="40" rx="10"/><path d="M70 22v8M60 48h.01M80 48h.01M56 60h28"/>',
  calendar: '<rect x="34" y="22" width="72" height="56" rx="6"/><path d="M34 40h72M52 16v12M88 16v12M50 54h8M66 54h8M82 54h8M50 66h8"/>',
};
const art = k => `<svg class="art" viewBox="0 0 140 96" aria-hidden="true">${ART[k] || ''}</svg>`;

/* Toasts: one at a time, 4s, optional Undo */
let _toastTimer = null, _toastUndo = null;
function toast(msg, o = {}) {
  const root = $('#toasts');
  _toastUndo = o.undo || null;
  root.innerHTML = `<div class="toast ${o.kind || ''}" role="status"><span>${esc(msg)}</span>${o.undo ? '<button class="linkbtn" data-a="toastUndo">Undo</button>' : ''}</div>`;
  requestAnimationFrame(() => root.firstElementChild && root.firstElementChild.classList.add('show'));
  clearTimeout(_toastTimer); _toastTimer = setTimeout(() => { root.innerHTML = ''; }, 4000);
}
ACT.toastUndo = () => { const f = _toastUndo; $('#toasts').innerHTML = ''; if (f) f(); };

/* Modals */
const MODALS = [];
function modal(o) {
  const scrim = document.createElement('div');
  scrim.className = 'scrim';
  const actions = o.actions || [];
  scrim.innerHTML = `<div class="dialog ${o.cls || ''}" role="dialog" aria-modal="true" aria-label="${esc(o.title)}" style="width:min(${o.width || 480}px,calc(100vw - 24px))">
    <header class="dlg-h"><h2>${esc(o.title)}</h2><button class="icon-btn" data-x aria-label="Close">${icon('x')}</button></header>
    <div class="dlg-b">${o.body || ''}</div>
    ${actions.length ? `<footer class="dlg-f">${actions.map((a, i) => `<button class="btn${a.primary ? ' primary' : ''}${a.danger ? ' danger' : ''}" data-i="${i}"${a.disabled ? ' disabled' : ''}>${esc(a.label)}</button>`).join('')}</footer>` : ''}
  </div>`;
  const rec = { el: scrim, root: scrim.querySelector('.dialog'), dismiss: o.dismiss !== false };
  rec.close = () => { if (!scrim.isConnected) return; scrim.remove(); MODALS.splice(MODALS.indexOf(rec), 1); if (o.onClose) o.onClose(); };
  scrim.addEventListener('click', e => {
    if (e.target === scrim && rec.dismiss) return rec.close();
    if (e.target.closest('[data-x]')) return rec.close();
    const b = e.target.closest('[data-i]');
    if (b && !b.disabled && b.closest('.dlg-f') && b.closest('.dialog') === rec.root) {
      const a = actions[+b.dataset.i];
      const r = a.fn ? a.fn(rec, e) : undefined;
      if (r !== false) rec.close();
    }
  });
  $('#overlays').appendChild(scrim); MODALS.push(rec);
  if (o.onMount) o.onMount(rec);
  setTimeout(() => { const f = rec.root.querySelector('input:not([disabled]),textarea,select') || rec.root.querySelector('.dlg-f .primary'); if (f) f.focus(); }, 30);
  return rec;
}
const topModal = () => MODALS[MODALS.length - 1];
function confirmDialog({ title, body, ok = 'Confirm', danger = false, fn }) {
  return modal({ title, width: 440, body: `<p class="lede">${body}</p>`, actions: [{ label: 'Cancel' }, { label: ok, primary: !danger, danger, fn }] });
}
function errorDialog({ title, cause, detail, action }) {
  const actions = [];
  if (action) actions.push({ label: action.label, primary: true, fn: action.fn });
  actions.push({ label: 'Close' });
  return modal({
    title, width: 460, cls: 'error-dialog', actions,
    body: `<div class="errrow">${icon('error', 'err-ic')}<p>${esc(cause)}</p></div>${detail ? `<details><summary>Technical detail</summary><pre>${esc(detail)}</pre></details>` : ''}`,
  });
}

/* Menus and popovers */
function closeMenus() { $$('.menu,.pop').forEach(m => m.remove()); }
function placeAt(el, anchor) {
  const r = anchor && anchor.getBoundingClientRect ? anchor.getBoundingClientRect() : anchor;
  const w = el.offsetWidth, h = el.offsetHeight;
  const left = Math.min(Math.max(8, r.left), innerWidth - w - 8);
  let top = r.bottom + 4;
  if (top + h > innerHeight - 8) top = Math.max(8, (r.top ?? r.bottom) - h - 4);
  el.style.left = left + 'px'; el.style.top = top + 'px';
}
function menu(anchor, items) {
  closeMenus();
  const el = document.createElement('div');
  el.className = 'menu'; el.setAttribute('role', 'menu');
  el.innerHTML = items.map((it, i) => it.sep ? '<hr>' : `<button class="mi${it.danger ? ' danger' : ''}" data-mm="${i}" role="menuitem"${it.disabled ? ' disabled' : ''}>${it.icon ? icon(it.icon) : '<span class="mi-ic"></span>'}<span class="mi-l">${esc(it.label)}${it.reason ? `<small>${esc(it.reason)}</small>` : ''}</span>${it.hint ? `<kbd>${esc(it.hint)}</kbd>` : ''}</button>`).join('');
  el._items = items;
  document.body.appendChild(el); placeAt(el, anchor);
  return el;
}
function pop(anchor, html, onMount) {
  closeMenus();
  const el = document.createElement('div');
  el.className = 'pop'; el.innerHTML = html;
  document.body.appendChild(el); placeAt(el, anchor);
  if (onMount) onMount(el);
  return el;
}

/* Global dispatch */
document.addEventListener('click', e => {
  const mm = e.target.closest('.menu [data-mm]');
  if (mm) { const it = mm.closest('.menu')._items[+mm.dataset.mm]; closeMenus(); if (it && it.fn) it.fn(); return; }
  if (!e.target.closest('.menu,.pop')) closeMenus();
  const a = e.target.closest('[data-a]');
  if (a && !a.disabled && ACT[a.dataset.a]) ACT[a.dataset.a](a, e);
});
document.addEventListener('input', e => { const f = e.target.dataset && e.target.dataset.inp; if (f && INP[f]) INP[f](e.target, e); });
document.addEventListener('change', e => { const f = e.target.dataset && e.target.dataset.ch; if (f && CHG[f]) CHG[f](e.target, e); });
document.addEventListener('contextmenu', e => {
  const c = e.target.closest('[data-ctx]');
  if (c && CTX[c.dataset.ctx]) { e.preventDefault(); closeMenus(); CTX[c.dataset.ctx](c, e); }
});

/* Keyboard helpers */
function comboOf(e) {
  if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return '';
  const parts = [];
  if (e.ctrlKey || e.metaKey) parts.push('Ctrl');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');
  parts.push(e.key.length === 1 ? e.key.toUpperCase() : e.key === ' ' ? 'Space' : e.key);
  return parts.join('+');
}

/* Utilities: diff and fuzzy */
function lineDiff(A, B) {
  const n = A.length, m = B.length, out = [];
  if (n * m > 4e6) return [...A.map(s => ({ t: 'del', s })), ...B.map(s => ({ t: 'add', s }))];
  const dp = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (A[i] === B[j]) { out.push({ t: 'eq', s: A[i] }); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) out.push({ t: 'del', s: A[i++] });
    else out.push({ t: 'add', s: B[j++] });
  }
  while (i < n) out.push({ t: 'del', s: A[i++] });
  while (j < m) out.push({ t: 'add', s: B[j++] });
  return out;
}
function fuzzy(q, s) {
  q = q.toLowerCase(); s = s.toLowerCase();
  let i = 0, score = 0, last = -2;
  for (let k = 0; k < s.length && i < q.length; k++) {
    if (s[k] === q[i]) { score += k === last + 1 ? 3 : 1; if (k === 0 || '/ -_.'.includes(s[k - 1])) score += 2; last = k; i++; }
  }
  return i === q.length ? score - s.length * 0.01 : -1;
}
