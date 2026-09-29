# Roadmap — takenotes

Source of truth: `CONTEXT.md` + `docs/decisions/` + this file + `docs/research/OBSIDIAN_FEATURES_CURRENT.md` (feature reference, not a plan). Implement against these decisions. No further design expansion without a grill round.

Ownership rule (ADR-0008): user Markdown/files are authoritative. `.takenotes/` holds workspace-traveling definitions only. Rebuildable index/cache/grants/logs live in app-data — deleting them loses no notes. Vocabulary: Workspace (never Vault), Collection (never Base), Favorite (never Bookmark), Connection (WSL only, post-MVP).

Target for MVP: native `windows-local | macos-local | linux-local` directly usable. WSL is one deferred feature after the note-taking app is done — WSL code stays maintenance-only until then.

## MVP — Local note-taking app, single drop, logic-tested

Build Steps 0–9 in order. Each step lands behind the Service Layer (`WorkspaceService / NoteService / SearchService / CommandService / RecoveryService`); no UI path bypasses services; renderer holds `workspaceId + relativePath` only.

Gate (record in `archive/status/mvp-status.md`): logic tests runnable on any OS (parser vectors incl. malformed YAML/CRLF/BOM/embeds/`@due/@scheduled`, search-operator parsing + AND-combine + unsupported-operator errors, `workspaceId` key separation, revision/CONFLICT transitions, recovery throttle/retention/restore-snapshots-current with fake clock, link-rename rewrite) + Linux integration (native adapter round-trip: create/rename/move/delete, reserved-name rejection, symlink-escape rejection, atomic-write + CONFLICT) + manual check on real Windows + Mac + Linux. No WSL two-user gate blocks MVP ship.

### Step 0 — Filesystem foundation

- Workspace lifecycle over normal folders: open/close/switch, recent workspaces, opaque `workspaceId` (randomUUID) + stable namespace (`kind + canonical root`) for drafts/recovery keys.
- Canonical path model + root confinement: `toCanonicalRel`, `/` separators, reject absolute/NUL/`..`/illegal components; `path.win32` rules (reserved names) on Windows, POSIX elsewhere; symlinked directories never traversed, symlinked final components rejected.
- One native `FileAdapter` for all three OSes (existing `local-workspace.ts` behavior, extended to mac/linux).
- Atomic save: tmp + fsync + rename, BOM/newline preservation, SHA-256 `revisionOfBytes`, every mutation carries `expectedRevision`, mismatch → `CONFLICT`, no silent overwrite, no auto-merge.
- Watcher reconciliation: external edit → reload-or-`CONFLICT` banner if dirty + reparse + update explorer/tabs/index; note the refresh contract in `mvp-status`.
- Trash policy: OS trash where native (`file.trash`), otherwise permanent delete labeled honestly + confirm. `deleteDir` refuses non-empty with `DIRECTORY_NOT_EMPTY` unless UI confirms recursive. Moves never escape root or cross workspaces.
- Recovery snapshots (ADR-0013, Obsidian File Recovery parity): app-data `recovery/<stable-namespace>/<rel>/`, ≤1 snapshot per changed file per 5 min during editing + snapshot on save/close/clean-shutdown when content differs, skip identical, 7-day retention + janitor, "recovery is not backup" in UI, V1 actions list + Restore (snapshots current first) + Copy. Drafts stay crash-only.
- Link-aware rename/move: validate new name/path → atomic rename → update `[[links]]` when auto-update enabled, else prompt → watcher/index sees move → explorer/tabs/backlinks/graph/search update. Duplicate names are first-class: autocomplete shows disambiguated paths, hover shows full path.

### Step 1 — Reliable editor (writing first)

