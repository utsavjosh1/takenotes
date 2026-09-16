# MVP design status — takenotes

Implements spec phases 1–6 + 8 (settings), with reliability states (7) and
polish pass (9) on the paths reachable with current main-process APIs.

## Done

- [x] Phase 1 — tokens, typography, title bar (overlay), rail 44px, sidebar
  shell, editor shell, status bar 24px
- [x] Phase 2 — real workspace open (Windows dialog), WSL identity + badge,
  lazy file tree (expand per folder), selection, loading/error states
- [x] Phase 3 — tabs (dirty dot, reorder, overflow scroll), CodeMirror Markdown
  theme (both themes), readable width 760 + full-width toggle, save state
- [x] Phase 4 — Quick open (recent + fuzzy), command palette (shared shell),
  tree keyboard nav, context menus (tree, tabs, sidebar header)
- [x] Phase 5 — new note (inline name), new folder, F2 inline rename, trash
  via OS recycle (`file:rename`, `file:trash` IPC), conflict bar
- [x] Phase 6 — search panel (filename + content, debounced, compact rows)
- [x] Phase 8 — settings dialog (General/Appearance/Editor/Files/Shortcuts/About)

## Honest gaps (blocked, not faked)

- WSL `directory.list` / file IO still main-side gated to Windows workspaces
  (helper wiring = Stage 6); WSL connect UI exists and reports the real error.
- Trash Undo: OS recycle bin has no restore API — toast says where to recover.
- No tab split groups (deferred per spec), no settings search (15 settings).

## Verify

`npm run typecheck && npm run lint && npm test && npm run build`.
Manual: 800×520, 1280×800, 1920×1080; 100/125/150% scaling; light + dark;
keyboard-only run of primary + power-user journeys.
