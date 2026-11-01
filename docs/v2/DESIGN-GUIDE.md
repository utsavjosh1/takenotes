# v2 Design guide — Obsidian parity in takenotes language

> Source of truth: `packages/ui/src/theme.ts` → generated `packages/ui/src/tokens.css` + desktop renderer styles. Do not hand-edit generated files. This guide adapts Obsidian behaviors (OBSIDIAN-FEATURES.md) into our visual system without renaming canonical terms or inventing shipped features.

## 1. Tokens (reuse, never inline)

Light: app `#faf6ee`, sidebar `#f3ecdd`, editor/overlay/input `#fffdf7`; ink `#191817`; accent `#4f41d6`. Dark: app `#151310`, sidebar `#201c16`, editor `#191613`, overlay `#26211a`; ink `#f4ecd9`; accent `#ad9fff`. Full semantic set (`--tn-surface-*`, `--tn-text-*`, `--tn-border-*`, `--tn-accent*`, `--tn-success/warning/danger-*`, `--tn-selection/code/highlight-surface`) in `docs/design/ui-ux/foundations.md` and `docs/design/tokens.md`.

- Spacing 4pt: 4 8 12 16 20 24 32 40 48 64. Radius: row 6, control 8, menu 12, dialog 16. Type: secondary 12 / control 14 / heading 20 / body 16; body 1.65, UI 1.4. Targets: control 36, icon 32, row 32; touch 48 / row 52.
- Focus: 2px `accent` outline + 2px offset, never clipped. Selected rows: soft violet fill + non-color indicator (no per-row shadow). Shadows = elevation only (menus/dialogs float; files do not). No glass, no gradients-behind-text, no rainbow tags, no pulsing dots, no decorative illustration per empty state.
- Missing token → add named token via `theme.ts` + regenerate (`npm run ui:tokens`). No raw hex/OKLCH/font-family in components. Verify contrast both themes incl. hover/selected/disabled (targets AA 4.5:1 text, 3:1 large/non-text).

## 2. Shell (Obsidian workspace → takenotes shell)

- **Layout:** top/title area, single tab strip, left rail + pane, optional right pane (empty slot until Steps 3/4/6), status strip. Shell state never leaks into feature logic.
- **Left rail order (fixed, Step 2):** `[Explorer, Search, Outline-stub, Favorites]`. Rail buttons switch left pane. Per-pane collapse + `view.toggleSidebar` + ribbon-visibility setting. No pane drag-reorder in MVP.
- **Status strip (Step 1):** `Workspace · OS · saved/dirty/conflict · index (n files)`. Conflict elsewhere never poisons the active indicator (`SaveView` derives from active doc only).
- **Welcome / recent workspaces:** open local folder, reopen recent (never folder-picker-only), honest no-workspace state.
- **Focus mode:** hides sidebars/status chrome; editor stays the stable center. Narrow windows: sidebars collapse to overlays; tab strip scrolls horizontally; no horizontal editor scroll for prose.

## 3. Component contracts (one brief per feature)

Each component states: job · entry/exit · hierarchy/density · primary/secondary/destructive actions · mouse/keyboard/focus/a11y · states · copy (canonical terms) · responsive · themes · tokens · service constraints · tests.

### 3.1 Tabs + Pin (F01)

- Job: hold open documents; pin protects working set from bulk-close and replacement.
- Visual: pinned tab shows `◆` + `aria-label="Pinned tab"` (see `overlays.tsx:138`); dirty dot coexists (both can show). Pinned tabs cluster left (open order otherwise preserved).
- Interactions: `Pin tab`/`Unpin tab` in tab context menu (`menus.ts:70`) + `togglePinnedTab` command; `Ctrl+Shift+T` reopens last closed (up to 20); numbered `Ctrl+1..n`, next/prev cycle; drag reorder (single strip).
- **Pin semantics (Obsidian parity, single-strip reading):** (a) opening any file while a pinned tab is active never replaces pinned content — target opens as/activates another tab; (b) `Close others` keeps the active tab *and* all pinned tabs; (c) `Close all` keeps pinned tabs (empty selection if all pinned — never force-close a pin); (d) rename preserves pin; (e) delete drops pins for removed paths.
- States: default / hover / active / dirty / pinned / pinned+dirty / conflict / loading-error (`TOO_LARGE`/`UNSUPPORTED_ENCODING` opens empty tab with message, never crashes).

