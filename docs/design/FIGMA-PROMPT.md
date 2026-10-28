# Takenotes — Figma prompt pack

Paste these into Figma Make (or any AI-to-Figma tool) **in order**. One giant prompt degrades; six focused ones keep the file structured. Prompt 0 sets the system; each later prompt adds a page and wires prototype links to what already exists. If the tool has a size limit, paste Prompt 0 once, then each numbered prompt as a follow-up in the same file.

Design source of truth: `docs/design/ui-ux/foundations.md` (tokens), `CONTEXT.md` (vocabulary), `docs/roadmap.md` + `docs/specs/LOCAL-FIRST-PLAN.md` (scope). Paid/cloud features are intentionally absent.

---

## Feature design summary

What each feature is for, how it should feel, and where it sits in scope. The prompts below carry the full detail; this is the map.

**Scope key:** **Core** = daily loop, ships first · **Connect** = WSL, agents, settings · **Trust** = saving and recovery, ships with Core · **Mobile / Web** = companion surfaces · **Concept** = prototype-only, badged, not committed · **Later** = demand-gated, shown only as labelled frames.

### Design thesis

Three ideas carry the whole design:

1. **Honest files.** The app never hides what happened to a file. Saves, conflicts, lost connections and agent writes are shown plainly, and nothing is silently merged or silently destroyed.
2. **One local truth.** Tasks, calendar items and Today read the same files that MCP agents read and write. The UI and an agent see the same plan.
3. **Keyboard first, chrome recedes.** The editor is the product. Advanced actions live in menus, the palette and shortcuts, not in permanent controls.

### Feature map

| Area | Feature | Scope | Design decision |
|---|---|---|---|
| Workspaces | Open folder, open WSL folder, create | Core | Switcher in the title bar; kind badge (Windows, WSL, macOS, Linux, Server) |
| Workspaces | Connections manager | Connect | One card per WSL environment: Start, Restart, Copy MCP config, Remove |
| Workspaces | WSL setup and pairing | Connect | Four steps with real progress; a failure names the exact step and offers Copy diagnostics |
| Editor | Single-surface WYSIWYG | Core | Markdown renders in place; raw source only as a fallback (e.g. invalid YAML) |
| Editor | Slash menu, selection toolbar | Core | `/` inserts blocks; selection toolbar handles inline formatting |
| Editor | Tasks in notes | Core | `- [ ]` with `@due`, `@scheduled`, `@priority` chips; the checkbox toggles only (ADR-0010) |
| Editor | Ghost links (F) | Concept | Unresolved `[[links]]` get a dashed underline; hover offers Create note with a template |
| Editor | Trust strip (C) | Concept | Collapsible footer: real path, revision, size, encoding, newline style |
| Editor | Focus mode (E) | Concept | Esc toggles; hides everything except the editor and a faint outline rail |
| Explorer | Tree, rename, drag, multi-select, sort | Core | Mirrors the filesystem; large folders show a truncation notice, never a silent cut |
| Tabs | Tabs, pin, dirty dot, conflict marker | Core | Dirty and conflict are separate markers; overflow menu for many tabs |
| Navigation | Quick Open (Ctrl+P) | Core | Files only; disambiguated paths; "Create 'name.md'" row |
| Navigation | Command Palette (Ctrl+Shift+P) | Core | Commands only; disabled commands state the reason; mode chips `>` `#` `@` `?` |
| Navigation | Page preview | Core | Hover card on `[[link]]` after 400ms |
| Knowledge | Backlinks, outgoing, outline, properties | Core | Unresolved outgoing links use warning style; properties round-trip losslessly |
| Knowledge | Search (Ctrl+Shift+F) | Core | Words, phrases, `-exclude`, `tag:`, `path:`, `file:`, `task:`, `[prop]`; results grouped by file |
| Knowledge | Favorites | Core | Typed (file, folder, search, heading, block); a missing target stays visible and greyed |
| Knowledge | Tags | Core | Nested tree or flat list |
| Plan | Today | Core | Aggregated view, not the Daily Note; same data as the MCP `plan_today` tool |
| Plan | Tasks view | Core | Groups: Overdue, Today, Upcoming, No date, Done; `j`/`k` move, `x` toggles |
| Plan | Calendar | Core | Event notes and `@scheduled` tasks; read-only ICS layer with a lock icon |
| Plan | Daily notes, templates | Core | Creating a Daily Note is always an explicit action, never silent |
| Plan | Quick Capture | Core | Global hotkey window; saves without a toast |
| Plan | Collections | Core (table, list) | Saved query as table or list; board, cards and formulas are Later |
| Trust | Save states | Core | Saved, saving, dirty, conflict, read-only, file missing, disconnected; each with tooltip text |
| Trust | Conflict banner and Compare | Core | Never auto-merges; choices are Keep mine, Load disk, Compare |
| Trust | Recovery snapshots | Core | Restore snapshots the current version first; labelled "Recovery is not a backup" |
| Trust | Draft retained | Core | File deleted while dirty keeps the unsaved text, with Save as or Recreate |
| Trust | Delete | Core | Native trash where it exists; permanent delete labelled honestly (WSL) |
| Trust | Errors | Core | Exact cause in plain language; technical detail behind a disclosure |
| Trust | Toasts | Core | Background info only; max one; 4s; Undo where reversible |
| Trust | Link-aware rename | Core | Preview list of updated notes; "Always update links" toggle |
| Agents | Tokens and Connect an agent | Connect | Token shown once; read-only by default; per-agent config snippet |
| Agents | Activity log | Connect | Every tool call with agent, workspace, result; denied attempts stay visible |
| Agents | Agent changes tray (A) | Concept | Status pill "claude-code edited 2 notes"; Keep or Undo via the pre-write snapshot |
| Agents | Plan with agent (B) | Concept | Shows the prompt to paste into Claude Code; no chat UI inside the app |
| Calendar | Event creation, drag to reschedule | Core | Dragging changes `@scheduled` only; tooltip states `@due` is unchanged |
| Settings | Full settings dialog | Connect | Left navigation; Agents is the showpiece |
| Updates | Banner and update dialog | Core | Status-bar banner, never a toast |
| Import | Markdown folder, Obsidian vault | Core | Summary lists skipped files |
| Mobile | Capture, notes, search, Today, settings | Mobile | Files arrive through the user's own sync tool; the app does no sync |
| Web | Server login, browser editor, agents panel | Web | Reuses desktop components; same conflict language |
| Graph, Local Graph, Canvas | Graph and canvas frames | Later | Shown only as labelled Later frames |

