/* Settings: 13 sections, Agents (MCP) showpiece, connections, ICS, hotkeys */
const SEC = [
  { id: 'general', label: 'General' }, { id: 'editor', label: 'Editor' }, { id: 'appearance', label: 'Appearance' },
  { id: 'hotkeys', label: 'Hotkeys' }, { id: 'files', label: 'Files & Links' }, { id: 'daily', label: 'Daily Notes & Templates' },
  { id: 'calendar', label: 'Calendar (ICS)' }, { id: 'search', label: 'Search' }, { id: 'recovery', label: 'Recovery' },
  { id: 'connections', label: 'Connections' }, { id: 'agents', label: 'Agents (MCP)' }, { id: 'updates', label: 'Updates' }, { id: 'about', label: 'About' },
];
const MOBILE_SECS = ['appearance', 'general', 'about'];
UI.sec = UI.sec || 'general';
const SET_ITEMS = {
  general: [['startView', 'Startup view', 'select', ['today', 'note', 'tasks', 'calendar']], ['language', 'Language', 'select', ['English', 'Français', 'Deutsch']], ['vaultName', 'Workspace display name', 'text'], ['haptics', 'Haptic feedback (mobile)', 'toggle']],
  editor: [['fontSize', 'Font size', 'range', [13, 22]], ['lineHeight', 'Line height', 'range', [1.4, 2]], ['readable', 'Readable width (760px)', 'toggle'], ['spellcheck', 'Spellcheck', 'toggle']],
  appearance: [['theme', 'Theme', 'select', ['system', 'light', 'dark']], ['accent', 'Accent colour', 'color'], ['zoom', 'Zoom (%)', 'range', [90, 130]], ['ribbon', 'Show ribbon', 'toggle']],
  files: [['newNoteFolder', 'New-note folder', 'text'], ['linkFormat', 'New link format', 'select', ['wikilink', 'shortest', 'relative', 'absolute']], ['autoLinks', 'Always update links on rename', 'toggle'], ['attachFolder', 'Attachment folder', 'text'], ['trashMode', 'Trash behaviour (Windows/macOS)', 'select', ['native', 'permanent']]],
  daily: [['dailyFolder', 'Daily notes folder', 'text'], ['dailyTemplate', 'Daily template', 'text'], ['templateFolder', 'Template folder', 'text']],
  search: [['searchTrash', 'Include Trash in search', 'toggle'], ['caseSensitive', 'Match case by default', 'toggle'], ['searchContext', 'Context lines', 'range', [0, 5]]],
  recovery: [['snapInterval', 'Snapshot interval (seconds)', 'select', ['30', '60', '300']], ['snapRetention', 'Snapshot retention', 'select', ['7 days', '30 days', '90 days']], ['keepTrash', 'Keep trashed notes for', 'select', ['7 days', '30 days', '90 days']]],
  updates: [['updateChannel', 'Update channel', 'select', ['stable', 'beta']]],
};
function settingsView() {
  const sec = UI.sec;
  const list = isMobile() ? SEC.filter(s => MOBILE_SECS.includes(s.id)) : SEC;
  const nav = list.map(s => `<button class="${s.id === sec ? 'on' : ''}" data-a="setSec" data-id="${s.id}">${s.label}</button>`).join('');
  let body = '';
  const items = SET_ITEMS[sec];
  if (items) body = items.map(it => settingRow(it)).join('');
  if (sec === 'hotkeys') body = hotkeysHTML();
  if (sec === 'calendar') body = icsHTML();
  if (sec === 'connections') body = connectionsHTML();
  if (sec === 'agents') body = agentsHTML();
  if (sec === 'about') body = aboutHTML();
  if (sec === 'updates') body = updatesHTML();
  return `<div class="page settings"><header class="page-h"><div><h1>Settings</h1></div></header>
    <div class="set-grid"><nav class="set-nav" aria-label="Settings sections">${nav}</nav><div class="set-body"><h2>${esc(list.find(s => s.id === sec).label)}</h2>${body}</div></div></div>`;
}
function settingRow([k, label, type, opt]) {
  const v = APP.settings[k];
  let ctl;
  if (type === 'toggle') ctl = `<label class="switch"><input type="checkbox" data-ch="setChg" data-k="${k}" ${v ? 'checked' : ''} aria-label="${esc(label)}"><span></span></label>`;
  else if (type === 'select') ctl = `<select data-ch="setChg" data-k="${k}" aria-label="${esc(label)}">${opt.map(o => `<option${String(o) === String(v) ? ' selected' : ''}>${esc(o)}</option>`).join('')}</select>`;
  else if (type === 'range') ctl = `<input type="range" min="${opt[0]}" max="${opt[1]}" step="${opt[1] < 3 ? 0.1 : 1}" value="${v}" data-inp="setRange" data-k="${k}" aria-label="${esc(label)}"><span class="rv">${v}</span>`;
  else if (type === 'color') ctl = `<input type="color" value="${v}" data-ch="setChg" data-k="${k}" aria-label="Accent colour">`;
  else ctl = `<input type="text" value="${esc(v)}" data-ch="setChg" data-k="${k}" aria-label="${esc(label)}">`;
  return `<div class="set-row"><div class="sl">${esc(label)}${k === 'attachFolder' ? '<small>Used when you insert images</small>' : ''}</div>${ctl}</div>`;
}
INP.setRange = el => { const k = el.dataset.k; APP.settings[k] = +el.value; el.nextElementSibling && (el.nextElementSibling.textContent = el.value); applySettings(); };
CHG.setChg = el => {
  const k = el.dataset.k;
  let v = el.type === 'checkbox' ? el.checked : el.value;
  if (['fontSize', 'zoom', 'searchContext', 'autosaveDelay'].includes(k)) v = +v;
  if (k === 'lineHeight') v = +v;
  APP.settings[k] = v;
  if (k === 'readable' || k === 'lineNumbers') {}
  if (k === 'startView' || k === 'vaultName') {}
  applySettings(); renderAll(); toast('Setting saved');
};
ACT.setSec = el => { UI.sec = el.dataset.id; renderContent(); };
function applySettings() {
  const r = document.documentElement; const s = APP.settings;
  r.style.setProperty('--fs', s.fontSize + 'px');
  r.style.setProperty('--lh', s.lineHeight);
  r.style.setProperty('--accent', s.accent);
  r.style.setProperty('--zoom', s.zoom / 100);
  r.style.setProperty('--measure', s.readable ? '760px' : 'none');
  if (s.theme === 'system') r.removeAttribute('data-theme'); else r.dataset.theme = s.theme;
  const app = $('#app'); if (app) app.classList.toggle('no-ribbon', !s.ribbon);
}
/* Hotkeys with capture and collisions */
function hotkeysHTML() {
  const clash = k => Object.keys(APP.hotkeys).filter(x => x !== k && APP.hotkeys[x] === APP.hotkeys[k]);
  const rows = Object.keys(APP.hotkeys).map(k => {
    const c = clash(k);
    return `<div class="set-row hk${c.length ? ' clash' : ''}"><div class="sl">${esc(APP.hotkeyLabels[k])}${c.length ? `<small class="errTxt">Conflicts with ${esc(APP.hotkeyLabels[c[0]])}. Change one of them.</small>` : ''}</div>
      <button class="kbtn${UI.keyCapture === k ? ' capturing' : ''}" data-a="hkEdit" data-k="${k}">${UI.keyCapture === k ? 'Press keys…' : `<kbd>${esc(APP.hotkeys[k])}</kbd>`}</button></div>`;
  }).join('');
  return `<p class="hint">Select a shortcut, then press the new keys. Esc cancels.</p>${rows}
    <div class="row-end"><button class="btn sm" data-a="hkReset">Reset to defaults</button></div>`;
}
ACT.hkEdit = el => { UI.keyCapture = el.dataset.k; renderContent(); };
ACT.hkReset = () => { APP.hotkeys = { quickOpen: 'Ctrl+P', palette: 'Ctrl+Shift+P', search: 'Ctrl+Shift+F', newNote: 'Ctrl+N', save: 'Ctrl+S', closeTab: 'Ctrl+W', reopenTab: 'Ctrl+Shift+T', rename: 'F2', find: 'Ctrl+F', rightPanel: 'Ctrl+\\', sidebar: 'Ctrl+B', quickCapture: 'Ctrl+Alt+N', focus: 'Esc', settings: 'Ctrl+,' }; renderAll(); toast('Shortcuts reset'); };

