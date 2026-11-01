/* Editor: note view, Markdown rendering, editing events, conflict/missing/offline banners, agent edits */
function inline(t) {
  let s = esc(t);
  const codes = [];
  s = s.replace(/`([^`]+)`/g, (_, c) => { codes.push(c); return `\u0000${codes.length - 1}\u0000`; });
  s = s.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, n, a) => {
    const p = resolveLink(n);
    return p ? `<a class="wl" href="#" data-a="openLink" data-name="${n}">${a || n}</a>`
      : `<a class="wl ghost" href="#" data-a="ghostLink" data-name="${n}" title="Unresolved link">${a || n}</a>`;
  });
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>').replace(/~~([^~]+)~~/g, '<s>$1</s>');
  s = s.replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  s = s.replace(/(^|\s)#([A-Za-z][\w/-]*)/g, '$1<a class="tag" href="#" data-a="tagOpen" data-tag="$2">#$2</a>');
  s = s.replace(/\u0000(\d+)\u0000/g, (_, k) => `<code>${codes[+k]}</code>`);
  return s;
}
function md(src) {
  const L = src.split('\n');
  let i = 0;
  if (L[0] === '---') { const end = L.indexOf('---', 1); if (end > 0) i = end + 1; }
  const out = [];
  const isTask = s => /^\s*[-*] \[( |x|X)\] /.test(s);
  while (i < L.length) {
    const s = L[i];
    let m;
    if (/^%%.*%%\s*$/.test(s)) { i++; continue; }
    if (/^```/.test(s)) {
      const lang = s.slice(3).trim(); const body = []; i++;
      while (i < L.length && !/^```/.test(L[i])) body.push(L[i++]);
      i++;
      out.push(`<figure class="code"><figcaption>${esc(lang || 'text')}</figcaption><pre><code>${esc(body.join('\n'))}</code></pre></figure>`);
      continue;
    }
    if ((m = s.match(/^>\s*\[!(\w+)\][-+]?\s*(.*)$/))) {
      const type = m[1].toLowerCase(); const title = m[2] || type[0].toUpperCase() + type.slice(1); const body = []; i++;
      while (i < L.length && /^>/.test(L[i])) body.push(L[i++].replace(/^>\s?/, ''));
      out.push(`<div class="callout ${esc(type)}"><div class="co-t">${icon(type === 'warning' || type === 'danger' ? 'warn' : 'info', 'sm')}${inline(title)}</div>${body.map(b => `<p>${inline(b)}</p>`).join('')}</div>`);
      continue;
    }
    if (/^>/.test(s)) { const body = []; while (i < L.length && /^>/.test(L[i])) body.push(L[i++].replace(/^>\s?/, '')); out.push(`<blockquote>${body.map(b => `<p>${inline(b)}</p>`).join('')}</blockquote>`); continue; }
    if ((m = s.match(/^(#{1,6})\s+(.*)$/))) { const n = m[1].length; out.push(`<h${n} id="ln-${i}" data-line="${i}">${inline(m[2])}</h${n}>`); i++; continue; }
    if (isTask(s)) {
      out.push('<ul class="tasks">');
      while (i < L.length && isTask(L[i])) {
        const t = L[i].match(/^\s*[-*] \[( |x|X)\] (.*)$/); const done = t[1] !== ' ';
        const meta = [];
        const text = t[2].replace(/@(due|scheduled|priority)\(([^)]*)\)/g, (x, k, v) => { meta.push(`<span class="chip ${k === 'due' ? 'due' : k === 'priority' ? 'pri' : 'sch'}">${esc(chipLabel(k, v))}</span>`); return ''; });
        out.push(`<li class="task${done ? ' done' : ''}"><button class="cbx${done ? ' on' : ''}" data-a="taskToggle" data-line="${i}" aria-label="Toggle task">${done ? icon('check', 'xs') : ''}</button><span class="tt">${inline(text.trim())}</span>${meta.join('')}</li>`);
        i++;
      }
      out.push('</ul>'); continue;
    }
    if (/^\s*[-*] /.test(s)) { out.push('<ul>'); while (i < L.length && /^\s*[-*] /.test(L[i]) && !isTask(L[i])) { out.push(`<li>${inline(L[i].replace(/^\s*[-*] /, ''))}</li>`); i++; } out.push('</ul>'); continue; }
    if (/^\s*\d+\. /.test(s)) { out.push('<ol>'); while (i < L.length && /^\s*\d+\. /.test(L[i])) { out.push(`<li>${inline(L[i].replace(/^\s*\d+\. /, ''))}</li>`); i++; } out.push('</ol>'); continue; }
    if (/^\|.*\|\s*$/.test(s) && i + 1 < L.length && /^\|?\s*:?-+/.test(L[i + 1])) {
      const head = s.split('|').slice(1, -1).map(x => x.trim()); i += 2; const rows = [];
      while (i < L.length && /^\|.*\|\s*$/.test(L[i])) rows.push(L[i++].split('|').slice(1, -1).map(x => x.trim()));
      out.push(`<table><thead><tr>${head.map(c => `<th>${inline(c)}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map(c => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`);
      continue;
    }
    if ((m = s.match(/^!\[\[([^\]]+)\]\]\s*$/))) { out.push(`<div class="embed-card">${icon('file', 'sm')}<span>Embedded note · ${esc(m[1])}</span></div>`); i++; continue; }
    if ((m = s.match(/^!\[([^\]]*)\]\(([^)]+)\)\s*$/))) { out.push(`<figure class="img"><div class="img-ph">${icon('image')}<span>${esc(m[2])}</span></div>${m[1] ? `<figcaption>${esc(m[1])}</figcaption>` : ''}</figure>`); i++; continue; }
    if (/^---\s*$/.test(s)) { out.push('<hr>'); i++; continue; }
    if (!s.trim()) { i++; continue; }
    out.push(`<p data-line="${i}">${inline(s)}</p>`); i++;
  }
  return out.join('\n') || `<div class="empty-note">${art('notes')}<p>Empty note. Start typing in the editor, or press <kbd>/</kbd> for blocks.</p></div>`;
}