### Platform breakdown: desktop and mobile

Desktop is the full authoring and agent-setup surface. Mobile is capture and retrieval first, as the plan's Tier F and the sync-folder decision require. Mobile never runs an MCP server or a WSL connection; it opens the same folder through the user's sync tool.

**Desktop (1440x900, compact 1024x700; Windows, macOS, Linux, WSL)**

| Surface | What it does | Platform-specific detail |
|---|---|---|
| First run | Open folder, open WSL folder, create workspace, recents | Only desktop offers WSL setup |
| Main shell | Title bar, ribbon, sidebar tree, tabs, editor, right sidebar, status bar | Three-pane; right sidebar collapsible; ribbon shows Explorer, Search, Outline, Favorites, Today, Calendar, Tags, Settings, palette hint |
| Editor | Full WYSIWYG, slash menu, selection toolbar, find and replace | Hotkeys shown in menus and tooltips |
| Explorer | Tree, drag, inline rename (F2), multi-select, sort, Expand/Collapse all | Right-click context menus on every target |
| Navigation | Quick Open (Ctrl+P), Command Palette (Ctrl+Shift+P), page preview | Keyboard-driven; ESC closes overlays |
| Search | Ctrl+Shift+F panel with operator chips, grouped results, context lines | Results open scrolled to the match |
| Knowledge panel | Backlinks, outgoing, outline, properties | Right sidebar tabs |
| Plan | Today (time-block rail), Tasks view, Calendar (month, week, day), Daily Notes | Drag blocks in Today and Calendar; `j`/`k`/`x` in Tasks |
| Quick Capture | 520x220 global-hotkey window | Desktop only; needs OS-level hotkey |
| Trust | Save states, conflict banner, Compare, recovery panel, delete confirmations | Same language on every platform (see mobile below) |
| Connect | Workspace switcher, WSL connection wizard, connections manager, Settings (13 sections) | WSL and server kinds only appear here |
| Agents | Tokens, Connect an agent, activity log, agent changes tray (Concept) | Desktop-only for setup; the activity log is visible here |
| Import, updates | Obsidian and Markdown import, update banner and dialog | Updates run through the status bar |

