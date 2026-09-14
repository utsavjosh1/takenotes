# SilverBullet reference (read-only)

- **Path:** `/home/utsav/Projects/silverbullet` (also visible as `../silverbullet`)
- **Remote:** `git@github.com:utsavjosh1/silverbullet.git`
- **Commit:** `e43ec4d1a6818f02e22794653483bdcd5fccb28c`
- **Branch:** `main` (working tree: one untracked `docs/codebase-guide/` dir; otherwise clean)
- **License:** MIT (Copyright 2022, Zef Hemel) — see `LICENSE.md` in that checkout
- **Date inspected:** 2026-09-14
- **Checkout is NOT modified by this project.** No dependency on it; no code copied.

## Files inspected

- `client/codemirror/editor_state.ts` (541 lines) — CodeMirror 6 state setup:
  compartments, `EditorState.create`, `externalUpdate` annotation to skip
  save-on-change for externally-sourced transactions, vim loading, markdown
  language extensions, presence/conflict/spellcheck plugins.
- `client/editor_commands.ts` (690 lines) — command registry over CodeMirror
  primitives (cursor motion, delete, indent, undo/redo, completion).
- `client/document_editor.ts`, `client/document_editor_js.ts`
- `client/codemirror/editor_paste.ts`, `client/codemirror/change.ts`
- `plugs/editor/*` (upload, outline, completion, vim), `plug-api/syscalls/editor.ts`

## Useful concepts (reimplemented cleanly, not copied)

- CodeMirror owns document/undo/selection; React mounts only.
- Annotation marking externally-sourced transactions to avoid save loops.
- Command registry with ids/titles/shortcuts (ours is deliberately NOT a plugin API).
- Filename quick-open over a bounded rebuildable in-memory index.
- External-change vs. dirty-draft conflict handling.

## Concepts intentionally NOT copied

- Server model / HTTP/WebSocket sync, Deno runtime, plug marketplace and
  scripting system, space sync, object-graph/database views, block editing.
- Our app is a local-first Electron filesystem notebook; no localhost server.

## Code reused

None. Zero lines copied. `THIRD_PARTY_NOTICES.md` will record provenance if
that ever changes (with exact file + commit + license).
