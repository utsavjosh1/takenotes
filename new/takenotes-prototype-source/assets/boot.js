/* Boot: keyboard routing, overlay keys, task keys, startup */
VIEWS.settings = () => settingsView();

const HK = {
  quickOpen: () => openQuick(),
  palette: () => openPalette(),
  search: () => openSearch(),
  newNote: () => newNote(),
  save: () => { const t = noteTab(); if (t) saveTab(t); },
  closeTab: () => closeTab(UI.active),
  reopenTab: () => reopenTab(),
  rename: () => { const t = noteTab(); if (t) { UI.renaming = t.path; renderAll(); setTimeout(() => { const i = $('#rename') || $('#title'); if (i) i.focus(); }, 30); } },
  find: () => { if (noteTab()) ACT.findBtn(); },
  rightPanel: () => toggleRight(),
  sidebar: () => toggleSidebar(),
  quickCapture: () => quickCapture(),
  settings: () => openView('settings'),
};
const isTyping = el => !!el && (el.matches('input,textarea,select') || el.isContentEditable);

function overlayKey(e) {
  const st = UI.pal || UI.qo; if (!st) return false;
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    const items = UI.pal ? UI.pal.items : UI.qo.items; const n = items.length || 1;
    st.i = (st.i + (e.key === 'ArrowDown' ? 1 : -1) + n) % n;
    UI.pal ? drawPalette() : drawQuick();
    const on = document.querySelector('.pal-item.on'); if (on) on.scrollIntoView({ block: 'nearest' });
    return true;
  }
  if (e.key === 'Enter') {
    e.preventDefault();
    if (UI.pal) { const it = UI.pal.items[UI.pal.i]; if (it && !it.disabled) { UI.pal.rec.close(); if (it.fn) it.fn(); } }
    else if (e.shiftKey) qoOpen({ create: true });
    else qoOpen(UI.qo.items[UI.qo.i]);
    return true;
  }
  return false;
}
function taskKey(e) {
  const tv = UI.tabs[UI.active];
  if (!tv || tv.type !== 'view' || tv.view !== 'tasks' || isTyping(e.target)) return false;
  const rows = $$('.trow[data-k]');
  if (!rows.length) return false;
  if (e.key === 'j' || e.key === 'k') {
    UI.tcur = Math.max(0, Math.min(rows.length - 1, UI.tcur + (e.key === 'j' ? 1 : -1)));
    rows.forEach(r => r.classList.toggle('cursor', +r.dataset.k === UI.tcur));
    rows[UI.tcur] && rows[UI.tcur].scrollIntoView({ block: 'nearest' });
    return true;
  }
  if (e.key === 'x') { const cb = rows[UI.tcur] && rows[UI.tcur].querySelector('.cbx'); if (cb) cb.click(); return true; }
  return false;
}

document.addEventListener('keydown', e => {
  if (UI.keyCapture) {
    e.preventDefault();
    if (e.key === 'Escape') { UI.keyCapture = null; return renderContent(); }
    const c = comboOf(e); if (!c) return;
    APP.hotkeys[UI.keyCapture] = c; UI.keyCapture = null; renderContent(); toast(`Shortcut set to ${c}`);
    return;
  }
  if (MODALS.length) {
    if (e.key === 'Escape') { const m = topModal(); if (m.dismiss) m.close(); return; }
    if (overlayKey(e)) return;
    if (e.target.id === 'capText' && e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (captureSave()) topModal().close(); return; }
    return;
  }
  if (e.target.id === 'ed' && edKey(e)) return;
  if (e.key === 'Escape') {
    closeMenus();
    if (UI.focus) toggleFocus();
    return;
  }
  if (UI.screen !== 'app') return;
  if (taskKey(e)) return;
  const c = comboOf(e); if (!c) return;
  if (isTyping(e.target) && !/Ctrl|Alt/.test(c) && c !== 'F2') return;
  for (const [name, combo] of Object.entries(APP.hotkeys)) {
    if (combo === c && HK[name]) { e.preventDefault(); HK[name](); return; }
  }
});

/* Startup */
(function init() {
  applySettings();
  if (isMobile()) { /* onboarding stays first on mobile */ }
  renderWelcome();
})();
window.addEventListener('resize', () => { if (UI.screen === 'app') renderAll(); });