**Mobile phone (390x844; iOS and Android)**

| Surface | What it does | Mobile adaptation |
|---|---|---|
| Onboarding | Choose a folder, "your notes stay files", sync-tool tip | Replaces desktop first run; no WSL step |
| Tab bar | Notes, Search, Capture (centre, prominent), Today, Settings | Replaces the ribbon and sidebar |
| Notes | Folder list with breadcrumb, swipe actions (favorite, rename, delete), pull to refresh, sort sheet | Swipe replaces context menus; sheets replace popovers |
| Note view | Reading mode by default; tap to edit; keyboard accessory bar (checkbox, list, heading, link, tag, undo) | Editing is opt-in, not the default state |
| Selection and links | Selection menu, link preview as bottom sheet | Bottom sheets replace hover previews |
| Conflict | Same banner and choices as desktop (Keep mine, Load disk, Compare) | Compare stacks the two versions vertically |
| Capture | Full-screen with destinations Inbox, Daily, Task, New note; share-sheet receive | Destination chips replace the destination switcher |
| Search | Recents, operator chips, highlighted results | Same operators as desktop, fewer panels |
| Today | Agenda list: overdue, scheduled, due today; swipe to complete | Agenda list replaces the time-block rail |
| Settings | Appearance, folder, haptics, about | No Connect, Agents or Calendar ICS sections |

**Tablet (820x1180)**

Two-pane (tree plus editor) with a split sidebar and a keyboard-shortcut overlay. It reuses the desktop shell components at a narrower width, so the Trust and Plan views look the same as desktop.

**Parity rules**

- Save states, conflict language, error copy and the toast rule are identical on every platform. An honest file behaves the same everywhere.
- Touch targets are 44px minimum on mobile and tablet. Desktop keeps the 28px list rows.
- A feature that needs a WSL connection or an MCP token is desktop-only. Mobile shows the note or task and says where the agent setup lives, but never offers to configure it.
- Every mobile sheet (sort, filter, move, link picker, date picker, confirm delete) has a desktop equivalent: a menu or popover.

### Scope flags (to decide before the prompts are pasted)

These items appear in the prompts but go beyond `docs/specs/LOCAL-FIRST-PLAN.md`. Each needs a yes or no. None has been removed from the prompts yet.

1. **Mobile voice dictation and share-sheet receive** (Prompt 5). The plan puts mobile in Tier F with folder sync only. Suggest: Concept or cut.
2. **Typed property creation and "add property"** (Prompt 3). The plan says properties are lossless round-trip with minimal UI. Suggest: edit existing values only.
3. **Regex toggle in Search** (Prompt 2/3). The plan defers regex. Suggest: remove the toggle.
4. **Appearance "frame style" and accent** (Prompt 4). The plan allows light, dark, system and accent only. Suggest: drop frame style.
5. **Natural-language dates in `@` mode** (Prompt 6 D, "tomorrow 3pm"). Not in the plan. Suggest: Concept, not core.
6. **Saved Views as tabs in Collections** (Prompt 3). Plan says table and list only. Suggest: keep if the saved query is the view; defer tabs.

---

## Prompt 0 — Product, system, file structure (paste first)

