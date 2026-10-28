/* Mobile layer (under 700px): bottom tabs, notes list, reading-first note, capture, search, agenda */
UI.mView = UI.mView || 'notes';
UI.mNote = null;

function renderTabbar() {
  const bar = $('#tabbar');
  if (!isMobile() || UI.screen !== 'app') { bar.innerHTML = ''; bar.hidden = true; return; }
  bar.hidden = false;
  const b = (v, ic, label) => `<button class="${UI.mView === v ? 'on' : ''}" data-a="mTab" data-v="${v}" aria-label="${label}">${icon(ic)}<span>${label}</span></button>`;
  bar.innerHTML = b('notes', 'folder', 'Notes') + b('search', 'search', 'Search')
    + `<button class="cap" data-a="mTab" data-v="capture" aria-label="Capture">${icon('plus')}</button>`
    + b('today', 'today', 'Today') + b('settings', 'gear', 'Settings');
}
ACT.mTab = el => {
  UI.mView = el.dataset.v;
  if (UI.mView === 'settings') UI.sec = UI.sec || 'general';
  if (UI.mView === 'capture') { UI.capture2 = { dest: 'inbox' }; }
  renderAll();
};

function renderMobile() {
  const el = $('#content');
  const v = UI.mView;
  const scroll = el.scrollTop;
  if (v === 'notes' && UI.mNote) el.innerHTML = mNoteHTML();
  else if (v === 'notes') el.innerHTML = mNotesHTML();
  else if (v === 'capture') el.innerHTML = mCaptureHTML();
  else if (v === 'search') el.innerHTML = mSearchHTML();
  else if (v === 'today') el.innerHTML = mTodayHTML();
  else if (v === 'settings') el.innerHTML = settingsView();
  el.scrollTop = scroll;
}

/* Notes */
function mNotesHTML() {
  const folder = UI.mFolder;
  const all = FS.list(UI.ws);
  const folders = [...new Set(all.filter(p => dirname(p).startsWith(folder ? folder + '/' : '') || (folder === '' && dirname(p) === '')).map(p => {
    const rel = folder ? p.slice(folder.length + 1) : p; return rel.includes('/') ? (folder ? folder + '/' : '') + rel.split('/')[0] : null;
  }).filter(Boolean))];
  const files = all.filter(p => dirname(p) === folder);
  const crumbs = folder ? folder.split('/') : [];
  return `<div class="m-page">
    <header class="m-head">${folder ? `<button class="icon-btn" data-a="mUp" aria-label="Up">${icon('chevR', 'sm').replace('<path', '<path transform="rotate(180 12 12)"')}</button>` : ''}
      <div class="m-title"><b>${esc(crumbs.length ? crumbs[crumbs.length - 1] : WS().name)}</b><small>${crumbs.length ? esc(crumbs.slice(0, -1).join(' / ') || WS().name) : esc(WS().kind + ' · ' + plural(all.length, 'file'))}</small></div>
      <button class="icon-btn" data-a="mRefresh" aria-label="Refresh">${icon('refresh', 'sm')}</button>
      <button class="icon-btn" data-a="sortMenu" aria-label="Sort">${icon('sort', 'sm')}</button></header>
    ${WS().conn === 'offline' ? `<div class="banner danger compact">${icon('cloud', 'xs')}<div>Disconnected. Changes wait in the editor.</div><button class="linkbtn" data-a="reconnect">Reconnect</button></div>` : ''}
    <div class="m-list">
      ${folders.map(f => `<button class="m-row" data-a="mFolder" data-f="${esc(f)}">${icon('folder', 'sm')}<span>${esc(basename(f + '.x').replace(/\.x$/, '').split('/').pop())}</span>${icon('chevR', 'xs')}</button>`).join('')}
      ${files.sort((a, b) => basename(a).localeCompare(basename(b))).map(p => `<div class="m-row file"><button class="m-main" data-a="mOpen" data-path="${esc(p)}">${icon('file', 'sm')}<span>${esc(basename(p))}</span></button><button class="icon-btn" data-a="mRowMenu" data-path="${esc(p)}" aria-label="More for ${esc(basename(p))}">${icon('menu', 'sm')}</button></div>`).join('')}
      ${!folders.length && !files.length ? `<div class="emptyside">${art('notes')}<p>This folder is empty.</p><button class="btn primary" data-a="newNoteBtn">New note</button></div>` : ''}
    </div>
  </div>`;
}
ACT.mFolder = el => { UI.mFolder = el.dataset.f; renderAll(); };
ACT.mUp = () => { UI.mFolder = dirname(UI.mFolder); renderAll(); };
ACT.mRefresh = () => toast('Up to date with disk');
ACT.mOpen = el => { UI.mNote = el.dataset.path; UI.mEdit = false; openNote(el.dataset.path); UI.mode = 'read'; renderAll(); };
ACT.mRowMenu = el => {
  const p = el.dataset.path; const f = WS().favs.some(x => x.type === 'file' && x.path === p);
  menu(el, [
    { label: f ? 'Remove from favorites' : 'Add to favorites', icon: 'star', fn: () => { const i = WS().favs.findIndex(x => x.type === 'file' && x.path === p); if (i > -1) WS().favs.splice(i, 1); else WS().favs.push({ type: 'file', path: p }); renderAll(); } },
    { label: 'Rename', icon: 'edit', fn: () => { UI.mNote = p; openNote(p); UI.renaming = p; renderAll(); } },
    { label: 'Move to trash', icon: 'trash', danger: true, fn: () => trashPath(p) },
  ]);
};

