# v2 Implementation map — who owns what

> Renderer identity boundary: `workspaceId + relativePath`. Services own truth; UI never bypasses them. Machine-local index/cache/grants/logs live in app-data; `.takenotes/` holds traveling definitions only (favorites, collections).

## 1. Service → feature ownership

| Service / module | Obsidian features (F-numbers in OBSIDIAN-FEATURES.md) | Key files |
|---|---|---|
| Workspace + FileAdapter + atomic save + watcher + trash | F03, F04 | `packages/core/src/ports/host-filesystem.ts`, `services/note-service.ts`, `policy/note-policy.ts`, `apps/desktop/src/main/*` (file supervisor, recovery, import runner, URI handler, MCP host) |
| Editor (single-surface) + `renderMarkdown()` | F06–F08, F31, F33, F36 | `apps/desktop/src/renderer/editor/*` (`wysiwyg.ts`, `create-editor.ts`, `format.ts`, `complete.ts`), `packages/core/src/markdown/render.ts` |
| Tabs + pin + history + reorder | F01, F18 | `apps/desktop/src/renderer/panes.ts`, `hooks/use-documents.ts`, `components/overlays.tsx`, `components/menus.ts`, `components/types.ts` |
| Quick Open + Command Palette + Hotkeys | F02, F16, F17, F39 | `packages/core/src/commands/{registry,palette,hotkeys}.ts`, `hooks/use-commands.ts`, `platform/keyboard.md` (`keymap.ts`), app-data `hotkeys.json` |
| Explorer + Favorites + Outline + Preview | F05, F28, F29 (+ preview part of F09) | `packages/core/src/explorer/sort.ts`, `favorites/store.ts`, `outline/extract.ts`, `hooks/use-file-tree.ts`, `index/workspace-index.ts` |
| Index (parse-once) + Properties foundation | F09 (parse), F13–F14 (index side) | `packages/core/src/index/{document,edges,properties,store}.ts`, `apps/desktop/src/renderer/index/workspace-index.ts` |
| Links + embeds + backlinks + outgoing + attachments | F09–F12, F30 | `packages/core/src/links/{backlinks,completion,embed-params}.ts`, `attachments/import.ts`, `markdown/render.ts` |
| Search | F15 | `packages/core/src/search/{query,search,summary}.ts` |
| Productivity (daily/templates/tasks/today/calendar/tags-view/props-view) | F13–F14 (view side), F24–F25, F32 | `packages/core/src/productivity/{daily,tasks,templates,today,calendar}.ts`, `tags/tree.ts`, `properties/summary.ts` |
| Collections/Views + Graph + Canvas | F21–F23 | `packages/core/src/collections/{evaluate,store}.ts`, `graph/model.ts`, `canvas/model.ts`, `components/canvas.tsx` |
| Recovery + Import (+Enex/Elephant) + URI + MCP | F37, F40–F41 | recovery in `main/*` + `hooks/use-documents.ts` history; `packages/core/src/import/{html,plan,enex}.ts`, `main/import/runner.ts`; `uri/parse.ts` + `main/uri/handler.ts`; `mcp/*` + `main/services/mcp-host.ts` |
| Appearance + platform + packaging + updates | F38–F39 | `packages/core/src/appearance/appearance.ts`, `packages/ui/src/theme.ts`, `tokens.css`, `platform/*`, `electron-builder.yml` |

## 2. v2 code changes (this drop)

1. **Pin working set (F01):** `panes.ts` gains `closeOtherTabs(layout, keepKey)` (keeps active + all pinned) and `closeUnpinnedTabs(layout)` (keeps all pinned; "Close all" parity), plus `isPinned()` helper. `togglePinned` unchanged (still per-tab boolean, no state reset). Rename/delete paths already preserve/drop pins (`applyRename`, `removeDocsForEntry`). Tests in `tests/renderer/panes.test.ts`.
2. **Elephant — Evernote import (F41):** new pure module `packages/core/src/import/enex.ts` (`parseEnex(xml)` → notes with title/tags/created/updated/HTML + resources; `enexSourcesToImport()` → `{markdown, html}` sources; `planEnexImport()` → `planImport()` with attachment mapping). Export added `@takenotes/core/import/enex`. Tests in `tests/import/enex.test.ts`. Runner (`main/import/runner.ts`) accepts `.enex` via the same confirm screen (`notes/attachments/unmapped/warnings/skipped`).

## 3. Status rollup (MVP Steps 0–9 language)

- Steps 0–1 (filesystem, editor, tabs incl. pin, status bar, save/conflict, recovery snapshots): implemented and verified.
- Step 2 (explorer, Quick Open, palette+pins, hotkeys.json, shell seam, favorites, outline, preview): implemented and verified except palette-pin persistence polish (verification incomplete, named in VERIFICATION.md).
- Step 3 (index parse-once + lifecycle + properties foundation): implemented and verified (bounded 2000/1MiB notices).
- Step 4 (links, autocomplete, V1 embeds, backlinks/outgoing, attachments): implemented; right-pane wiring verification incomplete.
- Step 5 (search full grammar): implemented and verified.
- Step 6 (daily/templates/tasks/calendar/today/capture/tags-view/props-view/collections table+list): implemented; calendar-drag-`@scheduled` + daily CTA verification incomplete on touch.
- Step 7 (graph global+local read-only; canvas minimal editable): partial — web/audio/PDF cards, export-image, folder-add, snap modifiers deferred (listed, not implied).
- Step 8 (MCP stdio, URI minimal, import Markdown/Textbundle/HTML/**Enex**): implemented and verified (logic); headless/remote MCP + full CLI parity deferred.
- Step 9 (appearance baseline + a11y, no WCAG cert): partial — marketplace/snippets/translucency/custom-icons/HW-toggle/i18n deferred.
- Post-MVP: WSL connection (maintenance-only), saved workspaces/stacked/pop-outs, Kanban/Map/formulas, math/Mermaid/footnotes-view, Vim, mobile capture, Sync/Publish, plugin SDK — deferred, each with an explicit "not in MVP" note wherever its Obsidian counterpart is described.

## 4. Conflict log (code vs roadmap vs status)

- None introduced by v2. `renderMarkdown()` remains preview/export only (ADR-0015); any legacy read-mode toggle reference is a bug to file, not a second mode to restore.
- `Ctrl+T` stays unbound in Step 2 scope (browser clash); `Ctrl+O` is opt-in second binding only, never a separate dialog.
- Evernote import was "Defer … Evernote" in Step 8; v2 explicitly promotes `.enex` to implemented (this ADR-level scope change is recorded here and in VERIFICATION.md evidence; a follow-up ADR should formalize it).