```
You are a senior product designer building a complete, clickable Figma prototype for "takenotes".

PRODUCT
takenotes is a free, open-source, local-first Markdown notebook for Windows, macOS and Linux, with first-class WSL support. Notes are ordinary .md files in folders the user owns; the app is an interface around them, never a database. Its unique angle: a developer's notes live in their Linux home (WSL), the Windows UI edits them, and AI agents (Claude Code, Cursor, Codex) read and write the same files through MCP to plan the day, create tasks and append to daily notes. Everything runs locally; there are no accounts, no sync, no subscriptions.

Audience: developers, students, researchers and power note-takers who live on the keyboard. Tone: calm, precise, trustworthy, quietly confident. Never playful clutter.

DESIGN PRINCIPLES
1. The editor is the product; chrome recedes. ~90% neutral, <=10% accent.
2. Files first: the sidebar mirrors the filesystem. Real files, real consequences: surface save state, conflicts and connection loss honestly; never toast "success" spam.
3. Keyboard-first: every flow works without a mouse and shortcuts are visible in menus, tooltips and the palette.
4. Progressive disclosure: advanced actions live in context menus, the Command Palette and "More" menus, not permanent chrome.
5. Minimal and polished, but with one or two memorable ideas (see Prompt 6). Originality through clarity and speed, not strange controls.

VOCABULARY (use exactly; never rename)
Workspace (not Vault) · Connection (a WSL environment) · Collection (not Base) with Views (table, list) · Daily Note · Today (an aggregated view, NOT the daily note) · Event note · Favorite (not Bookmark) · Task, Due and Scheduled are distinct · Quick Open (files) vs Command Palette (commands) · Recovery snapshot.

DESIGN TOKENS -> create as Figma Variables with Light and Dark modes (warm paper, not cold grey)
Surfaces: app #faf6ee / #151310 · sidebar #f3ecdd / #201c16 · editor #fffdf7 / #191613 · overlay #fffdf7 / #26211a · hover #ece4d1 / #322b22 · selected #ece8ff / #342b50
Text: primary #191817 / #f4ecd9 · secondary #4c4a45 / #d9cfae · muted #70695c / #b7ad9b
Borders: subtle #e5dcc8 / #38322a · control #8a806d / #887d69
Accent #4f41d6 / #ad9fff (links, focus, active indicator only) · accent-hover #4032ba / #c3b9ff
Primary button fill #1d1c1a / #f4ecd9 with text #fffdf7 / #191817
Status: success text #356b2f / #b9e5a8 on #e7f4df / #20321f · warning #805500 / #ffdf8e on #fff3d1 / #352a14 · danger #a53240 / #ffadb5 on #fcebed / #3b2025
Selection #e3dcff / #493968 · code surface #f3ecdd / #26211a · highlight #ffdf8e / #59451b
Typography: UI = Segoe UI Variable / system sans (14/20 UI, 12/16 secondary, 11 caps labels); editor body 16/26 at max width 760px; mono = Cascadia Code. Headings in the editor are the same family, weights 600-700.
Spacing 4px base (2,4,6,8,12,16,20,24,32,40). Radius: 4 controls, 6 inputs/menus, 8 dialogs, 10 max overlays. Elevation: one soft shadow for overlays only. Motion 100-180ms ease, respects reduced motion.
Layout: title bar 40, ribbon/rail 44, sidebar 240 (resizable 180-360), tab strip 35, list rows 28, tree indent 14 per level, status bar 24.
Accessibility: AA contrast everywhere, visible 2px accent focus ring on every control, minimum 44px touch targets on mobile, never color-only meaning.

FIGMA FILE STRUCTURE (create these pages, in this order)
00 Cover & Read me (product summary, flow map, how to run the prototype, changelog)
01 Foundations (variables, type scale, spacing, radius, elevation, motion specs, iconography grid)
02 Icons (24px, 1.5px stroke, rounded, one consistent set, each as a component with a size/state variant; name icon/<name>)
03 Components (atoms -> molecules -> organisms; every one with variants for state: default, hover, focus, active, selected, disabled, loading, error; and Light/Dark)
04 Desktop (frames 1440x900 and a compact 1024x700)
05 Mobile (iOS/Android 390x844 and tablet 820x1180)
06 Web (server login + browser editor, 1280x800)
07 Overlays (every dialog, popover, menu, sheet, toast as standalone components, also used in flows)
08 Flows (prototype connections organised as named flows, see below)
09 Assets (exportable SVG icons, app icon, empty-state illustrations, sample data)

COMPONENT NAMING: category/name/variant (e.g. button/primary/hover, tree-row/folder/expanded). Use Auto Layout, constraints, and component properties (boolean, text, instance-swap) everywhere. No detached instances, no hard-coded colors; everything bound to variables. Provide Light and Dark for every frame by switching the variable mode.

SAMPLE DATA (reuse across all frames so the prototype feels real)
Workspaces: "Notes" (~/notes, Windows local) and "dev-notes" (WSL · Ubuntu · ~/notes, connected). Folders: Daily/, Projects/, Inbox.md, Reading/, Templates/. Notes: "Takenotes roadmap", "Auth rewrite — plan", "Standup 2026-10-27", "Reading list", "Meeting — design review". Tags: #project #idea #reading #bug. A task list with @due() and @scheduled() dates, one overdue. One event note "Design review" 15:00-16:00. Three realistic MCP agents: claude-code (write), cursor (read-only), codex (write).

Confirm the structure, then create pages 00-03 with the full foundations, icon set and base components. Do not design screens yet.
```