/* Note, reading first */
function mNoteHTML() {
  const t = noteTab(); if (!t) { UI.mNote = null; return mNotesHTML(); }
  const conflict = t.conflict ? `<div class="banner warn compact">${icon('warn', 'xs')}<div><b>Changed on disk.</b> Both versions are kept.</div><button class="linkbtn" data-a="conflictLoad">Load disk</button><button class="linkbtn" data-a="conflictKeep">Keep mine</button></div>` : '';
  return `<div class="m-page note">
    <header class="m-head"><button class="icon-btn" data-a="mBack" aria-label="Back">${icon('chevR', 'sm').replace('<path', '<path transform="rotate(180 12 12)"')}</button>
      <div class="m-title"><b>${esc(basename(t.path))}</b><small><span class="savepill ${saveState(t)}"><i class="dot"></i>${esc(STATE[saveState(t)][0])}</span></small></div>
      <button class="icon-btn" data-a="toggleFav" aria-label="Favourite">${icon('star', 'sm')}</button></header>
    ${conflict}
    <div class="m-body"><div class="page-col m-col"><h1 class="m-h1">${esc(basename(t.path))}</h1><div id="ed" class="ed m-ed" contenteditable="true" spellcheck="true" role="textbox" aria-multiline="true" aria-label="Note"></div></div></div>
    <div class="accessory" role="toolbar" aria-label="Formatting">
      <button data-a="accFmt" data-f="task" aria-label="To-do">${icon('check', 'sm')}</button><button data-a="accFmt" data-f="list" aria-label="Bulleted list">${icon('list2', 'sm')}</button>
      <button data-a="accFmt" data-f="heading" aria-label="Heading">${icon('heading', 'sm')}</button><button data-a="accFmt" data-f="link" aria-label="Link to a note">${icon('link', 'sm')}</button>
      <button data-a="accUndo" aria-label="Undo">${icon('undo', 'sm')}</button></div>
  </div>`;
}
ACT.mBack = () => { UI.mNote = null; UI.mEdit = false; UI.mode = 'split'; renderAll(); };
ACT.accFmt = el => {
  const ed = $('#ed'); if (!ed) return; ed.focus();
  const f = el.dataset.f;
  if (f === 'task') edApply('task'); else if (f === 'list') edApply('ul'); else if (f === 'heading') edApply('h2');
  else if (f === 'link') { document.execCommand('insertText', false, '[['); edTrigger(); }
};
ACT.accUndo = () => { const ed = $('#ed'); if (ed) { ed.focus(); document.execCommand('undo'); edSync(); } };

