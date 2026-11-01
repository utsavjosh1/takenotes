/* takenotes prototype: data layer.
 * Every read and write goes through FS. To connect this prototype to real
 * files, replace FS.read/write/remove/list with your file or IPC calls and
 * keep the same signatures. Nothing else in the UI touches DB directly. */
const TODAY = '2026-10-28';
const NOW = Date.now();
const MIN = 60e3, HOUR = 36e5, DAY = 864e5;
const rev = () => Math.random().toString(16).slice(2, 9);
const F = (body, o = {}) => ({ body, rev: rev(), mtime: o.mtime ?? NOW - (o.ago ?? 2 * DAY), created: o.created ?? 'Oct 12' });

const ROADMAP = `---
status: active
owner: utsav
---
# Takenotes roadmap

Ship the desktop prototype first, then the mobile companion that reads the same folder.

## Milestones
- [x] Editor with live preview @priority(high)
- [ ] Backlinks and outline @due(2026-10-30) @priority(high)
- [ ] Settings parity @scheduled(2026-10-28 14:00) @due(2026-11-02)
- [ ] Agents changes tray @scheduled(2026-10-28 11:00) @due(2026-10-27)
- [ ] Quick Capture hotkey @due(2026-11-05)

## Open questions
- Do we need Agents (MCP) in v1?

See [[Design brief]], [[Keyboard shortcuts]] and [[Auth rewrite — plan]].

#project #roadmap`;

const BIG = {};
for (let i = 1; i <= 2000; i++) {
  const n = String(i).padStart(4, '0');
  BIG[`Archive/Note ${n}.md`] = F(`# Archived note ${n}\n\nOld material kept for reference.\n\n#archive`, { created: 'Jan 2026', ago: 90 * DAY });
}