---

## Prompt 1 — Core desktop: workspace, editor, navigation

```
Using the existing variables and components, design page 04 Desktop, section "Core". Build each as a 1440x900 frame in Light and Dark, plus the compact 1024x700 variant where noted.

1. First run / Welcome: pick "Open a folder", "Open WSL folder", "Create a workspace", recent workspaces list, a single short promise line ("Your notes stay plain Markdown files."). No marketing.
2. Main shell (the hero frame): title bar with workspace switcher; left ribbon (Explorer, Search, Outline, Favorites, Today, Calendar, Tags, Settings gear, Command Palette hint); sidebar with file tree; tab strip (dirty dot, pin, close, overflow); editor with a note; right sidebar (Backlinks / Outgoing / Properties / Outline tabs); status bar (Workspace - OS/Connection - saved|dirty|conflict - index "1,248 files" - word count).
3. Editor, single-surface WYSIWYG: show all rendering states in ONE long note frame: H1-H3, bold/italic/strike, inline code, fenced code with language label, blockquote, callouts (note/tip/warning/danger), nested lists, task checkboxes (open/done, with @due chip and @scheduled chip), GFM table, footnote, image with caption, [[wikilink]] resolved vs unresolved, #tag, embed ![[Note]], %%comment%% hidden. Show the floating selection toolbar and the slash-command menu ("/").
4. File Explorer states: expanded/collapsed, selected, active file revealed, dragging a file (drop indicator), inline rename (F2), new note inline row, multi-select, empty folder, sorting menu (name/modified/created, asc/desc), "Expand all/Collapse all", loading skeleton for a big workspace, 2,000-file "truncated" notice.
5. Tabs: many tabs overflow menu, reopen closed tab toast-less, dirty tab, pinned tab, conflict tab (warning marker).
6. Context menus: file, folder, tab, editor text selection, link (open, open in new tab, copy path, add to Favorites, reveal in explorer), each with keyboard shortcuts right-aligned.
7. Quick Open (Ctrl+P): input, fuzzy results with disambiguated paths for duplicate names, recent files when empty, "Create 'new idea.md'" row, hint footer (Enter open - Ctrl+Enter new tab - Shift+Enter create).
8. Command Palette (Ctrl+Shift+P): grouped commands with shortcuts, recents and pinned, a disabled command with reason, mode chips (> commands, # tags, @ dates, ? search) as a subtle row.
9. Page Preview: 400ms hover card on a [[link]] showing ~20 lines and the full path footer.
10. Hotkeys settings table with capture-to-assign, collision warning row, Reset to defaults.

Prototype: wire Welcome -> Main shell; Ctrl+P / Ctrl+Shift+P overlays open and close (ESC); clicking a tree row opens a tab; hovering a link shows the preview; right-click menus on each target; F2 rename; drag-drop of a row (smart-animate). Name this flow "Core".
```

---

## Prompt 2 — Trust & safety: saving, conflicts, recovery, errors

```
Design the "honest file" layer. This is takenotes' trust signature; make it calm, clear and consistent. Page 04 Desktop, section "Trust". Light and Dark.

1. Save-state language in the status bar and tab: saved (check, quiet), saving..., dirty (dot), conflict (warning), read-only, file missing, disconnected. Provide each as a component variant with tooltip text.
2. CONFLICT banner above the editor: "This file changed on disk." Actions: Keep my version (retry save), Load disk version, Compare. Show the Compare view: side-by-side diff with word-level highlights, never auto-merge, both versions kept safe.
3. Recovery panel (File Recovery): snapshot list for a note (time, size, "Auto"/"On close"), preview pane, actions Restore (it snapshots current first) and Copy to new note, retention note "Recovery is not a backup", empty state.
4. Draft retained flow: file deleted externally while dirty -> "Your unsaved text is kept" with Save as..., Recreate file.
5. Trash/delete confirmation: native trash vs permanent delete labeled honestly (WSL permanent), non-empty folder recursive confirm that lists what will be removed.
6. Errors with exact causes (never "Something went wrong"): path not found, permission denied, not a directory, outside workspace (symlink), file too large, unsupported encoding, WSL not running, connection failed, protocol version mismatch. Each: icon, plain-language sentence, technical detail disclosure, primary recovery action.
7. Toast rules: only for non-critical background info, max one visible, auto-dismiss 4s, with Undo where reversible. Show 3 examples.
8. Link-aware rename: dialog "Updating 12 links in 5 notes" with preview list and a toggle "Always update links".

Prototype flow "Trust": make a Dirty editor -> trigger external change -> Conflict banner -> Compare -> Keep mine / Load disk; and Editor -> Recovery -> Restore -> success state. Use after-delay transitions to simulate the external change.
```