/* Connections */
function connectionsHTML() {
  const rows = APP.connections.map((c, i) => {
    const map = { online: ['ok', 'Online'], stopped: ['warn', 'Stopped'], mismatch: ['bad', 'Version mismatch'] };
    const [cls, label] = map[c.state] || ['ok', 'Online'];
    const note = c.state === 'mismatch' ? `Server ${c.version} is older than this app (0.9.2). Update it from the Connect wizard.` : c.state === 'stopped' ? 'takenotes is installed but the server is not running in this distro.' : '';
    return `<div class="card conn"><div class="conn-h"><b>${esc(c.name)}</b><span class="badge ${cls}">${label}</span></div>
      <div class="kv"><span>Distro</span><b>${esc(c.distro)}</b><span>Linux user</span><b>${esc(c.user)}</b><span>URL</span><b>${esc(c.url)}</b><span>Version</span><b>${esc(c.version)}</b></div>
      ${note ? `<p class="errTxt">${esc(note)}</p>` : ''}
      <div class="row-end"><button class="btn sm" data-a="connStart" data-i="${i}">Start</button><button class="btn sm" data-a="connRestart" data-i="${i}">Restart</button><button class="btn sm" data-a="connCopyMcp" data-i="${i}">Copy MCP config</button><button class="btn sm danger" data-a="connRemove" data-i="${i}">Remove</button></div></div>`;
  }).join('');
  return `${rows || '<p class="muted">No connections yet. Open a WSL folder to set one up.</p>'}<div class="row-end"><button class="btn primary sm" data-a="wslStart">Set up WSL connection</button><button class="btn sm" data-a="pairFromLink">Pair from link</button></div>`;
}
ACT.connStart = el => { const c = APP.connections[+el.dataset.i]; c.state = 'online'; renderContent(); toast(`${c.name} started`); };
ACT.connRestart = el => { toast(`Restarting ${APP.connections[+el.dataset.i].name}…`); };
ACT.connCopyMcp = el => { const c = APP.connections[+el.dataset.i]; toast(`MCP config for ${c.name} copied`); };
ACT.connRemove = el => { const i = +el.dataset.i; const c = APP.connections[i]; confirmDialog({ title: `Remove ${c.name}?`, body: 'Workspaces stay on disk. Agents using this connection stop working.', ok: 'Remove', danger: true, fn: () => { APP.connections.splice(i, 1); renderContent(); } }); };
ACT.pairFromLink = () => pairDialog();