### 3.2 Quick Open (F16) vs Command Palette (F02/F17)

- Two dialogs, never merged: Quick Open opens **files** (`Ctrl+P`, opt-in `Ctrl+O` second binding); Palette runs **commands** (`Ctrl+Shift+P`, `>` mode).
- Both: fuzzy (always, no 10k fallback), arrows + `Enter`, capped display list, path disambiguation (duplicate names show folder), full-path on hover, keyboard-only operable, `Esc` closes, focus returns to editor.
- Quick Open keys: `Enter` open-best else create typed path; `Shift+Enter` force exact-name create; `Ctrl+Enter` open in new tab; empty = recents. Palette: categories, `shortcutLabel()` chips, `⚠` collision mark + Settings warning, disabled commands visible but inert, recents auto + user pins (max 20) above recents.
- Copy: "No matching files. Press Enter to create …" (never "Quick Switcher"); "No commands found".

### 3.3 File Explorer (F05)

- Rows: 32px, 6px radius, folder-first (name-asc default, persisted per-workspace in app-data). Active file auto-revealed (ancestors expanded + selected). Duplicate names allowed (path shown on hover/secondary line).
- Actions: new note (default location = selected folder else root), new folder, `F2` rename, delete (honest trash label; `DIRECTORY_NOT_EMPTY` unless confirmed recursive), drag move + drag-into-note inserts `[[shortest/path]]`, external drop copies in (`name 1.md` rule, never overwrite/move).
- Destructive confirm copy: "Delete …? This moves it to OS trash." vs "Permanent delete — this cannot be undone." (when no OS trash).

### 3.4 Editor — single surface (F06)

- One continuous WYSIWYG surface (CodeMirror owns doc/undo/selection). Title + body directly editable; click-and-type where content appears. No Edit/Read toggle. Markdown is storage truth, never UI.
- Chrome: blank-note affordance ("Start writing…"), inline task checkboxes (transaction, any non-space = done), table dividers (no raw pipes), code fences visible (edited as code), footnote superscripts, `%%comments%%` hidden, image label-shown/URL-hidden + local preview, callout chips, sanitized-HTML gate (script dropped, no render inside HTML blocks).
- Save states: `Saved HH:MM` / `Unsaved changes` / `Saving…` / `Conflict — Reload keeps disk / Retry save keeps mine` (both versions safe; draft retained if file vanished). Autosave debounced; explicit `Ctrl+S`.
- Find/replace bar, undo/redo, smart lists/auto-pair/guides/line-numbers, platform spellcheck. No `Ctrl+E`, no read-mode binding.

### 3.5 Links, backlinks, outgoing, preview (F09–F12, F29)

- Wikilink autocomplete: files/headings/blocks/aliases, disambiguated paths, excluded files deprioritized. Unresolved links render distinctly (clickable, follow → create via link-controlled path → open → backlinks update) — never a badge wall.
- Backlinks pane: Linked / Unlinked sections, alias-aware, collapse/context/sort/filter, "Link as `[[Canon|Alias]]`" action. Outgoing pane: Links / Unlinked, hover full path, code-block caveat footnote.
- Page preview: hover 400ms on resolved `[[link]]` → first ~20 lines via `renderMarkdown()` + full-path footer. Never steals focus, never obstructs typing. No backlink/search-row previews in MVP.
- Outline: live ATX headings of active note; click scrolls; drag deferred.

### 3.6 Search (F15)