---

## Prompt 3 — Knowledge & productivity: links, search, daily, tasks, calendar

```
Design the thinking-and-planning surfaces. Page 04 Desktop, section "Knowledge" and "Plan". Light and Dark.

KNOWLEDGE
1. Right sidebar tabs: Backlinks (linked + unlinked mentions with context lines, collapse, sort, "link it" action), Outgoing links (including unresolved in warning style), Outline (headings tree, click to scroll), Properties (typed fields: text, list, number, checkbox, date, tags; add property; invalid YAML warning with Source mode fallback).
2. Search panel (Ctrl+Shift+F): query input with operator autocomplete chips (file: path: tag: task: [prop] -exclude "phrase"), live results grouped by file with highlighted matches and line numbers, filters row (match case, regex off by default), sort menu, collapse/expand all, context lines slider, "Copy results", empty states (no results with query tips; unsupported operator error naming the operator), result count and "showing first 50".
3. Tags view: nested tree and flat list toggle, counts, sort by name/frequency. Properties view: all properties with type, frequency, rename.
4. Favorites pane: groups, drag-reorder, types (file, folder, search, heading, block) with distinct icons; missing target shown greyed and retained.
5. Attachments: paste/drag image into note with name/location prompt; PDF and audio embed render; unsupported file card.

PLAN
6. Today (aggregated view, not the daily note): a vertical "day rail" with time blocks. Left column: Overdue (danger chip), Due today, Scheduled; center: day timeline 07:00-22:00 with event notes and scheduled tasks as draggable blocks (drag changes @scheduled only; show a tooltip saying "@due is not changed"); right: Daily Note preview with "Create Today's Note" button when missing (never silent); quick actions (Capture, New note, Start focus).
7. Tasks view: all tasks across the workspace, groups (Overdue, Today, Upcoming, No date, Done), filters (tag, folder, priority, due range), inline checkbox toggle, due/scheduled/priority chips, "Open in note" jump with line highlight. Keyboard: j/k, x to toggle.
8. Calendar: Month, Week and Day views. Event notes and @scheduled tasks as items. A read-only external ICS layer in a hatched/lighter style with a lock icon and a layer toggle. Event creation popover (title, start, end, creates an Event note), drag-to-reschedule, overlapping items.
9. Daily Notes: ribbon button, date picker popover (calendar heat of days that have notes), previous/next day, template applied indicator, empty "Create" state.
10. Templates: insert-template picker with variable preview ({{title}} {{date}} {{time}}), settings for the template folder.
11. Quick Capture (global hotkey window, small 520x220): destination switcher (Inbox / Daily / Task / New note), text area, Enter to save, confirmation without toast.
12. Collections: table view and list view of a saved query (columns: file, status, due, tags), column picker, filter chips, sort, saved Views as tabs, "Save as view", empty and error states.
13. Graph and Local Graph, Canvas: design as "Later" frames, clearly labelled with a Later badge, so the roadmap is visible: graph with filters panel (tags, orphans, depth slider, groups colors), and a minimal canvas with text/note/image cards and labelled edges.

Prototype flow "Plan": Today -> drag a task block to 15:00 -> tooltip; Today -> Create Today's Note -> Daily note opens in a tab; Tasks -> toggle -> moves to Done group; Search -> click a result -> note opens scrolled with match highlighted; Calendar -> click empty slot -> creation popover -> new event appears.
```

---

## Prompt 4 — Workspaces, WSL connection, agents (MCP), settings