/* Main content */
function emptyHTML() {
  return `<div class="empty">${art('notes')}<h2>No note open</h2><p>Pick a file from the sidebar, press ${esc(APP.hotkeys.quickOpen)} to search, or start something new.</p>
    <p><button class="btn primary" data-a="newNoteBtn">New note</button> <button class="btn" data-a="openPalette">Search commands</button></p></div>`;
}
/* Editing */
ACT.copyToNewNoteBtn = () => copyToNewNote(noteTab());
ACT.toggleTrust = () => { UI.trust = !UI.trust; renderTrust(); };
ACT.trustToggle = () => { UI.trust = !UI.trust; renderAll(); };

INP.titleInp = () => {};
CHG.titleCh = el => {
  const t = noteTab(); if (!t) return;
  const v = el.value.trim();
  const err = validateName(v, t.path);
  const box = $('#titleErr');
  if (err) { if (box) box.textContent = err; el.value = basename(t.path); return; }
  if (box) box.textContent = '';
  if (v !== basename(t.path)) renameNote(t.path, v);
};
document.addEventListener('keydown', e => { if (e.target.id === 'title' && e.key === 'Enter') { e.preventDefault(); e.target.blur(); const ed = $('#ed'); if (ed && ed.getAttribute('contenteditable') === 'true') { ed.focus(); const f = [...ed.children].find(n => n.tagName === 'P') || ed.lastElementChild; if (f) setCaret(f, false); } } });

