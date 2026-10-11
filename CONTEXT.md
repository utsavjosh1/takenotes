# takenotes

Filesystem-first local Markdown notebook for Windows with WSL awareness. User Markdown files stay ordinary files.

## Language

### Workspaces and connections

**Workspace**:
The named identity the user opens and works inside: a location plus settings and grants.
_Avoid_: Vault

**Connection**:
How the app reaches a Linux environment: distro plus Linux user plus status. One connection can expose many workspaces.

**Distro picker**:
The "Open WSL folder…" dialog: distro plus Linux user plus Linux path plus connect. Reports precise errors, never a generic failure.

### Knowledge and productivity

**Collection**:
A saved structured query over workspace metadata with multiple presentations. Definitions travel with the workspace as YAML; machine state stays local.
_Avoid_: Base

**View**:
One presentation of a Collection: table, list, cards, board, or calendar.

**Daily Note**:
The calendar-dated note at `Daily/YYYY/MM/YYYY-MM-DD.md` with `type: daily, date: YYYY-MM-DD`. Created explicitly, never silently.

**Today**:
The aggregated productivity view combining scheduled items, overdue and due-today tasks, the Daily Note, recent notes, and quick actions. Not the Daily Note itself.

**Event note**:
An ordinary Markdown note with `type: event` and required `start` (optional `end`) that appears on the Calendar. Body holds agenda, notes, and follow-up tasks.

**Favorite**:
A saved shortcut to a note, heading, folder, search, collection, task view, calendar view, or URL.
_Avoid_: Bookmark

**Task**:
A Markdown checkbox item indexed into the productivity layer. Any `- [ ]` is valid; richer metadata is optional and progressive. Managed tasks gain a lazily assigned stable ID.

**Due**:
A task's deadline date. Never rewritten by calendar drags.

**Scheduled**:
A task's calendar time block. Rewritten when the item is dragged on the calendar; distinct from Due.

### Index (Step 3a lifecycle)

**Document index**:
Per-workspace in-memory parse of notes, rebuildable from disk. Keyed `workspaceId + relativePath`; workspaces never share entries.
_Avoid_: document-index.ts

**Title**:
Frontmatter `title`, else first `# ` heading, else filename stem.

**searchableText**:
Title + aliases + headings + tags + body. Frontmatter excluded.

**Anchor**:
Existing trailing `^id` preserved in the index. Indexing never assigns IDs.

**Index bounds**:
Bulk build caps at 2000 files (`truncated`) and skips files over 1 MiB (`skipped`), both surfaced via status notice. Neither makes the workspace unusable.

**Index lifecycle**:
Open parses and builds, writes re-parse, renames re-key, deletes drop, watcher events refresh, rebuild restores. Revision hash guards stale parses.

**Frontmatter**:
The raw YAML map at the top of a note. Storage truth; reads never normalize it.

**Properties**:
The typed interpretation of frontmatter through the registry. A lossless lens — `tags: single`, `tags: [a, b]`, and missing `tags` stay distinct on disk.

**Property type**:
Per-name interpretation (`text`, `list-text`, `number`, `checkbox`, `date`, `datetime`, `tags`) from an app-data registry keyed by workspace. Only an explicit patch coerces a value; the registry never rewrites on read.

### Organization

**Quick Open**:
Fuzzy file opener by name or alias with create-on-no-match.
_Avoid_: Quick Switcher

**Command Palette**:
Fuzzy command runner by title, opened with `>` mode.
_Avoid_: Palette

### Updates and testing

**Update-check**:
Fetch of the latest stable release tag compared against the running version. Silent when offline.

**Update-download / update-install**:
Fetch of the `.exe` plus `SHA256SUMS.txt`, mandatory SHA-256 verification, launch installer, quit app.

**Release channel**:
`stable` (`vX.Y.Z`, offered by the updater) versus `prerelease` (`-beta`/`-rc`, never auto-offered).

**Logic test**:
Pure protocol or filesystem test runnable on any OS with no real Windows or WSL desktop.

**Parked**:
Code kept in the repo but not a priority that never blocks Windows work.

**Launch-failure**:
Installer ran but no window opens after double-click.

**Install-failure**:
Installer itself was blocked or aborted; app files never land on disk.

**Publisher-warning**:
Windows SmartScreen "Unknown publisher" on an unsigned build. Bypass via More info → Run anyway.
_Avoid_: publisher error

**Download-failure**:
Browser or GitHub fetch blocked or hash mismatch.


## Product experience model

Takenotes is a calm, local-first writing and knowledge workspace. The filesystem and user-authored Markdown are authoritative; the UI should make that content comfortable to create, edit, navigate, connect, and retrieve without forcing users to manage Markdown syntax. The interface is a tool for thinking, not a dashboard competing for attention.

### Product principles