```
Design setup and automation. Page 04 Desktop, section "Connect". Light and Dark.

1. Workspace switcher dropdown: current, recents with kind badge (Windows / WSL / macOS / Linux / Server), Open folder..., Open WSL folder..., Manage workspaces. Close workspace confirm.
2. Open WSL folder (Connection flow): step 1 choose or set up an environment (list of detected distros with status running/stopped, "Set up takenotes in this distro" button); step 2 installing with a real progress list (download, install to ~/.local/share/takenotes, start server, health check) and a failure state with the exact failing step and a "Copy diagnostics" button; step 3 paired successfully with a green check and the workspace list; step 4 pick a folder. Also a pairing-by-link variant ("takenotes://pair?..." received) with a confirm dialog showing the server URL and name.
3. Connections manager: each connection card shows distro, Linux user, URL, version, state (online, starting, offline, version mismatch), actions (Start, Restart, Copy MCP config, Remove). Error states with plain-language causes.
4. Settings (full-screen dialog with left nav): General, Editor (font, size, line height, readable width, spellcheck, smart lists, line numbers), Appearance (Light/Dark/System, accent, zoom, inline title, ribbon visibility, frame style), Hotkeys, Files & Links (new-note location, wikilink format shortest/relative/absolute, auto-update links, attachment folder, trash behavior), Daily Notes & Templates, Calendar (ICS subscriptions: add URL field with "treated as secret" hint, refresh interval, last sync, error state), Search, Recovery (snapshot interval and retention), Agents (MCP), Updates, About.
5. Settings > Agents (MCP) - the showpiece of this prompt:
   - Header: one-line explanation and a status pill "Server running - 127.0.0.1:3000".
   - "Connect an agent" card: a client selector (Claude Code, Cursor, Codex, Other) that swaps a copy-ready config snippet with the token already inserted, a Copy button, and the exact file path where it goes.
   - Tokens table: label, scope pill (Read / Read & write), workspaces, created, last used, requests today, Revoke. Row actions menu.
   - Create token modal: label, workspace multi-select with checkboxes, scope radio (Read-only default), Create; then a "shown once" reveal state with a Copy button and a warning that it can't be seen again.
   - Revoke confirm.
   - Activity log: live list of tool calls (time, agent, tool such as note_update / task_create, workspace, result OK/Denied/Conflict) with filters (agent, tool, result), search, and a row detail drawer showing the affected file with an "Open in editor" link. Show a denied read-only attempt row.
   - Empty state with a 3-step illustration (create token, paste config, ask your agent to "plan my day").
6. Updates: update available toast-less banner in the status bar, update dialog with release notes, download progress, restart prompt, and "up to date" state.
7. Import: Import from folder of Markdown or Obsidian, mapping options, summary of skipped files, progress.

Prototype flow "Connect": Welcome -> Open WSL folder -> install steps (auto-advance) -> paired -> workspace opens; Settings -> Agents -> Create token -> reveal -> Copy -> table updates; trigger a revoke; open activity log row detail. Include the failure branch with a different prototype path.
```

---

## Prompt 5 — Mobile, tablet and web

```
Design the companion surfaces. Reuse tokens and map desktop components to mobile equivalents. Light and Dark. Page 05 Mobile and 06 Web.

MOBILE (390x844) - capture and retrieval first, not full authoring parity. Files arrive by the user's own folder sync tool (Syncthing, iCloud, Dropbox); say so in onboarding.
1. Onboarding: choose a folder, explain "your notes stay files", sync-tool tip.
2. Tab bar: Notes, Search, Capture (center, prominent), Today, Settings.
3. Notes: folder list with breadcrumb, swipe actions (favorite, rename, delete), pull to refresh, sort sheet, empty state.
4. Note view and editor: reading mode default, tap to edit, keyboard accessory bar (checkbox, list, heading, link, tag, undo), selection menu, link preview bottom sheet, conflict banner.
5. Capture: full-screen quick capture with destination chips (Inbox, Daily, Task, New note), voice dictation affordance, share-sheet receive state ("Save to takenotes").
6. Search: recents, operator chips, results with highlights.
7. Today (agenda list): overdue, scheduled, due today, with swipe to complete.
8. Settings: appearance, folder, haptics, about.
9. All sheets: sort, filter, move to, link picker, date picker, confirm destructive.
TABLET (820x1180): two-pane (tree + editor), split sidebar, keyboard shortcuts overlay.

WEB (1280x800) - the self-hosted server's browser client
10. Server login (owner password, throttle message "Too many attempts. Wait and retry."), first-boot hint.
11. Browser editor: workspace select, tree, note editor, save state, conflict banner (same language as desktop).
12. Agents panel (token list, create, reveal-once) - same component as desktop Agents, responsive.
13. Public website hero is out of scope.

Prototype flows "Mobile capture" (tab -> Capture -> type -> Save -> back with quiet confirmation) and "Web login" (login -> editor -> edit -> save -> conflict).
```