/* Image insert (name and location) */
function imageDialog() {
  const t = noteTab(); if (!t) return toast('Open a note first');
  modal({
    title: 'Insert image', width: 460,
    body: `<label class="field"><span>File name</span><input id="imgName" data-inp="imgName" value="diagram.png"></label>
      <label class="field"><span>Save to</span><select id="imgLoc"><option>${esc(APP.settings.attachFolder)}/</option><option>Same folder as note</option></select></label>
      <p class="err" id="imgErr" hidden></p>`,
    actions: [{ label: 'Cancel' }, { label: 'Insert', primary: true, fn: rec => {
      const n = rec.root.querySelector('#imgName').value.trim();
      const err = rec.root.querySelector('#imgErr');
      if (!/\.(png|jpe?g|gif|webp|svg)$/i.test(n)) { err.hidden = false; err.textContent = 'Use an image file name ending in .png, .jpg, .gif, .webp or .svg.'; return false; }
      const loc = rec.root.querySelector('#imgLoc').value.startsWith('Same') ? '' : APP.settings.attachFolder + '/';
      insertMd(`![${n.replace(/\.[^.]+$/, '')}](${loc}${n})`);
      toast('Image inserted. Drop the file into the attachments folder to see it.');
    } }],
  });
}
/* Templates */
function templatePicker() {
  const tpls = FS.list(UI.ws).filter(p => p.startsWith(APP.settings.templateFolder + '/'));
  const t = noteTab();
  const vars = { title: t ? basename(t.path) : 'Untitled', date: TODAY, time: '09:00' };
  const render = p => (FS.read(UI.ws, p).body || '').replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? `{{${k}}}`);
  modal({
    title: 'Insert template', width: 560,
    body: `<div class="tplgrid">${tpls.map((p, i) => `<label class="tpl"><input type="radio" name="tpl" value="${esc(p)}"${i === 0 ? ' checked' : ''}><span>${esc(basename(p))}</span></label>`).join('')}</div>
      <div class="field"><span>Preview</span><pre class="tplprev" id="tplprev">${esc(render(tpls[0]))}</pre></div>`,
    onMount: rec => {
      rec.root.addEventListener('change', e => { if (e.target.name === 'tpl') rec.root.querySelector('#tplprev').textContent = render(e.target.value); });
    },
    actions: [{ label: 'Cancel' }, { label: 'Insert', primary: true, fn: rec => {
      const p = rec.root.querySelector('input[name=tpl]:checked').value;
      const text = render(p);
      insertMd(text);
    } }],
  });
}
ACT.taskToggle = el => {
  const t = noteTab(); if (!t) return;
  const line = +el.dataset.line;
  mutateLine(t.path, line, l => l.replace(/\[( |x|X)\]/, m => (m === '[ ]' ? '[x]' : '[ ]')));
};
function mutateLine(path, line, fn) {
  const body = disk(path).body.split('\n');
  body[line] = fn(body[line]);
  mutateNote(path, body.join('\n'));
}
function mutateNote(path, newBody) {
  const t = UI.tabs.find(x => x.type === 'note' && x.path === path);
  if (t) { t.buffer = newBody; afterEdit(t); if (!isDirty(t)) saveTab(t); else saveTab(t); }
  else { snapshot(path, disk(path).body, 'Auto'); FS.write(UI.ws, path, newBody); }
  renderAll();
}
ACT.openLink = el => openNote(resolveLink(el.dataset.name));
ACT.ghostLink = el => {
  const name = el.dataset.name;
  const tpls = FS.list(UI.ws).filter(p => p.startsWith(APP.settings.templateFolder + '/'));
  modal({
    title: `Create “${name}”?`, width: 460,
    body: `<p class="lede">This link points to a note that doesn’t exist yet. Create it from a template?</p>
      <label class="field"><span>Template</span><select id="gtpl"><option value="">Blank note</option>${tpls.map(p => `<option value="${esc(p)}">${esc(basename(p))}</option>`).join('')}</select></label>`,
    actions: [{ label: 'Cancel' }, { label: 'Create note', primary: true, fn: rec => {
      const tp = rec.root.querySelector('#gtpl').value;
      const body = tp ? FS.read(UI.ws, tp).body.replace(/\{\{title\}\}/g, name).replace(/\{\{date\}\}/g, TODAY).replace(/\{\{time\}\}/g, '09:00') : `# ${name}\n\n`;
      const p = `${APP.settings.newNoteFolder}/${name}.md`;
      FS.write(UI.ws, p, body); UI.expanded[APP.settings.newNoteFolder] = true;
      openNote(p);
      const row = $('.row.active'); if (row) row.classList.add('arrive');
    } }],
  });
};
ACT.tagOpen = el => { UI.tagFilter = el.dataset.tag; UI.sb = true; UI.sbView = 'explorer'; openView('tags'); };
ACT.previewClick = (el, e) => {};

