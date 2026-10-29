/* Plan views: Today, Tasks, Calendar, Tags and properties, Collections, Trash, Graph (Later), Canvas (Later), Quick Capture */

const HOURS = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18];
const hLabel = h => (h > 12 ? h - 12 : h) + (h >= 12 ? ' PM' : ' AM');
const fmtDay = s => new Date(s + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
const addDays = (s, n) => { const d = new Date(s + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };

/* Tasks are lines in notes: - [ ] text @due(YYYY-MM-DD) @scheduled(YYYY-MM-DD HH:MM) @priority(x) */
function parseTasks(ws = UI.ws) {
  const out = [];
  for (const p of FS.list(ws)) {
    disk(p).body.split('\n').forEach((l, i) => {
      const m = l.match(/^\s*[-*] \[( |x|X)\] (.*)$/);
      if (!m) return;
      const due = (l.match(/@due\((\d{4}-\d{2}-\d{2})\)/) || [])[1] || null;
      const sm = l.match(/@scheduled\((\d{4}-\d{2}-\d{2})(?: (\d{2}):(\d{2}))?\)/);
      const prio = (l.match(/@priority\((\w+)\)/) || [])[1] || null;
      const text = m[2].replace(/@(due|scheduled|priority)\([^)]*\)/g, '').trim();
      out.push({ path: p, line: i, done: m[1] !== ' ', text, due, sched: sm ? sm[1] : null, time: sm && sm[2] ? +sm[2] : null, prio });
    });
  }
  return out;
}
function setTaskMeta(raw, key, val) {
  const re = new RegExp(`\\s*@${key}\\([^)]*\\)`);
  let s = raw.replace(re, '');
  if (val) s = s.replace(/\s*$/, '') + ` @${key}(${val})`;
  return s;
}
function taskGroup(t) {
  if (t.done) return 'Done';
  if (t.due && t.due < TODAY) return 'Overdue';
  if (t.due === TODAY || t.sched === TODAY) return 'Today';
  if (t.due || t.sched) return 'Upcoming';
  return 'No date';
}
ACT.taskToggleAt = el => mutateLine(el.dataset.path, +el.dataset.line, l => l.replace(/\[( |x|X)\]/, m => (m === '[ ]' ? '[x]' : '[ ]')));

/* Today */
VIEWS.today = () => {
  const tasks = parseTasks();
  const overdue = tasks.filter(t => !t.done && t.due && t.due < TODAY);
  const dueToday = tasks.filter(t => !t.done && t.due === TODAY);
  const sched = tasks.filter(t => !t.done && t.sched === TODAY);
  const unsched = tasks.filter(t => !t.done && t.sched !== TODAY && !t.due ? true : false).slice(0, 0);
  const events = FS.list(UI.ws).filter(p => p.startsWith('Calendar/')).map(p => ({ path: p, ...eventMeta(p) })).filter(e => e.start && e.start.startsWith(TODAY));
  const daily = `${APP.settings.dailyFolder}/${TODAY}.md`;
  const dailyDoc = FS.read(UI.ws, daily);
  const row = t => `<div class="trow${t.done ? ' done' : ''}" draggable="true" data-drag="task:${esc(t.path)}|${t.line}">
      <button class="cbx${t.done ? ' on' : ''}" data-a="taskToggleAt" data-path="${esc(t.path)}" data-line="${t.line}" aria-label="Toggle task">${t.done ? icon('check', 'xs') : ''}</button>
      <div class="tr-t"><span>${esc(t.text)}</span><small>${esc(basename(t.path))}${t.due ? ' · due ' + t.due.slice(5) : ''}${t.sched ? ' · scheduled ' + (t.time != null ? hLabel(t.time) : 'today') : ''}</small></div>
      <button class="linkbtn" data-a="openHit" data-path="${esc(t.path)}" data-line="${t.line}">Open</button></div>`;
  const timeline = HOURS.map(h => {
    const here = sched.filter(t => t.time === h);
    const evs = events.filter(e => e.start && +e.start.slice(11, 13) === h);
    return `<div class="tl-row"><div class="tl-h">${hLabel(h)}</div><div class="tl-drop" data-tdrop="today|${h}">
      ${evs.map(e => `<div class="blk ev" data-a="openPath" data-path="${esc(e.path)}">${esc(basename(e.path))}<small>${e.start.slice(11)}–${(e.end || '').slice(11)}</small></div>`).join('')}
      ${here.map(t => `<div class="blk task" draggable="true" data-drag="task:${esc(t.path)}|${t.line}" title="Dragging changes @scheduled only. @due is not changed.">${esc(t.text)}</div>`).join('')}
    </div></div>`;
  }).join('');
  const noSchedule = tasks.filter(t => !t.done && !t.due && !t.sched).slice(0, 8);
  return `<div class="page today">
    <header class="page-h"><div><h1>Today</h1><p class="sub">${fmtDay(TODAY)} · an aggregated view, not the daily note</p></div>
      <div class="page-a"><button class="btn" data-a="captureBtn">${icon('bolt', 'sm')} Quick Capture</button><button class="btn" data-a="newNoteBtn">${icon('plus', 'sm')} New note</button><button class="btn" data-a="focusNow">${icon('focus', 'sm')} Start focus</button></div></header>
    <div class="grid-2">
      <section class="card">
        <h3>${icon('today', 'sm')} Daily note</h3>
        ${dailyDoc ? `<p class="muted">${esc(daily)} exists. Showing its first lines.</p><pre class="snip">${esc(dailyDoc.body.split('\n').slice(0, 6).join('\n'))}</pre><button class="btn sm" data-a="openPath" data-path="${esc(daily)}">Open today’s note</button>`
          : `<p class="muted">Today’s daily note doesn’t exist yet. It is only created when you ask.</p><button class="btn primary sm" data-a="createDaily">Create today’s note</button>`}
      </section>
      <section class="card agent">
        <h3>${icon('sparkle', 'sm')} Ask your agent to plan today <span class="concept">Concept</span></h3>
        <p class="muted">Paste this into Claude Code. It reads the same files you see here.</p>
        <pre class="snip" id="agentPrompt">Plan my day for ${TODAY}. Use plan_today to read overdue and scheduled tasks, then task_create_many for anything missing. Write the plan to today’s daily note.</pre>
        <p class="muted small">Tools: <code>plan_today</code>, <code>task_create_many</code></p>
        <button class="btn sm" data-a="copyPrompt">${icon('copy', 'xs')} Copy prompt</button>
      </section>
    </div>
    <div class="grid-3">
      <section class="card"><h3>Overdue <span class="chip bad">${overdue.length}</span></h3>${overdue.map(row).join('') || '<p class="muted">Nothing overdue.</p>'}</section>
      <section class="card"><h3>Due today <span class="chip">${dueToday.length}</span></h3>${dueToday.map(row).join('') || '<p class="muted">Nothing due today.</p>'}</section>
      <section class="card drop" data-tdrop="unschedule|0"><h3>Unscheduled</h3><p class="hint">Drag a timed task here to remove its @scheduled.</p>${noSchedule.map(row).join('') || '<p class="muted">Every open task has a date.</p>'}</section>
    </div>
    <section class="card"><h3>Timeline</h3><p class="hint">Drag a task onto an hour to set @scheduled. Event notes are read-only here. Calendar items from ICS are locked.</p>
      <div class="timeline">${timeline}</div>
      ${APP.ics.filter(s => s.status === 'ok').flatMap(s => s.events.filter(e => e.start.startsWith(TODAY))).map(e => `<div class="ics">${icon('lock', 'xs')} ${esc(e.title)} · ${e.start.slice(11)}–${e.end.slice(11)} <small>read-only · ICS</small></div>`).join('')}
    </section>
  </div>`;
};
ACT.createDaily = () => createDaily();
function createDaily() {
  const p = `${APP.settings.dailyFolder}/${TODAY}.md`;
  if (FS.read(UI.ws, p)) return openNote(p);
  const tpl = FS.read(UI.ws, APP.settings.dailyTemplate);
  const body = (tpl ? tpl.body : `# ${TODAY}\n\n`).replace(/\{\{date\}\}/g, TODAY).replace(/\{\{title\}\}/g, TODAY).replace(/\{\{time\}\}/g, '09:00');
  FS.write(UI.ws, p, body); UI.expanded[APP.settings.dailyFolder] = true;
  openNote(p);
  toast('Created today’s note from the template');
}
ACT.copyPrompt = () => toast('Prompt copied. Paste it into Claude Code.');
ACT.focusNow = () => { if (!noteTab()) return toast('Open a note, then start focus'); toggleFocus(); };
ACT.captureBtn = () => quickCapture();
function eventMeta(p) {
  const fm = frontmatter(disk(p).body);
  const g = k => (fm.props.find(x => x.key === k) || {}).val || null;
  return { start: g('start'), end: g('end'), type: g('type') };
}
/* Drops on timeline (today) and calendar hours */
document.addEventListener('dragover', e => { if (e.target.closest('[data-tdrop]')) e.preventDefault(); });
document.addEventListener('drop', e => {
  const d = e.target.closest('[data-tdrop]'); if (!d) return;
  e.preventDefault();
  const payload = e.dataTransfer.getData('text/plain'); if (!payload) return;
  const [kind, rest] = [payload.split(':')[0], payload.slice(payload.indexOf(':') + 1)];
  const [target, hourStr] = d.dataset.tdrop.split('|');
  if (kind === 'task') {
    const [path, line] = rest.split('|'); const li = +line;
    if (target === 'unschedule') { mutateLine(path, li, l => setTaskMeta(l, 'scheduled', '')); return toast('Unscheduled. @due is unchanged.'); }
    const hh = String(hourStr || 9).padStart(2, '0');
    const day = target === 'today' ? TODAY : (UI.cal && UI.cal.date) || TODAY;
    mutateLine(path, li, l => setTaskMeta(l, 'scheduled', `${day} ${hh}:00`));
    toast(`Scheduled for ${hLabel(+hh)}. @due is unchanged.`);
  } else if (kind === 'event') {
    const hh = +hourStr; const p = rest; const meta = eventMeta(p);
    const dur = meta.start && meta.end ? (new Date(meta.end.replace(' ', 'T')) - new Date(meta.start.replace(' ', 'T'))) : 3600000;
    const day = (UI.cal && UI.cal.date) || TODAY;
    const start = new Date(`${day}T${String(hh).padStart(2, '0')}:00`);
    const end = new Date(start.getTime() + dur);
    const fmt = x => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')} ${String(x.getHours()).padStart(2, '0')}:${String(x.getMinutes()).padStart(2, '0')}`;
    const body = disk(p).body.replace(/^start: .*$/m, `start: ${fmt(start)}`).replace(/^end: .*$/m, `end: ${fmt(end)}`);
    FS.write(UI.ws, p, body); renderAll(); toast('Event moved');
  }
});

/* Tasks view */
UI.tcur = 0;
VIEWS.tasks = () => {
  const f = UI.viewState.tasks || { filter: 'all', folder: '', tag: '' };
  const all = parseTasks().filter(t => (f.filter === 'all' || (f.filter === 'open' ? !t.done : t.done)) && (!f.folder || dirname(t.path) === f.folder));
  const groups = ['Overdue', 'Today', 'Upcoming', 'No date', 'Done'];
  let idx = -1;
  const row = t => { idx++; const k = idx; return `<div class="trow${t.done ? ' done' : ''}${UI.tcur === k ? ' cursor' : ''}" data-k="${k}">
    <button class="cbx${t.done ? ' on' : ''}" data-a="taskToggleAt" data-path="${esc(t.path)}" data-line="${t.line}" aria-label="Toggle done">${t.done ? icon('check', 'xs') : ''}</button>
    <div class="tr-t"><span>${esc(t.text)}</span><small>${esc(t.path)}</small></div>
    ${t.prio ? `<span class="chip">${esc(t.prio)}</span>` : ''}${t.due ? `<span class="chip due">Due ${t.due.slice(5)}</span>` : ''}${t.sched ? `<span class="chip sch">Scheduled ${t.sched.slice(5)}</span>` : ''}
    <button class="linkbtn" data-a="openHit" data-path="${esc(t.path)}" data-line="${t.line}">Open in note</button></div>`; };
  const folders = [...new Set(parseTasks().map(t => dirname(t.path)))].filter(Boolean);
  const body = groups.map(g => {
    const items = all.filter(t => taskGroup(t) === g);
    if (!items.length) return '';
    return `<section class="tgroup"><h3>${g} <span class="count">${items.length}</span></h3>${items.map(row).join('')}</section>`;
  }).join('') || `<div class="emptyside">${art('tasks')}<p>No tasks match these filters.</p></div>`;
  const total = parseTasks().length;
  return `<div class="page">
    <header class="page-h"><div><h1>Tasks</h1><p class="sub">${total} tasks across this workspace. <kbd>j</kbd>/<kbd>k</kbd> move, <kbd>x</kbd> toggles.</p></div></header>
    <div class="filters">
      <div class="seg">${['all', 'open', 'done'].map(x => `<button class="${f.filter === x ? 'on' : ''}" data-a="taskFilter" data-f="${x}">${x[0].toUpperCase() + x.slice(1)}</button>`).join('')}</div>
      <select data-ch="taskFolder" aria-label="Folder"><option value="">All folders</option>${folders.map(x => `<option value="${esc(x)}"${f.folder === x ? ' selected' : ''}>${esc(x)}</option>`).join('')}</select>
    </div>
    ${body}
  </div>`;
};
ACT.taskFilter = el => { UI.viewState.tasks = { ...(UI.viewState.tasks || {}), filter: el.dataset.f }; renderContent(); };
CHG.taskFolder = el => { UI.viewState.tasks = { ...(UI.viewState.tasks || {}), folder: el.value }; renderContent(); };

/* Calendar */
UI.cal = UI.cal || { mode: 'week', date: TODAY, view: '2026-10' };
VIEWS.calendar = () => {
  const c = UI.cal;
  const head = `<header class="page-h"><div><h1>Calendar</h1><p class="sub">Event notes and scheduled tasks. Calendar subscriptions are read-only.</p></div>
    <div class="page-a"><div class="seg">${['month', 'week', 'day'].map(m => `<button class="${c.mode === m ? 'on' : ''}" data-a="calMode" data-m="${m}">${m[0].toUpperCase() + m.slice(1)}</button>`).join('')}</div>
    <button class="btn sm" data-a="calToday">Today</button></div></header>`;
  const items = [];
  FS.list(UI.ws).filter(p => p.startsWith('Calendar/')).forEach(p => { const m = eventMeta(p); if (m.start) items.push({ kind: 'event', path: p, title: basename(p), start: m.start, end: m.end, ro: false }); });
  parseTasks().filter(t => t.sched && !t.done).forEach(t => items.push({ kind: 'task', path: t.path, title: t.text, start: `${t.sched} ${String(t.time ?? 9).padStart(2, '0')}:00`, end: null, ro: false, line: t.line }));
  APP.ics.forEach(s => s.events.forEach(e => items.push({ kind: 'ics', title: e.title, start: e.start, end: e.end, ro: true })));
  if (c.mode === 'month') {
    const d = new Date(c.date + 'T12:00:00'); const y = d.getFullYear(), m = d.getMonth();
    const first = new Date(y, m, 1).getDay(), count = new Date(y, m + 1, 0).getDate();
    const cells = [];
    for (let i = 0; i < first; i++) cells.push(null);
    for (let i = 1; i <= count; i++) cells.push(`${y}-${String(m + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`);
    const daily = p => !!FS.read(UI.ws, `${APP.settings.dailyFolder}/${p}.md`);
    return `<div class="page">${head}
      <div class="month-nav"><button class="icon-btn" data-a="calNav" data-n="-1" aria-label="Previous month">${icon('chevR', 'sm').replace('<path', '<path transform="rotate(180 12 12)"')}</button><strong>${d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</strong><button class="icon-btn" data-a="calNav" data-n="1" aria-label="Next month">${icon('chevR', 'sm')}</button></div>
      <div class="cal-grid">${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(x => `<div class="dh">${x}</div>`).join('')}
      ${cells.map(s => s ? `<button class="dcell${s === TODAY ? ' today' : ''}${s === c.date ? ' sel' : ''}" data-a="calPickDay" data-d="${s}"><b>${+s.slice(8)}</b>
        ${items.filter(i => i.start && i.start.startsWith(s)).slice(0, 2).map(i => `<span class="dot-ev${i.ro ? ' ro' : ''}">${esc(i.title).slice(0, 14)}</span>`).join('')}
        ${daily(s) ? '<i class="dd" title="Daily note exists"></i>' : ''}</button>` : '<span></span>').join('')}</div>
      ${dayPanel(items)}</div>`;
  }
  const days = c.mode === 'day' ? [c.date] : Array.from({ length: 7 }, (_, i) => addDays(c.date, i - new Date(c.date + 'T12:00:00').getDay()));
  return `<div class="page">${head}
    <div class="tgrid" style="--cols:${days.length}"><div class="tg-h"></div>${days.map(d => `<div class="tg-h${d === TODAY ? ' today' : ''}">${new Date(d + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' })}</div>`).join('')}
      ${HOURS.map(h => `<div class="tg-hour">${hLabel(h)}</div>${days.map(d => {
        const here = items.filter(i => i.start && i.start.startsWith(d) && +i.start.slice(11, 13) === h);
        return `<div class="tg-cell" data-tdrop="event|${h}" data-a="calSlot" data-d="${d}" data-h="${h}">${here.map(i => `<div class="ev-b ${i.kind}${i.ro ? ' ro' : ''}" ${i.ro ? '' : `draggable="true" data-drag="${i.kind === 'event' ? 'event:' + esc(i.path) : 'task:' + esc(i.path) + '|' + i.line}" data-a="${i.kind === 'event' ? 'openPath' : 'openHit'}" data-path="${esc(i.path)}" data-line="${i.line ?? 0}"`} title="${i.ro ? 'Read-only · ICS subscription' : i.kind === 'task' ? 'Dragging changes @scheduled only. @due is not changed.' : 'Drag to reschedule'}">${i.ro ? icon('lock', 'xs') : ''}${esc(i.title)}<small>${i.start.slice(11)}</small></div>`).join('')}</div>`;
      }).join('')}`).join('')}
    </div>
    <p class="hint">Click an empty hour to create an event note. Drag an event to reschedule it. Dragging a task changes only @scheduled.</p>
  </div>`;
};
function dayPanel(items) {
  const d = UI.cal.date; const has = FS.read(UI.ws, `${APP.settings.dailyFolder}/${d}.md`);
  const list = items.filter(i => i.start && i.start.startsWith(d));
  return `<section class="card day-panel"><h3>${fmtDay(d)}</h3>
    ${list.map(i => `<div class="agenda">${i.ro ? icon('lock', 'xs') : ''}<b>${i.start.slice(11)}</b> ${esc(i.title)} <small>${i.kind}</small></div>`).join('') || '<p class="muted">Nothing scheduled.</p>'}
    ${has ? `<button class="btn sm" data-a="openPath" data-path="${esc(APP.settings.dailyFolder + '/' + d + '.md')}">Open daily note</button>` : `<button class="btn sm" data-a="createDailyFor" data-d="${d}">Create daily note for this day</button>`}
  </section>`;
}
ACT.createDailyFor = el => { UI.cal.date = el.dataset.d; createDaily(); };
ACT.calMode = el => { UI.cal.mode = el.dataset.m; renderContent(); renderRibbon(); };
ACT.calToday = () => { UI.cal.date = TODAY; renderContent(); };
ACT.calNav = el => { const d = new Date(UI.cal.date + 'T12:00:00'); d.setMonth(d.getMonth() + +el.dataset.n); UI.cal.date = d.toISOString().slice(0, 10); renderContent(); };
ACT.calPickDay = el => { UI.cal.date = el.dataset.d; renderContent(); };
ACT.calSlot = (el, e) => {
  if (e.target.closest('.ev-b')) return;
  const d = el.dataset.d, h = +el.dataset.h;
  pop(el.getBoundingClientRect(), `<div class="pop-form"><b>New event</b>
    <input id="evT" placeholder="Event title" aria-label="Event title">
    <label class="field"><span>Start</span><input id="evS" value="${d} ${String(h).padStart(2, '0')}:00"></label>
    <label class="field"><span>End</span><input id="evE" value="${d} ${String(h + 1).padStart(2, '0')}:00"></label>
    <p class="err" id="evE2" hidden></p>
    <div class="row-end"><button class="btn sm" data-a="popClose">Cancel</button><button class="btn sm primary" data-a="evCreate">Create event</button></div></div>`,
    el2 => el2.querySelector('#evT').focus());
};
ACT.popClose = () => closeMenus();
ACT.evCreate = () => {
  const t = $('#evT').value.trim(); const s = $('#evS').value.trim(); const e = $('#evE').value.trim();
  const err = $('#evE2');
  if (!t) { err.hidden = false; err.textContent = 'Give the event a title.'; return; }
  if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(s) || !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(e) || e <= s) { err.hidden = false; err.textContent = 'Use YYYY-MM-DD HH:MM for start and end, with end after start.'; return; }
  const p = `Calendar/${t.replace(/[\/\\:*?"<>|]/g, '')}.md`;
  if (FS.read(UI.ws, p)) { err.hidden = false; err.textContent = 'An event with this title already exists.'; return; }
  FS.write(UI.ws, p, `---\ntype: event\nstart: ${s}\nend: ${e}\n---\n# ${t}\n\n`);
  closeMenus(); renderAll(); toast('Event created');
};

/* Tags and properties */
VIEWS.tags = () => {
  const tab = UI.tagTab;
  const head = `<div class="seg big">${['tags', 'properties'].map(x => `<button class="${tab === x ? 'on' : ''}" data-a="tagTab" data-id="${x}">${x === 'tags' ? 'Tags' : 'Properties'}</button>`).join('')}</div>`;
  if (tab === 'properties') {
    const counts = {};
    FS.list(UI.ws).forEach(p => frontmatter(disk(p).body).props.forEach(pr => { const k = pr.key; counts[k] = counts[k] || { n: 0, types: {} }; counts[k].n++; const ty = propType(k, pr.val); counts[k].types[ty] = (counts[k].types[ty] || 0) + 1; }));
    return `<div class="page"><header class="page-h"><div><h1>Tags and properties</h1></div></header>${head}
      <div class="card">${Object.entries(counts).map(([k, v]) => `<div class="row-line"><b>${esc(k)}</b><span class="chip">${Object.keys(v.types)[0]}</span><span class="muted">${plural(v.n, 'file')}</span><span class="grow"></span><button class="linkbtn" data-a="renameProp" data-k="${esc(k)}">Rename</button></div>`).join('') || '<p class="muted">No properties in this workspace yet.</p>'}</div></div>`;
  }
  const tags = {};
  FS.list(UI.ws).forEach(p => tagsOf(disk(p).body).forEach(t => { tags[t] = (tags[t] || 0) + 1; }));
  const filt = UI.tagFilter;
  const files = filt ? FS.list(UI.ws).filter(p => tagsOf(disk(p).body).includes(filt)) : [];
  const list = Object.entries(tags).sort((a, b) => b[1] - a[1]);
  const tree = {};
  Object.keys(tags).forEach(t => { let n = tree; t.split('/').forEach(x => { n[x] = n[x] || {}; n = n[x]; }); });
  const renderTree = (node, prefix) => Object.keys(node).sort().map(k => { const full = prefix ? prefix + '/' + k : k; return `<div class="tnode"><button class="linkbtn" data-a="tagPick" data-tag="${esc(full)}">#${esc(k)}</button><small class="muted">${tags[full] || ''}</small>${Object.keys(node[k]).length ? `<div class="tsub">${renderTree(node[k], full)}</div>` : ''}</div>`; }).join('');
  return `<div class="page"><header class="page-h"><div><h1>Tags</h1><p class="sub">${Object.keys(tags).length} tags. Nested tags use slashes, for example #project/web.</p></div>
    <div class="page-a"><button class="btn sm" data-a="tagFlat">${UI.tagFlat ? 'Nested view' : 'Flat list'}</button></div></header>${head}
    <div class="grid-2"><section class="card">${UI.tagFlat ? list.map(([t, n]) => `<div class="row-line"><button class="linkbtn" data-a="tagPick" data-tag="${esc(t)}">#${esc(t)}</button><span class="grow"></span><span class="muted">${n}</span></div>`).join('') : renderTree(tree, '')}</section>
      <section class="card"><h3>${filt ? '#' + esc(filt) : 'Pick a tag'}</h3>${files.map(p => `<button class="rp-item" data-a="openPath" data-path="${esc(p)}"><b>${esc(basename(p))}</b><small>${esc(p)}</small></button>`).join('') || '<p class="muted">Choose a tag to see its notes.</p>'}</section></div></div>`;
};
ACT.tagTab = el => { UI.tagTab = el.dataset.id; renderContent(); };
ACT.tagPick = el => { UI.tagFilter = el.dataset.tag; renderContent(); };
ACT.tagFlat = () => { UI.tagFlat = !UI.tagFlat; renderContent(); };
ACT.renameProp = el => {
  const k = el.dataset.k;
  modal({ title: `Rename property “${k}”`, width: 420, body: `<label class="field"><span>New name</span><input id="pn" value="${esc(k)}"></label><p class="err" id="pnE" hidden></p>`,
    actions: [{ label: 'Cancel' }, { label: 'Rename everywhere', primary: true, fn: rec => {
      const nk = rec.root.querySelector('#pn').value.trim();
      if (!/^[\w-]+$/.test(nk)) { const e = rec.root.querySelector('#pnE'); e.hidden = false; e.textContent = 'Use letters, numbers, - or _.'; return false; }
      FS.list(UI.ws).forEach(p => { const b = disk(p).body; if (frontmatter(b).props.some(x => x.key === k)) FS.write(UI.ws, p, b.replace(new RegExp('^' + k + ':', 'm'), nk + ':')); });
      renderAll(); toast(`Renamed to ${nk}`);
    } }] });
};

/* Collections (saved queries as table or list) */
VIEWS.collections = () => {
  const v = APP.views.find(x => x.id === (UI.collView || APP.views[0].id)) || APP.views[0];
  const q = UI.viewState.collQ ?? v.q;
  const parsed = parseQuery(q);
  const res = parsed.err ? { err: parsed.err, results: [] } : runSearch(q);
  const files = (res.results || []).map(r => r.path);
  const colVal = (p, c) => {
    const body = disk(p).body; const fm = frontmatter(body);
    if (c === 'file') return basename(p);
    if (c === 'status') return ((fm.props.find(x => x.key === 'status') || {}).val) || (body.includes('- [x]') ? 'done' : '—');
    if (c === 'due') { const d = (body.match(/@due\((\d{4}-\d{2}-\d{2})\)/) || [])[1]; return d || '—'; }
    if (c === 'tags') return tagsOf(body).map(x => '#' + x).join(' ') || '—';
    if (c === 'modified') return fmtAgo(disk(p).mtime);
    return '—';
  };
  const cols = ['file', 'status', 'due', 'tags', 'modified'];
  const shown = v.cols;
  return `<div class="page">
    <header class="page-h"><div><h1>Collections</h1><p class="sub">Saved queries shown as a table or a list. Board and cards are Later.</p></div>
      <div class="page-a"><select data-ch="collView" aria-label="Saved view">${APP.views.map(x => `<option value="${x.id}"${x.id === v.id ? ' selected' : ''}>${esc(x.name)}</option>`).join('')}</select>
      <div class="seg">${['table', 'list'].map(k => `<button class="${v.kind === k ? 'on' : ''}" data-a="collKind" data-k="${k}" data-v="${v.id}">${k[0].toUpperCase() + k.slice(1)}</button>`).join('')}</div>
      <button class="btn sm" data-a="saveView">Save as view</button></div></header>
    <div class="filters"><input class="qin${parsed.err ? ' bad' : ''}" data-inp="collQ" value="${esc(q)}" aria-label="Query" placeholder="task:open tag:project"><details class="cols"><summary>Columns</summary>${cols.map(c => `<label class="check"><input type="checkbox" data-ch="collCol" data-c="${c}" data-v="${v.id}" ${shown.includes(c) ? 'checked' : ''}> ${c}</label>`).join('')}</details></div>
    ${parsed.err ? `<div class="banner danger compact">${icon('error', 'xs')}<div><b>Query error.</b> ${esc(parsed.err)}</div></div>` : ''}
    ${!files.length && !parsed.err ? `<div class="emptyside">${art('search')}<p>Nothing matches this query.</p></div>` : ''}
    ${files.length && v.kind === 'table' ? `<table class="tbl"><thead><tr>${shown.map(c => `<th>${c}</th>`).join('')}</tr></thead><tbody>${files.map(p => `<tr data-a="openPath" data-path="${esc(p)}">${shown.map(c => `<td>${esc(colVal(p, c))}</td>`).join('')}</tr>`).join('')}</tbody></table>` : ''}
    ${files.length && v.kind === 'list' ? `<div class="card">${files.map(p => `<button class="rp-item" data-a="openPath" data-path="${esc(p)}"><b>${esc(basename(p))}</b><small>${shown.filter(c => c !== 'file').map(c => esc(colVal(p, c))).join(' · ')}</small></button>`).join('')}</div>` : ''}
  </div>`;
};
ACT.collKind = el => { const v = APP.views.find(x => x.id === el.dataset.v); v.kind = el.dataset.k; renderContent(); };
CHG.collView = el => { UI.collView = el.value; UI.viewState.collQ = undefined; renderContent(); };
CHG.collCol = el => { const v = APP.views.find(x => x.id === el.dataset.v); const c = el.dataset.c; v.cols = el.checked ? [...v.cols, c] : v.cols.filter(x => x !== c); renderContent(); };
INP.collQ = el => { UI.viewState.collQ = el.value; const box = el.closest('.page'); const p = parseQuery(el.value); el.classList.toggle('bad', !!p.err); };
ACT.saveView = () => {
  const q = (UI.viewState.collQ ?? (APP.views[0] || {}).q) || '';
  modal({ title: 'Save as view', width: 420, body: `<label class="field"><span>View name</span><input id="vn" value="New view"></label>`,
    actions: [{ label: 'Cancel' }, { label: 'Save', primary: true, fn: rec => { const n = rec.root.querySelector('#vn').value.trim() || 'View'; const id = 'v' + uid(); APP.views.push({ id, name: n, q, kind: 'table', cols: ['file', 'status', 'due'] }); UI.collView = id; renderContent(); toast('View saved'); } }] });
};

/* Trash */
VIEWS.trash = () => {
  const items = WS().trash;
  const rows = items.map((t, i) => `<div class="trow"><div class="tr-t"><span>${esc(basename(t.path))}</span><small>${esc(t.path)} · deleted ${fmtAgo(t.deleted)}${t.perm ? ' · no Trash on this workspace' : ''}</small></div>
    <button class="btn sm" data-a="trashRestore" data-i="${i}">Restore</button><button class="btn sm danger" data-a="trashPurge" data-i="${i}">Delete forever</button></div>`).join('');
  return `<div class="page"><header class="page-h"><div><h1>Trash</h1><p class="sub">${plural(items.length, 'item')} · kept ${esc(APP.settings.keepTrash)}</p></div>
    <div class="page-a"><button class="btn sm danger" data-a="trashEmpty" ${items.length ? '' : 'disabled'}>Empty trash</button></div></header>
    ${rows || `<div class="emptyside">${art('notes')}<p>Trash is empty.</p></div>`}</div>`;
};
ACT.trashRestore = el => { const i = +el.dataset.i; const t = WS().trash[i]; if (resolveDup(t.path)) return toast('A file with this name is already there'); FS.write(UI.ws, t.path, t.body); WS().trash.splice(i, 1); renderAll(); toast('Restored'); };
function resolveDup(p) { return !!FS.read(UI.ws, p); }
ACT.trashPurge = el => { const i = +el.dataset.i; confirmDialog({ title: 'Delete forever?', body: 'This cannot be undone.', ok: 'Delete forever', danger: true, fn: () => { WS().trash.splice(i, 1); renderAll(); } }); };
ACT.trashEmpty = () => confirmDialog({ title: 'Empty trash?', body: `${plural(WS().trash.length, 'item')} will be deleted permanently.`, ok: 'Empty trash', danger: true, fn: () => { WS().trash = []; renderAll(); } });

/* Graph (Later) */
VIEWS.graph = () => {
  const g = UI.graph;
  const files = FS.list(UI.ws).filter(p => !p.startsWith('Archive/')).slice(0, 40);
  const edges = []; const deg = {};
  files.forEach(p => linksOf(disk(p).body).forEach(l => { const q = resolveLink(l); if (q && files.includes(q)) { edges.push([p, q]); deg[p] = (deg[p] || 0) + 1; deg[q] = (deg[q] || 0) + 1; } }));
  const nodes = files.filter(p => g.orphans || deg[p]);
  const cx = 260, cy = 190, R = 150;
  const pos = {}; nodes.forEach((p, i) => { const a = (i / nodes.length) * Math.PI * 2; pos[p] = [cx + Math.cos(a) * R, cy + Math.sin(a) * R]; });
  return `<div class="page"><span class="later">Later · demand-gated</span><header class="page-h"><div><h1>Graph</h1><p class="sub">Notes as nodes, [[links]] as edges. Frame for the roadmap.</p></div></header>
    <div class="grid-graph"><div class="card graph-filters"><h3>Filters</h3>
      <label class="check"><input type="checkbox" data-ch="gOrph" ${g.orphans ? 'checked' : ''}> Show orphans</label>
      <label class="field"><span>Depth ${g.depth}</span><input type="range" min="1" max="5" value="${g.depth}" data-ch="gDepth"></label>
      <p class="hint">Depth limits nodes to this many link hops from the current note.</p></div>
      <svg class="graph" viewBox="0 0 520 380" role="img" aria-label="Note graph">${edges.map(([a, b]) => pos[a] && pos[b] ? `<line x1="${pos[a][0]}" y1="${pos[a][1]}" x2="${pos[b][0]}" y2="${pos[b][1]}"/>` : '').join('')}
      ${nodes.map(p => `<g class="gn" data-a="openPath" data-path="${esc(p)}"><circle cx="${pos[p][0]}" cy="${pos[p][1]}" r="${6 + (deg[p] || 0) * 2}"/><text x="${pos[p][0] + 10}" y="${pos[p][1] + 4}">${esc(basename(p)).slice(0, 18)}</text></g>`).join('')}</svg></div></div>`;
};
CHG.gOrph = el => { UI.graph.orphans = el.checked; renderContent(); };
CHG.gDepth = el => { UI.graph.depth = +el.value; renderContent(); };

/* Canvas (Later) */
UI.canvasCards = UI.canvasCards || [
  { id: 'c1', x: 40, y: 40, text: 'Roadmap' }, { id: 'c2', x: 280, y: 60, text: 'Design brief' }, { id: 'c3', x: 160, y: 200, text: 'Agents' },
];
VIEWS.canvas = () => `<div class="page"><span class="later">Later · demand-gated</span><header class="page-h"><div><h1>Canvas</h1><p class="sub">Drag cards. Edges show intent only.</p></div></header>
  <div class="canvas" id="canvas">${UI.canvasCards.map(c => `<div class="ccard" data-card="${c.id}" style="left:${c.x}px;top:${c.y}px">${esc(c.text)}</div>`).join('')}
  <svg class="cedges"><line x1="130" y1="70" x2="330" y2="90"/><line x1="130" y1="70" x2="230" y2="230"/></svg></div></div>`;
let _drag = null;
document.addEventListener('pointerdown', e => { const c = e.target.closest('[data-card]'); if (!c) return; const card = UI.canvasCards.find(x => x.id === c.dataset.card); _drag = { card, sx: e.clientX - card.x, sy: e.clientY - card.y }; });
document.addEventListener('pointermove', e => { if (!_drag) return; _drag.card.x = e.clientX - _drag.sx; _drag.card.y = e.clientY - _drag.sy; const el = $(`[data-card="${_drag.card.id}"]`); if (el) { el.style.left = _drag.card.x + 'px'; el.style.top = _drag.card.y + 'px'; } });
document.addEventListener('pointerup', () => { _drag = null; });

/* Quick Capture: destinations Inbox, Daily, Task, New note */
function quickCapture() {
  UI.capture2 = { dest: 'inbox' };
  modal({
    title: 'Quick Capture', width: 520, cls: 'capture',
    body: `<div class="dest">${[['inbox', 'Inbox'], ['daily', 'Daily'], ['task', 'Task'], ['note', 'New note']].map(([k, l]) => `<label class="dchip"><input type="radio" name="dest" value="${k}"${k === 'inbox' ? ' checked' : ''}><span>${l}</span></label>`).join('')}</div>
      <textarea id="capText" data-inp="capText" rows="3" placeholder="Capture something. Enter saves, Shift+Enter adds a line." aria-label="Capture text"></textarea>
      <p class="err" id="capErr" hidden></p>`,
    onMount: rec => rec.root.addEventListener('change', e => { if (e.target.name === 'dest') UI.capture2.dest = e.target.value; }),
    actions: [{ label: 'Cancel' }, { label: 'Save', primary: true, fn: () => captureSave() }],
  });
}
INP.capText = () => {};
function captureSave() {
  const txt = (($('#capText') || {}).value || '').trim();
  const err = $('#capErr');
  if (!txt) { if (err) { err.hidden = false; err.textContent = 'Nothing to save yet.'; } return false; }
  const dest = UI.capture2.dest;
  if (dest === 'daily') {
    const p = `${APP.settings.dailyFolder}/${TODAY}.md`;
    if (!FS.read(UI.ws, p)) { err.hidden = false; err.textContent = 'Today’s daily note doesn’t exist. Create it from Today, then capture again.'; return false; }
    FS.write(UI.ws, p, FS.read(UI.ws, p).body.replace(/\n*$/, '\n') + `- ${txt}\n`);
  } else if (dest === 'task') {
    appendTo('Inbox/Capture.md', `- [ ] ${txt} @scheduled(${TODAY})`);
  } else if (dest === 'note') {
    const p = `Inbox/Capture ${Date.now().toString().slice(-4)}.md`; FS.write(UI.ws, p, `# Capture\n\n${txt}\n`);
  } else appendTo('Inbox/Capture.md', `- ${txt}`);
  return true;
}
function appendTo(p, line) {
  const cur = FS.read(UI.ws, p);
  FS.write(UI.ws, p, (cur ? cur.body : '# Capture\n\n').replace(/\n*$/, '\n') + line + '\n');
}