- Single-surface WYSIWYG (ADR-0015, CodeMirror owns document/undo/selection): CommonMark + GFM — paragraphs, H1–H6, bold/italic/strike, blockquotes + `> [!type]` callout chips, ordered/unordered/nested lists (rendered bullets/computed numbers), `- [ ]/- [x]` tasks (any non-space = done, in-editor checkbox widgets via transaction), GFM tables (pipes replaced by dividers, delimiter rows hidden, cells edited as source), inline code (backticks hidden) + fenced code blocks (fences stay visible, edited as code), footnote `[^id]` refs (superscript widgets) + definition prefixes hidden, `%%comments%%` hidden, images/media (label shown, URL hidden, additive local preview), sanitized HTML (no script, no render inside HTML blocks). The user never sees Markdown syntax — it is storage truth (ADR-0008), not UI. There is no desktop `readMode`, no Edit/Read toggle, no second HTML editing surface. `renderMarkdown()` is preview/export only.
- Reference renderer: shared `renderMarkdown()` HTML (links, embeds, checkboxes, images, callouts, tables, footnotes) for web preview/export — not a desktop editing mode.
- Editor chrome: multi-tab (open/close/reopen/pin/dirty/history, next/prev/numbered, reopen-closed `Ctrl+Shift+T`); no splits, no stacked tabs, no pop-outs, no saved workspaces in MVP. Status bar: `Workspace · OS · saved/dirty/conflict · index (n files)`.
- Save pipeline: debounced autosave + explicit save, dirty tracking, `CONFLICT` banner keeps both versions safe (Reload-keeps-disk / Retry-save), draft-retained flow when file vanished.
- Editor basics: undo/redo, find/replace, spellcheck (platform dictionaries), smart lists/auto-paired brackets/line numbers/indent guides.
- Defer: Live Preview widgets, image resize `+/-/0`, table visual editor, colored highlights (Catalyst), MathJax/Temml math, Mermaid confirm-banner rendering, fold-all/more/less commands, Vim mode.

### Step 2 — Organization (locked: grill rounds 1–2)

