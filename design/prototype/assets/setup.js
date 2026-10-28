/* Welcome, web login, workspace open/create, WSL wizard, pairing, import, updates */

/* Welcome (desktop and mobile onboarding) */
function renderWelcome() {
  UI.screen = 'welcome';
  const scr = $('#screen'); scr.hidden = false; $('#app').hidden = true;
  const recents = APP.recents.filter(id => DB.ws[id]);
  const mobile = isMobile();
  scr.innerHTML = `<div class="welcome${mobile ? ' mobile-onb' : ''}">
    <div class="welcome-in">
      <div class="brand big">take<i>notes</i></div>
      <p class="promise">Your notes stay plain Markdown files.</p>
      ${mobile ? `<div class="card onb"><b>Choose a folder</b><p class="muted">Files arrive through your own sync tool (Syncthing, iCloud or Dropbox). takenotes does no sync.</p><button class="btn primary" data-a="openFolderDialog">Choose folder</button></div>`
      : `<div class="welcome-grid">
        <button class="wcard" data-a="openFolderDialog">${icon('folder')}<b>Open a folder</b><small>Use any folder of Markdown files</small></button>
        <button class="wcard" data-a="wslStart">${icon('terminal')}<b>Open WSL folder</b><small>Your Linux home, edited from Windows</small></button>
        <button class="wcard" data-a="createWorkspaceDialog">${icon('plus')}<b>Create a workspace</b><small>Start empty with a welcome note</small></button>
        <button class="wcard" data-a="loginDialog">${icon('cloud')}<b>Sign in to a server</b><small>Browser editor for a self-hosted takenotes</small></button>
      </div>`}
      ${recents.length ? `<div class="recents"><h4>Recent</h4>${recents.map(id => `<button class="rec-row" data-a="enterWs" data-id="${id}"><span class="kind kind-${DB.ws[id].kind.toLowerCase()}">${esc(DB.ws[id].kind)}</span><span class="rn">${esc(DB.ws[id].name)}</span><small>${esc(DB.ws[id].path)}</small></button>`).join('')}</div>` : ''}
    </div></div>`;
}
ACT.enterWs = el => { closeMenus(); enterWorkspace(el.dataset.id); };
ACT.openFolderDialog = () => openFolderDialog();
ACT.createWorkspaceDialog = () => createWorkspaceDialog();
ACT.wslStart = () => wslWizard();
ACT.loginDialog = () => renderLogin();
function openFolderDialog() {
  const rows = DB.order.map(id => `<button class="pick" data-a="pickFolder" data-id="${id}">${icon('folder', 'sm')}<span><b>${esc(DB.ws[id].name)}</b><small>${esc(DB.ws[id].kind)} · ${esc(DB.ws[id].path)}</small></span></button>`).join('')
    + `<button class="pick" data-a="pickLocked">${icon('lock', 'sm')}<span><b>Locked Archive</b><small>Windows · C:\\Program Files\\Locked</small></span></button>`;
  modal({ title: 'Open a folder', width: 520, body: `<p class="lede">Choose a folder that contains Markdown files. takenotes reads and writes the files in place.</p><div class="picklist">${rows}</div>`, actions: [{ label: 'Cancel' }] });
}
ACT.pickFolder = el => { const id = el.dataset.id; topModal() && topModal().close(); enterWorkspace(id); };
ACT.pickLocked = () => { topModal() && topModal().close(); errorDialog({ title: 'Can’t open this folder', cause: 'Windows denied access to this folder. Check its permissions, or choose a different folder.', detail: "EPERM: operation not permitted, scandir 'C:\\Program Files\\Locked'", action: { label: 'Choose another folder', fn: () => openFolderDialog() } }); };
function createWorkspaceDialog() {
  modal({
    title: 'Create a workspace', width: 480,
    body: `<label class="field"><span>Name</span><input id="wsn" data-inp="wsName" value="" placeholder="My notes" aria-label="Workspace name"></label>
      <label class="field"><span>Location</span><select id="wsl"><option>Windows · Documents\\Notes</option><option>macOS · ~/Documents/Notes</option></select></label>
      <p class="err" id="wsErr" hidden></p>`,
    actions: [{ label: 'Cancel' }, { label: 'Create', primary: true, fn: rec => {
      const n = rec.root.querySelector('#wsn').value.trim(); const e = rec.root.querySelector('#wsErr');
      const bad = !n ? 'Give the workspace a name.' : /[\/\\:*?"<>|]/.test(n) ? 'Names can’t contain / \\ : * ? " < > |.' : DB.order.some(id => DB.ws[id].name.toLowerCase() === n.toLowerCase()) ? 'A workspace with this name already exists.' : '';
      if (bad) { e.hidden = false; e.textContent = bad; return false; }
      const id = n.toLowerCase().replace(/\s+/g, '-') + '-' + uid();
      const isMac = rec.root.querySelector('#wsl').value.startsWith('macOS');
      DB.ws[id] = { id, name: n, kind: isMac ? 'macOS' : 'Windows', path: isMac ? `~/Documents/${n}` : `C:\\Users\\utsav\\Documents\\${n}`, conn: 'online', readOnly: [], folders: [], favs: [], files: { 'Welcome.md': F('# Welcome\n\nYour notes stay plain Markdown files.\n\n#start', { ago: 0 }) }, snaps: {}, trash: [] };
      DB.order.push(id);
      enterWorkspace(id);
      toast(`Created workspace “${n}”`);
    } }],
  });
}
INP.wsName = () => {};
function closeWorkspace2() {}

/* Web login with throttling */
let _fails = 0, _lockUntil = 0;
function renderLogin() {
  UI.screen = 'login';
  const scr = $('#screen'); scr.hidden = false; $('#app').hidden = true;
  scr.innerHTML = `<div class="welcome"><div class="welcome-in narrow">
    <div class="brand big">take<i>notes</i></div><p class="muted">Sign in to your self-hosted server. The browser editor reuses the desktop components.</p>
    <div class="card">
      <label class="field"><span>Server</span><input value="https://notes.home.arpa:3000" readonly></label>
      <label class="field"><span>Owner password</span><input type="password" id="pw" data-inp="pwIn" aria-label="Owner password"></label>
      <p class="err" id="pwErr" hidden></p>
      <div class="row-end"><button class="linkbtn" data-a="welcomeBack">Back</button><button class="btn primary" data-a="doLogin" id="loginBtn">Sign in</button></div>
    </div>
    <p class="hint">First boot? The owner password was printed once in the server log.</p></div></div>`;
  setTimeout(() => $('#pw') && $('#pw').focus(), 20);
  tickLock();
}
function tickLock() {
  const err = $('#pwErr'); const btn = $('#loginBtn');
  if (!err || !btn) return;
  const left = Math.ceil((_lockUntil - Date.now()) / 1000);
  if (left > 0) { err.hidden = false; err.textContent = `Too many attempts. Wait ${left}s and retry.`; btn.disabled = true; setTimeout(tickLock, 1000); }
  else { btn.disabled = false; if (err.textContent.startsWith('Too many')) { err.hidden = true; } }
}
ACT.welcomeBack = () => renderWelcome();
ACT.doLogin = () => {
  const pw = $('#pw').value; const err = $('#pwErr');
  if (Date.now() < _lockUntil) return tickLock();
  if (pw === 'takenotes') { _fails = 0; DB.order.includes('home-server') && enterWorkspace('home-server'); return; }
  _fails++;
  if (_fails >= 3) { _lockUntil = Date.now() + 30000; _fails = 0; return tickLock(); }
  err.hidden = false; err.textContent = `Wrong password. ${3 - _fails} attempt${3 - _fails === 1 ? '' : 's'} left before a short lock. Hint: the sample password is “takenotes”.`;
};

/* WSL setup wizard: pick distro, install with real steps, pair */
const WSL_STEPS = [
  ['Download server 0.9.2 (14 MB)', 500], ['Install to ~/.local/share/takenotes', 700], ['Start server on 127.0.0.1:3000', 600], ['Health check', 700],
];
function wslWizard() {
  UI.wsl = { step: 'pick', fail: false, distro: 'Ubuntu', progress: [] };
  UI.wslRec = modal({ title: 'Open WSL folder', width: 560, dismiss: true, body: '<div id="wslBody"></div>', actions: [], onClose: () => { UI.wsl = null; } });
  drawWsl();
}
function drawWsl() {
  const s = UI.wsl; const body = $('#wslBody'); if (!body || !s) return;
  const step = s.step;
  const stepper = ['Choose', 'Install', 'Pair', 'Open'].map((l, i) => { const idx = ['pick', 'install', 'pair', 'open'].indexOf(step); return `<span class="stp${i < idx ? ' done' : i === idx ? ' on' : ''}">${i + 1}. ${l}</span>`; }).join('');
  let inner = '';
  if (step === 'pick') inner = `<p class="lede">takenotes runs a small server inside your Linux distro. Your notes stay in your Linux home.</p>
      <div class="picklist">
        <button class="pick${s.distro === 'Ubuntu' ? ' on' : ''}" data-a="wslPick" data-d="Ubuntu">${icon('terminal', 'sm')}<span><b>Ubuntu</b><small>Running · utsav · no takenotes yet</small></span></button>
        <button class="pick${s.distro === 'Debian' ? ' on' : ''}" data-a="wslPick" data-d="Debian">${icon('terminal', 'sm')}<span><b>Debian</b><small>Stopped · start it to continue</small></span></button>
      </div>
      <label class="check"><input type="checkbox" data-ch="wslFail" ${s.fail ? 'checked' : ''}> Simulate a failed health check (to see the error path)</label>`;
  if (step === 'install') inner = `<p class="lede">Installing into ${esc(s.distro)}. This usually takes under a minute.</p><ol class="steps">${s.progress.map((p, i) => `<li class="${p}">${p === 'done' ? icon('check', 'xs') : p === 'fail' ? icon('error', 'xs') : p === 'run' ? '<i class="spin"></i>' : ''}${esc(WSL_STEPS[i][0])}${p === 'fail' ? `<small class="errTxt">This step failed: connection refused on 127.0.0.1:3000. The server did not answer within 10 seconds.</small>` : ''}</li>`).join('')}</ol>
      ${s.failed ? `<div class="row-end"><button class="btn sm" data-a="wslCopyDiag">Copy diagnostics</button><button class="btn sm" data-a="wslBackPick">Back</button><button class="btn sm primary" data-a="wslRetry">Try again</button></div>` : ''}`;
  if (step === 'pair') inner = `<div class="okbox">${icon('check')}<div><b>Paired with takenotes on ${esc(s.distro)}</b><p class="muted">Server 0.9.2 on 127.0.0.1:3000 is healthy. The pairing token was stored in your Windows credential store.</p></div></div>
      <div class="row-end"><button class="btn primary" data-a="wslOpen">Choose a folder</button></div>`;
  if (step === 'open') inner = `<p class="lede">Pick a folder inside your Linux home.</p><div class="picklist">${['~/notes', '~/projects/notes'].map(p => `<button class="pick" data-a="wslFinish" data-p="${p}">${icon('folder', 'sm')}<span><b>${p}</b><small>${esc(s.distro)}</small></span></button>`).join('')}</div>`;
  body.innerHTML = `<div class="stepper">${stepper}</div>${inner}`;
}
ACT.wslPick = el => { UI.wsl.distro = el.dataset.d; drawWsl(); };
CHG.wslFail = el => { UI.wsl.fail = el.checked; };
ACT.wslStart2 = () => {};
document.addEventListener('click', e => {
  if (!UI.wsl) return;
  const b = e.target.closest('[data-a="wslNext"]');
  if (b) { UI.wsl.step = 'install'; UI.wsl.progress = WSL_STEPS.map(() => 'todo'); UI.wsl.failed = false; drawWsl(); runWsl(0); }
});
function runWsl(i) {
  const s = UI.wsl; if (!s) return;
  if (i >= WSL_STEPS.length) { s.step = 'pair'; return drawWsl(); }
  s.progress[i] = 'run'; drawWsl();
  setTimeout(() => {
    if (!UI.wsl) return;
    if (s.fail && i === WSL_STEPS.length - 1) { s.progress[i] = 'fail'; s.failed = true; return drawWsl(); }
    s.progress[i] = 'done'; drawWsl(); runWsl(i + 1);
  }, WSL_STEPS[i][1]);
}
ACT.wslRetry = () => { UI.wsl.fail = false; UI.wsl.failed = false; UI.wsl.progress = WSL_STEPS.map(() => 'todo'); drawWsl(); runWsl(0); };
ACT.wslBackPick = () => { UI.wsl.step = 'pick'; drawWsl(); };
ACT.wslCopyDiag = () => toast('Diagnostics copied: distro Ubuntu, server health check timed out.');
ACT.wslOpen = () => { UI.wsl.step = 'open'; drawWsl(); };
ACT.wslFinish = el => {
  const id = 'wsl-' + uid();
  DB.ws[id] = { id, name: `${UI.wsl.distro.toLowerCase()} · ${el.dataset.p}`, kind: 'WSL', distro: UI.wsl.distro, path: el.dataset.p, conn: 'online', readOnly: [], folders: [], favs: [], files: { 'Welcome.md': F('# Welcome\n\nThis folder lives in your Linux home.\n\n#start', { ago: 0 }) }, snaps: {}, trash: [] };
  DB.order.push(id); APP.connections.push({ id: 'c' + uid(), name: `${UI.wsl.distro} · ${el.dataset.p}`, distro: UI.wsl.distro, user: 'utsav', url: 'http://127.0.0.1:3000', version: '0.9.2', state: 'online' });
  UI.wslRec && UI.wslRec.close(); UI.wsl = null;
  enterWorkspace(id); toast('WSL workspace opened');
};
document.addEventListener('click', e => { const b = e.target.closest('[data-a="wslNext"]'); void b; });
/* Install step needs a start action on the pick step */
const _drawWsl = drawWsl;
drawWsl = function () {
  _drawWsl();
  const body = $('#wslBody'); if (!body || !UI.wsl) return;
  if (UI.wsl.step === 'pick') {
    const f = document.createElement('div'); f.className = 'row-end';
    f.innerHTML = `<button class="btn primary" data-a="wslInstall">Set up takenotes in ${esc(UI.wsl.distro)}</button>`;
    body.appendChild(f);
  }
};
ACT.wslInstall = () => { UI.wsl.step = 'install'; UI.wsl.progress = WSL_STEPS.map(() => 'todo'); UI.wsl.failed = false; drawWsl(); runWsl(0); };

/* Pair from link */
function pairDialog() {
  modal({
    title: 'Pair from link', width: 480,
    body: `<label class="field"><span>Pairing link</span><input id="pl" data-inp="pairIn" value="takenotes://pair?server=http://127.0.0.1:3001&name=Debian%20dev" aria-label="Pairing link"></label>
      <div id="pairPrev" class="pairprev"></div><p class="err" id="plErr" hidden></p>`,
    onMount: () => INP.pairIn($('#pl')),
    actions: [{ label: 'Cancel' }, { label: 'Pair', primary: true, fn: rec => {
      const v = rec.root.querySelector('#pl').value;
      const m = v.match(/^takenotes:\/\/pair\?server=([^&]+)&name=([^&]+)/);
      if (!m) { const e = rec.root.querySelector('#plErr'); e.hidden = false; e.textContent = 'This isn’t a takenotes pairing link.'; return false; }
      APP.connections.push({ id: 'c' + uid(), name: decodeURIComponent(m[2]), distro: 'Debian', user: 'utsav', url: decodeURIComponent(m[1]), version: '0.9.2', state: 'online' });
      toast('Paired. The connection is in Settings › Connections.');
    } }],
  });
}
INP.pairIn = el => {
  const v = el.value; const m = v.match(/server=([^&]+)&name=([^&]+)/);
  const box = $('#pairPrev'); if (!box) return;
  box.innerHTML = m ? `<div class="pv-row"><span>Server</span><b>${esc(decodeURIComponent(m[1]))}</b></div><div class="pv-row"><span>Name</span><b>${esc(decodeURIComponent(m[2]))}</b></div>` : '<p class="muted">Paste a takenotes://pair link to see what it connects to.</p>';
};

/* Import (Markdown folder or Obsidian vault) */
function importDialog() {
  modal({
    title: 'Import notes', width: 520,
    body: `<div class="field"><span>Source</span><label class="check"><input type="radio" name="src" value="md" checked> Markdown folder</label><label class="check"><input type="radio" name="src" value="obs"> Obsidian vault</label></div>
      <div class="field"><span>Mapping</span><label class="check"><input type="checkbox" checked> Keep frontmatter properties</label><label class="check"><input type="checkbox" checked> Convert [[wikilinks]] as they are</label><label class="check"><input type="checkbox"> Flatten folders into Imported/</label></div>
      <div id="impBody"></div>`,
    actions: [{ label: 'Cancel' }, { label: 'Import', primary: true, fn: rec => { runImport(rec); return false; } }],
  });
}
function runImport(rec) {
  const body = rec.root.querySelector('#impBody');
  body.innerHTML = `<div class="prog"><i style="width:0%"></i></div><p class="muted" id="impMsg">Reading files…</p>`;
  const bar = body.querySelector('.prog i'); let p = 0;
  const tick = setInterval(() => {
    p += 12; bar.style.width = Math.min(p, 100) + '%';
    if (p >= 100) {
      clearInterval(tick);
      const imported = ['Imported/Book notes.md', 'Imported/Daily 2026-10-01.md', 'Imported/Clippings.md'];
      imported.forEach((f, i) => FS.write(UI.ws, f, `# ${basename(f)}\n\nImported content ${i + 1}.\n\n#import`));
      body.innerHTML = `<div class="okbox">${icon('check')}<div><b>Imported ${imported.length} notes</b><p class="muted">Skipped 2 files:</p><ul class="plain-list"><li>.DS_Store (system file)</li><li>attachments/movie.mov (over the 50 MB import limit)</li></ul></div></div>`;
      rec.root.querySelector('.dlg-f').innerHTML = '<button class="btn primary" data-x>Done</button>';
      renderAll();
    }
  }, 180);
}

/* Updates */
function updateDialog() {
  const u = APP.update;
  const rec = modal({
    title: `takenotes ${u.available} is available`, width: 480,
    body: `<p class="muted">You have ${u.current}. Release notes:</p><ul class="plain-list">${u.notes.split('\n').map(n => `<li>${esc(n)}</li>`).join('')}</ul>
      <div id="updBody"></div>`,
    actions: [{ label: 'Later' }, { label: 'Download and install', primary: true, fn: r => { startDownload(r); return false; } }],
  });
  void rec;
}
function startDownload(rec) {
  const body = rec.root.querySelector('#updBody');
  body.innerHTML = `<div class="prog"><i style="width:0%"></i></div><p class="muted" id="updMsg">Downloading 0.9.3…</p>`;
  const bar = body.querySelector('.prog i'); let p = 0;
  const t = setInterval(() => {
    p += 14; bar.style.width = Math.min(p, 100) + '%';
    if (p >= 100) { clearInterval(t); APP.update.current = APP.update.available; APP.update.available = null; body.innerHTML = `<div class="okbox">${icon('check')}<div><b>Ready to install</b><p class="muted">Restart takenotes to finish. Your open notes are saved first.</p></div></div>`; rec.root.querySelector('.dlg-f').innerHTML = '<button class="btn primary" data-x>Restart later</button>'; renderAll(); }
  }, 220);
}
ACT.updateDialog = () => updateDialog();