- **Writing comes first.** The note editor is the primary surface. The intended desktop experience is one continuous, directly editable WYSIWYG surface: users click and type where content appears. Do not introduce an Edit/Read toggle or a second editing surface. Markdown remains the durable storage format; `renderMarkdown()` is for preview/export, not an alternate editor.
- **Progressive disclosure.** Keep the default surface quiet. Put infrequent commands in Command Palette, contextual actions near the object they affect, and advanced controls in Settings. Do not expose every capability at once.
- **Filesystem trust.** Notes remain ordinary files. Never hide conflicts, silently overwrite user edits, silently create a Daily Note, or imply that recovery is a backup. Preserve BOM/newlines and existing frontmatter shape where the contracts require it.
- **Fast, predictable navigation.** Quick Open opens files; Command Palette runs commands. Keyboard behavior must be consistent, discoverable, customizable where specified, and tested for collisions.
- **One system, distinct tools.** Components may have different information density according to their task, but share tokens, typography, spacing, surfaces, focus behavior, interaction patterns, and tone. Do not make each feature look like a separate product.
- **Useful states are part of the design.** Empty, loading, error, conflict, partial-index, unresolved-link, disabled, success, and long-content states must be designed, not treated as afterthoughts.
- **Accessible and robust.** Keyboard-first operation, visible focus, readable contrast, scalable type, Unicode/RTL text correctness, reduced motion, and sensible narrow-window behavior matter even though no WCAG certification is claimed.
- **Evidence over invention.** Before changing a feature, inspect its implementation, service contracts, tests, roadmap, and ADRs. Label behavior as implemented, partial, planned, deferred, or unverified. Never describe roadmap intent as shipped behavior.

### Visual system contract

The source of truth is `packages/ui/src/theme.ts`. Generated token outputs include `packages/ui/src/tokens.css` and the desktop renderer styles. Do not hand-edit generated files unless the token-generation workflow explicitly requires it. Preserve `--tn-*` tokens and existing light/dark/system behavior.

- Light surfaces: app `#faf6ee`, sidebar `#f3ecdd`, editor/overlay/input `#fffdf7`; primary text `#191817`; accent `#4f41d6`.
- Dark surfaces: app `#151310`, sidebar `#201c16`, editor `#191613`, overlay `#26211a`; primary text `#f4ecd9`; accent `#ad9fff`.
- Spacing uses a 4-point base: 4, 8, 12, 16, 20, 24, 32, 40, 48, 64.
- Radius tokens: row 6, control 8, menu 12, dialog 16.
- Typography tokens: secondary 12px, control 14px, heading 20px, body 16px; body line height 1.65 and UI line height 1.4.
- Standard targets: control 36px, icon 32px, row 32px; touch targets 48px and touch rows 52px.
- All UI color, type, radius, and spacing choices must reuse existing tokens or add a named token through the source-of-truth system. No inline hex/OKLCH/font-family values in component styles. Check contrast in both themes, including hover/selected/disabled states.
- Do not introduce a generic SaaS dashboard aesthetic, loud gradients, decorative glass, unnecessary cards, excessive borders, or animation for frequently repeated actions. Quiet does not mean low-contrast or vague.

### Feature and component map

Treat each component as a focused design problem with a defined job, while preserving a consistent shell and shared interaction language. This is a map of product domains, not a claim that every roadmap item is complete.

