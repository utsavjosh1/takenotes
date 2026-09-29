# ADR-0015 — Single-surface WYSIWYG desktop editor

Status: accepted (supersedes the Step-1 "Source mode + Reading view" split for the desktop editor).

## Context

Step 1 originally specified a CodeMirror "Source mode" plus a separate rendered-HTML "Reading view" (`readMode`, `editor.toggleReadMode`, Read/Edit toggle), deferring Live Preview widgets. That produced two mutually exclusive desktop surfaces: the editor was destroyed and recreated on every mode switch (losing undo/selection/focus/scroll), and checkbox edits in Reading view bypassed the editor transaction pipeline with direct filesystem writes.

The product requirement is Notion-style: one editable rendered document, Markdown as storage truth (ADR-0008), no user-visible Edit/Read distinction.

## Decision

- Desktop editing uses exactly one surface: CodeMirror + Lezer + `editor/wysiwyg.ts` decorations/widgets over the Markdown document state.
- Markdown remains authoritative storage. Inline marks hide; fenced code fences, table pipes, and media sources never hide (styled or previewed additively, always editable).
- All user mutations (typing, formatting, task widgets, link edits, list/table edits) go through CodeMirror transactions → `onChange` → document state → autosave/persistence. No direct filesystem writes from widgets.
- `renderMarkdown()` (`packages/core/src/markdown/render.ts`) is for web preview/export and non-editing contexts — not a second desktop editing mode.
- Removed: `TabState.readMode`, `panes.setReadMode`, `useDocuments.toggleReadMode` + `toggleTaskCheckbox` (direct-write path), `editor.toggleReadMode` command/registry/keymap/menu/palette/shortcut, Read/Edit button, `markdown-reading` desktop surface and its click delegation.

## Consequences

- Undo/redo, selection, cursor, focus, and scroll survive normal editing (no destroy/recreate).
- Checkbox/task edits participate in undo, dirty tracking, revision/CONFLICT, and autosave like any edit.
- Rich constructs (lists, tables, callouts, breaks, comments, footnotes, media) are replaced or hidden in place so no Markdown syntax is visible; cells, code, and bodies remain editable source. True visual table editing (add/remove columns) and footnote popovers remain future work.
- `Ctrl/Cmd+E` is freed (no mode toggle). Wikilink navigation survives as Ctrl/Cmd+click inside the editor.
- Roadmap Step 1 updated to mandate this invariant so future work does not reintroduce the split.