/* ICS calendars */
function icsHTML() {
  return `${APP.ics.map((s, i) => `<div class="card"><div class="conn-h"><b>${esc(s.name)}</b><span class="badge ${s.status === 'ok' ? 'ok' : 'bad'}">${s.status === 'ok' ? 'Synced' : 'Error'}</span></div>
      <p class="muted">Last sync ${fmtAgo(s.last)} · refresh every ${esc(s.refresh)}</p>${s.error ? `<p class="errTxt">${esc(s.error)}. Replace the link, or remove this calendar.</p>` : ''}
      <div class="row-end"><button class="btn sm" data-a="icsRemove" data-i="${i}">Remove</button></div></div>`).join('')}
    <div class="card"><h3>Add a calendar</h3><label class="field"><span>ICS subscription URL</span><input id="icsUrl" placeholder="https://…/calendar.ics" aria-label="ICS URL"></label>
      <p class="hint">Treated as a secret: stored locally and never shown in logs.</p><p class="err" id="icsErr" hidden></p>
      <div class="row-end"><label class="set-inline">Refresh <select data-ch="icsRefresh">${['1 hour', '1 day'].map(x => `<option${x === APP.settings.icsRefresh ? ' selected' : ''}>${x}</option>`).join('')}</select></label><button class="btn primary sm" data-a="icsAdd">Add calendar</button></div></div>`;
}
ACT.icsAdd = () => {
  const v = $('#icsUrl').value.trim(); const e = $('#icsErr');
  if (!/^https:\/\/\S+\.ics(\?\S*)?$/.test(v)) { e.hidden = false; e.textContent = 'Use an https:// link that ends in .ics.'; return; }
  APP.ics.push({ id: 'ics' + uid(), name: new URL(v).hostname, refresh: APP.settings.icsRefresh, last: Date.now(), status: 'ok', events: [] });
  renderContent(); toast('Calendar added and synced');
};
ACT.icsRemove = el => { APP.ics.splice(+el.dataset.i, 1); renderContent(); };
CHG.icsRefresh = el => { APP.settings.icsRefresh = el.value; };