/* Capture, full screen */
function mCaptureHTML() {
  const dest = (UI.capture2 || { dest: 'inbox' }).dest;
  return `<div class="m-page capture-full">
    <header class="m-head"><button class="linkbtn" data-a="mTab" data-v="notes">Cancel</button><div class="m-title"><b>Quick capture</b></div><button class="btn sm primary" data-a="mCapSave">Save</button></header>
    <div class="dest chips">${[['inbox', 'Inbox'], ['daily', 'Daily'], ['task', 'Task'], ['note', 'New note']].map(([k, l]) => `<button class="dchip${dest === k ? ' on' : ''}" data-a="mDest" data-d="${k}">${l}</button>`).join('')}</div>
    <textarea id="capText" data-inp="capText" class="cap-area" placeholder="Write, dictate or share here…" aria-label="Capture text"></textarea>
    <p class="err" id="capErr" hidden></p>
    <div class="cap-row"><button class="btn" data-a="mVoice" aria-label="Dictate">${icon('mic', 'sm')} Dictate</button></div>
  </div>`;
}
ACT.mDest = el => { UI.capture2 = { dest: el.dataset.d }; renderAll(); };
ACT.mVoice = () => toast('Voice dictation is a Concept on mobile. Type for now.');
ACT.mCapSave = () => { if (captureSave()) { UI.mView = 'notes'; renderAll(); } };

/* Search, mobile */
function mSearchHTML() {
  return `<div class="m-page">
    <header class="m-head"><div class="m-title"><b>Search</b></div></header>
    <div class="sp-input"><span>${icon('search', 'sm')}</span><input id="sq" data-inp="searchQ" value="${esc(UI.search.q)}" placeholder="Search notes" aria-label="Search"></div>
    <div class="ops">${['file:', 'tag:', 'task:open', '-exclude'].map(o => `<button class="chip-btn" data-a="insertOp" data-o="${o}">${o}</button>`).join('')}</div>
    <div id="sresults" class="sresults">${UI.search.q ? searchResultsHTML() : `<p class="muted pad">Recents</p>${recentPaths().slice(0, 6).map(p => `<button class="rp-item" data-a="mOpen" data-path="${esc(p)}"><b>${esc(basename(p))}</b></button>`).join('') || '<p class="muted pad">Nothing yet.</p>'}`}</div>
  </div>`;
}

/* Today as an agenda */
function mTodayHTML() {
  const tasks = parseTasks();
  const sec = (title, list) => `<section class="agsec"><h3>${title} <span class="count">${list.length}</span></h3>${list.map(t => `<div class="trow${t.done ? ' done' : ''}"><button class="cbx${t.done ? ' on' : ''}" data-a="taskToggleAt" data-path="${esc(t.path)}" data-line="${t.line}" aria-label="Complete">${t.done ? icon('check', 'xs') : ''}</button><div class="tr-t"><span>${esc(t.text)}</span><small>${esc(basename(t.path))}${t.time != null ? ' · ' + hLabel(t.time) : ''}</small></div></div>`).join('') || '<p class="muted">None.</p>'}</section>`;
  return `<div class="m-page"><header class="m-head"><div class="m-title"><b>Today</b><small>${fmtDay(TODAY)}</small></div></header>
    ${sec('Overdue', tasks.filter(t => !t.done && t.due && t.due < TODAY))}
    ${sec('Scheduled', tasks.filter(t => !t.done && t.sched === TODAY))}
    ${sec('Due today', tasks.filter(t => !t.done && t.due === TODAY))}
    ${!FS.read(UI.ws, `${APP.settings.dailyFolder}/${TODAY}.md`) ? `<button class="btn primary wide" data-a="createDaily">Create today’s note</button>` : ''}
  </div>`;
}