- File Explorer: create note in default location (selected folder, else root) or chosen folder, create folders, rename/delete/move (drag + context menu + `F2`), sort name/modified/created asc/desc (name-asc default, persisted per-workspace in app-data, folders-first), auto-reveal active file (expand ancestors + select), expand/collapse all. Duplicate names allowed (disambiguate by path). External drop = copy-in with `name 1.md` collision increment, never overwrite/move. `deleteDir` refuses non-empty unless confirmed recursive (Step 0). Internal drag-into-note inserts `[[relative/path]]` (shortest default).
- Quick Open (`Ctrl+P`; `Ctrl+O` only as opt-in second binding via hotkeys.json, never a separate dialog): fuzzy name/alias search (filename-only aliases until Step 3 index), arrow nav, `Enter` = open-best-match else create typed path, `Shift+Enter` = force exact-name create, `Ctrl+Enter` = open in new tab, empty query = recents. Always-fuzzy (no 10k fallback), cap display list, never keyword-fallback.
- Command Palette (`Ctrl+Shift+P` / `>` commands mode): single `CommandService` registry `{id,title,category,scope,run,when?,defaultHotkey?}`, fuzzy match, recents (auto: last 10 commands + last 20 files) + pins (user-pinned commands only, max 20, above recents; no file-pinning — that's Favorites). Minimum IDs: `note.new/open`, `workspace.open/switch/close` (`switch` registered-but-disabled until recent-switch lands), `editor.save`, `search.open`, `quickOpen.open`, `palette.open`, `view.toggleSidebar`, `settings.open`. Remove second ad-hoc table in `App.tsx`/`use-commands.ts`; palette/menus/keyboard dispatch by ID only.
- Customizable hotkeys in app-data `hotkeys.json` (`{[commandId]: string[]}`, empty = `keymap.ts` defaults): assignable per command, multiple per command, shown in palette via `shortcutLabel()`. Collision = last-write wins for display, loser disabled + Settings warning + `⚠` in palette. Step 2 UI = table list + capture-to-assign + Reset to defaults (multi-edit via JSON). Defaults: `Ctrl+P` Quick Open, `Ctrl+Shift+P` palette, `Ctrl+N` new, `Ctrl+S` save, `Ctrl+Shift+F` search. No `Ctrl+E` (struck — ADR-0015 single-surface, no read toggle). `Ctrl+T` unbound in Step 2 (browser clash).
- Sidebars/ribbon/status shell (seam only, no fake data): left sidebar container with fixed-order panes `[Explorer, Search, Outline-stub, Favorites]`; rail buttons switch left pane; right sidebar = empty slot until Steps 3/4/6. Per-pane collapse + `view.toggleSidebar` + ribbon-visibility setting. Pane drag-reorder deferred. Status bar unchanged from Step 1 + file-count. Mobile gestures out of scope.
- Favorites (never Bookmarks) traveling in `.takenotes/favorites.yaml` (`version: 1, groups: [{name, entries: [{type, target, alias?}]}]`). V1 types: file, folder, search-string, heading (`Note.md#Heading`), block (`Note.md#^id`). Ops: add via explorer-menu/palette/heading-hover, groups create/rename/delete, drag-reorder + up/down, edit alias, remove. Missing target = greyed + retained + re-resolves on create. Path validation rejects escape.
- Outline (live-parse, no index dependency): ATX headings of active note only, click scrolls editor; drag-reorder deferred post-MVP.
- Page Preview (no index dependency): hover 400ms on resolved `[[link]]` in editor/explorer shows first ~20 lines via `renderMarkdown()` + full-path footer for disambiguation. No backlinks/search-row previews in Step 2.
- Defer (locked): Unique Note Creator (timestamp ZK), Note Composer merge/extract, Word count, Slides, Audio Recorder, Random Note.
- Gate: logic tests (Quick Open fuzzy + Enter/Shift+Enter/Ctrl+Enter vectors, registry uniqueness + `workspace.switch` disabled, hotkey multi-parse + collision, favorites yaml round-trip + unresolved-retain, explorer sort/reveal pure fns) + Linux integration (service CRUD, external-drop copy, outline live-parse incl. CRLF/BOM) + manual Windows/Mac hotkey check.

### Step 3 — Metadata index (parse-once, rebuildable)

- Core module `packages/core/src/index/` with renderer wiring `apps/desktop/src/renderer/index/workspace-index.ts` (renderer + core; no main module, no new IPC), per-workspace in-memory, rebuildable: `{workspaceId, relativePath, revision.hash, frontmatter, title/aliases, tags/type/status/dates, headings{text,level,line,anchor}, tags, links{target,alias,heading,blockAnchor,embed,resolved,line}, tasks{description,completed,line,anchor,tags,due,scheduled,priority}, searchableText}`. No `col` in V1. Bounded: skip files >1 MiB, cap bulk build (e.g. 2000 files) with user-visible `truncated/skipped` notice — never silent partial.
- Parse rules V1 (freeze, Step 3a): `#tag` + `#a/b` inline; `[[t]]`, `[[t|a]]`, `[[t#h]]`, `[[t#h|a]]`, `[[t#^id]]`, `![[…]]` embeds; embed dimensions (`![[image.png|100x145]]`) and PDF `#page=N`/`#height=` belong to Step 4; block IDs `^latin-numbers-dashes` (lazy only, indexing never assigns); tasks `- [ ]/- [x]` (`*`/`+` markers) + opportunistic `@due()/@scheduled()/@priority()`; headings ATX only; title fallback = frontmatter `title` → first `# ` heading → filename stem. Needs one pinned YAML dependency; bad YAML → `{}` + file still indexed.
- Step 3a lifecycle (acceptance contract): `open → parse/index → re-parse → watcher refresh → rename → restore/drop → rebuild` while preserving `workspaceId + relativePath` as the identity boundary. Full parse on open, re-parse on write/rename/restore, drop on delete, bulk build on open (bounded concurrency, skip binary/NUL). Refresh on tree-expand + after every mutation + watcher events. Step 3b (Properties round-trip/type registry) is separate.
- Properties foundation here (UI in Step 6): YAML round-trip without damaging body; types text/list/number/checkbox/date/datetime/tags; per-name type registry; `tags/aliases/cssclasses` defaults; invalid YAML never destroys content; nested-properties UI deferred, Source mode fallback documented.

### Step 4 — Knowledge links

- Wikilinks + Markdown links: `[[Note]]`, `[[Note.md]]`, `[[Projects/Note]]`, `[Note](Note%20name.md)`, aliases `[[Note|Alias]]`, heading `[[#H]]`/`[[Note#H]]`, block `[[Note#^id]]`, link-to-attachment with extension, links-to-nonexistent valid (follow → resolve creation path from link → create → open → backlinks update).
- Link settings: shortest/relative/absolute generation, Wikilinks on/off, auto-update on rename (toggleable).
- Autocomplete for files/headings/blocks/aliases with duplicate-name disambiguation.
- Embeds V1: notes, headings, blocks/lists, images (local + external URL with size), audio/video attach playback, PDFs (`![[Doc.pdf]]`, `#page=N`, `#height=400`). Defer Canvas/Base/search-embed transclusion, web `iframe`/YouTube embeds.
- Backlinks pane (linked + unlinked mentions, alias-aware, collapse/context/sort/filter, link-alias-action `[[Canon|Alias]]`) + Outgoing pane (links + unlinked mentions, hover full path, code-block caveat documented) + unresolved-links model explicit. Excluded files hidden from unlinked mentions.
- Attachments: paste/drag-in import with naming/collision policy, default location options (root / folder / same-folder / subfolder), accepted formats (images `avif/bmp/gif/jpg/png/svg/webp`, audio `flac/m4a/mp3/ogg/wav/webm/3gp`, video `mkv/mov/mp4/ogv/webm`, PDFs); unsupported types shown/linked per setting.

### Step 5 — Search

- `SearchService.query` over index only (delete old fs-scan path when index lands): words AND by default, `"exact phrase"` (escaped quotes), `OR`, parens, `-negation`, `/regex/` (JS flavor), `file:`, `path:`, `content:`, `match-case:`, `ignore-case:`, `tag:`, `line:`, `block:`, `section:`, `task:`, `task-todo:`, `task-done:`, `[prop]`, `[prop:value]`, `[prop:null]`, subqueries, comparators (`[n:<5]`). Anything else → `INVALID_REQUEST` naming the operator. Debounce ≥150 ms, `maxResults` cap, one match per file for content queries (bounded shape), sort filename/modified/created asc/desc, collapse/context/copy-results, empty query shows recents, selected editor text seeds search, excluded files hidden.
- Defer: embedded `query` code blocks, Publish search.

### Step 6 — Productivity + structured knowledge in MVP

- Daily Notes (`Daily/YYYY/MM/YYYY-MM-DD.md`, `type:daily,date:YYYY-MM-DD`, local date, no silent create — missing shows `[ Create Today's Note ]`): folder/date-format/template settings, ribbon/command/hotkey/URI/CLI hooks. Date properties link to dailies when plugin active.
- Templates: template-folder config, vars `{{title}},{{date}},{{time}}` (+ Moment formats) only — no shell/JS/loops/network/MCP; insert-at-cursor commands; property-merge into note.
- Tasks (ADR-0010): any `- [ ]` valid, progressive `@due/@scheduled/@priority`, lazy `^task-id` only when cross-view identity needed, `due` (deadline) ≠ `scheduled` (time block) never rewritten into each other, toggle flips checkbox only, no recurrence/deps/NLP in MVP. Mutations carry `expectedRevision`; UI preserves dirty on `CONFLICT`.
- Calendar (ADR-0011): exactly two native sources — event-notes (`type:event`, `start` required ISO-8601 with offset, `end` optional, 30-min visual-only default never persisted) + `@scheduled` tasks. Drag rewrites `@scheduled` in place, `@due` untouched. Tasks inside event-notes need own `@scheduled` to block time. External calendars (Google/CalDAV/ICS/Outlook) deferred.
- Today: aggregated view (scheduled + overdue/due-today + Daily embed + recent + quick actions), never the Daily file itself, no silent create.
- Quick Capture: Daily/Inbox/Task/New Note via services, default `Inbox.md`.
- Tags view (nested tree/flat, counts, sort name/frequency, click-to-search) + Properties view (file properties + all-properties with type/frequency/rename/search) + property search syntax.
- Collections (`.takenotes/collections/*.yaml`, query + named views, travel with workspace): table + list views only in MVP. No cards/board/calendar views, no formulas, no summaries. Saved views = named Collection views.
- Defer: Bases Kanban/Map, formulas/functions, CSV export, advanced table summaries, collapsible groups.

### Step 7 — Visual mindmap in MVP (graph + canvas minimal)

- Global Graph + Local Graph (read-only): nodes = notes, edges = links, size = reference count, hover highlight, click-open, right-click menu, pan/zoom, filters (search grammar, tags toggle, attachments toggle, existing-only, orphans), groups by search term (colors), arrows/text-fade/node-size/thickness. Local adds depth slider. Mermaid links excluded from graph (Obsidian parity).
- Canvas minimal (editable mindmap, JSON Canvas `.canvas` files): infinite 2D space, text cards (Markdown/links/code) + note cards (vault file, edit-in-place) + image cards, directed edges (reconnect/disconnect, navigate source/target, labels), card/edge colors, groups + rename + group-selected, pan/zoom/fit/selection, embed shapes-only `![[x.canvas]]` (text-inside-cards not rendered in embed — documented limit).
- Defer: web cards, audio/PDF/unrecognized-file cards, add-folder-as-cards, Alt-drag duplicate, Shift-constrain, Space-no-snap, aspect-lock resize, background images, jump-to-group, readonly mode, settings, global text-card search, export-image, Canvas-in-Canvas full text.

### Step 8 — Automation + import in MVP

- MCP (ADR-0009/0012): permissions per-client × per-workspace + approval screen → stdio sidecar `takenotes-mcp` (framed 4-byte BE length + UTF-8 JSON, 16 MiB max, stdout=frames only; private IPC, app-must-be-running, no HTTP) → `notes/search` tools → `task` tools → `calendar` tools → `daily-note` tools → activity log. Resolves `workspaceId → {root}` in main; no raw paths by default. No `command_execute`, no remote/headless MCP in MVP.
- URI minimal (`takenotes://`): `open` (file/path/heading/block, `tab` paneType only), `new` (name/path/content, creation-path-from-link honored), `daily`, `search`. No `hook-get-address`/callbacks beyond `x-success/x-error` echo. Confirmation dialog removed only with guardrails elsewhere documented.
- Import: Markdown + Textbundle/HTML files only (attachment mapping, link conversion). Defer Notion/Airtable/OneNote/Evernote/Apple Notes/Bear/Craft/Roam/Logseq/Tomboy/CSV + Importer templates.
- Defer: full Obsidian CLI parity (bases/bookmarks/plugins/publish/sync CLI), Headless Sync, Web Clipper extension + Interpreter, Apple Shortcuts/Share Sheet/widgets, Android widgets/tiles.

### Step 9 — Appearance + a11y baseline in MVP

- Light/dark/system, accent, base font size + quick adjust, zoom level, inline title, tab title bar, ribbon visibility, native menus, frame style. Font/interface pickers.
- Keyboard-first: focus management, semantic UI, scalable typography, settings keyboard nav. No WCAG-cert claim.
- Defer: community themes marketplace, CSS snippets (`.takenotes/snippets/` injection), translucency, custom icons, hardware-acceleration toggle, full i18n/RTL workspace flip (Unicode/RTL text correctness still required early).

## Post-MVP — WSL feature (one feature, after note-taking app)

Single milestone, gated separately: WSL discovery (distro → user → path, `wsl.exe -l -v` parse, listing never starts a distro) → `users.list` helper op (`/etc/passwd`, uid ≥1000 + current/default always, skip bad lines) → Connection record (`{distro,linuxUser,status}`; one connection → many workspaces) → `connectWsl(distro,linuxUser,linuxPath)` 3-arg form → `~` expands in helper as selected user → spawn `wsl.exe -d <distro> -u <user>` (`shell:false`, separate argv, no sudo) → WSL `FileAdapter` via `helper.cjs` (pinned Linux Node in `~/.local/share/takenotes/`, `HELPER_OPERATIONS` gating, `PROTOCOL_VERSION` + nonce + execPath verification) → path errors (`PATH_NOT_FOUND, PERMISSION_DENIED, NOT_A_DIRECTORY, CONNECTION_FAILED, DISTRO_NOT_RUNNING, HELPER_FAILED`) with friendly + detail UI → `700`-home separation (`PERMISSION_DENIED` browsing other user's home) → WSL permanent-delete honest label.

Gate: real Windows 11 + WSL2, Ubuntu users A+B + second distro (e.g. Debian), list-without-start, open-as-A vs open-as-B distinct IDs, per-user `~`, `PERMISSION_DENIED` demo, create/rename/move/delete + folders on WSL, two-actor `expectedRevision` CONFLICT, recovery list/restore/copy on WSL, search V1+ operators over WSL index, recorded in `archive/status/wsl-status.md`. See ADR-0007.

## Post-MVP — Later / External / Probably-unnecessary

- Later: Live Preview widgets, table visual editor, callouts full set + custom CSS, math (MathJax 4.1.3), Mermaid + security gate, footnotes view, outline drag-reorder, Unique notes, Note Composer, saved workspaces/stacked tabs/pop-outs, embedded `query` blocks, Bases formulas/table summaries/cards/board/calendar/Kanban/Map, Canvas web/audio/PDF cards + export-image, property bulk-edit + nested-properties UI, URI callbacks/CLI full parity, Importer full sources, Export PDF/CSV, themes/snippets/marketplace, Vim mode, i18n/RTL flip, mobile + Quick Capture queue, Sync/Publish/collaboration (paid-service territory).
- External/plugin territory: Dataview-like querying, Templater-style scripting, AI clipping, Git/SRS/drawing/advanced tasks, plugin SDK + sandbox + Plugin Manager (only after internal seams stable — ADR-0009).
- Probably unnecessary: Slides (`---` presentations), Audio Recorder.