/* Conflict, missing, offline */
ACT.conflictKeep = () => {
  const t = noteTab(); const d = disk(t.path);
  snapshot(t.path, d.body, 'Before overwrite');
  try { FS.write(UI.ws, t.path, t.buffer); t.base = disk(t.path).rev; t.baseBody = t.buffer; t.conflict = null; toast('Kept your version. The disk version is in Recovery.'); }
  catch (e) { errorDialog({ title: 'Save failed', cause: 'Your version could not be written.', detail: e.message }); }
  renderAll();
};
ACT.conflictLoad = () => {
  const t = noteTab(); const d = disk(t.path);
  snapshot(t.path, t.buffer, 'Before reload');
  t.buffer = d.body; t.baseBody = d.body; t.base = d.rev; t.conflict = null;
  toast('Loaded the disk version. Your edits are in Recovery.');
  renderAll();
};
ACT.conflictCompare = () => {
  const t = noteTab(); const d = disk(t.path);
  const diff = lineDiff(t.buffer.split('\n'), d.body.split('\n'));
  const row = x => `<div class="dl ${x.t}"><span class="sg">${x.t === 'add' ? '+' : x.t === 'del' ? '−' : ' '}</span><span>${esc(x.s) || '&nbsp;'}</span></div>`;
  modal({
    title: 'Compare versions', width: 760,
    body: `<div class="cmp-legend"><span class="del">Your version</span><span class="add">On disk</span></div><div class="cmp">${diff.map(row).join('')}</div>`,
    actions: [{ label: 'Cancel' }, { label: 'Load disk version', fn: () => ACT.conflictLoad() }, { label: 'Keep my version', primary: true, fn: () => ACT.conflictKeep() }],
  });
};
ACT.saveAsDraft = () => {
  const t = noteTab();
  modal({
    title: 'Save draft as', width: 460,
    body: `<label class="field"><span>New name</span><input id="sad" data-inp="draftName" value="${esc(basename(t.path))} (draft)"></label><p class="err" id="sadErr" hidden></p>`,
    actions: [{ label: 'Cancel' }, { label: 'Save', primary: true, fn: rec => {
      const n = rec.root.querySelector('#sad').value;
      const err = validateName(n, `${APP.settings.newNoteFolder}/x.md`);
      if (err) { const b = rec.root.querySelector('#sadErr'); b.hidden = false; b.textContent = err; return false; }
      const p = `${APP.settings.newNoteFolder}/${n.trim()}.md`;
      FS.write(UI.ws, p, t.buffer); t.path = p; t.missing = false; t.baseBody = t.buffer; t.base = FS.read(UI.ws, p).rev;
      renderAll(); toast('Saved as a new file');
    } }],
  });
};
ACT.recreateFile = () => {
  const t = noteTab();
  FS.write(UI.ws, t.path, t.buffer); t.missing = false; t.baseBody = t.buffer; t.base = disk(t.path).rev;
  renderAll(); toast('File recreated');
};
ACT.closeMissing = () => closeTab(UI.active);
ACT.reconnect = () => flushOffline();
ACT.copyDiag = () => toast('Diagnostics copied: WSL distro Ubuntu, server stopped on 127.0.0.1:3000');