const DB = {
  ws: {
    'dev-notes': {
      id: 'dev-notes', name: 'dev-notes', kind: 'WSL', path: '~/notes', distro: 'Ubuntu', conn: 'online',
      readOnly: ['Reading'], folders: ['Areas', 'Attachments', 'Daily', 'Inbox', 'Projects', 'Reading', 'Templates', 'Calendar', 'Archive'],
      favs: [{ type: 'file', path: 'Projects/Takenotes roadmap.md' }, { type: 'folder', path: 'Projects' }, { type: 'search', q: 'task:open' }, { type: 'heading', path: 'Projects/Takenotes roadmap.md', text: 'Milestones' }],
      files: {
        ...BIG,
        'Projects/Takenotes roadmap.md': F(ROADMAP, { created: 'Oct 12', ago: 2 * HOUR }),
        'Projects/Design brief.md': F('# Design brief\n\nA calm, fast desktop notes app.\n\n## Principles\n- Keyboard first\n- Nothing overlaps\n- Plain text on disk\n\n#design', { ago: DAY }),
        'Projects/Auth rewrite — plan.md': F('# Auth rewrite — plan\n\n1. Move sessions to server-side tokens\n2. Add refresh rotation\n\n> [!warning] Blocked\n> Waiting on the WSL pairing token format.\n\n- [ ] Write migration @due(2026-11-01) @priority(medium)\n- [ ] Draft rollout note @due(2026-10-28)\n\n#project #bug', { ago: 3 * DAY }),
        'Projects/Meeting — design review.md': F('# Meeting — design review\n\nDate: 2026-10-28 · Attendees: Ron, Utsav\n\n## Agenda\n- Prototype walkthrough\n- Conflict banner wording\n\n## Actions\n- [ ] Ron: tighten empty states @due(2026-10-30)\n\n#meeting', { ago: 4 * HOUR }),
        'Projects/Keyboard shortcuts.md': F('# Keyboard shortcuts\n\n- Ctrl+P quick open\n- Ctrl+Shift+P command palette\n- Ctrl+Shift+F search\n- Ctrl+B sidebar (bold inside the editor)\n- Ctrl+\\ right panel\n- Esc focus mode\n\n#reference', { ago: 8 * DAY }),
        'Daily/2026-10-27.md': F('# 2026-10-27\n\n- [x] Finished editor spec\n- [ ] Ask about WSL pairing token @due(2026-10-27)\n\n#daily', { ago: DAY }),
        'Inbox/Ideas.md': F('# Ideas\n\n- Graph view for [[Takenotes roadmap]]\n- Templates for meeting notes\n- Typewriter scroll option\n- Link to [[Missing concept]] from the roadmap\n\n#idea', { ago: 2 * DAY }),
        'Inbox/Capture.md': F('# Capture\n\n', { ago: 5 * HOUR }),
        'Reading/Reading list.md': F('# Reading list\n\n- The Pragmatic Programmer\n- Thinking in Systems\n\n#reading', { ago: 9 * DAY }),
        'Areas/Team.md': F('# Team\n\nContractors: Ron (design), a developer, a consultant.\n\n#area', { ago: 6 * DAY }),
        'Calendar/Design review.md': F('---\ntype: event\nstart: 2026-10-28 15:00\nend: 2026-10-28 16:00\n---\n# Design review\n\nWalk through the Figma prototype with the team.\n\n#meeting', { ago: 5 * HOUR }),
        'Calendar/Standup.md': F('---\ntype: event\nstart: 2026-10-28 09:30\nend: 2026-10-28 09:45\n---\n# Standup\n\n#meeting', { ago: 5 * HOUR }),
        'Templates/Daily.md': F('# {{date}}\n\n## Plan\n- [ ] \n\n## Notes\n\n#daily', { ago: 20 * DAY }),
        'Templates/Meeting.md': F('# {{title}}\n\nDate: {{date}} {{time}}\n\n## Agenda\n- \n\n## Actions\n- [ ] \n\n#meeting', { ago: 20 * DAY }),
        'Templates/Project.md': F('# {{title}}\n\nStatus: active\nOwner: \n\n## Goals\n- \n\n#project', { ago: 20 * DAY }),
      },
      snaps: {
        'Projects/Takenotes roadmap.md': [
          { id: 's1', at: NOW - 3 * HOUR, label: 'Auto', body: ROADMAP.replace('- [ ] Quick Capture hotkey @due(2026-11-05)\n', '') },
          { id: 's2', at: NOW - DAY, label: 'On close', body: ROADMAP.replace('Ship the desktop prototype first', 'Ship the prototype') },
        ],
      },
      trash: [{ path: 'Inbox/Old scratch.md', body: '# Old scratch\n\nNothing useful here.', deleted: NOW - 8 * DAY, perm: true }],
    },
    notes: {
      id: 'notes', name: 'Notes', kind: 'Windows', path: 'C:\\Users\\utsav\\Documents\\Notes', conn: 'online',
      readOnly: [], folders: ['Daily', 'Inbox', 'Reading'], favs: [],
      files: {
        'Inbox/Groceries.md': F('# Groceries\n\n- Oats\n- Lemons\n- Tea\n\n#home', { ago: DAY }),
        'Inbox/Welcome.md': F('# Welcome\n\nYour notes stay plain Markdown files.\n\n#start', { ago: 30 * DAY }),
        'Reading/Reading list.md': F('# Reading list\n\n- Thinking in Systems\n\n#reading', { ago: 9 * DAY }),
      },
      snaps: {},
      trash: [{ path: 'Inbox/Welcome draft.md', body: '# Welcome draft\n', deleted: NOW - 2 * DAY, perm: false }],
    },
    research: {
      id: 'research', name: 'Research', kind: 'macOS', path: '~/Documents/Research', conn: 'online',
      readOnly: [], folders: ['Papers'], favs: [],
      files: {
        'Papers/Attention notes.md': F('# Attention notes\n\nSee [[Agents survey]].\n\n#paper', { ago: 3 * DAY }),
        'Papers/Agents survey.md': F('# Agents survey\n\nTool use and memory. Links back to [[Attention notes]].\n\n#paper #survey', { ago: 4 * DAY }),
      },
      snaps: {}, trash: [],
    },
    'home-server': {
      id: 'home-server', name: 'home-server', kind: 'Server', path: 'https://notes.home.arpa:3000', conn: 'online',
      readOnly: [], folders: ['Journal', 'Lists'], favs: [],
      files: {
        'Journal/2026-10-27.md': F('# 2026-10-27\n\nQuiet day. Read two chapters.\n\n#journal', { ago: DAY }),
        'Lists/Shopping.md': F('# Shopping\n\n- [ ] Batteries\n- [ ] Coffee\n\n#list', { ago: 2 * DAY }),
      },
      snaps: {}, trash: [],
    },
  },
  order: ['dev-notes', 'notes', 'research', 'home-server'],
};