---

## Prompt 6 — Out-of-the-box layer, polish, QA (paste last)

```
Now elevate the design without breaking the minimal system. Add these as clearly labelled "Concept" frames inside the relevant sections (badge: Concept) and wire them into the prototype:

A. Agent changes tray. When an agent writes through MCP, show a small unobtrusive pill in the status bar ("claude-code edited 2 notes"). Clicking opens a tray listing each change with a compact diff, Keep / Undo (restores the pre-write recovery snapshot). Inline in the editor, a thin accent margin marker and a one-line "Edited by claude-code 2m ago" note that fades. This builds trust that agents never silently destroy data.
B. "Plan with agent" starter: in Today, an optional card "Ask your agent to plan today" that shows the exact prompt to paste into Claude Code and the MCP tools it will use (plan_today, task_create_many). No chat UI inside the app.
C. Trust strip: a collapsible footer under the editor showing file truth: real path, revision hash (short), last modified, size, encoding and newline style, "Reveal in Explorer". Calm, tiny, developer-friendly.
D. Command Palette modes: typing > # @ ? switches mode with a morphing prefix chip; @ lets you type "tomorrow 3pm" and creates a scheduled task.
E. Focus mode: Esc-toggled, hides all chrome except the editor and a faint outline rail; typewriter scroll option.
F. Ghost links: unresolved [[links]] render as a soft dashed underline; hover offers "Create note" with a template picker; creating shows the new note sliding into the tree (smart-animate).
G. Empty states with personality but zero fluff: one custom monochrome line illustration per empty state (no notes, no search results, no tasks, no tags, no agents, no calendar events) using only token colors, plus one useful action each.

POLISH AND QA PASS
- Add micro-interactions as prototype transitions (100-180ms): row hover, tab open, overlay fade+8px rise, checkbox tick, drag shadow, toast slide. Provide a "Reduced motion" variant that uses opacity only.
- Verify every text/background pair meets AA; add a Contrast checks table to page 01.
- Verify 200% text scaling and long-content stress frames: a 120-character note title, 5 levels of nested folders, 60 tabs, a table with 12 columns, an RTL title, CJK text, emoji in filenames, 500 search results, 9-digit task counts.
- Keyboard map frame: every shortcut grouped by area, as a printable cheat sheet (Quick Open Ctrl+P, Palette Ctrl+Shift+P, Search Ctrl+Shift+F, New Ctrl+N, Save Ctrl+S, Close tab Ctrl+W, Reopen Ctrl+Shift+T, Rename F2).
- Add focus-order annotations on the three most complex frames (shell, Settings, Agents).
- Page 00: a flow map diagram listing all prototype flows (Core, Trust, Plan, Connect, Mobile capture, Web login) with start frames; add "Run it" instructions and a one-line description of each flow.
- Page 09 Assets: export-ready SVG icon set, light/dark app icon at 16/32/64/256/512, tray icon, 6 empty-state illustrations, sample Markdown content as text frames.
- Clean the file: delete unused styles, ensure no detached instances or raw hex fills, name every layer, group components by category, and lock the Foundations page.
```

---

## Notes for the maintainer

- The prompts deliberately exclude accounts, Google login, payments, hosted MCP and share links (see `docs/later/`). If a paid tier is ever built, add a separate "Later" page rather than mixing it into core flows.
- Graph, Canvas, Collections board/cards and themes are marked as Later/Concept in line with the demand-gated plan.
- If the AI tool drops detail, re-run a single prompt on its own page; the structure and naming in Prompt 0 are what keep the file coherent.
- Realistic sample data is repeated in every prompt on purpose; keep it identical so screens read as one product.
