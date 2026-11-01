/* Shell: state, workspaces, tabs, explorer, chrome rendering, saving */
const UI = {
  screen: 'welcome', ws: 'dev-notes', tabs: [], active: -1, closedTabs: [],
  sb: true, sbView: 'explorer', rp: true, rpTab: 'backlinks', focus: false, trust: false,
  expanded: {}, sel: [], limit: {}, sort: { by: 'name', dir: 'asc' },
  mode: 'split', find: null, slash: null, selTool: null, loading: false,
  search: { q: '', ctx: 2, results: null, err: null, caseSens: false },
  qo: null, pal: null, updateBanner: true, jump: null, pendingSave: false,
  renaming: null, mTab: 'notes', mFolder: '', mEdit: false, capture: null, viewState: {},
  tagTab: 'tags', tagFlat: false, tagFilter: null, collView: null, graph: { orphans: true, depth: 3, tag: null },
  canvas: null, agentPill: true, hoverTimer: null, hoverPath: null, uDialog: null, capture2: null, keyCapture: null,
};
const WS = () => DB.ws[UI.ws];
const isReadOnly = (path, ws = UI.ws) => DB.ws[ws].readOnly.some(f => path.startsWith(f + '/'));
const disk = path => FS.read(UI.ws, path);
const tabOf = () => UI.tabs[UI.active] || null;
const noteTab = () => { const t = tabOf(); return t && t.type === 'note' ? t : null; };
const isDirty = t => t.buffer !== t.baseBody;
const pathsByName = () => {
  if (!linkIndex._ver || linkIndex._ver !== FS.ver || linkIndex._ws !== UI.ws) {
    const m = new Map();
    for (const p of FS.list(UI.ws)) m.set(basename(p).toLowerCase(), p);
    linkIndex._map = m; linkIndex._ver = FS.ver; linkIndex._ws = UI.ws;
  }
  return linkIndex._map;
};
function linkIndex() { return pathsByName(); }
const resolveLink = name => pathsByName().get(name.trim().toLowerCase()) || null;
const tagsOf = body => [...new Set((body.match(/(^|\s)#([A-Za-z][\w/-]*)/g) || []).map(x => x.trim().slice(1).toLowerCase()))];
const linksOf = body => [...new Set([...body.matchAll(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g)].map(m => m[1].trim()))];
const frontmatter = body => {
  const L = body.split('\n');
  if (L[0] !== '---') return { props: [], end: 0, bad: [] };
  const end = L.indexOf('---', 1);
  if (end < 0) return { props: [], end: 0, bad: ['Frontmatter is not closed with ---'] };
  const props = [], bad = [];
  for (let i = 1; i < end; i++) {
    const m = L[i].match(/^([\w-]+):\s?(.*)$/);
    if (m) props.push({ key: m[1], val: m[2], line: i }); else if (L[i].trim()) bad.push(`Line ${i + 1} is not "key: value": ${L[i]}`);
  }
  return { props, end: end + 1, bad };
};
const propType = (k, v) => {
  if (k === 'tags') return 'tags';
  if (/^(true|false)$/.test(v)) return 'checkbox';
  if (/^\d{4}-\d{2}-\d{2}/.test(v)) return 'date';
  if (/^-?\d+(\.\d+)?$/.test(v)) return 'number';
  if (v.startsWith('[')) return 'list';
  return 'text';
};

/* Workspaces */
function enterWorkspace(id) {
  UI.ws = id; UI.screen = 'app'; UI.tabs = []; UI.active = -1; UI.closedTabs = []; UI.sel = []; UI.find = null; UI.jump = null;
  UI.loading = true; renderAll();
  setTimeout(() => { UI.loading = false; renderAll(); }, 350);
  const rec = APP.settings && APP.recents; if (rec) { const i = rec.indexOf(id); if (i > -1) rec.splice(i, 1); rec.unshift(id); }
  if (APP.settings.startView === 'today' && !UI.tabs.length) openView('today');
  else if (!UI.tabs.length) { const first = Object.keys(WS().files).find(p => p.startsWith('Projects/')) || FS.list(id)[0]; if (first) openNote(first); }
}
function switchWorkspace(id) {
  if (id === UI.ws) return;
  const dirtyTabs = UI.tabs.filter(t => t.type === 'note' && isDirty(t));
  const go = () => { closeMenus(); enterWorkspace(id); toast(`Switched to ${DB.ws[id].name}`); };
  if (!dirtyTabs.length) return go();
  modal({
    title: 'Unsaved changes', width: 440,
    body: `<p class="lede">${plural(dirtyTabs.length, 'open note')} ${dirtyTabs.length === 1 ? 'has' : 'have'} unsaved changes. Save them before switching workspace?</p>`,
    actions: [{ label: 'Cancel' }, { label: 'Discard and switch', danger: true, fn: () => go() }, { label: 'Save and switch', primary: true, fn: () => { dirtyTabs.forEach(t => saveTab(t)); go(); } }],
  });
}

/* Tabs */
function openView(id) {
  const i = UI.tabs.findIndex(t => t.type === 'view' && t.view === id);
  if (i > -1) UI.active = i; else { UI.tabs.push({ type: 'view', view: id, pinned: false }); UI.active = UI.tabs.length - 1; }
  renderAll();
}
function openNote(path, opts = {}) {
  const d = disk(path);
  if (!d) return toast('That file no longer exists');
  let i = UI.tabs.findIndex(t => t.type === 'note' && t.path === path);
  if (i < 0) {
    UI.tabs.push({ type: 'note', path, buffer: d.body, baseBody: d.body, base: d.rev, pinned: false, conflict: null, missing: false, timer: null, agentAt: null, marks: [] });
    i = UI.tabs.length - 1;
  }
  UI.active = i; UI.find = null; UI.jump = opts.line ?? null;
  if (opts.line != null && UI.search.results) { /* keep search results visible */ }
  renderAll();
  if (opts.line != null) setTimeout(() => jumpToLine(opts.line), 40);
}
function closeTab(i) {
  const t = UI.tabs[i]; if (!t) return;
  if (t.type === 'note' && isDirty(t) && APP.settings.autosave !== 'on') {
    return modal({
      title: 'Unsaved changes', width: 440, body: `<p class="lede">${esc(basename(t.path))} has unsaved changes.</p>`,
      actions: [{ label: 'Cancel' }, { label: 'Discard', danger: true, fn: () => doCloseTab(i, false) }, { label: 'Save and close', primary: true, fn: () => doCloseTab(i, true) }],
    });
  }
  doCloseTab(i, true);
}
function doCloseTab(i, save) {
  const t = UI.tabs[i]; if (!t) return;
  if (save && t.type === 'note') saveTab(t);
  UI.closedTabs.push({ ...t, buffer: undefined });
  UI.tabs.splice(i, 1);
  if (UI.active === i) UI.active = Math.min(i, UI.tabs.length - 1);
  else if (UI.active > i) UI.active--;
  renderAll();
}
function reopenTab() {
  const t = UI.closedTabs.pop();
  if (!t) return toast('No recently closed tab');
  if (t.type === 'note') { if (!disk(t.path)) return reopenTab(); openNote(t.path); }
  else openView(t.view);
}
function pinTab(i) {
  const t = UI.tabs[i]; t.pinned = !t.pinned;
  const cur = UI.tabs[UI.active];
  UI.tabs.sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));
  UI.active = UI.tabs.indexOf(cur);
  renderAll();
}

/* Saving */
const STATE = {
  saved: ['Saved', 'File is up to date on disk'], saving: ['Saving…', 'Writing to disk'], dirty: ['Unsaved changes', 'Edits not yet written to disk'],
  conflict: ['Conflict', 'The file changed on disk while you have unsaved edits'], readonly: ['Read-only', 'This folder is read-only in this workspace'],
  missing: ['File missing', 'The file was deleted outside takenotes'], disconnected: ['Disconnected', 'WSL connection lost. Changes are kept in the editor'],
};
function saveState(t) {
  if (!t || t.type !== 'note') return null;
  if (WS().conn === 'offline') return 'disconnected';
  if (t.missing) return 'missing';
  if (t.conflict) return 'conflict';
  if (isReadOnly(t.path)) return 'readonly';
  if (t.saving) return 'saving';
  return isDirty(t) ? 'dirty' : 'saved';
}
function snapshot(path, body, label) {
  const w = WS(); w.snaps[path] = w.snaps[path] || [];
  const list = w.snaps[path];
  if (label === 'Auto') {
    if (list[0] && list[0].body === body) return;
    if (list[0] && Date.now() - list[0].at < 60 * 1000) return;
  }
  list.unshift({ id: uid(), at: Date.now(), label, body });
}
function saveTab(t) {
  if (!t || t.type !== 'note' || !disk(t.path)) return;
  if (!isDirty(t)) return;
  if (t.missing) return;
  const d = disk(t.path);
  if (d.rev !== t.base) { t.conflict = { at: Date.now() }; return renderAll(); }
  if (t.conflict) return toast('Resolve the conflict before saving');
  try {
    snapshot(t.path, d.body, 'Auto');
    FS.write(UI.ws, t.path, t.buffer);
    t.base = disk(t.path).rev; t.baseBody = t.buffer;
    UI.pendingSave = false;
  } catch (e) {
    if (e.code === 'OFFLINE') { UI.pendingSave = true; }
    else if (e.code === 'EACCES') errorDialog({ title: 'Can’t save this file', cause: 'This folder is read-only in this workspace, so your changes could not be written. Your text is still in the editor.', detail: e.message, action: { label: 'Copy to new note', fn: () => copyToNewNote(t) } });
    else errorDialog({ title: 'Save failed', cause: 'takenotes could not write this file.', detail: e.message });
  }
  renderAll();
}
function scheduleAutosave(t) {
  clearTimeout(t.timer);
  if (APP.settings.autosave !== 'on') return;
  t.timer = setTimeout(() => saveTab(t), APP.settings.autosaveDelay);
}
function copyToNewNote(t) {
  const name = `${basename(t.path)} (recovered)`;
  const p = `${APP.settings.newNoteFolder}/${name}.md`;
  FS.write(UI.ws, p, t.buffer);
  openNote(p);
  toast('Copied to a new note');
}
function flushOffline() {
  WS().conn = 'online';
  UI.tabs.forEach(t => { if (t.type === 'note' && isDirty(t)) saveTab(t); });
  toast('Reconnected. Pending changes saved.');
  renderAll();
}

/* Explorer helpers */
function folderList(ws = UI.ws) {
  const set = new Set(DB.ws[ws].folders || []);
  for (const p of FS.list(ws)) { let d = dirname(p); while (d) { set.add(d); d = dirname(d); } }
  return [...set].sort();
}
function newNote(folder) {
  folder = folder ?? APP.settings.newNoteFolder;
  let n = 'Untitled', k = 1;
  while (FS.read(UI.ws, `${folder}/${n}.md`)) n = `Untitled ${++k}`;
  const p = `${folder}/${n}.md`;
  FS.write(UI.ws, p, '');
  UI.expanded[folder] = true;
  openNote(p);
  renderAll();
  setTimeout(() => { const i = $('#title'); if (i) { i.focus(); i.select(); } }, 40);
}
function validateName(name, from) {
  const n = name.trim();
  if (!n) return 'Name can’t be empty.';
  if (/[\/\\]/.test(n)) return 'Names can’t contain / or \\.';
  if (/[<>:"|?*]/.test(n)) return 'Names can’t contain < > : " | ? *.';
  const target = `${dirname(from)}/${n}.md`.replace(/^\//, '');
  if (target !== from && FS.read(UI.ws, target)) return 'A file with this name already exists in this folder.';
  return null;
}
function renameNote(from, name) {
  const to = (dirname(from) ? dirname(from) + '/' : '') + name.trim() + '.md';
  if (to === from) { UI.renaming = null; return renderAll(); }
  const oldTitle = basename(from), newTitle = name.trim();
  const refs = FS.list(UI.ws).filter(p => p !== from && linksOf(disk(p).body).some(l => l.toLowerCase() === oldTitle.toLowerCase()));
  const apply = () => {
    const body = FS.read(UI.ws, from).body;
    FS.write(UI.ws, to, body); FS.remove(UI.ws, from);
    const re = new RegExp(`\\[\\[${oldTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\|[^\\]]+)?\\]\\]`, 'gi');
    let count = 0;
    if (APP.settings.autoLinks || refs.length === 0 || true) refs.forEach(p => {
      const b = disk(p).body;
      const nb = b.replace(re, (m, a) => { count++; return `[[${newTitle}${a || ''}]]`; });
      if (nb !== b) FS.write(UI.ws, p, nb);
    });
    UI.tabs.forEach(t => { if (t.type === 'note' && t.path === from) { t.path = to; t.buffer = FS.read(UI.ws, to).body; t.baseBody = t.buffer; t.base = FS.read(UI.ws, to).rev; } });
    UI.renaming = null;
    if (count) toast(`Renamed. Updated ${plural(count, 'link')} in ${plural(refs.length, 'note')}.`);
    renderAll();
  };
  if (!refs.length) return apply();
  if (APP.settings.autoLinks) return apply();
  const preview = refs.map(p => `<li>${esc(p)}</li>`).join('');
  modal({
    title: 'Rename and update links', width: 500,
    body: `<p class="lede">Updating links in ${plural(refs.length, 'note')} from <b>${esc(oldTitle)}</b> to <b>${esc(newTitle)}</b>.</p><ul class="plain-list">${preview}</ul>
      <label class="check"><input type="checkbox" data-ch="setAutoLinks"> Always update links when renaming</label>`,
    actions: [{ label: 'Cancel', fn: () => { UI.renaming = null; renderAll(); } }, { label: 'Rename and update', primary: true, fn: apply }],
  });
}
function moveFile(from, toFolder) {
  const name = basename(from);
  const to = (toFolder ? toFolder + '/' : '') + name + '.md';
  if (to === from) return;
  if (FS.read(UI.ws, to)) return errorDialog({ title: 'Can’t move file', cause: `A file named “${name}.md” already exists in ${toFolder || 'the workspace root'}.`, detail: `EEXIST: ${to}` });
  if (isReadOnly(to)) return errorDialog({ title: 'Can’t move file', cause: 'The destination folder is read-only in this workspace.', detail: `EACCES: ${to}` });
  const body = FS.read(UI.ws, from).body;
  FS.write(UI.ws, to, body); FS.remove(UI.ws, from);
  UI.tabs.forEach(t => { if (t.type === 'note' && t.path === from) t.path = to; });
  toast(`Moved to ${toFolder || 'root'}`);
  renderAll();
}
function trashPath(path) {
  const d = disk(path); const w = WS();
  const permanent = w.kind === 'WSL' || w.kind === 'Server' || APP.settings.trashMode !== 'native';
  const doit = () => {
    if (permanent) { FS.remove(UI.ws, path); }
    else { w.trash.unshift({ path, body: d.body, deleted: Date.now(), perm: false }); FS.remove(UI.ws, path); }
    UI.tabs = UI.tabs.filter(t => !(t.type === 'note' && t.path === path));
    UI.active = Math.min(UI.active, UI.tabs.length - 1);
    renderAll();
    if (!permanent) toast(`Moved “${basename(path)}” to Trash`, { undo: () => { const it = w.trash.find(x => x.path === path); if (it) { FS.write(UI.ws, path, it.body); w.trash.splice(w.trash.indexOf(it), 1); renderAll(); } } });
    else toast(`Deleted “${basename(path)}” permanently`);
  };
  if (permanent) {
    confirmDialog({ title: 'Delete permanently?', body: `${esc(basename(path))} will be deleted. ${w.kind === 'WSL' ? 'This workspace is on WSL, which has no Trash, so the file cannot be recovered from Trash.' : 'This cannot be undone.'}`, ok: 'Delete permanently', danger: true, fn: doit });
  } else doit();
}
function trashFolder(folder) {
  const items = FS.list(UI.ws).filter(p => p.startsWith(folder + '/'));
  const shown = items.slice(0, 10).map(p => `<li>${esc(p)}</li>`).join('');
  modal({
    title: `Delete folder “${basename(folder)}”?`, width: 480,
    body: `<p class="lede">This removes ${plural(items.length, 'file')} inside ${esc(folder)}. Subfolders are removed too.</p><ul class="plain-list">${shown}${items.length > 10 ? `<li>and ${items.length - 10} more</li>` : ''}</ul>`,
    actions: [{ label: 'Cancel' }, { label: 'Delete folder', danger: true, fn: () => { items.forEach(p => { const d = disk(p); WS().trash.unshift({ path: p, body: d.body, deleted: Date.now(), perm: WS().kind !== 'Windows' && WS().kind !== 'macOS' }); FS.remove(UI.ws, p); }); WS().folders = (WS().folders || []).filter(f => !f.startsWith(folder)); UI.tabs = UI.tabs.filter(t => !(t.type === 'note' && t.path.startsWith(folder + '/'))); UI.active = Math.min(UI.active, UI.tabs.length - 1); renderAll(); toast(`Folder deleted (${plural(items.length, 'file')})`); } }],
  });
}

/* Chrome rendering */
function renderAll() {
  if (UI.screen !== 'app') return;
  const m = isMobile();
  const app = $('#app');
  app.hidden = false; $('#screen').hidden = true;
  app.classList.toggle('sb-closed', !UI.sb || m);
  app.classList.toggle('rp-closed', !UI.rp || m);
  app.classList.toggle('focus', UI.focus && !m);
  app.classList.toggle('is-mobile', m);
  renderTitlebar(); renderRibbon(); renderSidebar(); renderTabs(); renderContent(); renderRight(); renderStatus(); renderTrust();
  renderTabbar();
}
function renderTitlebar() {
  const w = WS();
  $('#titlebar').innerHTML = `
    <div class="brand">take<i>notes</i></div>
    <button class="ws-switch" data-a="wsMenu" aria-haspopup="menu" title="Switch workspace">
      <span class="kind kind-${w.kind.toLowerCase()}">${esc(w.kind)}</span><span>${esc(w.name)}</span>${icon('chevD', 'sm')}
    </button>
    <button class="searchpill" data-a="quickOpen" title="Quick Open (${esc(APP.hotkeys.quickOpen)})">${icon('search', 'sm')}<span>Search files…</span><kbd>${esc(APP.hotkeys.quickOpen)}</kbd></button>
    <span class="grow"></span>
    <button class="icon-btn" data-a="openPalette" title="Command Palette (${esc(APP.hotkeys.palette)})" aria-label="Command Palette">${icon('command')}</button>
    <button class="btn primary sm" data-a="newNoteBtn" title="New note (${esc(APP.hotkeys.newNote)})">${icon('plus', 'sm')} New</button>`;
}
function renderRibbon() {
  const on = id => UI.sb && UI.sbView === id ? ' on' : '';
  const view = id => { const t = tabOf(); return t && t.type === 'view' && t.view === id ? ' on' : ''; };
  const b = (cls, ic, label, attr) => `<button class="rb${cls}" ${attr} title="${label}" aria-label="${label}">${icon(ic)}</button>`;
  $('#ribbon').innerHTML = [
    b(on('explorer'), 'folder', 'Explorer', 'data-a="sbView" data-id="explorer"'),
    b(on('search'), 'search', 'Search (' + APP.hotkeys.search + ')', 'data-a="sbView" data-id="search"'),
    b(on('favorites'), 'star', 'Favorites', 'data-a="sbView" data-id="favorites"'),
    b(view('today'), 'today', 'Today', 'data-a="openViewBtn" data-id="today"'),
    b(view('calendar'), 'calendar', 'Calendar', 'data-a="openViewBtn" data-id="calendar"'),
    b(view('tags'), 'tag', 'Tags and properties', 'data-a="openViewBtn" data-id="tags"'),
    b(view('tasks'), 'tasks', 'Tasks', 'data-a="openViewBtn" data-id="tasks"'),
    b(on('outline'), 'outline', 'Outline (right panel)', 'data-a="rpTab" data-id="outline"'),
    `<span class="grow"></span>`,
    b(view('settings'), 'gear', 'Settings', 'data-a="openViewBtn" data-id="settings"'),
    b('', 'keyboard', 'Command Palette', 'data-a="openPalette"'),
  ].join('');
}
ACT.openViewBtn = el => { if (el.dataset.id === 'today' || el.dataset.id === 'calendar' || el.dataset.id === 'tags' || el.dataset.id === 'tasks' || el.dataset.id === 'settings') openView(el.dataset.id); };
ACT.sbView = el => { if (UI.sb && UI.sbView === el.dataset.id) UI.sb = false; else { UI.sb = true; UI.sbView = el.dataset.id; } renderAll(); };
ACT.rpTab = el => { UI.rp = true; UI.rpTab = el.dataset.id; renderAll(); };
ACT.newNoteBtn = () => newNote();
ACT.wsMenu = el => {
  const items = DB.order.map(id => ({ label: DB.ws[id].name + (id === UI.ws ? '  ✓' : ''), reason: `${DB.ws[id].kind} · ${DB.ws[id].path}`, icon: 'folder', fn: () => switchWorkspace(id) }));
  menu(el, [
    ...items,
    { sep: true },
    { label: 'Open folder…', icon: 'folder', fn: () => openFolderDialog() },
    { label: 'Open WSL folder…', icon: 'terminal', fn: () => wslWizard() },
    { label: 'Create workspace…', icon: 'plus', fn: () => createWorkspaceDialog() },
    { label: 'Manage workspaces and connections', icon: 'plug', fn: () => openView('settings') },
    { sep: true },
    { label: 'Close workspace', icon: 'x', danger: true, fn: () => closeWorkspace() },
  ]);
};
function closeWorkspace() {
  confirmDialog({ title: 'Close workspace?', body: `${esc(WS().name)} will close. Open tabs close with it.`, ok: 'Close workspace', danger: true, fn: () => { UI.screen = 'welcome'; UI.tabs = []; renderWelcome(); } });
}
function renderSidebar() {
  const sb = $('#sidebar');
  if (!UI.sb || isMobile()) { sb.innerHTML = ''; return; }
  const titles = { explorer: 'Files', search: 'Search', favorites: 'Favorites' };
  let body = '';
  if (UI.loading) body = `<div class="skeleton">${'<i></i>'.repeat(9)}</div>`;
  else if (UI.sbView === 'explorer') body = treeHTML();
  else if (UI.sbView === 'search') body = searchPanelHTML();
  else body = favoritesHTML();
  sb.innerHTML = `<div class="sb-head">
      <span class="sb-title">${titles[UI.sbView] || 'Files'}</span><span class="grow"></span>
      ${UI.sbView === 'explorer' ? `<button class="icon-btn" data-a="sortMenu" title="Sort" aria-label="Sort">${icon('sort', 'sm')}</button>
      <button class="icon-btn" data-a="newNoteBtn" title="New note" aria-label="New note">${icon('plus', 'sm')}</button>
      <button class="icon-btn" data-a="newFolder" title="New folder" aria-label="New folder">${icon('folder', 'sm')}</button>` : ''}

    </div>
    <div class="sb-body" data-drop-root="1">${body}</div>
    <div class="sb-foot">${plural(FS.list(UI.ws).length, 'file')} · ${esc(WS().name)}</div>`;
}
ACT.closeSidebar = () => { UI.sb = false; renderAll(); };
ACT.expandAll = () => { folderList().forEach(f => UI.expanded[f] = true); renderSidebar(); };
ACT.collapseAll = () => { folderList().forEach(f => UI.expanded[f] = false); renderSidebar(); };
ACT.newFolder = () => {
  const r = modal({
    title: 'New folder', width: 420,
    body: `<label class="field"><span>Folder name</span><input data-inp="folderName" id="fname" autocomplete="off"></label><p class="err" id="ferr" hidden></p>`,
    actions: [{ label: 'Cancel' }, { label: 'Create', primary: true, fn: rec => {
      const n = rec.root.querySelector('#fname').value.trim();
      const e = rec.root.querySelector('#ferr');
      if (!n || /[\/\\:*?"<>|]/.test(n)) { e.hidden = false; e.textContent = 'Use a plain folder name without / \\ : * ? " < > |'; return false; }
      if (folderList().includes(n)) { e.hidden = false; e.textContent = 'That folder already exists.'; return false; }
      WS().folders = [...(WS().folders || []), n]; UI.expanded[n] = true; renderAll();
    } }],
  });
};
ACT.sortMenu = el => menu(el, [
  { label: 'Name', icon: 'sort', fn: () => { UI.sort = { by: 'name', dir: UI.sort.dir }; renderSidebar(); } },
  { label: 'Modified', icon: 'sort', fn: () => { UI.sort = { by: 'mtime', dir: 'desc' }; renderSidebar(); } },
  { label: 'Created', icon: 'sort', fn: () => { UI.sort = { by: 'created', dir: 'desc' }; renderSidebar(); } },
  { sep: true },
  { label: UI.sort.dir === 'asc' ? 'Descending' : 'Ascending', icon: 'chevD', fn: () => { UI.sort.dir = UI.sort.dir === 'asc' ? 'desc' : 'asc'; renderSidebar(); } },
]);
function treeHTML() {
  const files = FS.list(UI.ws);
  if (!files.length && !folderList().length) return `<div class="emptyside">${art('notes')}<p>No notes in this workspace yet.</p><button class="btn primary sm" data-a="newNoteBtn">New note</button></div>`;
  const tree = { folders: {}, files: [] };
  for (const f of folderList()) { let node = tree; let acc = ''; for (const part of f.split('/')) { acc = acc ? acc + '/' + part : part; node.folders[part] = node.folders[part] || { folders: {}, files: [], path: acc }; node = node.folders[part]; } }
  const insert = p => {
    const parts = p.split('/'); let node = tree; let acc = '';
    for (let i = 0; i < parts.length - 1; i++) { acc = acc ? acc + '/' + parts[i] : parts[i]; node.folders[parts[i]] = node.folders[parts[i]] || { folders: {}, files: [], path: acc }; node = node.folders[parts[i]]; }
    node.files.push(p);
  };
  files.forEach(insert);
  const cmpFiles = (a, b) => {
    const da = disk(a), db = disk(b);
    const dir = UI.sort.dir === 'asc' ? 1 : -1;
    if (UI.sort.by === 'name') return basename(a).localeCompare(basename(b)) * dir;
    if (UI.sort.by === 'mtime') return (da.mtime - db.mtime) * (UI.sort.dir === 'asc' ? 1 : -1);
    return (da.created > db.created ? 1 : -1) * (UI.sort.dir === 'asc' ? 1 : -1);
  };
  const row = (path, depth) => {
    const active = tabOf() && tabOf().type === 'note' && tabOf().path === path;
    const selected = UI.sel.includes(path);
    if (UI.renaming === path) {
      return `<div class="row file renaming" style="--d:${depth}"><span class="ico">${icon('file', 'sm')}</span><input id="rename" data-inp="renameInp" data-path="${esc(path)}" value="${esc(basename(path))}" aria-label="Rename"><span class="renerr" id="renerr"></span></div>`;
    }
    const ro = isReadOnly(path) ? `<span class="lock" title="Read-only folder">${icon('lock', 'xs')}</span>` : '';
    return `<div class="row file${active ? ' active' : ''}${selected ? ' sel' : ''}" style="--d:${depth}" data-a="rowOpen" data-path="${esc(path)}" data-ctx="file" data-drag="${esc(path)}" draggable="true" role="treeitem" tabindex="0">
      <span class="ico">${icon('file', 'sm')}</span><span class="nm">${esc(basename(path))}</span>${ro}</div>`;
  };
  const folderRow = (f, depth, name) => {
    const open = UI.expanded[f.path] ?? (countIn(f.path) <= 40);
    const children = Object.values(f.folders).sort((a, b) => a.path.localeCompare(b.path));
    let html = `<div class="row folder" style="--d:${depth}" data-a="folderToggle" data-path="${esc(f.path)}" data-ctx="folder" data-drop="${esc(f.path)}" role="treeitem" aria-expanded="${open}">
      ${icon(open ? 'chevD' : 'chevR', 'xs')}${icon('folder', 'sm')}<span class="nm">${esc(name)}</span><span class="count">${countIn(f.path)}</span></div>`;
    if (open) {
      for (const c of children) html += folderRow(c, depth + 1, c.path.split('/').pop());
      const list = f.files.sort(cmpFiles);
      const lim = UI.limit[f.path] || 200;
      list.slice(0, lim).forEach(p => { html += row(p, depth + 1); });
      if (list.length > lim) html += `<div class="row notice" style="--d:${depth + 1}"><span>Showing ${lim} of ${list.length.toLocaleString('en-US')} files in this folder.</span><button class="linkbtn" data-a="showMore" data-path="${esc(f.path)}">Show more</button></div>`;
      if (!children.length && !f.files.length) html += `<div class="row empty-row" style="--d:${depth + 1}">Empty folder</div>`;
    }
    return html;
  };
  const countIn = p => FS.list(UI.ws).filter(x => x.startsWith(p + '/')).length;
  let html = '';
  for (const c of Object.values(tree.folders).sort((a, b) => a.path.localeCompare(b.path))) html += folderRow(c, 0, c.path.split('/').pop());
  for (const p of tree.files.sort(cmpFiles)) html += row(p, 0);
  return `<div class="tree" role="tree" data-drop="">${html}</div>`;
}
ACT.showMore = el => { UI.limit[el.dataset.path] = (UI.limit[el.dataset.path] || 200) + 400; renderSidebar(); };
ACT.folderToggle = el => {
  const p = el.dataset.path;
  if (UI.sel.length && false) return;
  UI.expanded[p] = !(UI.expanded[p] ?? (FS.list(UI.ws).filter(x => x.startsWith(p + '/')).length <= 40));
  renderSidebar();
};
ACT.rowOpen = (el, e) => {
  const p = el.dataset.path;
  if (e.ctrlKey || e.metaKey) { UI.sel = UI.sel.includes(p) ? UI.sel.filter(x => x !== p) : [...UI.sel, p]; return renderSidebar(); }
  if (e.shiftKey && UI.sel.length) { const all = FS.list(UI.ws).sort(); const a = all.indexOf(UI.sel[UI.sel.length - 1]), b = all.indexOf(p); UI.sel = all.slice(Math.min(a, b), Math.max(a, b) + 1); return renderSidebar(); }
  UI.sel = [];
  openNote(p);
};
INP.renameInp = (el) => {
  const from = el.dataset.path;
  const err = validateName(el.value, from);
  const box = $('#renerr'); if (box) box.textContent = err || '';
  el.classList.toggle('invalid', !!err);
  el._err = err;
};
document.addEventListener('keydown', e => {
  if (e.target.id === 'rename') {
    if (e.key === 'Enter') { e.preventDefault(); const from = e.target.dataset.path; if (validateName(e.target.value, from)) return; renameNote(from, e.target.value); }
    if (e.key === 'Escape') { e.preventDefault(); UI.renaming = null; renderAll(); }
  }
});
/* Drag to move files into folders */
document.addEventListener('dragstart', e => { const r = e.target.closest('[data-drag]'); if (r) { e.dataTransfer.setData('text/plain', r.dataset.drag); e.dataTransfer.effectAllowed = 'move'; } });
document.addEventListener('dragover', e => { const d = e.target.closest('[data-drop]'); if (d) { e.preventDefault(); $$('.drop-target').forEach(x => x.classList.remove('drop-target')); d.classList.add('drop-target'); } });
document.addEventListener('dragleave', e => { const d = e.target.closest('[data-drop]'); if (d) d.classList.remove('drop-target'); });
document.addEventListener('drop', e => {
  const d = e.target.closest('[data-drop]'); if (!d) return;
  e.preventDefault(); $$('.drop-target').forEach(x => x.classList.remove('drop-target'));
  const from = e.dataTransfer.getData('text/plain'); if (!from) return;
  moveFile(from, d.dataset.drop);
});
CTX.file = (el) => {
  const p = el.dataset.path;
  const ro = isReadOnly(p);
  menu(el, [
    { label: 'Open', icon: 'file', hint: 'Enter', fn: () => openNote(p) },
    { label: 'Open in new tab', hint: 'Ctrl+Enter', fn: () => openNote(p) },
    { label: 'Rename', icon: 'edit', hint: APP.hotkeys.rename, disabled: ro, reason: ro ? 'Read-only folder' : '', fn: () => { UI.renaming = p; renderAll(); setTimeout(() => { const i = $('#rename'); if (i) { i.focus(); i.select(); } }, 30); } },
    { label: 'Add to Favorites', icon: 'star', fn: () => { WS().favs.push({ type: 'file', path: p }); renderAll(); toast('Added to Favorites'); } },
    { label: 'Copy path', icon: 'copy', fn: () => toast(`Copied ${WS().path}/${p}`) },
    { label: 'Reveal in File Explorer', icon: 'eye', fn: () => toast('Revealed in File Explorer') },
    { sep: true },
    { label: 'Move to trash', icon: 'trash', danger: true, hint: 'Del', reason: WS().kind === 'WSL' ? 'Permanent on WSL' : '', fn: () => trashPath(p) },
  ]);
};
CTX.folder = (el) => {
  const f = el.dataset.path;
  menu(el, [
    { label: 'New note here', icon: 'plus', fn: () => newNote(f) },
    { label: 'New folder inside', icon: 'folder', fn: () => { ACT.newFolder(); } },
    { label: 'Add to Favorites', icon: 'star', fn: () => { WS().favs.push({ type: 'folder', path: f }); renderAll(); toast('Added to Favorites'); } },
    { sep: true },
    { label: 'Delete folder', icon: 'trash', danger: true, fn: () => trashFolder(f) },
  ]);
};
CTX.tab = (el) => {
  const i = +el.dataset.idx; const t = UI.tabs[i];
  menu(el, [
    { label: t.pinned ? 'Unpin tab' : 'Pin tab', icon: 'pin', fn: () => pinTab(i) },
    { label: 'Close tab', hint: APP.hotkeys.closeTab, fn: () => closeTab(i) },
    { label: 'Close other tabs', fn: () => { UI.tabs = UI.tabs.filter((x, k) => k === i); UI.active = 0; renderAll(); } },
    { label: 'Reopen closed tab', hint: APP.hotkeys.reopenTab, fn: () => reopenTab() },
  ]);
};
CTX.favs = el => {};
ACT.tabOpen = (el, e) => { UI.active = +el.dataset.idx; renderAll(); };
ACT.tabClose = (el, e) => { e.stopPropagation(); closeTab(+el.dataset.idx); };
ACT.tabPinToggle = (el) => pinTab(+el.dataset.idx);
ACT.tabsOverflow = el => menu(el, UI.tabs.map((t, i) => ({ label: t.type === 'note' ? basename(t.path) : VIEW_NAMES[t.view], icon: t.type === 'note' ? 'file' : 'bolt', fn: () => { UI.active = i; renderAll(); } })));
const VIEW_NAMES = { today: 'Today', tasks: 'Tasks', calendar: 'Calendar', tags: 'Tags', collections: 'Collections', favorites: 'Favorites', trash: 'Trash', graph: 'Graph (Later)', canvas: 'Canvas (Later)', settings: 'Settings' };

function renderTabs() {
  const el = $('#tabs');
  if (isMobile()) { el.innerHTML = ''; return; }
  const max = 8;
  const visible = UI.tabs.map((t, i) => ({ t, i }));
  const shown = visible.slice(0, max);
  const hidden = visible.length - shown.length;
  el.innerHTML = shown.map(({ t, i }) => {
    const label = t.type === 'note' ? basename(t.path) : VIEW_NAMES[t.view];
    const dirty = t.type === 'note' && isDirty(t) ? '<i class="dirty" title="Unsaved changes"></i>' : '';
    const conf = t.type === 'note' && t.conflict ? `<i class="conflict" title="Conflict with disk">${icon('warn', 'xs')}</i>` : '';
    return `<div class="tab${i === UI.active ? ' active' : ''}${t.pinned ? ' pinned' : ''}" role="tab" data-a="tabOpen" data-idx="${i}" data-ctx="tab" title="${esc(t.type === 'note' ? t.path : label)}">
      ${t.pinned ? icon('pin', 'xs') : ''}<span class="tl">${esc(label)}</span>${dirty}${conf}
      ${t.pinned ? '' : `<button class="x" data-a="tabClose" data-idx="${i}" aria-label="Close ${esc(label)}">${icon('x', 'xs')}</button>`}
    </div>`;
  }).join('') + (hidden > 0 ? `<button class="tab-more" data-a="tabsOverflow">+${hidden}</button>` : '') + (UI.tabs.length > max ? '' : '');
}
function renderStatus() {
  const t = noteTab(); const st = saveState(t);
  const w = WS();
  const conn = w.conn === 'offline' ? 'bad' : 'ok';
  const connText = w.conn === 'offline' ? 'Disconnected' : (w.kind === 'WSL' ? `WSL · ${w.distro}` : w.kind === 'Server' ? 'Server · online' : 'Local');
  const save = st ? `<span class="savepill ${st}" title="${esc(STATE[st][1])}">${st === 'saving' ? '<i class="spin"></i>' : '<i class="dot"></i>'}${esc(STATE[st][0])}</span>` : '';
  const changes = UI.agentPill ? DB_agentPending() : [];
  const agent = changes.length ? `<button class="agentpill" data-a="agentTray">${icon('bot', 'xs')} claude-code edited ${plural(changes.length, 'note')}</button>` : '';
  const upd = UI.updateBanner && APP.update.available ? `<button class="updbanner" data-a="updateDialog">Update ${esc(APP.update.available)} available · Review</button>` : '';
  const words = t && t.type === 'note' ? plural(wordCount(t.buffer), 'word') : '';
  $('#status').innerHTML = `
    <span class="st-l"><span class="conn ${conn}"><i class="dot"></i>${esc(w.name)} · ${esc(connText)}</span>${UI.pendingSave ? '<span class="warnTxt">Changes pending</span>' : ''}</span>
    ${save}${agent}${upd}
    <span class="grow"></span>
    <span class="st-r"><span>${plural(FS.list(UI.ws).length, 'file')}</span>${words ? `<span>${words}</span>` : ''}</span>`;
}
function DB_agentPending() { return APP.agentChanges.filter(c => c.status === 'pending' && c.ws === UI.ws); }
function renderTrust() {
  const el = $('#trust');
  const t = noteTab();
  if (!t || !UI.trust || UI.focus || isMobile()) { el.innerHTML = ''; return; }
  const d = disk(t.path);
  if (!d) { el.innerHTML = ''; return; }
  const nl = d.body.includes('\r\n') ? 'CRLF' : 'LF';
  el.innerHTML = `<div class="trustbar">
    <button class="linkbtn" data-a="trustToggle" aria-expanded="true">${icon('chevD', 'xs')} File</button>
    <span class="tpath" title="${esc(WS().path)}/${esc(t.path)}">${esc(WS().path)}/${esc(t.path)}</span>
    <span>Rev ${esc(d.rev)}</span><span>Modified ${fmtAgo(d.mtime)}</span><span>${(new Blob([d.body]).size / 1024).toFixed(1)} KB</span><span>UTF-8 · ${nl}</span>
    <button class="linkbtn" data-a="revealFile">${icon('eye', 'xs')} Reveal in Explorer</button>
  </div>`;
}
ACT.trustToggle = () => { UI.trust = false; renderAll(); };
ACT.revealFile = () => toast('Revealed in File Explorer');