const APP = {
  settings: {
    startView: 'today', language: 'English', vaultName: 'dev-notes',
    fontSize: 16, lineHeight: 1.7, readable: true, spellcheck: false, smartLists: true, lineNumbers: false, typewriter: false,
    theme: 'system', accent: '#4f41d6', zoom: 100, inlineTitle: true, ribbon: true,
    newNoteFolder: 'Inbox', linkFormat: 'wikilink', autoLinks: true, attachFolder: 'Attachments',
    dailyFolder: 'Daily', dailyTemplate: 'Templates/Daily.md', templateFolder: 'Templates',
    icsRefresh: '1 hour', searchTrash: false, caseSensitive: false, searchContext: 2,
    snapInterval: '60', snapRetention: '30 days', autosave: 'on', autosaveDelay: 1200,
    updateChannel: 'stable', haptics: true, mcpPort: 3000, mcpOn: true, keepTrash: '30 days',
  },
  hotkeys: {
    quickOpen: 'Ctrl+P', palette: 'Ctrl+Shift+P', search: 'Ctrl+Shift+F', newNote: 'Ctrl+N', save: 'Ctrl+S',
    closeTab: 'Ctrl+W', reopenTab: 'Ctrl+Shift+T', rename: 'F2', find: 'Ctrl+F', rightPanel: 'Ctrl+\\',
    sidebar: 'Ctrl+B', quickCapture: 'Ctrl+Alt+N', focus: 'Esc', settings: 'Ctrl+,',
  },
  hotkeyLabels: {
    quickOpen: 'Quick Open (files)', palette: 'Command Palette', search: 'Search panel', newNote: 'New note',
    save: 'Save', closeTab: 'Close tab', reopenTab: 'Reopen closed tab', rename: 'Rename (inline)', find: 'Find in note',
    rightPanel: 'Toggle right panel', sidebar: 'Toggle sidebar (outside the editor)', quickCapture: 'Quick Capture',
    focus: 'Focus mode (Esc)', settings: 'Settings',
  },
  tokens: [
    { id: 'tk1', label: 'claude-code · laptop', scope: 'write', ws: ['dev-notes'], created: 'Oct 12', last: NOW - 12 * MIN, reqToday: 48 },
    { id: 'tk2', label: 'cursor · read-only', scope: 'read', ws: ['dev-notes'], created: 'Oct 20', last: NOW - 2 * HOUR, reqToday: 9 },
    { id: 'tk3', label: 'codex', scope: 'write', ws: ['dev-notes', 'home-server'], created: 'Oct 25', last: null, reqToday: 0 },
  ],
  activity: [
    { at: NOW - 12 * MIN, agent: 'claude-code', tool: 'plan_today', ws: 'dev-notes', path: 'Daily', result: 'OK' },
    { at: NOW - 30 * MIN, agent: 'cursor', tool: 'note_update', ws: 'dev-notes', path: 'Projects/Takenotes roadmap.md', result: 'Denied', note: 'token is read-only' },
    { at: NOW - 2 * HOUR, agent: 'claude-code', tool: 'task_create', ws: 'dev-notes', path: 'Inbox/Capture.md', result: 'OK' },
    { at: NOW - 3 * HOUR, agent: 'codex', tool: 'note_update', ws: 'dev-notes', path: 'Projects/Auth rewrite — plan.md', result: 'Conflict', note: 'file changed on disk' },
  ],
  ics: [
    { id: 'team', name: 'Team calendar', refresh: '1 hour', last: NOW - 20 * MIN, status: 'ok', events: [{ title: 'Sprint planning', start: '2026-10-28 10:00', end: '2026-10-28 11:00' }] },
    { id: 'old', name: 'Old calendar', refresh: '1 day', last: NOW - 3 * DAY, status: 'error', error: 'HTTP 403: link expired', events: [] },
  ],
  connections: [
    { id: 'c1', name: 'Ubuntu · dev-notes', distro: 'Ubuntu', user: 'utsav', url: 'http://127.0.0.1:3000', version: '0.9.2', state: 'online' },
    { id: 'c2', name: 'Debian', distro: 'Debian', user: 'utsav', url: 'http://127.0.0.1:3001', version: '0.9.2', state: 'stopped' },
    { id: 'c3', name: 'Ubuntu 22.04 (old)', distro: 'Ubuntu-22.04', user: 'utsav', url: 'http://127.0.0.1:3002', version: '0.8.0', state: 'mismatch' },
  ],
  views: [
    { id: 'v1', name: 'Open tasks', q: 'task:open', kind: 'table', cols: ['file', 'status', 'due', 'tags'] },
    { id: 'v2', name: 'Project notes', q: 'tag:project', kind: 'list', cols: ['file', 'tags'] },
  ],
  agentChanges: [],
  recents: ['dev-notes', 'notes'],
  update: { current: '0.9.2', available: '0.9.3', notes: 'Fixes conflict banner focus\nFaster search on large folders\nRecovery snapshots labelled clearly' },
};

/* FS: the only path to files. Throws Error with .code: ENOENT, EACCES, OFFLINE. */
const err = (code, msg) => Object.assign(new Error(msg), { code });
const FS = {
  ver: 0,
  read(ws, path) { const f = DB.ws[ws].files[path]; return f ? { ...f } : null; },
  write(ws, path, body) {
    const w = DB.ws[ws];
    if (w.conn === 'offline') throw err('OFFLINE', 'WSL connection lost');
    if (w.readOnly.some(f => path.startsWith(f + '/'))) throw err('EACCES', `permission denied, open '${w.path}/${path}'`);
    const r = rev(); const prev = w.files[path] || {};
    w.files[path] = { ...prev, body, rev: r, mtime: Date.now(), created: prev.created ?? 'Just now' };
    this.ver++;
    return r;
  },
  remove(ws, path) { delete DB.ws[ws].files[path]; this.ver++; },
  list(ws) { return Object.keys(DB.ws[ws].files); },
};