- Field + grammar hint + `Explain search term` affordance. Supported operators only; anything else → inline `INVALID_REQUEST` naming the operator (never silent empty).
- Results: bounded (`maxResults`), one match per file for content queries, context lines, collapse, copy-results, sort name/modified/created, debounce ≥150ms, empty = recents, excluded hidden. Selecting editor text seeds the query.

### 3.7 Favorites (F28), Tags (F13), Properties (F14)

- Favorites: groups + entries (file/folder/search-string/heading/block), drag-reorder + up/down, alias edit, missing = greyed + retained + re-resolves. Word is always "Favorite".
- Tags: nested tree / flat, counts = files, sort name/frequency, click → `tag:` search. Tag chips are navigation, not decoration.
- Properties: typed controls (text/list/number/checkbox/date/datetime/tags) over lossless YAML; per-workspace type registry; malformed YAML banner + Source fallback; absent/null/empty visually distinct; body never touched by property edits.

### 3.8 Today / Daily / Tasks / Calendar (F24, F32 + Step 6)

- Today = aggregate (scheduled + overdue/due-today + Daily embed + recent + quick actions), never the Daily file. Missing Daily → explicit `[ Create Today's Note ]` button. Never silent-create.
- Tasks: checkbox-first; `@due()` (deadline) vs `@scheduled()` (time block) visually distinct; calendar drag rewrites `@scheduled` only, `@due` untouched. No recurrence/deps/NLP promises in copy.
- Calendar: two native sources only (event-notes `type:event` + `start` required ISO-8601 with offset; `@scheduled` tasks). All-day vs time-block distinct; timezone offset shown; 30-min visual default never persisted.
- Quick Capture: Daily / Inbox (`Inbox.md` default) / Task / New Note.

### 3.9 Collections/Views (F23), Graph (F21), Canvas (F22)

- Collections: saved query + named views; MVP table + list share query semantics; identical empty/loading/error frames. No formulas/summaries/CSV/cards/board/calendar in MVP copy.
- Graph: read-only; nodes = notes, edges = links; size = references; hover highlight; click-open; context menu; pan/zoom; filters (search/tags/attachments/existing-only/orphans); groups by search (colors); arrows/fade/size/thickness controls; Local + depth slider. Empty (no links) and disconnected states designed, plus keyboard list alternative (graph is secondary to search).
- Canvas: infinite 2D; text/note/image cards; directed edges + labels + colors; groups + rename; pan/zoom/fit/selection; embed renders shapes-only (documented limit footnote). Distinct from Graph everywhere in copy.

### 3.10 Recovery (F37), Import incl. Elephant (F40–F41), Settings (F38–F39), Updates

- Recovery: snapshot list (time + reason), Restore (snapshots current content first + confirm) + Copy, 7-day retention note, "Recovery is not a backup" verbatim. Never imply backup.
- Import: confirm screen lists notes + attachments + `unmapped` (remote/absolute/missing kept as-is) + `warnings` + `skipped` (cap/collision/malformed). Elephant (`.enex`) same screen: tag/frontmatter mapping + resource report + never-fetch-remote note.
- Settings grouped by user goal (Appearance / Editor / Files / Hotkeys / Import / Updates), not module. Hotkeys table + capture-to-assign + Reset + collision warning.
- Updates: stable (`vX.Y.Z`, offered) vs prerelease (`-beta`/`-rc`, never auto-offered); offline-silent check; SHA-256 verified download; honest install/launch/download-failure copy.

## 4. Copy voice

Quiet, filesystem-honest, keyboard-first. Use canonical terms exactly. Say what happened + what is safe: "Your edits are still safe." "Reload keeps disk." "Recovery is not a backup." Never "Vault", "Base", "Bookmark", "Quick Switcher", "Palette" alone, "read mode", or "synced" for local snapshots.

## 5. Motion

Rare and purposeful. Instant response for Quick Open/Palette/toggles/list nav/shortcuts. No layout animation that moves the caret or selection. Respect `prefers-reduced-motion`. Hover/focus transitions ≤120ms, no decorative loops.
