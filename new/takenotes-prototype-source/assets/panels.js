/* Right panel, search, favorites, Quick Open, Command Palette, hover preview, simulations */

/* Right panel: backlinks, outgoing, outline, properties */
function renderRight() {
  const el = $('#rightpanel');
  const t = noteTab();
  if (!UI.rp || isMobile() || UI.focus) { el.innerHTML = ''; return; }
  const head = `<div class="rp-head"><span class="grow"></span><button class="icon-btn" data-a="closeRight" aria-label="Hide side panel" title="Hide side panel (${esc(APP.hotkeys.rightPanel)})">${icon('x', 'sm')}</button></div>`;
  if (!t) { el.innerHTML = head + `<div class="rp-body"><p class="muted">Open a note to see what links to it, its sections, and its details.</p></div>`; return; }
  el.innerHTML = head + `<div class="rp-body">${outlineSection(t)}${backlinksHTML(t)}${outgoingHTML(t)}${detailsSection(t)}</div>`;
}
function outlineSection(t) {
  const hs = t.buffer.split('\n').map((l, i) => ({ l, i })).filter(x => /^#{1,6} /.test(x.l));
  if (!hs.length) return '';
  return `<section><h4>On this page</h4>${hs.map(x => `<button class="outline-item" data-a="outlineGo" data-line="${x.i}" style="padding-left:${Math.min(x.l.match(/^#+/)[0].length - 1, 2) * 12 + 6}px">${esc(x.l.replace(/^#+ /, ''))}</button>`).join('')}</section>`;
}
function detailsSection(t) {
  const fm = frontmatter(t.buffer);
  if (!fm.props.length && !fm.bad.length) return '';
  return `<section><details class="rp-details"${fm.bad.length ? ' open' : ''}><summary>Details <span class="count">${fm.props.length}</span></summary>${propertiesHTML(t)}</details></section>`;
}
ACT.closeRight = () => { UI.rp = false; renderAll(); };
function backlinksHTML(t) {
  const title = basename(t.path).toLowerCase();
  const linked = FS.list(UI.ws).filter(p => p !== t.path && linksOf(disk(p).body).some(l => l.toLowerCase() === title));
  const unlinked = [];
  FS.list(UI.ws).forEach(p => {
    if (p === t.path || linked.includes(p)) return;
    const lines = disk(p).body.split('\n');
    const i = lines.findIndex(l => l.toLowerCase().includes(title));
    if (i > -1) unlinked.push({ p, i, text: lines[i] });
  });
  return `<section><h4>Linked from · ${linked.length}</h4>${linked.map(p => `<button class="rp-item" data-a="openPath" data-path="${esc(p)}"><b>${esc(basename(p))}</b><small>${esc(dirname(p) || 'Root')}</small></button>`).join('') || '<p class="muted">No other note links here yet.</p>'}</section>
    ${unlinked.length ? `<section><h4>Mentioned without a link · ${unlinked.length}</h4>${unlinked.map(u => `<div class="rp-item"><b>${esc(basename(u.p))}</b><small>${esc(u.text)}</small><button class="linkbtn" data-a="linkIt" data-path="${esc(u.p)}" data-line="${u.i}">Link it</button></div>`).join('')}</section>` : ''}`;
}
ACT.openPath = el => openNote(el.dataset.path);
ACT.linkIt = el => {
  const p = el.dataset.path, i = +el.dataset.line; const title = basename(t_ = noteTab().path);
  mutateLine(p, i, l => l.replace(new RegExp(title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), m => `[[${m}]]`));
  toast(`Linked “${title}”`);
};
let t_;
function outgoingHTML(t) {
  const ls = linksOf(t.buffer);
  if (!ls.length) return '';
  return `<section><h4>Links to · ${ls.length}</h4>${ls.map(l => {
    const p = resolveLink(l);
    return p ? `<button class="rp-item" data-a="openLink" data-name="${esc(l)}"><b>${esc(l)}</b><small>${esc(p)}</small></button>`
      : `<div class="rp-item warn"><b>${esc(l)}</b><small>No note with this name yet</small><button class="linkbtn" data-a="ghostLink" data-name="${esc(l)}">Create it</button></div>`;
  }).join('')}</section>`;
}
function outlineHTML(t) {
  const hs = t.buffer.split('\n').map((l, i) => ({ l, i })).filter(x => /^#{1,6} /.test(x.l));
  if (!hs.length) return `<p class="muted">No headings in this note.</p>`;
  return hs.map(x => `<button class="outline-item" data-a="outlineGo" data-line="${x.i}" style="padding-left:${(x.l.match(/^#+/)[0].length - 1) * 12 + 8}px">${esc(x.l.replace(/^#+ /, ''))}</button>`).join('');
}
ACT.outlineGo = el => {
  const line = +el.dataset.line;
  jumpToLine(line);
};
function propertiesHTML(t) {
  const fm = frontmatter(t.buffer);
  const body = fm.props.map(p => {
    const type = propType(p.key, p.val);
    let input;
    if (type === 'checkbox') input = `<label class="check"><input type="checkbox" data-ch="propCh" data-k="${esc(p.key)}" ${p.val === 'true' ? 'checked' : ''}> ${p.val}</label>`;
    else input = `<input class="prop-in" type="${type === 'date' ? 'date' : type === 'number' ? 'number' : 'text'}" data-ch="propTx" data-k="${esc(p.key)}" value="${esc(type === 'date' ? p.val.slice(0, 10) : p.val)}" aria-label="${esc(p.key)}">`;
    return `<div class="prop"><div class="pk">${esc(p.key)}</div><div class="pv">${input}</div></div>`;
  }).join('');
  const warn = fm.bad.length ? `<div class="banner warn compact">${icon('warn', 'xs')}<div>${fm.bad.map(esc).join('<br>')}</div><button class="linkbtn" data-a="editSource">Fix as text</button></div>` : '';
  return `${warn}<section>${body || '<p class="muted">No details yet.</p>'}</section>
    <p class="hint">Change a value here. To add a new detail, use ⋯ › Edit as plain text.</p>`;
}
function setProp(key, val) {
  const t = noteTab(); if (!t) return;
  const fm = frontmatter(t.buffer);
  const p = fm.props.find(x => x.key === key); if (!p) return;
  const L = t.buffer.split('\n'); L[p.line] = `${key}: ${val}`;
  t.buffer = L.join('\n'); afterEdit(t);
}
CHG.propCh = el => setProp(el.dataset.k, el.checked ? 'true' : 'false');
CHG.propTx = el => setProp(el.dataset.k, el.value);

/* Search: operators, grouped results */
const SEARCH_OPS = ['file', 'path', 'tag', 'task'];
function parseQuery(q) {
  const toks = q.match(/"[^"]+"|-?\[[^\]]+\]|\S+/g) || [];
  const f = { text: [], phrases: [], not: [], file: [], path: [], tag: [], task: [], prop: [], err: null };
  for (let tok of toks) {
    let neg = false;
    if (tok.startsWith('-') && tok.length > 1) { neg = true; tok = tok.slice(1); }
    if (tok.startsWith('"')) { (neg ? f.not : f.phrases).push(tok.slice(1, -1)); continue; }
    let m;
    if ((m = tok.match(/^\[([^:\]]+)(?::([^\]]*))?\]$/))) { f.prop.push({ k: m[1], v: m[2] || '', neg }); continue; }
    if ((m = tok.match(/^([\w-]+):(.*)$/))) {
      if (!SEARCH_OPS.includes(m[1])) { f.err = `Unknown operator “${m[1]}:”. Supported operators: file:, path:, tag:, task:, [property:value].`; continue; }
      f[m[1]].push({ v: m[2], neg }); continue;
    }
    (neg ? f.not : f.text).push(tok);
  }
  return f;
}
function runSearch(q) {
  const f = parseQuery(q);
  if (f.err) return { err: f.err, results: [] };
  if (!q.trim()) return { results: null };
  const cs = APP.settings.caseSensitive;
  const norm = s => (cs ? s : s.toLowerCase());
  const terms = [...f.text, ...f.phrases].map(norm);
  const results = [];
  let hitCount = 0;
  for (const p of FS.list(UI.ws).sort()) {
    const body = disk(p).body;
    if (f.file.some(x => x.neg ? basename(p).includes(x.v) : !basename(p).includes(x.v))) continue;
    if (f.path.some(x => x.neg ? p.includes(x.v) : !p.includes(x.v))) continue;
    const tags = tagsOf(body);
    if (f.tag.some(x => x.neg ? tags.includes(x.v) : !tags.includes(x.v))) continue;
    const lines = body.split('\n');
    const taskLines = lines.map((l, i) => ({ l, i })).filter(x => /^\s*[-*] \[( |x|X)\]/.test(x.l));
    const taskOk = f.task.every(x => {
      const want = x.v === 'done' ? 'x' : 'open';
      const hit = taskLines.filter(t => (want === 'x' ? /\[[xX]\]/.test(t.l) : /\[ \]/.test(t.l)));
      return x.neg ? hit.length === 0 : hit.length > 0;
    });
    if (!taskOk) continue;
    const fm = frontmatter(body);
    const propOk = f.prop.every(x => {
      const pr = fm.props.find(y => y.key === x.k);
      const ok = !!pr && (x.v === '' || pr.val.toLowerCase().includes(x.v.toLowerCase()));
      return x.neg ? !ok : ok;
    });
    if (!propOk) continue;
    if (f.not.some(x => norm(body).includes(norm(x)))) continue;
    const hits = [];
    lines.forEach((l, i) => {
      const nl = norm(l);
      if (terms.length) { if (terms.every(t => nl.includes(t))) hits.push({ i, l }); }
      else if (f.task.length) { if (taskLines.some(t => t.i === i)) hits.push({ i, l }); }
      else if (f.prop.length || f.tag.length || f.file.length || f.path.length) { if (i === 0) hits.push({ i, l }); }
    });
    if (!terms.length && !hits.length && (f.file.length || f.path.length || f.tag.length || f.prop.length || f.task.length)) hits.push({ i: 0, l: lines[0] || '' });
    if (!hits.length) continue;
    results.push({ path: p, hits });
    hitCount += hits.length;
    if (hitCount >= 50) break;
  }
  return { results, shown: hitCount >= 50, terms, cs };
}
function highlight(text, terms, cs) {
  let s = esc(text);
  terms.filter(Boolean).forEach(t => {
    const re = new RegExp(t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), cs ? 'g' : 'gi');
    s = s.replace(re, m => `<mark>${m}</mark>`);
  });
  return s;
}
function searchPanelHTML() {
  const s = UI.search;
  return `<div class="search-panel">
    <div class="sp-input"><span>${icon('search', 'sm')}</span><input id="sq" data-inp="searchQ" value="${esc(s.q)}" placeholder="Search words, \"phrases\", tag:, path:, task:open, [status:active]" aria-label="Search"></div>
    <div class="ops">${['file:', 'path:', 'tag:', 'task:open', '-exclude', '"phrase"', '[prop:value]'].map(o => `<button class="chip-btn" data-a="insertOp" data-o="${esc(o)}">${esc(o)}</button>`).join('')}</div>
    <div class="sp-opts">
      <label class="check"><input type="checkbox" data-ch="searchCase" ${APP.settings.caseSensitive ? 'checked' : ''}> Match case</label>
      <label class="sp-ctx">Context <input type="range" min="0" max="5" value="${s.ctx}" data-ch="searchCtx"><span>${s.ctx}</span></label>
    </div>
    <div id="sresults" class="sresults">${searchResultsHTML()}</div>
  </div>`;
}
function searchResultsHTML() {
  const s = UI.search;
  if (s.err) return `<div class="banner danger compact" role="alert">${icon('error', 'xs')}<div><b>Search error.</b> ${esc(s.err)}</div></div>`;
  if (!s.q.trim()) return `<p class="muted pad">Type to search every note in this workspace. Operators narrow the results.</p>`;
  const r = s.results || [];
  if (!r.length) return `<div class="emptyside">${art('search')}<p>No results for “${esc(s.q)}”.</p><p class="hint">Try fewer words, remove a -exclusion, or check the operator spelling.</p></div>`;
  const total = r.reduce((n, x) => n + x.hits.length, 0);
  return `<div class="res-h">${plural(total, 'result')} in ${plural(r.length, 'file')}${total >= 50 ? ' · showing first 50' : ''} <button class="linkbtn" data-a="copyResults">Copy results</button></div>` +
    r.map(g => `<div class="res-g"><div class="res-f" data-a="openPath" data-path="${esc(g.path)}">${icon('file', 'xs')}${esc(g.path)}<span>${g.hits.length}</span></div>
      ${g.hits.map(h => {
        const L = disk(g.path).body.split('\n'); const c = s.ctx;
        const ctx = [];
        for (let k = Math.max(0, h.i - c); k < h.i; k++) ctx.push(`<div class="res-c">${esc(L[k])}</div>`);
        const after = []; for (let k = h.i + 1; k <= Math.min(L.length - 1, h.i + c); k++) after.push(`<div class="res-c">${esc(L[k])}</div>`);
        return `${ctx.join('')}<button class="res-h2" data-a="openHit" data-path="${esc(g.path)}" data-line="${h.i}"><small>${h.i + 1}</small>${highlight(h.l, s.terms || [], APP.settings.caseSensitive)}</button>${after.join('')}`;
      }).join('')}</div>`).join('');
}
function runSearchUI() {
  const r = runSearch(UI.search.q);
  UI.search.err = r.err || null; UI.search.results = r.results || null; UI.search.terms = r.terms || []; UI.search.shown = r.shown;
  const box = $('#sresults'); if (box) box.innerHTML = searchResultsHTML();
}
INP.searchQ = el => { UI.search.q = el.value; runSearchUI(); };
CHG.searchCase = el => { APP.settings.caseSensitive = el.checked; runSearchUI(); };
CHG.searchCtx = el => { UI.search.ctx = +el.value; el.nextElementSibling.textContent = el.value; runSearchUI(); };
ACT.insertOp = el => { const i = $('#sq'); const v = el.dataset.o; UI.search.q = (UI.search.q ? UI.search.q + ' ' : '') + v; i.value = UI.search.q; i.focus(); runSearchUI(); };
ACT.openHit = el => openNote(el.dataset.path, { line: +el.dataset.line });
ACT.copyResults = () => {
  const r = UI.search.results || [];
  const text = r.map(g => g.path + '\n' + g.hits.map(h => `  ${h.i + 1}: ${h.l}`).join('\n')).join('\n');
  toast(`Copied ${plural(r.length, 'file')} of results`);
  void text;
};
function openSearch(q) { UI.sb = true; UI.sbView = 'search'; if (q != null) UI.search.q = q; renderAll(); setTimeout(() => { const i = $('#sq'); if (i) i.focus(); if (q) runSearchUI(); }, 30); }

/* Favorites list */
function favoritesHTML() {
  const favs = WS().favs;
  if (!favs.length) return `<div class="emptyside">${art('tags')}<p>No favorites yet. Right-click a file or folder and choose Add to Favorites.</p></div>`;
  const label = { file: 'file', folder: 'folder', search: 'search', heading: 'heading', block: 'block' };
  const icons = { file: 'file', folder: 'folder', search: 'search', heading: 'heading', block: 'book' };
  return `<div class="favs">${favs.map((f, i) => {
    let title, sub, missing = false;
    if (f.type === 'file') { title = basename(f.path); sub = f.path; missing = !disk(f.path); }
    else if (f.type === 'folder') { title = basename(f.path) || f.path; sub = f.path; missing = !folderList().includes(f.path); }
    else if (f.type === 'search') { title = f.q; sub = 'Saved search'; }
    else if (f.type === 'heading') { title = f.text; sub = basename(f.path); missing = !disk(f.path); }
    return `<div class="fav${missing ? ' missing' : ''}" draggable="true" data-drag="fav:${i}" data-favdrop="${i}" data-a="favOpen" data-i="${i}">
      ${icon(icons[f.type], 'sm')}<span class="fav-t">${esc(title)}<small>${esc(label[f.type])} · ${esc(sub)}${missing ? ' · missing' : ''}</small></span>
      <button class="icon-btn xs" data-a="favRemove" data-i="${i}" aria-label="Remove favorite">${icon('x', 'xs')}</button></div>`;
  }).join('')}</div><p class="hint pad">Drag to reorder. Missing targets stay in the list.</p>`;
}
ACT.favOpen = el => {
  const f = WS().favs[+el.dataset.i];
  if (f.type === 'file' || f.type === 'heading') { if (!disk(f.path)) return toast('This file is missing'); if (f.type === 'heading') { const L = disk(f.path).body.split('\n'); const i = L.findIndex(l => l.replace(/^#+ /, '') === f.text); return openNote(f.path, { line: i > -1 ? i : 0 }); } openNote(f.path); }
  else if (f.type === 'folder') { UI.sb = true; UI.sbView = 'explorer'; UI.expanded[f.path] = true; renderAll(); }
  else if (f.type === 'search') openSearch(f.q);
};
ACT.favRemove = el => { WS().favs.splice(+el.dataset.i, 1); renderSidebar(); };
document.addEventListener('dragover', e => { const d = e.target.closest('[data-favdrop]'); if (d) e.preventDefault(); });
document.addEventListener('drop', e => {
  const d = e.target.closest('[data-favdrop]'); if (!d) return;
  e.preventDefault();
  const from = e.dataTransfer.getData('text/plain'); if (!from.startsWith('fav:')) return;
  const a = +from.slice(4), b = +d.dataset.favdrop; const favs = WS().favs;
  const [item] = favs.splice(a, 1); favs.splice(b, 0, item);
  renderSidebar();
});

/* Quick Open (files) */
function recentPaths() {
  const seen = []; for (const t of UI.tabs.slice().reverse()) if (t.type === 'note' && !seen.includes(t.path)) seen.push(t.path);
  return seen;
}
function quickItems(q) {
  const files = FS.list(UI.ws);
  if (!q) return recentPaths().concat(files.filter(p => !recentPaths().includes(p)).sort((a, b) => disk(b).mtime - disk(a).mtime)).slice(0, 12).map(p => ({ path: p, label: basename(p), dir: dirname(p) || 'Root' }));
  const scored = files.map(p => ({ p, s: fuzzy(q, p.replace(/\.md$/, '')) })).filter(x => x.s >= 0).sort((a, b) => b.s - a.s).slice(0, 30);
  const items = scored.map(x => ({ path: x.p, label: basename(x.p), dir: dirname(x.p) || 'Root' }));
  const exact = files.some(p => basename(p).toLowerCase() === q.toLowerCase());
  if (!exact) items.push({ create: true, label: `Create “${q}.md”`, dir: APP.settings.newNoteFolder });
  return items;
}
function openQuick() {
  closeMenus();
  if (UI.qo) return;
  UI.qo = { q: '', i: 0, items: [] };
  const rec = modal({
    title: 'Quick Open', cls: 'palette', width: 580, dismiss: true, body: `
      <input class="pal-input" id="qoq" data-inp="qoQ" placeholder="Search files by name…" aria-label="Quick Open">
      <div class="pal-list" id="qol"></div>
      <div class="pal-foot"><span><kbd>Enter</kbd> open</span><span><kbd>Ctrl+Enter</kbd> new tab</span><span><kbd>Shift+Enter</kbd> create</span></div>`,
    onClose: () => { UI.qo = null; },
  });
  UI.qo.rec = rec; drawQuick();
}
function drawQuick() {
  if (!UI.qo) return;
  UI.qo.items = quickItems(UI.qo.q);
  if (UI.qo.i >= UI.qo.items.length) UI.qo.i = 0;
  const list = $('#qol'); if (!list) return;
  list.innerHTML = UI.qo.items.map((it, i) => `<button class="pal-item${i === UI.qo.i ? ' on' : ''}${it.create ? ' create' : ''}" data-a="qoPick" data-i="${i}">${icon(it.create ? 'plus' : 'file', 'sm')}<span class="pl">${esc(it.label)}</span><small>${esc(it.dir)}</small></button>`).join('') || `<p class="muted pad">No matching files.</p>`;
}
INP.qoQ = el => { UI.qo.q = el.value; UI.qo.i = 0; drawQuick(); };
ACT.qoPick = el => qoOpen(UI.qo.items[+el.dataset.i]);
function qoOpen(it) {
  if (!it) return;
  const name = UI.qo.q;
  if (it.create) { const p = `${APP.settings.newNoteFolder}/${name}.md`; const rec = UI.qo.rec; rec.close(); FS.write(UI.ws, p, `# ${name}\n\n`); openNote(p); return; }
  UI.qo.rec.close(); openNote(it.path);
}

/* Command Palette */
const PAL_MODES = { '>': 'commands', '#': 'tags', '@': 'schedule', '?': 'search' };
function openPalette() {
  if (UI.pal) return;
  closeMenus();
  UI.pal = { q: '', i: 0, mode: 'commands', items: [] };
  UI.pal.rec = modal({
    title: 'Command Palette', cls: 'palette', width: 620, body: `
      <div class="pal-modes" id="palmodes"></div>
      <input class="pal-input" id="palq" data-inp="palQ" placeholder="Type a command, or > # @ ? for other modes" aria-label="Command Palette">
      <div class="pal-list" id="pall"></div>
      <div class="pal-foot"><span><kbd>↑</kbd><kbd>↓</kbd> move</span><span><kbd>Enter</kbd> run</span><span><kbd>Esc</kbd> close</span></div>`,
    onClose: () => { UI.pal = null; },
  });
  drawPalette();
}
function commandList() {
  const t = noteTab(); const w = WS();
  const hasSnap = t && (WS().snaps[t.path] || []).length;
  const hasAgent = APP.agentChanges.some(c => c.status === 'pending');
  const sec = (k) => ({ ok: true });
  void sec;
  return [
    { g: 'File', label: 'New note', hint: APP.hotkeys.newNote, icon: 'plus', fn: () => newNote() },
    { g: 'File', label: 'New folder', icon: 'folder', fn: () => ACT.newFolder() },
    { g: 'File', label: 'Rename current note', hint: APP.hotkeys.rename, icon: 'edit', when: () => (t ? null : 'Open a note first'), fn: () => { UI.renaming = t.path; renderAll(); } },
    { g: 'File', label: 'Move current note to trash', icon: 'trash', when: () => (t ? null : 'Open a note first'), fn: () => trashPath(t.path) },
    { g: 'File', label: 'Import notes…', icon: 'upload', fn: () => importDialog() },
    { g: 'File', label: 'Pair from link…', icon: 'link', fn: () => pairDialog() },
    { g: 'View', label: 'Toggle sidebar', hint: APP.hotkeys.sidebar, icon: 'menu', fn: () => toggleSidebar() },
    { g: 'View', label: 'Toggle right panel', hint: APP.hotkeys.rightPanel, icon: 'split', fn: () => toggleRight() },
    { g: 'View', label: 'Focus mode', hint: 'Esc', icon: 'focus', when: () => (t ? null : 'Open a note first'), fn: () => toggleFocus() },
    { g: 'View', label: 'Toggle file details (trust strip)', icon: 'info', fn: () => { UI.trust = !UI.trust; renderAll(); } },
    { g: 'Go to', label: 'Today', icon: 'today', fn: () => openView('today') },
    { g: 'Go to', label: 'Tasks', icon: 'tasks', fn: () => openView('tasks') },
    { g: 'Go to', label: 'Calendar', icon: 'calendar', fn: () => openView('calendar') },
    { g: 'Go to', label: 'Tags and properties', icon: 'tag', fn: () => openView('tags') },
    { g: 'Go to', label: 'Collections', icon: 'table', fn: () => openView('collections') },
    { g: 'Go to', label: 'Trash', icon: 'trash', fn: () => openView('trash') },
    { g: 'Go to', label: 'Graph (Later)', icon: 'graph', fn: () => openView('graph') },
    { g: 'Go to', label: 'Canvas (Later)', icon: 'canvas', fn: () => openView('canvas') },
    { g: 'Go to', label: 'Settings', hint: APP.hotkeys.settings, icon: 'gear', fn: () => openView('settings') },
    { g: 'Go to', label: 'Keyboard shortcuts', icon: 'keyboard', fn: () => shortcutsDialog() },
    { g: 'Editor', label: 'Find in note', hint: APP.hotkeys.find, icon: 'search', when: () => (t ? null : 'Open a note first'), fn: () => ACT.findBtn() },
    { g: 'Editor', label: 'Insert template…', icon: 'file', when: () => (t ? null : 'Open a note first'), fn: () => templatePicker(null) },
    { g: 'Editor', label: 'Insert image…', icon: 'image', when: () => (t ? null : 'Open a note first'), fn: () => imageDialog() },
    { g: 'Editor', label: 'Create today’s daily note', icon: 'today', fn: () => createDaily() },
    { g: 'Recovery', label: 'Open recovery for this note', icon: 'refresh', when: () => (t ? null : 'Open a note first'), fn: () => ACT.recoveryOpen() },
    { g: 'Recovery', label: 'Restore last snapshot', icon: 'undo', when: () => (hasSnap ? null : 'No snapshots for this note yet'), fn: () => { const s = WS().snaps[t.path][0]; snapshot(t.path, disk(t.path).body, 'Before restore'); FS.write(UI.ws, t.path, s.body); t.buffer = s.body; t.baseBody = s.body; t.base = disk(t.path).rev; renderAll(); toast('Restored last snapshot'); } },
    { g: 'Workspace', label: 'Switch workspace…', icon: 'folder', fn: () => ACT.wsMenu($('.ws-switch')) },
    { g: 'Workspace', label: 'Open WSL folder…', icon: 'terminal', fn: () => wslWizard() },
    { g: 'Workspace', label: 'Create workspace…', icon: 'plus', fn: () => createWorkspaceDialog() },
    { g: 'Agents', label: 'Simulate: claude-code writes to a note', icon: 'bot', when: () => (w.kind === 'Server' ? 'Agents need a local workspace' : null), fn: () => ACT.simAgent() },
    { g: 'Agents', label: 'Simulate: cursor write attempt (read-only token)', icon: 'lock', fn: () => ACT.simDenied() },
    { g: 'Agents', label: 'Review agent changes', icon: 'bot', when: () => (hasAgent ? null : 'No agent changes waiting'), fn: () => ACT.agentTray() },
    { g: 'Agents', label: 'Open agent activity log', icon: 'list', fn: () => openView('settings') },
    { g: 'Capture', label: 'Quick Capture', hint: APP.hotkeys.quickCapture, icon: 'bolt', fn: () => quickCapture() },
    { g: 'Simulate', label: 'Simulate: file changed on disk', icon: 'refresh', when: () => (t ? null : 'Open a note first'), fn: () => ACT.simExternal() },
    { g: 'Simulate', label: 'Simulate: file deleted outside takenotes', icon: 'trash', when: () => (t ? null : 'Open a note first'), fn: () => ACT.simDelete() },
    { g: 'Simulate', label: 'Simulate: WSL connection lost', icon: 'cloud', when: () => (w.kind === 'WSL' ? null : 'Only for WSL workspaces'), fn: () => ACT.simDisconnect() },
    { g: 'Help', label: 'Check for updates', icon: 'download', fn: () => updateDialog() },
  ];
}
function paletteItemsFor(mode, q) {
  if (mode === 'commands') {
    const list = commandList().filter(c => !q || c.label.toLowerCase().includes(q.toLowerCase()) || (c.g || '').toLowerCase().includes(q.toLowerCase()));
    return list.map(c => ({ ...c, reason: c.when ? c.when() : null, disabled: !!(c.when && c.when()) }));
  }
  if (mode === 'tags') {
    const tags = [...new Set(FS.list(UI.ws).flatMap(p => tagsOf(disk(p).body)))].sort();
    return tags.filter(t => !q || t.includes(q.toLowerCase())).map(t => ({ label: '#' + t, icon: 'tag', fn: () => { UI.tagFilter = t; openView('tags'); } }));
  }
  if (mode === 'search') return [{ label: `Search for “${q || ''}”`, icon: 'search', fn: () => openSearch(q), disabled: !q }];
  if (mode === 'schedule') {
    const p = parseSchedule(q);
    return [{ label: p ? `Schedule: ${p.title}` : 'Type a task, then a time such as “tomorrow 3pm”', reason: p ? `Creates “- [ ] ${p.title} @scheduled(${p.when})” in Inbox/Capture.md` : 'Concept: natural-language dates', icon: 'clock', disabled: !p, fn: () => { createScheduled(p); } }];
  }
  return [];
}
function parseSchedule(q) {
  if (!q.trim()) return null;
  let when = TODAY, time = '09:00';
  const m = q.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i);
  if (m) { let h = +m[1]; if (/pm/i.test(m[3]) && h < 12) h += 12; if (/am/i.test(m[3]) && h === 12) h = 0; time = `${String(h).padStart(2, '0')}:${m[2] || '00'}`; }
  if (/tomorrow/i.test(q)) when = '2026-10-29';
  const title = q.replace(m ? m[0] : '', '').replace(/\btomorrow\b|\btoday\b/gi, '').trim();
  if (!title) return null;
  return { title, when: `${when} ${time}` };
}
function createScheduled(p) {
  const path = 'Inbox/Capture.md';
  const cur = FS.read(UI.ws, path) || { body: '# Capture\n\n' };
  FS.write(UI.ws, path, cur.body.replace(/\n*$/, '\n') + `- [ ] ${p.title} @scheduled(${p.when})\n`);
  closeMenus(); if (UI.pal) UI.pal.rec.close();
  toast('Scheduled task added to Inbox/Capture.md');
  renderAll();
}
function drawPalette() {
  if (!UI.pal) return;
  const q = UI.pal.q;
  const modeKey = PAL_MODES[q[0]] ? q[0] : null;
  const mode = modeKey ? PAL_MODES[modeKey] : 'commands';
  const qq = modeKey ? q.slice(1).trim() : q;
  UI.pal.mode = mode;
  UI.pal.items = paletteItemsFor(mode, qq);
  if (UI.pal.i >= UI.pal.items.length) UI.pal.i = 0;
  const chips = $('#palmodes');
  if (chips) chips.innerHTML = Object.entries(PAL_MODES).map(([k, v]) => `<span class="pm${mode === v ? ' on' : ''}"><kbd>${k}</kbd>${v}</span>`).join('') + '<span class="pm-hint">Concept: @ schedules a task</span>';
  const list = $('#pall'); if (!list) return;
  let lastG = null;
  list.innerHTML = UI.pal.items.map((it, i) => {
    const head = it.g && it.g !== lastG ? `<div class="pal-g">${esc(it.g)}</div>` : '';
    lastG = it.g || lastG;
    return head + `<button class="pal-item${i === UI.pal.i ? ' on' : ''}${it.disabled ? ' disabled' : ''}" data-a="palRun" data-i="${i}"${it.disabled ? ' aria-disabled="true"' : ''}>${icon(it.icon || 'bolt', 'sm')}<span class="pl">${esc(it.label)}${it.reason ? `<small>${esc(it.reason)}</small>` : ''}</span>${it.hint ? `<kbd>${esc(it.hint)}</kbd>` : ''}</button>`;
  }).join('') || `<p class="muted pad">No matches.</p>`;
}
INP.palQ = el => { UI.pal.q = el.value; UI.pal.i = 0; drawPalette(); };
ACT.palRun = el => {
  const it = UI.pal.items[+el.dataset.i];
  if (!it || it.disabled) return;
  UI.pal.rec.close(); if (it.fn) it.fn();
};
function openPaletteWithQ(q) { openPalette(); UI.pal.q = q; $('#palq').value = q; drawPalette(); }
function shortcutsDialog() {
  const rows = Object.entries(APP.hotkeys).map(([k, v]) => `<tr><td>${esc(APP.hotkeyLabels[k] || k)}</td><td><kbd>${esc(v)}</kbd></td></tr>`).join('');
  modal({ title: 'Keyboard shortcuts', width: 520, body: `<table class="keys">${rows}</table><p class="hint">Change any shortcut in Settings › Hotkeys.</p>`, actions: [{ label: 'Close', primary: true }] });
}

/* Layout toggles */
function toggleSidebar() { UI.sb = !UI.sb; renderAll(); }
function toggleRight() { UI.rp = !UI.rp; renderAll(); }
function toggleFocus() { UI.focus = !UI.focus; renderAll(); if (UI.focus) toast('Focus mode. Press Esc to leave.'); }

/* Hover preview on wikilinks: after 400ms */
document.addEventListener('mouseover', e => {
  const a = e.target.closest && e.target.closest('#pv .wl');
  if (!a) return;
  clearTimeout(UI.hoverTimer);
  UI.hoverTimer = setTimeout(() => {
    const name = a.dataset.name; const p = resolveLink(name);
    const r = a.getBoundingClientRect();
    if (!p) { pop({ left: r.left, bottom: r.bottom, top: r.top }, `<div class="hcard"><b>${esc(name)}</b><p>No note with this name yet. Click to create it.</p></div>`); return; }
    const lines = disk(p).body.split('\n').slice(0, 20).map(esc).join('\n');
    pop({ left: r.left, bottom: r.bottom, top: r.top }, `<div class="hcard"><b>${esc(basename(p))}</b><pre>${lines}</pre><small class="hcard-f">${esc(p)}</small></div>`);
  }, 400);
});
document.addEventListener('mouseout', e => { const a = e.target.closest && e.target.closest('#pv .wl'); if (a) { clearTimeout(UI.hoverTimer); } });