/* Agent changes */
function agentWrite(actor, path, transform, note) {
  const before = disk(path).body;
  const after = transform(before);
  const d = DB.ws[UI.ws].files[path];
  const change = { id: uid(), path, ws: UI.ws, actor, at: Date.now(), before, after, status: 'pending', note };
  d.body = after; d.rev = rev(); d.mtime = Date.now(); FS.ver++;
  APP.agentChanges.push(change);
  APP.activity.unshift({ at: Date.now(), agent: actor, tool: 'note_update', ws: UI.ws, path, result: 'OK' });
  const t = UI.tabs.find(x => x.type === 'note' && x.path === path);
  if (t) {
    t.agentAt = Date.now();
    const bl = before.split('\n'), al = after.split('\n');
    t.marks = al.map((l, i) => (bl[i] !== l ? i : -1)).filter(i => i >= 0);
    if (isDirty(t)) t.conflict = { at: Date.now(), by: actor };
    else { t.buffer = after; t.baseBody = after; t.base = d.rev; }
  }
  renderAll();
}
ACT.simAgent = () => {
  const path = 'Projects/Takenotes roadmap.md';
  agentWrite('claude-code', path, b => b.replace(/\n*$/, '\n') + '- [ ] Draft release notes @scheduled(2026-10-28 16:00)\n', 'Added a task');
  toast('claude-code added a task to the roadmap');
};
ACT.simDenied = () => {
  APP.activity.unshift({ at: Date.now(), agent: 'cursor', tool: 'note_update', ws: UI.ws, path: 'Projects/Takenotes roadmap.md', result: 'Denied', note: 'token is read-only' });
  toast('cursor’s write was denied: its token is read-only', { kind: 'error' });
  renderAll();
};
ACT.agentTray = () => {
  const list = APP.agentChanges.filter(c => c.status === 'pending' && c.ws === UI.ws);
  const body = list.length ? list.map(c => {
    const diff = lineDiff(c.before.split('\n'), c.after.split('\n')).filter(x => x.t !== 'eq').slice(0, 14);
    return `<div class="chg"><div class="chg-h"><b>${esc(basename(c.path))}</b><span class="muted">${esc(c.actor)} · ${fmtAgo(c.at)}</span></div>
      <div class="cmp mini">${diff.map(x => `<div class="dl ${x.t}"><span class="sg">${x.t === 'add' ? '+' : '−'}</span><span>${esc(x.s)}</span></div>`).join('')}</div>
      <div class="chg-a"><button class="btn sm" data-a="agentKeep" data-id="${c.id}">Keep</button><button class="btn sm" data-a="agentUndo" data-id="${c.id}">Undo</button></div></div>`;
  }).join('') : `<div class="emptyside">${art('agents')}<p>No agent changes waiting for review.</p></div>`;
  modal({ title: 'Agent changes', width: 620, body: `<p class="lede">Agents write through the same files you edit. Each change keeps a snapshot, so Undo always restores the exact previous version.</p>${body}`, actions: [{ label: 'Close', primary: true }] });
};
ACT.agentKeep = el => {
  const c = APP.agentChanges.find(x => x.id === el.dataset.id); if (c) c.status = 'kept';
  const top = topModal(); if (top) top.close();
  renderAll(); toast('Kept. The change is no longer waiting for review.');
};
ACT.agentUndo = el => {
  const c = APP.agentChanges.find(x => x.id === el.dataset.id); if (!c) return;
  const d = DB.ws[c.ws].files[c.path]; if (!d) return;
  snapshot(c.path, d.body, 'Before agent undo');
  d.body = c.before; d.rev = rev(); d.mtime = Date.now(); FS.ver++;
  c.status = 'undone';
  const t = UI.tabs.find(x => x.type === 'note' && x.path === c.path);
  if (t) { if (isDirty(t)) t.conflict = { at: Date.now(), by: 'undo' }; else { t.buffer = c.before; t.baseBody = c.before; t.base = d.rev; } t.marks = []; }
  toast('Undone. The version before the agent change is restored.');
  renderAll();
};
ACT.simExternal = () => {
  const t = noteTab() || UI.tabs.find(x => x.type === 'note');
  if (!t) return toast('Open a note first');
  const d = DB.ws[UI.ws].files[t.path];
  d.body = d.body.replace(/\n*$/, '\n') + `\n- Edited in another app at ${new Date().toTimeString().slice(0, 5)}\n`;
  d.rev = rev(); d.mtime = Date.now(); FS.ver++;
  if (isDirty(t)) t.conflict = { at: Date.now() };
  else { t.buffer = d.body; t.baseBody = d.body; t.base = d.rev; toast('Changed on disk. Reloaded.'); }
  renderAll();
};
ACT.simDelete = () => {
  const t = noteTab() || UI.tabs.find(x => x.type === 'note');
  if (!t) return toast('Open a note first');
  FS.remove(UI.ws, t.path); t.missing = true;
  renderAll();
};
ACT.simDisconnect = () => {
  WS().conn = 'offline';
  renderAll();
};
function recoveryDialog(t) {
  const list = WS().snaps[t.path] || [];
  if (!list.length) return modal({ title: 'File Recovery', width: 480, body: `<div class="emptyside">${art('notes')}<p>No snapshots yet for ${esc(basename(t.path))}. A snapshot is taken before saves and restores.</p></div>`, actions: [{ label: 'Close', primary: true }] });
  const first = list[0];
  modal({
    title: `File Recovery · ${basename(t.path)}`, width: 760,
    body: `<p class="lede small">Recovery is not a backup. Snapshots live in takenotes’ recovery folder on this machine.</p>
      <div class="rec">
        <div class="rec-list">${list.map((s, i) => `<button class="rec-item${i === 0 ? ' on' : ''}" data-a="recPick" data-id="${s.id}"><b>${esc(s.label)}</b><small>${fmtAgo(s.at)} · ${plural(s.body.split('\n').length, 'line')}</small></button>`).join('')}</div>
        <pre class="rec-prev" id="recPrev">${esc(first.body)}</pre>
      </div>`,
    actions: [{ label: 'Close' }, { label: 'Copy to new note', fn: rec => { const id = rec.root.dataset.sel || first.id; const s = list.find(x => x.id === id); const p = `${APP.settings.newNoteFolder}/${basename(t.path)} (recovered).md`; FS.write(UI.ws, p, s.body); openNote(p); } }, { label: 'Restore this version', primary: true, fn: rec => { const id = rec.root.dataset.sel || first.id; const s = list.find(x => x.id === id); snapshot(t.path, disk(t.path).body, 'Before restore'); FS.write(UI.ws, t.path, s.body); const tt = UI.tabs.find(x => x.type === 'note' && x.path === t.path); if (tt) { tt.buffer = s.body; tt.baseBody = s.body; tt.base = disk(t.path).rev; } renderAll(); toast('Restored. The version before restore is in Recovery.'); } }],
  });
}
ACT.recPick = el => {
  const t = noteTab(); const list = WS().snaps[t.path] || [];
  const s = list.find(x => x.id === el.dataset.id);
  $$('.rec-item').forEach(b => b.classList.toggle('on', b === el));
  $('#recPrev').textContent = s.body;
  el.closest('.dialog').dataset.sel = s.id;
};
ACT.recoveryOpen = () => { const t = noteTab(); if (t) recoveryDialog(t); };