/* Agents (MCP) */
UI.agent = UI.agent || { client: 'claude-code', activity: { agent: 'all', tool: 'all', result: 'all', q: '' } };
function agentsHTML() {
  const running = APP.settings.mcpOn;
  const pill = running ? `<span class="badge ok">Server running · 127.0.0.1:${APP.settings.mcpPort}</span>` : `<span class="badge warn">Server stopped</span>`;
  const tok = APP.tokens[0];
  const ac = UI.agent.client;
  const clients = { 'claude-code': ['Claude Code', '~/.claude.json'], cursor: ['Cursor', '~/.cursor/mcp.json'], codex: ['Codex', '~/.codex/config.toml'], other: ['Other', 'your client’s MCP config file'] };
  const token = tok ? `<token shown in the table below>` : '&lt;create a token first&gt;';
  const snippet = ac === 'codex'
    ? `[mcp_servers.takenotes]\nurl = "http://127.0.0.1:${APP.settings.mcpPort}/mcp"\nheaders = { Authorization = "Bearer ${tok ? 'tk_…' : '<token>'}" }`
    : `{\n  "mcpServers": {\n    "takenotes": {\n      "url": "http://127.0.0.1:${APP.settings.mcpPort}/mcp",\n      "headers": { "Authorization": "Bearer ${tok ? 'tk_…' : '<token>'}" }\n    }\n  }\n}`;
  const log = APP.activity.filter(a => (UI.agent.activity.agent === 'all' || a.agent === UI.agent.activity.agent) && (UI.agent.activity.tool === 'all' || a.tool === UI.agent.activity.tool) && (UI.agent.activity.result === 'all' || a.result === UI.agent.activity.result) && (!UI.agent.activity.q || (a.path || '').toLowerCase().includes(UI.agent.activity.q.toLowerCase())));
  const agents = [...new Set(APP.activity.map(a => a.agent))];
  const tools = [...new Set(APP.activity.map(a => a.tool))];
  return `<div class="agents">
    <div class="ag-top">${pill}<label class="switch sm"><input type="checkbox" data-ch="setChg" data-k="mcpOn" ${running ? 'checked' : ''} aria-label="Server on"><span></span></label></div>
    <p class="lede">Agents read and write the same Markdown files you see here. Tokens are read-only unless you choose write.</p>

    <section class="card">
      <h3>Connect an agent</h3>
      <div class="seg">${Object.entries(clients).map(([k, v]) => `<button class="${ac === k ? 'on' : ''}" data-a="agentClient" data-c="${k}">${v[0]}</button>`).join('')}</div>
      <p class="hint">Add this to <code>${esc(clients[ac][1])}</code>.</p>
      <pre class="snip code" id="snip">${esc(snippet)}</pre>
      <div class="row-end"><button class="btn sm" data-a="copySnippet">${icon('copy', 'xs')} Copy config</button></div>
    </section>

    <section class="card">
      <div class="conn-h"><h3>Tokens</h3><button class="btn primary sm" data-a="tokenCreate">Create token</button></div>
      ${APP.tokens.length ? `<table class="tbl"><thead><tr><th>Label</th><th>Scope</th><th>Workspaces</th><th>Created</th><th>Last used</th><th>Today</th><th></th></tr></thead><tbody>
        ${APP.tokens.map(t => `<tr><td>${esc(t.label)}</td><td><span class="chip ${t.scope === 'write' ? 'warn' : 'ok'}">${t.scope === 'write' ? 'Read & write' : 'Read'}</span></td><td>${t.ws.map(esc).join(', ')}</td><td>${esc(t.created)}</td><td>${fmtAgo(t.last)}</td><td>${t.reqToday}</td><td><button class="linkbtn danger" data-a="tokenRevoke" data-id="${t.id}">Revoke</button></td></tr>`).join('')}
        </tbody></table>` : `<div class="emptyside">${art('agents')}<p>No tokens yet. Create one, paste the config into your agent, then ask it to “plan my day”.</p></div>`}
      <p class="hint">Steps: 1 create a token · 2 paste the config · 3 ask your agent to plan your day.</p>
    </section>

    <section class="card">
      <h3>Activity log</h3>
      <div class="filters">
        <input class="qin" data-inp="actQ" placeholder="Filter by path" value="${esc(UI.agent.activity.q)}" aria-label="Filter activity">
        <select data-ch="actAgent" aria-label="Agent"><option value="all">All agents</option>${agents.map(a => `<option${UI.agent.activity.agent === a ? ' selected' : ''}>${esc(a)}</option>`).join('')}</select>
        <select data-ch="actTool" aria-label="Tool"><option value="all">All tools</option>${tools.map(a => `<option${UI.agent.activity.tool === a ? ' selected' : ''}>${esc(a)}</option>`).join('')}</select>
        <select data-ch="actResult" aria-label="Result"><option value="all">Any result</option>${['OK', 'Denied', 'Conflict'].map(r => `<option${UI.agent.activity.result === r ? ' selected' : ''}>${r}</option>`).join('')}</select>
      </div>
      ${log.length ? `<div class="log">${log.map((a, i) => `<button class="logrow" data-a="actDetail" data-i="${APP.activity.indexOf(a)}"><span class="badge ${a.result === 'OK' ? 'ok' : a.result === 'Denied' ? 'bad' : 'warn'}">${a.result}</span><b>${esc(a.agent)}</b><span>${esc(a.tool)}</span><span class="grow path">${esc(a.path || '')}</span><small>${fmtAgo(a.at)}</small></button>`).join('')}</div>` : `<div class="emptyside">${art('search')}<p>No activity matches these filters.</p></div>`}
    </section>
  </div>`;
}
ACT.agentClient = el => { UI.agent.client = el.dataset.c; renderContent(); };
ACT.copySnippet = () => toast('Config copied. Paste it into the file shown above.');
INP.actQ = el => { UI.agent.activity.q = el.value; const box = el.closest('.card'); const s = box.querySelector('.log'); void s; renderContent(); };
CHG.actAgent = el => { UI.agent.activity.agent = el.value; renderContent(); };
CHG.actTool = el => { UI.agent.activity.tool = el.value; renderContent(); };
CHG.actResult = el => { UI.agent.activity.result = el.value; renderContent(); };
ACT.actDetail = el => {
  const a = APP.activity[+el.dataset.i];
  modal({ title: `${a.agent} · ${a.tool}`, width: 480, body: `<div class="kv"><span>Result</span><b>${a.result}</b><span>Workspace</span><b>${esc(a.ws)}</b><span>File</span><b>${esc(a.path || '—')}</b><span>When</span><b>${fmtAgo(a.at)}</b></div>${a.note ? `<p class="errTxt">${esc(a.note)}</p>` : ''}`,
    actions: [{ label: 'Close' }, { label: 'Open in editor', primary: true, fn: () => { if (a.path && disk(a.path)) openNote(a.path); } }] });
};
ACT.tokenCreate = () => {
  modal({ title: 'Create token', width: 480, body: `<label class="field"><span>Label</span><input id="tkl" placeholder="claude-code · laptop" aria-label="Token label"></label>
    <div class="field"><span>Workspaces</span>${DB.order.map(id => `<label class="check"><input type="checkbox" name="tkws" value="${id}"${id === 'dev-notes' ? ' checked' : ''}> ${esc(DB.ws[id].name)}</label>`).join('')}</div>
    <div class="field"><span>Scope</span><label class="check"><input type="radio" name="tks" value="read" checked> Read-only (default)</label><label class="check"><input type="radio" name="tks" value="write"> Read & write</label></div>
    <p class="err" id="tkErr" hidden></p>`,
    actions: [{ label: 'Cancel' }, { label: 'Create', primary: true, fn: rec => {
      const label = rec.root.querySelector('#tkl').value.trim();
      const ws = [...rec.root.querySelectorAll('input[name=tkws]:checked')].map(x => x.value);
      const scope = rec.root.querySelector('input[name=tks]:checked').value;
      const e = rec.root.querySelector('#tkErr');
      if (!label || !ws.length) { e.hidden = false; e.textContent = !label ? 'Name the token so you can recognise it later.' : 'Choose at least one workspace.'; return false; }
      const secret = 'tk_' + Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10);
      APP.tokens.push({ id: 'tk' + uid(), label, scope, ws, created: 'Oct 28', last: null, reqToday: 0, secret });
      revealToken(secret);
    } }] });
};
function revealToken(secret) {
  modal({ title: 'Token created', width: 480, dismiss: false, body: `<p class="lede">Copy this token now. It is shown once and cannot be seen again.</p>
    <div class="secret"><code>${esc(secret)}</code><button class="btn sm" data-a="copySecret" data-s="${esc(secret)}">${icon('copy', 'xs')} Copy</button></div>
    <p class="hint">If you lose it, revoke the token and create a new one.</p>`, actions: [{ label: 'Done', primary: true }] });
  renderContent();
}
ACT.copySecret = el => { el.textContent = 'Copied'; toast('Token copied'); };
ACT.tokenRevoke = el => {
  const t = APP.tokens.find(x => x.id === el.dataset.id);
  confirmDialog({ title: `Revoke “${t.label}”?`, body: 'The agent using this token loses access immediately.', ok: 'Revoke', danger: true, fn: () => { APP.tokens = APP.tokens.filter(x => x.id !== t.id); APP.activity.unshift({ at: Date.now(), agent: t.label.split(' ')[0], tool: 'token_revoke', ws: UI.ws, path: '', result: 'OK' }); renderContent(); toast('Token revoked'); } });
};
function updatesHTML() {
  const u = APP.update;
  return `<div class="card"><div class="kv"><span>Current version</span><b>${u.current}</b><span>Channel</span><b>${esc(APP.settings.updateChannel)}</b></div>
    ${u.available ? `<p class="okline">${icon('download', 'xs')} ${u.available} is available.</p><button class="btn primary sm" data-a="updateDialog">Review update</button>` : `<p class="okline">${icon('check', 'xs')} You’re up to date.</p><button class="btn sm" data-a="checkUpdates">Check now</button>`}</div>`;
}
ACT.checkUpdates = () => { toast('You’re up to date.'); };
function aboutHTML() {
  return `<div class="card"><p><b>takenotes</b> ${APP.update.current} · free, open source, local-first.</p>
    <p class="muted">No accounts, no sync, no subscriptions. Notes are plain Markdown files.</p>
    <h4>Scope decisions in this prototype</h4><ul class="plain-list">
      <li>Properties: edit existing values here; new properties are written in the source.</li>
      <li>Search: no regex toggle (regex is deferred).</li>
      <li>Appearance: light, dark, system and accent only (no frame style).</li>
      <li>Natural-language dates: Concept, shown in the palette’s @ mode.</li>
      <li>Saved views: table and list only; board and cards are Later.</li></ul></div>`;
}