1. **Workspace welcome / recent workspaces** — open a local folder, reopen a recent workspace, and clearly communicate when no workspace is open. Do not make the folder picker the only way to reopen a recent workspace.
2. **Application shell** — top/title area, single tab strip, left navigation rail and pane, optional right pane, status strip, menus, overlays, and focus mode. Shell state must not leak into feature-domain logic.
3. **File Explorer** — browse/create/rename/move/delete files and folders, sorting, active-note reveal, drag/drop, context menus, duplicate-name disambiguation, and honest destructive-action confirmation.
4. **Single-surface editor** — title plus directly editable Markdown content, selection/cursor fidelity, inline formatting, headings, lists/tasks, tables, callouts, code, links, embeds/media, autosave, dirty/conflict behavior, and blank-note affordance. No separate read/edit toggle.
5. **Tabs and document lifecycle** — one tab strip, dirty/pinned state, reopen closed tab, keyboard navigation/reordering where implemented; do not design split panes or pop-outs into MVP.
6. **Quick Open** — fast fuzzy file/alias opener, recents on empty query, clear no-match/create behavior, keyboard selection, and path disambiguation. Keep it distinct from command execution.
7. **Command Palette and commands** — fuzzy command execution, categories, shortcuts, recent commands and pinned commands where implemented. Use the single CommandService registry; never invent duplicate command sources.
8. **Hotkey settings** — searchable/scan-friendly command list, capture-to-assign, reset, collision warning and disabled-loser state. Respect platform labels and defaults in the roadmap; no Ctrl+E read-mode binding.
9. **Search** — indexed queries and supported operators only; debounced results, clear syntax/errors, context, sorting, empty/recent states, and bounded result behavior. Do not present unimplemented operators as available.
10. **Favorites** — persistent shortcuts and groups, reorder/edit/remove, missing-target recovery, and the canonical word “Favorite,” never “Bookmark.”
11. **Outline and link preview** — live headings for the active note, scroll-to-heading, resolved-link preview, full-path disambiguation; preview should not steal focus or obstruct editing.
12. **Knowledge links and backlinks** — wikilinks/Markdown links, autocomplete, unresolved targets, outgoing links, linked and unlinked mentions, and link-aware rename. Make resolution state understandable without turning every link into a badge.
13. **Attachments and embeds** — import, naming/collision feedback, images/audio/video/PDF/note embeds and unsupported-format behavior. Respect path safety and safe rendering.
14. **Properties and metadata** — frontmatter-backed property display/editing with lossless round-trip, per-workspace type registry, malformed-YAML handling, and clear distinction between stored data and inferred presentation.
15. **Today and Daily Notes** — Today is an aggregate, not the Daily Note. Show scheduled tasks, overdue/due-today work, recent notes, Daily Note state, and quick actions; missing daily note has an explicit create action.
16. **Tasks and quick capture** — checkbox-first progressive metadata, due vs scheduled distinction, quick capture destinations, and conflict-safe edits. Avoid implying recurrence, dependencies, or natural-language parsing in MVP.
17. **Calendar and event notes** — event notes and scheduled tasks as native sources; clear all-day/time-block distinction, drag semantics, and explicit handling of due dates that must not be changed by calendar movement.
18. **Tags** — browse nested/flat tags, counts and sorting; selecting a tag should connect naturally to search.
19. **Collections and Views** — saved structured queries with multiple presentations. A View belongs to a Collection; table/list/cards/board/calendar should share query semantics and consistent empty/loading/error behavior. Verify implementation before claiming each view is complete.
20. **Graph** — local/global knowledge graph navigation, readable labels, understandable edge meaning, useful empty/disconnected states, and keyboard alternatives. Keep graph secondary to writing and search.
21. **Canvas** — spatial thinking surface with clear note/link cards and reliable navigation back to source notes. Canvas is distinct from Graph; do not conflate them.
22. **Recovery/history** — snapshot list, restore (snapshot current version first), copy, retention explanation, and honest “recovery is not backup” language.
23. **Settings and appearance** — light/dark/system, accent, font size, zoom, title/tab/ribbon/frame settings, font/interface controls, native menus, and keyboard navigation. Settings should be grouped by user goal, not implementation module.
24. **Import** — Markdown, Textbundle, and HTML scope only for MVP; show attachment mapping and link conversion outcomes. Do not promise deferred importers.
25. **Updates and release feedback** — clear stable/prerelease semantics, offline-silent update checks, verified downloads, and understandable install/launch/download failures.
26. **WSL connection (post-MVP / maintenance-only until MVP ships)** — distro → Linux user → path; precise status and error handling, per-user isolation, and explicit connection/workspace distinction. Do not let WSL feature work block the native local-first MVP.
27. **MCP and external-agent connection surfaces** — if present in the current tree, inspect the actual implementation and approval/security boundaries before designing them. Treat agent connections as an integration capability, not as the core note-taking workflow; do not invent tools, permissions, or successful connections.

### Design and implementation boundaries

- Canonical terms are defined in this file and `docs/roadmap.md`. Never rename Workspace, Connection, Collection, View, Daily Note, Today, Event note, Favorite, Task, Due, Scheduled, Quick Open, or Command Palette.
- Roadmap and ADRs determine scope. The feature-reference document is not a delivery plan. A feature listed as deferred remains deferred unless the user explicitly changes scope.
- Keep service boundaries intact: `WorkspaceService`, `NoteService`, `SearchService`, `CommandService`, and `RecoveryService` where applicable. UI must not bypass services or reach into filesystem internals.
- Renderer state should use `workspaceId + relativePath` as the workspace note identity boundary. Do not leak machine-local cache/index details into traveling workspace definitions.
- Do not refactor working application logic merely to achieve a visual redesign. Prefer isolated component styling/layout changes and narrow interaction changes backed by tests.
- Never remove routes, components, settings, keyboard shortcuts, or behavior as a side effect of a redesign without explicit approval.
- Every UI proposal should identify: user job, entry point, information hierarchy, primary action, secondary actions, keyboard/focus model, states, responsive behavior, token usage, dependencies, and how the design will be validated.
- For a single component, design the component in context and include default, hover, focus-visible, active, disabled, loading, error, and success states where those states make sense. Do not force nonsensical states on static elements.
- For broader feature work, prototype genuinely different options behind an isolated prototype route or preview before changing production UI. Keep prototypes separate from production components until a direction is selected.
- Test representative edge cases: empty/one/large datasets, long filenames and paths, duplicate names, malformed frontmatter, Unicode/CJK/emoji/RTL, missing links/attachments, narrow windows, dark mode, keyboard-only use, reduced motion, dirty edits plus external file changes, and partial-index limits.
- Keep animation rare and purposeful. High-frequency actions (Quick Open, Command Palette, toggles, list navigation, shortcuts) should respond immediately. Respect reduced motion and avoid layout animation that interferes with editing or selection.

### Current status discipline

Use `docs/roadmap.md` for intended scope and `docs/archive/status/mvp-status.md` for evidence/status. This file describes product truth and design constraints; it is not a replacement for the roadmap or verification log. When code, roadmap, and status disagree, report the exact disagreement with file/line evidence and ask before changing product semantics. Do not silently rewrite historical verification records.
