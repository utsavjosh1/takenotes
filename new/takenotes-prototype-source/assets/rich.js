/* Rich editor. People write on a normal page: headings, lists, to-dos, links.
   Markdown stays on disk as the file format, but nobody has to see or learn it.
   edLoad(): file text -> page.  edSync(): page -> file text (only after the person edits). */

/* ---------- small helpers ---------- */
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function shortDay(s) {
  const m = String(s).match(/^(\d{4})-(\d\d)-(\d\d)(?:[ T](\d\d:\d\d))?/);
  if (!m) return s;
  return `${MONTHS[+m[2] - 1]} ${+m[3]}${m[4] ? ', ' + m[4] : ''}`;
}
function chipLabel(k, v) {
  if (k === 'priority') return `${v.charAt(0).toUpperCase() + v.slice(1)} priority`;
  return `${k === 'due' ? 'Due' : 'Planned'} ${shortDay(v)}`;
}
function splitFm(buf) {
  const L = buf.split('\n');
  if (L[0] === '---') {
    const end = L.indexOf('---', 1);
    if (end > 0) return { fm: L.slice(0, end + 1).join('\n') + '\n', body: L.slice(end + 1).join('\n'), off: end + 1 };
  }
  return { fm: '', body: buf, off: 0 };
}

/* ---------- file text -> editable page ---------- */
function inlineEd(text) {
  const stash = [];
  const put = h => { stash.push(h); return `\u0001${stash.length - 1}\u0001`; };
  let s = esc(text);
  s = s.replace(/`([^`]+)`/g, (_, c) => put(`<code>${c}</code>`));
  s = s.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (raw, n, a) => {
    const ok = resolveLink(n);
    return put(`<a class="wl${ok ? '' : ' ghost'}" contenteditable="false" href="#" data-a="${ok ? 'openLink' : 'ghostLink'}" data-name="${n}" data-raw="${raw}" title="${ok ? 'Open note' : 'No note with this name yet. Click to create it.'}">${a || n}</a>`);
  });
  s = s.replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, (_, t, u) => put(`<a href="${u}" target="_blank" rel="noopener">${t}</a>`));
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>').replace(/~~([^~]+)~~/g, '<s>$1</s>');
  s = s.replace(/(^|\s)#([A-Za-z][\w/-]*)/g, (_, sp, tg) => `${sp}<a class="tag" contenteditable="false" href="#" data-a="tagOpen" data-tag="${tg}">#${tg}</a>`);
  return s.replace(/\u0001(\d+)\u0001/g, (_, k) => stash[+k]);
}
function taskChips(text) {
  const chips = [];
  const clean = text.replace(/@(due|scheduled|priority)\(([^)]*)\)/g, (raw, k, v) => {
    chips.push(`<span class="chip ${k === 'due' ? 'due' : k === 'priority' ? 'pri' : 'sch'}" contenteditable="false" data-raw="${esc(raw)}">${esc(chipLabel(k, v))}</span>`);
    return '';
  });
  return { clean: clean.trim(), chips: chips.join('') };
}
function liHTML(kind, depth, text, done) {
  if (kind === 'task') {
    const { clean, chips } = taskChips(text);
    return `<li class="task${done ? ' done' : ''}" data-d="${depth}"><span class="cbx${done ? ' on' : ''}" contenteditable="false" data-a="edTask" role="checkbox" aria-checked="${!!done}" title="Mark as done"></span><span class="tt">${inlineEd(clean) || '<br>'}</span>${chips}</li>`;
  }
  return `<li data-d="${depth}">${inlineEd(text) || '<br>'}</li>`;
}
function rawHTML(mdText, cls) {
  const inner = md(mdText).replace(/<div class="empty-note">[\s\S]*$/, '');
  return `<div class="raw ${cls || ''}" contenteditable="false" data-md="${esc(mdText)}" title="Double-click to edit this block">${inner}</div>`;
}
function edHTML(body, off, marks) {
  const L = body.split('\n');
  const out = [];
  let i = 0;
  const mk = (start, end) => (marks && marks.some(m => m >= off + start && m < off + end)) ? ' agent-mark' : '';
  const dl = s => `data-line="${off + s}"`;
  const listRe = /^(\s*)([-*]|\d+\.)\s(\[[ xX]\]\s)?(.*)$/;
  while (i < L.length) {
    const s = L[i];
    let m;
    if (!s.trim()) { i++; continue; }
    if (/^%%.*%%\s*$/.test(s)) { out.push(`<div class="raw hide" hidden contenteditable="false" data-md="${esc(s)}"></div>`); i++; continue; }
    if (/^```/.test(s)) {
      const start = i; const lang = s.slice(3).trim(); const code = []; i++;
      while (i < L.length && !/^```/.test(L[i])) code.push(L[i++]);
      i++;
      out.push(`<pre class="code${mk(start, i)}" ${dl(start)} data-lang="${esc(lang)}" spellcheck="false">${esc(code.join('\n')) || '<br>'}</pre>`);
      continue;
    }
    if (/^>\s*\[!\w+\]/.test(s)) {
      const start = i; const frag = [];
      while (i < L.length && /^>/.test(L[i])) frag.push(L[i++]);
      out.push(rawHTML(frag.join('\n'), 'callout-block' + mk(start, i)));
      continue;
    }
    if (/^>/.test(s)) {
      const start = i; const ps = [];
      while (i < L.length && /^>/.test(L[i])) ps.push(L[i++].replace(/^>\s?/, ''));
      out.push(`<blockquote ${dl(start)} class="${mk(start, i).trim()}">${ps.map(p => `<p>${inlineEd(p) || '<br>'}</p>`).join('')}</blockquote>`);
      continue;
    }
    if ((m = s.match(/^(#{1,6})\s+(.*)$/))) {
      const n = Math.min(m[1].length, 3);
      out.push(`<h${n} ${dl(i)} class="${mk(i, i + 1).trim()}">${inlineEd(m[2]) || '<br>'}</h${n}>`); i++; continue;
    }
    if ((m = s.match(listRe))) {
      const start = i;
      const kindOf = x => { const mm = x.match(listRe); return mm ? (mm[3] ? 'task' : /\d/.test(mm[2]) ? 'ol' : 'ul') : null; };
      const kind = kindOf(s); const items = [];
      while (i < L.length && kindOf(L[i]) === kind) {
        const mm = L[i].match(listRe);
        items.push(liHTML(kind, Math.min(3, Math.floor(mm[1].length / 2)), mm[4], mm[3] && /[xX]/.test(mm[3])));
        i++;
      }
      const tag = kind === 'ol' ? 'ol' : 'ul';
      out.push(`<${tag} class="${kind === 'task' ? 'tasks' : ''}${mk(start, i)}" ${dl(start)}>${items.join('')}</${tag}>`);
      continue;
    }
    if (/^\|.*\|\s*$/.test(s) && i + 1 < L.length && /^\|?\s*:?-+/.test(L[i + 1])) {
      const start = i; const frag = [L[i++], L[i++]];
      while (i < L.length && /^\|.*\|\s*$/.test(L[i])) frag.push(L[i++]);
      out.push(rawHTML(frag.join('\n'), 'table-block' + mk(start, i)));
      continue;
    }
    if (/^!\[/.test(s)) { out.push(rawHTML(s, 'media-block' + mk(i, i + 1))); i++; continue; }
    if (/^(---|\*\*\*)\s*$/.test(s)) { out.push(`<hr class="raw" contenteditable="false" data-md="---">`); i++; continue; }
    out.push(`<p ${dl(i)} class="${mk(i, i + 1).trim()}">${inlineEd(s) || '<br>'}</p>`); i++;
  }
  out.push('<p><br></p>');
  return out.join('');
}
function edLoad(ed, t) {
  const { fm, body, off } = splitFm(t.buffer);
  ed._fm = fm; ed._path = t.path; ed._buf = t.buffer;
  ed.innerHTML = edHTML(body, off, t.marks);
  const h = ed.firstElementChild; if (h && h.tagName === 'H1' && h.textContent.trim() === basename(t.path)) h.classList.add('dup-title');
}

/* ---------- editable page -> file text ---------- */
function serInline(n) {
  let o = '';
  n.childNodes.forEach(c => {
    if (c.nodeType === 3) { o += c.nodeValue.replace(/\u00a0/g, ' ').replace(/\u200b/g, ''); return; }
    if (c.nodeType !== 1) return;
    const tg = c.tagName;
    if (c.dataset && c.dataset.raw != null) o += c.dataset.raw;
    else if (c.classList.contains('tag')) o += '#' + c.dataset.tag;
    else if (tg === 'BR') o += '';
    else if (tg === 'B' || tg === 'STRONG') { const x = serInline(c); o += x ? `**${x}**` : ''; }
    else if (tg === 'I' || tg === 'EM') { const x = serInline(c); o += x ? `*${x}*` : ''; }
    else if (tg === 'S' || tg === 'STRIKE' || tg === 'DEL') { const x = serInline(c); o += x ? `~~${x}~~` : ''; }
    else if (tg === 'CODE') o += '`' + c.textContent + '`';
    else if (tg === 'A') { const x = serInline(c); o += `[${x}](${c.getAttribute('href') || ''})`; }
    else o += serInline(c);
  });
  return o;
}
function serEd(ed) {
  const out = [];
  for (const n of ed.children) {
    const tg = n.tagName;
    if (tg === 'HR' || n.classList.contains('raw')) { if (n.dataset.md != null) out.push(n.dataset.md); continue; }
    if (tg === 'UL' || tg === 'OL') {
      const lines = []; let k = 0;
      for (const li of n.children) {
        const ind = '  '.repeat(+li.dataset.d || 0);
        if (li.classList.contains('task')) {
          const tt = li.querySelector('.tt');
          const chips = [...li.querySelectorAll('.chip')].map(c => c.dataset.raw).join(' ');
          lines.push(`${ind}- [${li.classList.contains('done') ? 'x' : ' '}] ${serInline(tt).trim()}${chips ? ' ' + chips : ''}`.trimEnd());
        } else if (tg === 'OL') lines.push(`${ind}${++k}. ${serInline(li).trim()}`);
        else lines.push(`${ind}- ${serInline(li).trim()}`);
      }
      if (lines.length) out.push(lines.join('\n'));
      continue;
    }
    if (/^H[1-6]$/.test(tg)) { out.push('#'.repeat(+tg[1]) + ' ' + serInline(n).trim()); continue; }
    if (tg === 'BLOCKQUOTE') { out.push([...n.children].map(p => '> ' + serInline(p).trim()).join('\n')); continue; }
    if (tg === 'PRE') { out.push('```' + (n.dataset.lang || '') + '\n' + n.textContent.replace(/\n$/, '') + '\n```'); continue; }
    const text = serInline(n).trim();
    if (text) out.push(text);
  }
  return out.join('\n\n') + (out.length ? '\n' : '');
}
function edSync() {
  const ed = $('#ed'); const t = noteTab();
  if (!ed || !t || ed._path !== t.path) return;
  const buf = ed._fm + serEd(ed);
  if (buf === t.buffer) return;
  t.buffer = buf; ed._buf = buf; t.marks = [];
  scheduleAutosave(t);
  updateDerived(t);
}
function updateDerived(t) {
  renderTabs(); renderStatus(); renderRight(); renderTrust();
  const top = $('#docMeta'); if (top && t) top.innerHTML = metaHTML(t);
}
function afterEdit(t) {
  t.marks = t.marks || [];
  scheduleAutosave(t);
  const ed = $('#ed');
  if (ed && noteTab() === t) edLoad(ed, t);
  updateDerived(t);
}

/* ---------- page: banners, title, meta, editor ---------- */
function noteBanners(t) {
  const b = [];
  if (t.missing) {
    b.push(isDirty(t)
      ? `<div class="banner danger" role="alert">${icon('warn', 'sm')}<div><b>This note was deleted outside takenotes.</b> Your unsaved changes are still here.</div><button class="btn sm" data-a="saveAsDraft">Save as new note</button><button class="btn sm primary" data-a="recreateFile">Restore note</button></div>`
      : `<div class="banner danger" role="alert">${icon('warn', 'sm')}<div><b>This note was deleted outside takenotes.</b></div><button class="btn sm" data-a="closeMissing">Close</button></div>`);
  }
  if (t.conflict && !t.missing) b.push(`<div class="banner warn" role="alert">${icon('warn', 'sm')}<div><b>This note was changed somewhere else.</b> You also have changes here, so nothing was merged. Both versions are safe.</div>
      <button class="btn sm" data-a="conflictKeep">Keep mine</button><button class="btn sm" data-a="conflictLoad">Use the other one</button><button class="btn sm primary" data-a="conflictCompare">Compare</button></div>`);
  if (WS().conn === 'offline') b.push(`<div class="banner danger" role="alert">${icon('cloud', 'sm')}<div><b>Connection lost.</b> Keep writing. Changes save when it comes back.</div><button class="btn sm" data-a="copyDiag">Copy details</button><button class="btn sm primary" data-a="reconnect">Reconnect</button></div>`);
  if (isReadOnly(t.path)) b.push(`<div class="banner info" role="status">${icon('lock', 'sm')}<div>This folder is read-only. You can read and copy it, but not change it.</div><button class="btn sm" data-a="copyToNewNoteBtn">Copy to a new note</button></div>`);
  const ch = APP.agentChanges.filter(c => c.path === t.path && c.status === 'pending').slice(-1)[0];
  if (ch) b.push(`<div class="agent-chip">${icon('bot', 'xs')} claude-code changed this note <button class="linkbtn" data-a="agentTray">Review</button></div>`);
  else if (t.agentAt) b.push(`<div class="agent-note">${icon('bot', 'xs')} Edited by claude-code · ${fmtAgo(t.agentAt)}</div>`);
  return b.join('');
}
function metaHTML(t) {
  const d = disk(t.path);
  const tags = tagsOf(t.buffer);
  const folder = dirname(t.path) || WS().name;
  const parts = [esc(folder), d && d.mtime ? 'Edited ' + esc(fmtAgo(d.mtime)) : ''].filter(Boolean);
  return parts.join('<i class="sep">·</i>') + (tags.length ? '<i class="sep">·</i>' + tags.map(x => `<a class="tag" href="#" data-a="tagOpen" data-tag="${esc(x)}">#${esc(x)}</a>`).join(' ') : '');
}
function noteTop(t) {
  const fav = WS().favs.some(f => f.type === 'file' && f.path === t.path);
  return `${noteBanners(t)}
    <div class="title-row">
      <input class="title-input" id="title" data-ch="titleCh" value="${esc(basename(t.path))}" aria-label="Note title" spellcheck="false" placeholder="Untitled">
      <div class="title-tools">
        <button class="icon-btn${fav ? ' on' : ''}" data-a="toggleFav" title="${fav ? 'Remove from favourites' : 'Add to favourites'}" aria-pressed="${fav}">${icon('star', 'sm')}</button>
        <button class="icon-btn" data-a="noteMore" title="More" aria-haspopup="menu" aria-label="More">${icon('dots', 'sm')}</button>
      </div>
    </div>
    <div class="title-err" id="titleErr"></div>
    <div class="note-meta" id="docMeta">${metaHTML(t)}</div>`;
}
function noteHTML(t) {
  const ro = t.missing || isReadOnly(t.path);
  return `<div class="doc">
    <div class="page-col" id="docTop">${noteTop(t)}</div>
    <div class="page-col"><div id="ed" class="ed" contenteditable="${ro ? 'false' : 'true'}" spellcheck="${!!APP.settings.spellcheck}" role="textbox" aria-multiline="true" aria-label="Note"></div></div>
    <div class="seltool" id="seltool" hidden>
      <button data-a="edFmt" data-f="bold" title="Bold (Ctrl+B)" aria-label="Bold"><b>B</b></button>
      <button data-a="edFmt" data-f="italic" title="Italic (Ctrl+I)" aria-label="Italic"><i>I</i></button>
      <button data-a="edFmt" data-f="strike" title="Strikethrough" aria-label="Strikethrough"><s>S</s></button>
      <span class="sep-v"></span>
      <button data-a="edFmt" data-f="h2" title="Heading" aria-label="Heading">H</button>
      <button data-a="edFmt" data-f="task" title="Turn into a to-do" aria-label="To-do">${icon('check', 'xs')}</button>
      <button data-a="edFmt" data-f="link" title="Add link (Ctrl+K)" aria-label="Add link">${icon('link', 'xs')}</button>
    </div>
    <button class="plus" id="plus" data-a="edPlus" hidden aria-label="Add a block" title="Add a block">${icon('plus', 'sm')}</button>
    <div class="slash" id="slash" hidden role="listbox"></div>
  </div>`;
}
function renderContent() {
  if (isMobile()) return renderMobile();
  const el = $('#content'); const t = tabOf();
  const keep = el.scrollTop;
  if (t && t.type === 'note') {
    const ed = $('#ed');
    if (ed && el.contains(ed) && ed._path === t.path && ed._buf === t.buffer) {
      const top = $('#docTop'); if (top) { const active = document.activeElement; if (!(active && top.contains(active))) top.innerHTML = noteTop(t); }
      ed.setAttribute('contenteditable', (t.missing || isReadOnly(t.path)) ? 'false' : 'true');
      renderFind(); return;
    }
    el.innerHTML = noteHTML(t);
    const e2 = $('#ed'); edLoad(e2, t);
    if (!t.buffer.trim() && !t.missing) setTimeout(() => e2.focus(), 30);
  } else el.innerHTML = t ? (VIEWS[t.view] ? VIEWS[t.view]() : '<p>Not found</p>') : emptyHTML();
  el.scrollTop = keep;
  renderFind();
  if (UI.jump != null && t && t.type === 'note') setTimeout(() => jumpToLine(UI.jump), 20);
}
const _renderMobile = renderMobile;
renderMobile = function () { _renderMobile(); const ed = $('#ed'); const t = noteTab(); if (ed && t) edLoad(ed, t); };
function jumpToLine(line) {
  const ed = $('#ed'); if (!ed) return;
  let best = null;
  ed.querySelectorAll('[data-line]').forEach(n => { if (+n.dataset.line <= line) best = n; });
  UI.jump = null;
  if (!best) return;
  best.scrollIntoView({ block: 'center', behavior: 'smooth' });
  best.classList.add('flash'); setTimeout(() => best.classList.remove('flash'), 1600);
}

/* ---------- caret helpers ---------- */
function selNode() { const s = getSelection(); return s && s.rangeCount ? s.anchorNode : null; }
function inEd(n) { const ed = $('#ed'); return !!(ed && n && ed.contains(n)); }
function curBlock() {
  const ed = $('#ed'); let n = selNode();
  if (!inEd(n)) return null;
  while (n && n.parentNode !== ed) n = n.parentNode;
  return n && n.nodeType === 1 ? n : null;
}
function curEl(sel) { let n = selNode(); if (n && n.nodeType === 3) n = n.parentNode; return n && n.closest ? n.closest(sel) : null; }
function setCaret(node, end) {
  const r = document.createRange(); r.selectNodeContents(node); r.collapse(!end);
  const s = getSelection(); s.removeAllRanges(); s.addRange(r);
}
function textBefore(block) {
  const s = getSelection(); if (!s.rangeCount) return '';
  const r = document.createRange(); r.selectNodeContents(block); r.setEnd(s.anchorNode, s.anchorOffset);
  return r.toString().replace(/\u200b/g, '');
}
const isEmptyEl = n => !n.textContent.replace(/\u200b/g, '').trim() && !n.querySelector('a,code,.chip');

/* ---------- building and converting blocks ---------- */
function mkEl(tag, cls) { const x = document.createElement(tag); if (cls) x.className = cls; return x; }
function newLi(task, html, depth) { const t = document.createElement('template'); t.innerHTML = liHTML(task ? 'task' : 'ul', depth || 0, '', false); const li = t.content.firstChild; if (html) (li.querySelector('.tt') || li).innerHTML = html; return li; }
function mkBlock(kind, html) {
  let b;
  if (kind === 'p') { b = mkEl('p'); b.innerHTML = html || '<br>'; }
  else if (/^h[1-3]$/.test(kind)) { b = mkEl(kind); b.innerHTML = html || '<br>'; }
  else if (kind === 'quote') { b = mkEl('blockquote'); const p = mkEl('p'); p.innerHTML = html || '<br>'; b.appendChild(p); }
  else if (kind === 'ul' || kind === 'ol') { b = mkEl(kind); b.appendChild(newLi(false, html)); }
  else if (kind === 'task') { b = mkEl('ul', 'tasks'); b.appendChild(newLi(true, html)); }
  else if (kind === 'code') { b = mkEl('pre', 'code'); b.dataset.lang = ''; b.spellcheck = false; b.innerHTML = '<br>'; }
  else if (kind === 'hr') { b = mkEl('hr', 'raw'); b.setAttribute('contenteditable', 'false'); b.dataset.md = '---'; }
  return b;
}
function blockHTML(b) {
  if (!b) return '';
  if (b.tagName === 'UL' || b.tagName === 'OL') { const li = b.firstElementChild; return (li.querySelector('.tt') || li).innerHTML; }
  if (b.tagName === 'BLOCKQUOTE') return b.firstElementChild ? b.firstElementChild.innerHTML : '';
  return b.innerHTML;
}
function liOut(li) {   // split the list so this item is its own block, return that block
  const list = li.parentNode; const before = [], after = []; let hit = false;
  for (const c of [...list.children]) { if (c === li) { hit = true; continue; } (hit ? after : before).push(c); }
  const mk = () => mkEl(list.tagName, list.className);
  const mid = mk(); mid.appendChild(li);
  list.after(mid);
  if (after.length) { const a = mk(); after.forEach(x => a.appendChild(x)); mid.after(a); }
  if (!before.length) list.remove();
  return mid;
}
function edApply(kind) {
  const ed = $('#ed'); if (!ed || ed.getAttribute('contenteditable') === 'false') return;
  let b = curBlock();
  if (!b) { ed.focus(); b = ed.lastElementChild; }
  const li = curEl('li');
  const same = (kind === 'ul' && b.tagName === 'UL' && !b.classList.contains('tasks')) || (kind === 'ol' && b.tagName === 'OL') || (kind === 'task' && b.classList.contains('tasks')) || (kind === b.tagName.toLowerCase());
  if (same && kind !== 'p') kind = 'p';   // second click turns it back into plain text
  if (li) b = liOut(li);
  const html = blockHTML(b);
  let nb;
  if (kind === 'callout') {
    const t = document.createElement('template'); t.innerHTML = rawHTML('> [!info] Note\n> Write something here', 'callout-block'); nb = t.content.firstChild;
  } else if (kind === 'table') {
    const t = document.createElement('template'); t.innerHTML = rawHTML('| Column A | Column B |\n| --- | --- |\n| | |', 'table-block'); nb = t.content.firstChild;
  } else if (kind === 'date') { document.execCommand('insertText', false, shortDay(TODAY) + ' '); return edSync(); }
  else nb = mkBlock(kind, html);
  b.replaceWith(nb);
  if (nb.tagName === 'HR' || nb.classList.contains('raw')) { const p = mkBlock('p'); nb.after(p); setCaret(p); }
  else setCaret(nb.tagName === 'UL' || nb.tagName === 'OL' ? (nb.querySelector('.tt') || nb.firstElementChild) : nb.tagName === 'BLOCKQUOTE' ? nb.firstElementChild : nb, true);
  edSync(); edCaretUI();
}
ACT.edTask = el => {
  const li = el.closest('li'); if (!li || $('#ed').getAttribute('contenteditable') === 'false') return;
  const on = li.classList.toggle('done'); el.classList.toggle('on', on); el.setAttribute('aria-checked', on);
  el.innerHTML = '';
  edSync();
};

/* ---------- keyboard ---------- */
function edKey(e) {
  const t = noteTab(); if (!t) return false;
  if (UI.slash && !$('#slash').hidden) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); UI.slash.i = (UI.slash.i + (e.key === 'ArrowDown' ? 1 : -1) + UI.slash.items.length) % UI.slash.items.length; drawSlash(); return true; }
    if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); applySlash(UI.slash.items[UI.slash.i]); return true; }
    if (e.key === 'Escape') { e.preventDefault(); closeSlash(); return true; }
  }
  const combo = comboOf(e);
  if (combo === 'Ctrl+B') { e.preventDefault(); document.execCommand('bold'); edSync(); return true; }
  if (combo === 'Ctrl+I') { e.preventDefault(); document.execCommand('italic'); edSync(); return true; }
  if (combo === 'Ctrl+K') { e.preventDefault(); edLink(); return true; }
  if (combo === 'Ctrl+S') { e.preventDefault(); saveTab(t); return true; }
  if (e.key === 'Tab') {
    e.preventDefault();
    const li = curEl('li');
    if (li) { li.dataset.d = Math.max(0, Math.min(3, (+li.dataset.d || 0) + (e.shiftKey ? -1 : 1))); edSync(); }
    return true;
  }
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) return edEnter(e);
  if (e.key === 'Backspace') return edBackspace(e);
  if (e.key === ' ') return edSpace(e);
  return false;
}
function edSpace(e) {
  const b = curBlock(); if (!b || b.tagName !== 'P') return false;
  const s = getSelection(); if (!s.isCollapsed) return false;
  const txt = textBefore(b); if (txt !== b.textContent.replace(/\u200b/g, '')) return false;
  const map = { '#': 'h1', '##': 'h2', '###': 'h3', '-': 'ul', '*': 'ul', '1.': 'ol', '[]': 'task', '[ ]': 'task', '>': 'quote' };
  const kind = map[txt]; if (!kind) return false;
  e.preventDefault(); b.innerHTML = '<br>'; edApply(kind); return true;
}
function edEnter(e) {
  const b = curBlock(); if (!b) return false;
  const s = getSelection(); if (!s.rangeCount) return false;
  if (!s.isCollapsed) { s.getRangeAt(0).deleteContents(); }
  const li = curEl('li');
  if (li) {
    e.preventDefault();
    const tt = li.querySelector('.tt') || li;
    if (isEmptyEl(tt)) {
      if ((+li.dataset.d || 0) > 0) li.dataset.d = +li.dataset.d - 1;
      else { const blk = liOut(li); const p = mkBlock('p'); blk.replaceWith(p); setCaret(p); }
    } else {
      const r = s.getRangeAt(0); const tail = document.createRange();
      tail.setStart(r.endContainer, r.endOffset); tail.setEnd(tt, tt.childNodes.length);
      const frag = tail.extractContents();
      const nli = newLi(li.classList.contains('task'), '', +li.dataset.d || 0);
      const nt = nli.querySelector('.tt') || nli; nt.innerHTML = ''; nt.appendChild(frag);
      if (!nt.textContent && !nt.querySelector('*')) nt.innerHTML = '<br>';
      if (!tt.textContent && !tt.querySelector('*')) tt.innerHTML = '<br>';
      li.after(nli); setCaret(nt);
    }
    edSync(); edCaretUI(); return true;
  }
  if (b.tagName === 'PRE') {
    e.preventDefault();
    const atEnd = textBefore(b).length >= b.textContent.length;
    if (atEnd && /\n$/.test(b.textContent)) { b.textContent = b.textContent.replace(/\n$/, '') || ''; if (!b.textContent) b.innerHTML = '<br>'; const p = mkBlock('p'); b.after(p); setCaret(p); }
    else document.execCommand('insertText', false, '\n' + (atEnd ? '\n' : ''));
    if (atEnd && !/\n\n$/.test(b.textContent)) { /* keep a trailing newline so the caret shows on a new line */ }
    edSync(); return true;
  }
  if (b.tagName === 'BLOCKQUOTE') {
    const p = curEl('blockquote > p');
    if (p && isEmptyEl(p)) { e.preventDefault(); p.remove(); const np = mkBlock('p'); b.after(np); setCaret(np); if (!b.children.length) b.remove(); edSync(); return true; }
    return false;
  }
  if (b.tagName === 'P') {
    const txt = b.textContent.trim();
    if (txt === '---' || txt === '***') { e.preventDefault(); const hr = mkBlock('hr'); b.replaceWith(hr); const p = mkBlock('p'); hr.after(p); setCaret(p); edSync(); return true; }
    if (/^```/.test(txt)) { e.preventDefault(); const pre = mkBlock('code'); pre.dataset.lang = txt.slice(3).trim(); b.replaceWith(pre); setCaret(pre); edSync(); return true; }
  }
  if (/^H[1-3]$/.test(b.tagName)) {
    e.preventDefault();
    const r = s.getRangeAt(0); const tail = document.createRange();
    tail.setStart(r.endContainer, r.endOffset); tail.setEnd(b, b.childNodes.length);
    const frag = tail.extractContents();
    const p = mkBlock('p'); if (frag.textContent) { p.innerHTML = ''; p.appendChild(frag); }
    if (!b.textContent) b.innerHTML = '<br>';
    b.after(p); setCaret(p); edSync(); return true;
  }
  return false;
}
function edBackspace(e) {
  const b = curBlock(); if (!b) return false;
  const s = getSelection(); if (!s.isCollapsed) return false;
  const li = curEl('li');
  const host = li ? (li.querySelector('.tt') || li) : (b.tagName === 'BLOCKQUOTE' ? b.firstElementChild : b);
  if (textBefore(host) !== '' || !host) return false;
  if (li) {
    e.preventDefault();
    if ((+li.dataset.d || 0) > 0) li.dataset.d = +li.dataset.d - 1;
    else edApply('p');
    edSync(); return true;
  }
  if (/^H[1-3]$/.test(b.tagName) || b.tagName === 'BLOCKQUOTE') { e.preventDefault(); edApply('p'); return true; }
  return false;
}
document.addEventListener('input', e => {
  if (e.target.id !== 'ed') return;
  edSync(); edTrigger(); edCaretUI();
});
document.addEventListener('paste', e => {
  if (e.target.id !== 'ed') return;
  e.preventDefault();
  const txt = (e.clipboardData || window.clipboardData).getData('text/plain');
  insertMd(txt);
});
document.addEventListener('dblclick', e => {
  const raw = e.target.closest && e.target.closest('.raw[data-md]'); if (!raw || raw.tagName === 'HR') return;
  modal({
    title: 'Edit block', width: 560,
    body: `<p class="lede small">This block (a table, highlighted note or image) is edited as plain text.</p><textarea id="rawTa" class="plain-ta" rows="8" spellcheck="false">${esc(raw.dataset.md)}</textarea>`,
    actions: [{ label: 'Cancel' }, { label: 'Save', primary: true, fn: rec => {
      const v = rec.root.querySelector('#rawTa').value;
      const t = document.createElement('template'); t.innerHTML = rawHTML(v, raw.className.replace(/\braw\b/, '').trim());
      raw.replaceWith(t.content.firstChild); edSync();
    } }],
  });
});
function insertMd(text) {
  const ed = $('#ed'); if (!ed) { const t = noteTab(); if (t) { t.buffer += text; afterEdit(t); } return; }
  ed.focus();
  if (UI.edRange) { const s = getSelection(); s.removeAllRanges(); s.addRange(UI.edRange); UI.edRange = null; }
  else if (!inEd(selNode())) setCaret(ed.lastElementChild, false);
  if (curEl('pre') || (!/\n/.test(text) && !/^(#{1,6} |[-*] |\d+\. |> )/.test(text))) document.execCommand('insertText', false, text);
  else { const html = edHTML(text, 0, []).replace(/<p><br><\/p>$/, ''); document.execCommand('insertHTML', false, html); }
  edSync();
}
function insertNodes(html) {
  const s = getSelection(); if (!s.rangeCount) return;
  const r = s.getRangeAt(0); r.deleteContents();
  const t = document.createElement('template'); t.innerHTML = html;
  const frag = t.content; const last = frag.lastChild;
  r.insertNode(frag);
  if (last) { const nr = document.createRange(); nr.setStartAfter(last); nr.collapse(true); s.removeAllRanges(); s.addRange(nr); }
}
function saveEdRange() { const s = getSelection(); UI.edRange = s.rangeCount && inEd(s.anchorNode) ? s.getRangeAt(0).cloneRange() : null; }
function restoreEdRange() { const ed = $('#ed'); if (ed) ed.focus(); if (UI.edRange) { const s = getSelection(); s.removeAllRanges(); s.addRange(UI.edRange); UI.edRange = null; } }

/* ---------- formatting toolbar ---------- */
ACT.edFmt = el => {
  const f = el.dataset.f;
  $('#ed').focus();
  if (f === 'bold') document.execCommand('bold');
  else if (f === 'italic') document.execCommand('italic');
  else if (f === 'strike') document.execCommand('strikeThrough');
  else if (f === 'link') return edLink();
  else if (f === 'h2') edApply(curBlock() && curBlock().tagName === 'H2' ? 'p' : 'h2');
  else if (f === 'task') edApply('task');
  edSync(); edCaretUI();
};
function edLink() {
  const t = noteTab(); if (!t) return;
  saveEdRange();
  const hasSel = UI.edRange && !UI.edRange.collapsed;
  modal({
    title: 'Add a link', width: 440,
    body: `${hasSel ? '' : `<label class="field"><span>Text to show</span><input id="lkText" placeholder="For example: our website" autocomplete="off"></label>`}
      <label class="field"><span>Web address</span><input id="lkUrl" placeholder="https://example.com" autocomplete="off"></label>
      <p class="hint">To link to another note instead, type <kbd>[[</kbd> in the page.</p><p class="err" id="lkErr" hidden></p>`,
    onMount: rec => setTimeout(() => rec.root.querySelector(hasSel ? '#lkUrl' : '#lkText').focus(), 30),
    actions: [{ label: 'Cancel' }, { label: 'Add link', primary: true, fn: rec => {
      let u = rec.root.querySelector('#lkUrl').value.trim();
      const err = rec.root.querySelector('#lkErr');
      if (u && !/^https?:\/\//i.test(u) && /^[\w-]+(\.[\w-]+)+/.test(u)) u = 'https://' + u;
      if (!/^https?:\/\/\S+\.\S+/.test(u)) { err.hidden = false; err.textContent = 'Enter a full web address, like https://example.com'; return false; }
      restoreEdRange();
      if (hasSel) document.execCommand('createLink', false, u);
      else document.execCommand('insertHTML', false, `<a href="${esc(u)}">${esc(rec.root.querySelector('#lkText').value.trim() || u)}</a>&nbsp;`);
      edSync();
    } }],
  });
}
function edCaretUI() {
  const ed = $('#ed'); if (!ed) return;
  ed.querySelectorAll('.cur-empty').forEach(n => { n.classList.remove('cur-empty'); n.removeAttribute('data-ph'); });
  const plus = $('#plus'), bar = $('#seltool');
  const s = getSelection();
  if (!s.rangeCount || !inEd(s.anchorNode) || ed.getAttribute('contenteditable') === 'false') { if (plus) plus.hidden = true; if (bar) bar.hidden = true; return; }
  const b = curBlock();
  if (b && b.tagName === 'P' && isEmptyEl(b)) {
    b.classList.add('cur-empty'); b.dataset.ph = ed.children.length <= 2 ? 'Start writing, or press / for more' : 'Press / to add a heading, list or to-do';
    if (plus) { const r = b.getBoundingClientRect(); plus.hidden = false; plus.style.left = Math.max(r.left - 36, 8) + 'px'; plus.style.top = (r.top + (r.height - 28) / 2) + 'px'; }
  } else if (plus) plus.hidden = true;
  if (bar) {
    if (!s.isCollapsed && !curEl('pre')) {
      const r = s.getRangeAt(0).getBoundingClientRect();
      if (r.width) { bar.hidden = false; const w = bar.offsetWidth || 220; bar.style.left = Math.max(8, Math.min(innerWidth - w - 8, r.left + r.width / 2 - w / 2)) + 'px'; bar.style.top = Math.max(8, r.top - 46) + 'px'; }
    } else bar.hidden = true;
  }
}
document.addEventListener('selectionchange', () => { if ($('#ed')) edCaretUI(); });
document.addEventListener('mousedown', e => { if (e.target.closest && e.target.closest('#seltool,#plus')) e.preventDefault(); });
window.addEventListener('scroll', () => { const p = $('#plus'); if (p && !p.hidden) edCaretUI(); }, true);

/* ---------- "/" block menu and "[[" note picker ---------- */
const SLASH = [
  { k: 'h1', label: 'Big heading', desc: 'A title for a section', g: 'H1' },
  { k: 'h2', label: 'Heading', desc: 'A medium section title', g: 'H2' },
  { k: 'h3', label: 'Small heading', desc: 'A subtitle', g: 'H3' },
  { k: 'task', label: 'To-do list', desc: 'Things to tick off', g: '☐' },
  { k: 'ul', label: 'Bulleted list', desc: 'A simple list', g: '•' },
  { k: 'ol', label: 'Numbered list', desc: 'A list in order', g: '1.' },
  { k: 'quote', label: 'Quote', desc: 'Set a passage apart', g: '“' },
  { k: 'callout', label: 'Highlighted note', desc: 'Make something stand out', g: '!' },
  { k: 'code', label: 'Code', desc: 'Text that keeps its spacing', g: '</>' },
  { k: 'table', label: 'Table', desc: 'Rows and columns', g: '▦' },
  { k: 'hr', label: 'Divider', desc: 'A line between sections', g: '—' },
  { k: 'link', label: 'Link to a note', desc: 'Connect to another note', g: '↗' },
  { k: 'image', label: 'Image…', desc: 'Add a picture', g: '▣' },
  { k: 'template', label: 'From a template…', desc: 'Start from a saved layout', g: '⎘' },
  { k: 'date', label: 'Today’s date', desc: shortDay(TODAY), g: '31' },
];
function edTrigger() {
  const s = getSelection(); const n = s.anchorNode;
  if (!s.isCollapsed || !n || n.nodeType !== 3 || !inEd(n) || curEl('pre')) return closeSlash();
  const before = n.nodeValue.slice(0, s.anchorOffset);
  let m = before.match(/\[\[([^\[\]]{0,40})$/);
  if (m) {
    const q = m[1].toLowerCase();
    const notes = FS.list(UI.ws).map(p => basename(p)).filter(x => !q || x.toLowerCase().includes(q)).slice(0, 7);
    const items = notes.map(x => ({ k: 'note', label: x, desc: 'Link to this note', g: '↗' }));
    if (m[1].trim() && !FS.list(UI.ws).some(p => basename(p).toLowerCase() === q)) items.push({ k: 'newnote', label: `Create “${m[1].trim()}”`, desc: 'A new note, linked from here', g: '+', name: m[1].trim() });
    if (!items.length) return closeSlash();
    UI.slash = { kind: 'link', items, i: 0, node: n, start: s.anchorOffset - m[0].length, end: s.anchorOffset };
    return drawSlash();
  }
  m = before.match(/(^|\s)\/([\w ]{0,18})$/);
  if (!m) return closeSlash();
  const q = m[2].toLowerCase();
  const items = SLASH.filter(x => !q || x.label.toLowerCase().includes(q) || x.k.includes(q)).sort((a, b) => (b.label.toLowerCase().startsWith(q) ? 1 : 0) - (a.label.toLowerCase().startsWith(q) ? 1 : 0));
  if (!items.length) return closeSlash();
  UI.slash = { kind: 'slash', items, i: 0, node: n, start: s.anchorOffset - m[2].length - 1, end: s.anchorOffset };
  drawSlash();
}
ACT.edPlus = () => {
  const b = curBlock(); if (!b) return;
  UI.slash = { kind: 'slash', items: SLASH, i: 0, node: null, start: 0, end: 0, fromPlus: true };
  drawSlash();
};
function drawSlash() {
  const box = $('#slash'); if (!box || !UI.slash) return;
  const s = getSelection(); let r = s.rangeCount ? s.getRangeAt(0).getBoundingClientRect() : null;
  if (!r || (!r.width && !r.height)) { const b = curBlock(); r = b ? b.getBoundingClientRect() : { left: 300, bottom: 200, top: 180 }; }
  box.hidden = false;
  const below = innerHeight - r.bottom > 330;
  box.style.left = Math.max(8, Math.min(r.left, innerWidth - 300)) + 'px';
  box.style.top = below ? (r.bottom + 6) + 'px' : Math.max(8, r.top - 6 - Math.min(320, 52 + UI.slash.items.length * 44)) + 'px';
  box.innerHTML = `<div class="slash-h">${UI.slash.kind === 'link' ? 'Link to a note' : 'Add to your note'}</div>` + UI.slash.items.map((it, i) =>
    `<button class="${i === UI.slash.i ? 'on' : ''}" data-a="slashPick" data-i="${i}" role="option"><span class="si">${esc(it.g)}</span><span class="sl2"><b>${esc(it.label)}</b><small>${esc(it.desc)}</small></span></button>`).join('');
  const on = box.querySelector('button.on'); if (on) on.scrollIntoView({ block: 'nearest' });
}
function closeSlash() { UI.slash = null; const b = $('#slash'); if (b) b.hidden = true; }
ACT.slashPick = el => applySlash(UI.slash.items[+el.dataset.i]);
function applySlash(it) {
  if (!UI.slash || !it) return closeSlash();
  const S = UI.slash; closeSlash();
  const ed = $('#ed'); ed.focus();
  if (S.node && S.node.parentNode) {   // remove what was typed: "/head" or "[[ide"
    const r = document.createRange(); r.setStart(S.node, S.start); r.setEnd(S.node, Math.min(S.end, S.node.nodeValue.length)); r.deleteContents();
    const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r);
  }
  if (it.k === 'note' || it.k === 'newnote') {
    const name = it.k === 'note' ? it.label : it.name;
    if (it.k === 'newnote') { const p = (APP.settings.newNoteFolder ? APP.settings.newNoteFolder + '/' : '') + name + '.md'; if (!FS.read(UI.ws, p)) { try { FS.write(UI.ws, p, `# ${name}\n`); } catch (e) { toast('Could not create that note', { kind: 'error' }); } } }
    insertNodes(inlineEd(`[[${name}]]`) + '&nbsp;');
    edSync(); renderSidebar(); return;
  }
  if (it.k === 'link') { document.execCommand('insertText', false, '[['); edTrigger(); return; }
  if (it.k === 'image') { saveEdRange(); return imageDialog(); }
  if (it.k === 'template') { saveEdRange(); return templatePicker(); }
  edApply(it.k);
}
document.addEventListener('mousedown', e => { if (UI.slash && !e.target.closest('#slash,#plus')) closeSlash(); });

/* ---------- find and replace ---------- */
function findMatches() {
  const ed = $('#ed'); if (!ed || !UI.find || !UI.find.q) return [];
  const out = []; const q = UI.find.q.toLowerCase();
  const w = document.createTreeWalker(ed, NodeFilter.SHOW_TEXT); let n;
  while ((n = w.nextNode())) {
    if (n.parentElement.closest('.raw')) continue;
    const t = n.nodeValue.toLowerCase(); let i = t.indexOf(q);
    while (i > -1) { const r = document.createRange(); r.setStart(n, i); r.setEnd(n, i + q.length); out.push(r); i = t.indexOf(q, i + q.length); }
  }
  return out;
}
function findPaint() {
  if (!(window.CSS && CSS.highlights && window.Highlight)) return;
  const all = findMatches();
  CSS.highlights.delete('tn-find'); CSS.highlights.delete('tn-find-cur');
  if (!all.length) return;
  const idx = (UI.find.idx || 0) % all.length;
  CSS.highlights.set('tn-find', new Highlight(...all));
  CSS.highlights.set('tn-find-cur', new Highlight(all[idx]));
}
function findCount() {
  const m = findMatches(); const c = $('#fcount');
  if (c) c.textContent = m.length ? `${(UI.find.idx % m.length) + 1} of ${m.length}` : (UI.find && UI.find.q ? 'Nothing found' : '');
  findPaint(); return m;
}
function findGo(step) {
  const m = findMatches(); if (!m.length) return findCount();
  UI.find.idx = ((UI.find.idx || 0) + step + m.length) % m.length;
  const r = m[UI.find.idx]; const p = r.startContainer.parentElement; if (p) p.scrollIntoView({ block: 'center' });
  findCount();
}
function renderFind() {
  const host = $('#findbar');
  if (!UI.find) { host.innerHTML = ''; if (window.CSS && CSS.highlights) { CSS.highlights.delete('tn-find'); CSS.highlights.delete('tn-find-cur'); } return; }
  if (host.querySelector('#findQ')) { findCount(); return; }
  host.innerHTML = `<div class="findbar" role="search">
    ${icon('search', 'xs')}<input data-inp="findQ" id="findQ" value="${esc(UI.find.q)}" placeholder="Find in this note" aria-label="Find in this note">
    <span class="fcount" id="fcount"></span>
    <button class="icon-btn" data-a="findPrev" aria-label="Previous match" title="Previous">${icon('arrowUp', 'xs')}</button>
    <button class="icon-btn" data-a="findNext" aria-label="Next match" title="Next">${icon('chevD', 'xs')}</button>
    <input data-inp="repQ" id="repQ" value="${esc(UI.find.rep)}" placeholder="Replace with" aria-label="Replace with">
    <button class="btn sm" data-a="replaceOne">Replace</button><button class="btn sm" data-a="replaceAll">Replace all</button>
    <span class="grow"></span><button class="icon-btn" data-a="findClose" aria-label="Close find" title="Close">${icon('x', 'xs')}</button></div>`;
  findCount();
}
ACT.findBtn = () => { UI.find = UI.find || { q: '', idx: 0, rep: '' }; renderFind(); setTimeout(() => { const q = $('#findQ'); if (q) { q.focus(); q.select(); } }, 0); };
ACT.findClose = () => { UI.find = null; renderFind(); const ed = $('#ed'); if (ed) ed.focus(); };
ACT.findNext = () => findGo(1);
ACT.findPrev = () => findGo(-1);
INP.findQ = el => { UI.find.q = el.value; UI.find.idx = 0; const m = findCount(); if (m.length) findGo(0); };
INP.repQ = el => { UI.find.rep = el.value; };
ACT.replaceOne = () => {
  const m = findMatches(); if (!m.length) return;
  const r = m[UI.find.idx % m.length]; r.deleteContents(); if (UI.find.rep) r.insertNode(document.createTextNode(UI.find.rep));
  edSync(); findCount();
};
ACT.replaceAll = () => {
  const m = findMatches(); if (!m.length) return;
  const n = m.length;
  m.reverse().forEach(r => { r.deleteContents(); if (UI.find.rep) r.insertNode(document.createTextNode(UI.find.rep)); });
  edSync(); findCount(); toast(`Replaced ${n} ${n === 1 ? 'match' : 'matches'}`);
};

/* ---------- note menu, plain-text escape hatch ---------- */
ACT.noteMore = el => {
  const t = noteTab(); if (!t) return;
  menu(el, [
    { label: 'Find in note', icon: 'search', hint: APP.hotkeys.find, fn: () => ACT.findBtn() },
    { label: 'Show file details', icon: 'info', fn: () => { UI.trust = !UI.trust; renderTrust(); } },
    { sep: true },
    { label: 'Rename', icon: 'edit', hint: APP.hotkeys.rename, fn: () => { const i = $('#title'); if (i) { i.focus(); i.select(); } } },
    { label: 'Make a copy', icon: 'copy', fn: () => { const p = dirname(t.path); const n = basename(t.path) + ' copy'; FS.write(UI.ws, `${p ? p + '/' : ''}${n}.md`, t.buffer); openNote(`${p ? p + '/' : ''}${n}.md`); } },
    { label: 'Insert from a template…', icon: 'file', fn: () => { saveEdRange(); templatePicker(); } },
    { label: 'Version history…', icon: 'refresh', fn: () => recoveryDialog(t) },
    { label: 'Edit as plain text…', icon: 'edit', fn: () => editSourceDialog() },
    { sep: true },
    { label: 'Move to trash', icon: 'trash', danger: true, fn: () => trashPath(t.path) },
  ]);
};
function editSourceDialog() {
  const t = noteTab(); if (!t) return;
  modal({
    title: 'Edit as plain text', width: 680,
    body: `<p class="lede small">This is the note exactly as it is stored in the file. Most people never need this view.</p><textarea id="srcTa" class="plain-ta" rows="16" spellcheck="false">${esc(t.buffer)}</textarea>`,
    actions: [{ label: 'Cancel' }, { label: 'Apply', primary: true, fn: rec => { t.buffer = rec.root.querySelector('#srcTa').value; afterEdit(t); } }],
  });
}
ACT.editSource = editSourceDialog;
ACT.toggleFav = () => {
  const t = noteTab(); if (!t) return;
  const f = WS().favs; const i = f.findIndex(x => x.type === 'file' && x.path === t.path);
  if (i > -1) { f.splice(i, 1); toast('Removed from favourites'); } else { f.push({ type: 'file', path: t.path }); toast('Added to favourites'); }
  renderAll();
};
