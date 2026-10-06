# Obsidian Current Feature Reference

## Document Metadata

Research completed: 2026-09-22

Snapshot scope: current Obsidian public release plus explicitly marked Catalyst / early-access release notes. This document is a research reference for Takenotes planning. It is not a Takenotes implementation plan and contains no code changes.

Primary source hierarchy used: official Obsidian Help, official Obsidian changelog, official Obsidian developer docs, official Sync/Publish/Web Clipper/CLI docs. Community functionality is separated from core features.

## Executive Summary

Obsidian is a local-first, Markdown-first knowledge-management app built around a **vault**: a normal local folder containing Markdown notes, attachments, `.base` files, `.canvas` JSON Canvas files, and a per-vault `.obsidian` configuration folder. Its major differentiator is a first-party metadata/index layer over normal files: internal links, backlinks, aliases, tags, frontmatter properties, search, graph, Bases, Canvas, tabs/workspaces, recovery, Sync, Publish, Web Clipper, official CLI, URI automation, theming, and community plugins.

For Takenotes, the essential lesson is not to clone every Obsidian feature. The features that strongly fit Takenotes' identity are: reliable filesystem/vault semantics, Markdown editor, atomic note CRUD, link-aware renames, file explorer, metadata index, search, backlinks/outgoing links, tags/properties, recovery, and keyboard-first navigation. Higher-level views such as graph, Canvas, Bases, Publish, Sync, and broad plugin APIs depend on that foundation.

## Current Versions

| Channel | Latest version found | Date | Notes |
| --- | ---: | --- | --- |
| Public desktop | 1.13.7 | 2026-08-12 | Latest public desktop changelog entry at research time. |
| Public mobile | 1.13.8 | 2026-08-20 | Latest public mobile changelog entry at research time. |
| Catalyst / early-access desktop | 1.14.2 | 2026-09-15 | Not public stable. |
| Catalyst / early-access mobile | 1.14.2 | 2026-09-15 | Not public stable. |

Important Catalyst-only items: opening files outside vaults, color highlights, Bases Kanban, Bases folder-column drag behavior, full RTL workspace flip, mobile Quick Capture Locations/widgets/location variables, and MathJax 4.1.3. Do not treat these as public stable.

Sources: [Changelog JSON](https://obsidian.md/changelog.json), [Desktop 1.14.2 EA](https://obsidian.md/changelog/2026-09-15-desktop-v1.14.2/), [Mobile 1.14.2 EA](https://obsidian.md/changelog/2026-09-15-mobile-v1.14.2/), [Desktop 1.13.7 public](https://obsidian.md/changelog/2026-08-12-desktop-v1.13.7/), [Mobile 1.13.8 public](https://obsidian.md/changelog/2026-08-20-mobile-v1.13.8/).

## Product Philosophy

Obsidian's docs emphasize durable, non-proprietary local files: notes are Markdown plain text in a vault; attachments are regular files; users can use other editors and file managers; Obsidian automatically refreshes the vault after external changes. Obsidian-specific behavior is layered through configuration files, metadata cache, core plugins, optional paid services, and community plugins.

Feature labels used below:

- `CORE`: built into the app experience.
- `CORE_PLUGIN`: official built-in plugin, usually toggleable.
- `OPTIONAL_OFFICIAL_SERVICE`: paid or separate official service.
- `COMMUNITY_EXTENSION`: community plugin/theme or official community plugin.
- `DESKTOP_ONLY`, `MOBILE`, `IOS_ONLY`, `ANDROID_ONLY`.
- `CATALYST`: only found in early-access notes/docs requiring unreleased version.
- `DEPRECATED`, `REMOVED`.

Sources: [How Obsidian stores data](https://help.obsidian.md/data-storage), [Core plugins](https://help.obsidian.md/plugins), [Community plugins](https://help.obsidian.md/community-plugins).

## Storage / Vault Model

**Type:** `CORE`  
**Platforms:** Desktop + Mobile

A vault is a folder on the local filesystem. It contains notes, attachments, subfolders, and Obsidian-specific configuration. Obsidian can create new vaults, open existing folders as vaults, open multiple folders as separate vaults, rename/move/remove vaults in the vault switcher, and transfer settings by copying `.obsidian`.

### Normal user content

- Markdown notes: `.md`.
- Bases: `.base`.
- Canvas: `.canvas` using the open JSON Canvas format.
- Attachments: images (`.avif`, `.bmp`, `.gif`, `.jpeg`, `.jpg`, `.png`, `.svg`, `.webp`), audio (`.flac`, `.m4a`, `.mp3`, `.ogg`, `.wav`, `.webm`, `.3gp`), video (`.mkv`, `.mov`, `.mp4`, `.ogv`, `.webm`), PDFs.
- Folders and nested folders are normal filesystem directories.

### Obsidian-specific metadata/configuration

- Per-vault config folder: default `.obsidian`, stored at vault root. Contains preferences such as hotkeys, themes, community plugins, workspace layouts, and plugin settings.
- Config folder can be overridden to another hidden folder name beginning with `.`.
- Global settings live in OS app-data locations (`~/Library/Application Support/obsidian`, `%APPDATA%\Obsidian\`, `$XDG_CONFIG_HOME/obsidian` or `~/.config/obsidian`).
- IndexedDB is used for backend storage such as Sync connection state and metadata cache persistence.
- Metadata cache tracks links, headings, blocks, tags, properties/frontmatter, etc. It powers graph, outline, backlinks, search-related features and can be rebuilt from Settings.

### Filesystem behavior

- Obsidian automatically refreshes after external file changes.
- Renaming a note updates all links to that file if automatic internal-link updating is enabled; otherwise users can be prompted.
- Deleted files can go to system trash, `.trash` inside the vault, or be permanently deleted depending on Settings.
- Obsidian respects OS filename limits and warns users to choose cross-platform-safe names if syncing.
- Vaults within vaults are discouraged because vault-local internal links may not update correctly.
- Network drive support exists but recent public changelog fixed a network-drive vault bug in 1.13.6, so it is a documented area of complexity rather than a simple guarantee.
- Symlinks and junctions are allowed but strongly discouraged; Obsidian disallows loops, ignores symlinks that would duplicate the vault, warns about sync conflicts/data loss, cannot move across device boundaries with link updates, and file symlinks are not officially supported.
- Public stable does not support opening arbitrary files outside the vault as normal Obsidian files. **Catalyst 1.14.2 desktop** adds “Open file from outside the vault...” and OS “Open with” integration.

Takenotes relevance: **Essential**.  
Implementation dependency: canonical workspace identity, safe path normalization, file watcher, atomic note writes, link-aware move/rename, attachment policy, config-vs-content separation.

Sources: [How Obsidian stores data](https://help.obsidian.md/data-storage), [Manage vaults](https://help.obsidian.md/manage-vaults), [Manage notes](https://help.obsidian.md/manage-notes), [Configuration folder](https://help.obsidian.md/configuration-folder), [Accepted file formats](https://help.obsidian.md/file-formats), [Symbolic links and junctions](https://help.obsidian.md/symlinks), [Settings](https://help.obsidian.md/settings), [Desktop 1.14.2 EA](https://obsidian.md/changelog/2026-09-15-desktop-v1.14.2/).

## Core Note Management

**Type:** `CORE`

Users can create notes via `Ctrl/Cmd+N`, command palette, file explorer, links to nonexistent notes, Daily Notes, Unique Note Creator, Bases, URI, CLI, and mobile actions. Active notes can be renamed with `F2` or inline title; deletes use active-note menu/command/file explorer. Rename automatically updates links to renamed files when enabled. Move operations are available through drag/drop and “Move file to...” context menu.

Takenotes relevance: **Essential**.  
Dependencies: note CRUD, atomic saves, conflict detection, link index, filesystem watcher, trash strategy.

Sources: [Manage notes](https://help.obsidian.md/manage-notes), [Internal links](https://help.obsidian.md/links), [File explorer](https://help.obsidian.md/plugins/file-explorer).

## File Explorer

**Type:** `CORE_PLUGIN`  
**Platforms:** Desktop + Mobile

File Explorer browses notes and accepted files inside the vault. It supports:

- Create new note in default location or inside a chosen folder.
- Create folders/subfolders.
- Rename/delete files and folders.
- Move files/folders with drag-and-drop or context menu.
- Multi-selection: `Alt/Opt-click` for individual files, `Shift-click` for ranges; selected files can be dragged or bookmarked.
- Sort ascending/descending by filename, modified time, or created time.
- Auto-reveal active file.
- Expand all / collapse all folders.
- Context menus with file-specific operations.
- Drag a file from File Explorer into a note to create a link.
- Drag a file into a File Explorer folder to copy/move it.
- Drag external supported files into Obsidian to import copies into the attachment folder; dragging an external folder into desktop app imports the folder and preserves structure in public 1.13.
- Drag/drop participates with search results, backlinks, links, tabs, sidebars, bookmarks, and external apps.

Takenotes relevance: **Essential**.  
Dependencies: workspace tree model, file operations with constraints, multi-select state, drag/drop, rename/move link updating, trash policy.

Sources: [File explorer](https://help.obsidian.md/plugins/file-explorer), [Drag and drop](https://help.obsidian.md/drag-and-drop), [Desktop 1.13 public](https://obsidian.md/changelog/2026-07-30-desktop-v1.13.4/).

## Markdown Editor

**Type:** `CORE`

Obsidian supports three user-facing note views/modes:

- **Reading view:** rendered Markdown without source syntax; good for reading/review. Toggle with view switcher or `Ctrl/Cmd+E`.
- **Editing view / Live Preview:** default editing mode. Shows formatted content inline and hides most syntax until cursor enters the formatted region. Often avoids switching to Reading view.
- **Editing view / Source mode:** displays all Markdown syntax exactly as written.

### Markdown and Obsidian-flavored syntax

Public docs state Obsidian supports CommonMark, GitHub Flavored Markdown, and LaTeX. Supported user syntax includes:

- Paragraphs, line breaks, strict line break option.
- Headings H1-H6.
- Bold, italic, nested bold/italic, bold+italic.
- Strikethrough `~~text~~`.
- Highlights `==text==`; **colored highlights are Catalyst 1.14 only** using color emoji/swatches.
- Blockquotes.
- Ordered/unordered/nested lists.
- Task lists `- [ ]` and `- [x]`; any non-space character in brackets marks complete; Reading view checkboxes are toggleable.
- Internal links and external links.
- Images and external images, with size syntax.
- Horizontal rules.
- Inline code and fenced/indented code blocks; Prism in Reading view for syntax highlighting; editing views may render highlighting differently.
- Markdown tables; Live Preview table context menu can add/delete/sort/move rows/columns and align columns.
- Footnotes: named and inline; inline footnotes work in Reading view, not Live Preview.
- Comments `%%...%%`, visible only in Editing view.
- Escaped characters with backslash.
- Sanitized HTML; Markdown is not rendered inside HTML elements; HTML blocks must be self-contained.
- Math using MathJax/LaTeX syntax (`$inline$`, `$$block$$`). **Catalyst 1.14.1 says math rendering uses MathJax 4.1.3, replacing MathJax 3 and Temml.**
- Mermaid diagrams in fenced `mermaid` blocks, with internal-link class support; Mermaid diagram links do not show in Graph view. Public 1.13 added a one-time banner asking users to confirm Mermaid rendering.
- Callouts `> [!type]`, foldable callouts, custom CSS callouts.
- Folding for headings and indented lists; fold/unfold all; fold more/less commands.
- Multiple cursors and standard editor keyboard shortcuts.
- Smart lists, auto-paired brackets and Markdown syntax, line numbers, indentation guides, tab/space indentation settings.

Takenotes relevance: **Essential** for core Markdown; **Later** for full parity (Mermaid, math, callouts, table visual editor).  
Dependencies: editor component, Markdown parser/renderer, source/preview model, syntax extensions, cursor-safe widgets, save pipeline.

Sources: [Views and editing mode](https://help.obsidian.md/edit-and-read), [Basic formatting syntax](https://help.obsidian.md/syntax), [Advanced formatting syntax](https://help.obsidian.md/advanced-syntax), [Obsidian Flavored Markdown](https://help.obsidian.md/obsidian-flavored-markdown), [HTML content](https://help.obsidian.md/html), [Callouts](https://help.obsidian.md/callouts), [Folding](https://help.obsidian.md/folding), [Settings](https://help.obsidian.md/settings), [Desktop 1.14.0 EA](https://obsidian.md/changelog/2026-09-02-desktop-v1.14.0/), [Desktop 1.14.1 EA](https://obsidian.md/changelog/2026-09-08-desktop-v1.14.1/).

## Live Preview

**Type:** `CORE`

Live Preview is the default editing mode. It renders many Markdown constructs inline while preserving editability. Syntax becomes visible when the cursor interacts with formatted content. Public 1.13 includes improved image interactions: keyboard selection of images, delete/cut/copy image embeds, resize with `+`/`-`/`0`, and full-screen image viewer integration.

Takenotes relevance: **Strong candidate** after reliable source editing.  
Dependencies: bidirectional parser/editor widgets, selection model, syntax hiding, widget lifecycle.

Sources: [Views and editing mode](https://help.obsidian.md/edit-and-read), [Desktop 1.13 public](https://obsidian.md/changelog/2026-07-30-desktop-v1.13.4/).

## Reading View

**Type:** `CORE`

Reading view renders Markdown as readable HTML, supports links, embeds, checkboxes, callouts, math, Mermaid (after confirmation in current public), images, media, PDFs, and page preview. It is distinct from Live Preview because it is not an editing mode.

Takenotes relevance: **Strong candidate**.  
Dependencies: renderer, safe HTML sanitization, link handling, attachment embed pipeline.

Sources: [Views and editing mode](https://help.obsidian.md/edit-and-read), [HTML content](https://help.obsidian.md/html).

## Internal Links

**Type:** `CORE`

Obsidian supports internal links to notes, headings, blocks, and attachments. Supported forms include:

- `[[Note]]` and `[[Note.md]]`.
- Markdown form: `[Note](Note%20name.md)`.
- Folder paths from vault root: `[[Projects/Note]]`.
- Aliases/display text: `[[Note|Alias]]`, `[[Note#Heading|Alias]]`.
- Heading links: `[[#Heading]]`, `[[Note#Heading]]`, nested heading paths such as `[[Note#Heading#Subheading]]`.
- Cross-vault heading search in link autocomplete: `[[## header]]`.
- Block links: `[[Note#^block-id]]`; block IDs can be generated from suggestions or manually set as `^id` using Latin letters, numbers, dashes.
- Cross-vault block search syntax in autocomplete: `[[^^block]]`.
- Links to any accepted file format; non-Markdown links need file extension.
- Links to nonexistent notes; opening/following can create missing notes, and folder path in link controls creation location.
- Markdown-link generation when `Use [[Wikilinks]]` is disabled.
- Link generation settings: shortest path when possible, relative path, absolute path in vault; Wikilinks on/off; automatic link updates on rename.
- Excluded files are deprioritized in link suggestions.

Ambiguous names are handled by path disambiguation/link generation settings; docs explicitly warn that unlinked mentions can refer to different notes with the same name and can show full path on hover. Takenotes should assume duplicate names are a first-class problem.

Takenotes relevance: **Essential**.  
Dependencies: path identity, Markdown parser, link resolver, note index, heading/block index, alias index, rename/move transaction that rewrites links.

Sources: [Internal links](https://help.obsidian.md/links), [Aliases](https://help.obsidian.md/aliases), [Settings](https://help.obsidian.md/settings).

## Embeds

**Type:** `CORE`

Embeds/transclusion use `!` before internal links. Embedded files display inline and update when source changes. Supported forms:

- Notes: `![[Note]]`.
- Headings: `![[Note#Heading]]`.
- Blocks/lists: `![[Note#^block-id]]`.
- Images with optional dimensions: `![[Image.jpg|100x145]]` or external image Markdown with size syntax.
- Audio files.
- PDFs, including page links `#page=N` and embedded height `#height=400`.
- Canvas: `![[My canvas.canvas]]`; embedded canvases show shapes but not text inside cards.
- Bases: `![[File.base]]`, `![[File.base#View]]`.
- Search results through `query` code blocks.
- Web pages via HTML `iframe`, YouTube/Twitter external image syntax, and Canvas web cards.

Takenotes relevance: **Strong candidate** for note/image/PDF embeds; **Later** for Canvas/Bases/search embeds.  
Dependencies: internal link resolver, renderer, attachment pipeline, block/heading extraction, safe external-content rules.

Sources: [Embed files](https://help.obsidian.md/embeds), [Search](https://help.obsidian.md/plugins/search), [Embed web pages](https://help.obsidian.md/embed-web-pages), [Canvas](https://help.obsidian.md/plugins/canvas), [Create a base](https://help.obsidian.md/bases/create-base).

## Backlinks

**Type:** `CORE_PLUGIN`  
**Platforms:** docs mark desktop-only for Backlinks page, but mobile can access sidebar/plugin commands generally.

Backlinks show incoming links for the active note. Sections:

- **Linked mentions:** notes containing internal links to active note.
- **Unlinked mentions:** text occurrences of active note name; aliases also participate.
- Backlinks pane in right sidebar.
- Linked backlinks tab for a specific note independent of active note.
- Backlinks in document at bottom of note.
- Collapse results, show more context, sort order, search filter.
- Excluded files do not appear in unlinked mentions.
- Unlinked alias mentions can be linked; link becomes `[[Canonical note|Alias]]`.

Backlinks are calculated from parsed internal links plus text search against note names/aliases.

Takenotes relevance: **Essential** after link index.  
Dependencies: internal-link index, alias index, full-text/token search, active note identity, incremental watcher/parser updates.

Sources: [Backlinks](https://help.obsidian.md/plugins/backlinks), [Aliases](https://help.obsidian.md/aliases).

## Outgoing Links

**Type:** `CORE_PLUGIN`  
**Platforms:** docs mark desktop-only.

Outgoing Links shows, for the active note:

- **Links:** all links in active note; click to open.
- **Unlinked mentions:** text in active note matching names/aliases of other notes; click button to create link.
- Full path shown on hover when an unlinked mention could refer to different notes.
- Code-block caveat: unlinked mentions can be linked inside code blocks, but links in code blocks do not appear under Links.

Takenotes relevance: **Strong candidate**.  
Dependencies: per-note outgoing-link parser, alias/name index, edit transaction to create links.

Sources: [Outgoing links](https://help.obsidian.md/plugins/outgoing-links).

## Tags

**Type:** `CORE` + `CORE_PLUGIN` Tags view

Tags can be inline (`#project`) or stored in the `tags` property. Nested tags use slashes (`#project/frontend`). Tags support autocomplete, clicking to search, Search `tag:` operator, Tags view counts, nested tree/flat display, sort by name/frequency, expand/collapse nested levels. Tag rules: letters, numbers, `_`, `-`, `/`, Unicode/emoji; at least one non-numeric char; case-insensitive; no spaces.

Takenotes relevance: **Strong candidate**.  
Dependencies: Markdown/YAML parser, tag tokenizer, search index, tag tree aggregation.

Sources: [Tags](https://help.obsidian.md/tags), [Tags view](https://help.obsidian.md/plugins/tags), [Search](https://help.obsidian.md/plugins/search).

## Properties

**Type:** `CORE` + `CORE_PLUGIN` Properties view

Properties are Obsidian's UI over YAML/frontmatter at the top of Markdown files. Add via command, `Cmd/Ctrl+;`, More actions, or typing `---` at file start.

Supported property types:

- Text.
- List.
- Number.
- Checkbox.
- Date.
- Date & time.
- Tags (special type only for `tags`).

Default properties: `tags`, `aliases`, `cssclasses`. Publish-specific properties include `publish`, `permalink`, `description`, `image`, `cover`. Deprecated property aliases `tag`, `alias`, `cssclass` were deprecated in 1.4 and default support dropped in 1.9; Format Converter can migrate them.

Features:

- Property type assigned per property name across vault.
- Properties can display visible, hidden, or source YAML.
- Property search syntax (`[property]`, `[property:value]`, `null`, subqueries, regex).
- Properties view: File properties for active note; All properties with type/frequency, sort, click-to-search, global rename.
- Keyboard navigation and Vim-like property navigation.
- Templates merge template properties into notes.
- Not supported: nested properties UI, bulk editing in core, Markdown rendered in properties.
- Invalid YAML is a problem space; docs recommend Source mode for nested properties.

Takenotes relevance: **Strong candidate**.  
Dependencies: YAML parser/preserver, property schema registry, source/visual editing bridge, search index, rename property migration.

Sources: [Properties](https://help.obsidian.md/properties), [Properties view](https://help.obsidian.md/plugins/properties), [Search properties](https://help.obsidian.md/plugins/search), [Format converter](https://help.obsidian.md/plugins/format-converter).

## Search

**Type:** `CORE_PLUGIN`  
**Platforms:** Desktop + Mobile

Search finds data in notes and canvases. It opens from sidebar or `Ctrl/Cmd+Shift+F`. If editor text is selected, opening Search searches that text. Empty Search shows recent search terms.

Current grammar:

- Words match independently; default all words required.
- Exact phrases in quotes, with escaped quotes.
- `OR`, parentheses, negation `-`.
- Comparators in square brackets or quotes for property search (`[duration:<5]`).
- Regex delimited by `/.../`, JavaScript flavor, combinable with operators.
- Operators: `file:`, `path:`, `content:`, `match-case:`, `ignore-case:`, `tag:`, `line:`, `block:`, `section:`, `task:`, `task-todo:`, `task-done:`.
- Property queries: `[property]`, `[property:value]`, `[property:null]`, property/value subqueries, `OR`, exact matching, regex.
- Nested `section:` is documented in changelog historically; current docs include section and block operators.

UI features:

- Explain search term.
- Match case toggle.
- Sort by filename, modified time, created time ascending/descending.
- Collapse results, show more context.
- Copy search results.
- Embedded searches via `query` code blocks (not supported by Publish).
- Excluded files hidden from results.

Takenotes relevance: **Essential**.  
Dependencies: incremental full-text index, parser for search grammar, content/path/tag/property indexes, result context extraction, embedded query renderer.

Sources: [Search](https://help.obsidian.md/plugins/search), [Changelog 1.13 public](https://obsidian.md/changelog/2026-07-30-desktop-v1.13.4/).

## Quick Switcher

**Type:** `CORE_PLUGIN`

Quick Switcher opens with `Ctrl/Cmd+O`, ribbon, or mobile plus icon. It fuzzy-searches notes by name or alias, supports arrow navigation, creates a new note when no match (`Enter`) or exact name despite similar matches (`Shift+Enter`), opens in new tab (`Ctrl/Cmd+Enter`), and shows recent notes when query empty. Public docs say autocomplete switches to a simpler algorithm above 10,000 items; **Catalyst 1.14.2 removes that fallback so fuzzy matching is always used**.

Quick Switcher++ is not a core feature; it is community/plugin territory.

Takenotes relevance: **Essential**.  
Dependencies: note name/alias index, fuzzy matcher, recents, creation flow, tab integration.

Sources: [Quick switcher](https://help.obsidian.md/plugins/quick-switcher), [Desktop 1.14.2 EA](https://obsidian.md/changelog/2026-09-15-desktop-v1.14.2/).

## Command Palette

**Type:** `CORE_PLUGIN`

Command Palette runs any command from keyboard (`Ctrl/Cmd+P`) and shows available commands/hotkeys. It supports fuzzy matching, arrow navigation, plugin commands, recently used commands (since 1.8.3), and pinned commands configured in plugin settings. Hotkeys can be assigned to commands independently.

Takenotes relevance: **Essential**.  
Dependencies: command registry, fuzzy matcher, keybinding system, plugin command registration if extensible.

Sources: [Command palette](https://help.obsidian.md/plugins/command-palette), [Hotkeys](https://help.obsidian.md/hotkeys).

## Tabs and Workspace

**Type:** `CORE`

Desktop workspace consists of ribbon, left/right sidebars, sidebar tab groups, central tab groups, tabs, and status bar. Mobile workspace has tabs via tab counter, sidebars via gestures, bottom navigation bar, ribbon menu, and editor toolbar.

Tabs support:

- New tab (`Ctrl/Cmd+T`).
- Link modifiers: navigate, open in new tab, new tab group, new window.
- Drag tabs to reorder, move between tab groups/windows, or create tab groups.
- Split right / split down.
- Resize tab groups and sidebars.
- Move/open tab in new pop-out window.
- Pin tab; links from pinned tab open separately.
- Switch next/previous/numbered tabs; reopen recently closed tab (`Ctrl/Cmd+Shift+T`).
- Stack tab groups (“sliding notes”).
- Linked views: local graph, backlinks, outline linked to note tab.
- Per-tab history was introduced with tabs; forward/back navigation exists in tab title bar.
- Workspaces plugin saves/restores layouts containing open files/tabs and sidebar width/visibility.
- Quitting/restarting restores previously open vaults/windows (documented in historical changelog).

Pop-out windows are desktop-only, associated with their vault window; closing vault window closes pop-outs; files can move only between windows for same vault.

Takenotes relevance: **Strong candidate** for tabs/splits/history; **Later** for stacked tabs/workspace save.  
Dependencies: view model, tab identity, navigation history, layout persistence, popout process/window model.

Sources: [Workspace](https://help.obsidian.md/workspace), [Tabs](https://help.obsidian.md/tabs), [Sidebar](https://help.obsidian.md/sidebar), [Pop-out windows](https://help.obsidian.md/pop-out-windows), [Workspaces](https://help.obsidian.md/plugins/workspaces), [Status bar](https://help.obsidian.md/status-bar), [Ribbon](https://help.obsidian.md/ribbon).

## Sidebars

**Type:** `CORE`

Left/right sidebars hold plugin tabs such as File Explorer, Search, Backlinks, Outgoing Links. Desktop can drag notes into sidebars. Mobile/smaller tablets open hidden sidebars by swipes or commands. Sidebar tabs can be opened by plugin enablement/commands/dragging notes, rearranged, closed where allowed, pinned, and grouped.

Takenotes relevance: **Strong candidate**.  
Dependencies: pluggable pane system, sidebar layout persistence, mobile navigation model.

Sources: [Sidebar](https://help.obsidian.md/sidebar), [Workspace](https://help.obsidian.md/workspace).

## Navigation

**Type:** `CORE`

Navigation includes forward/back history, link modifiers, Quick Switcher, Command Palette, File Explorer reveal, graph clicking, search/backlink result clicking, bookmarks, outline heading clicks, URI/CLI commands, and mobile navigation bar. Tabs maintain navigation history.

Takenotes relevance: **Essential** basic; **Later** full parity.  
Dependencies: canonical resource identity, command registry, tab history.

Sources: [Tabs](https://help.obsidian.md/tabs), [Mobile app](https://help.obsidian.md/mobile), [Obsidian URI](https://help.obsidian.md/uri), [Obsidian CLI](https://help.obsidian.md/cli).

## Workspaces

**Type:** `CORE_PLUGIN`

Workspaces save/load/delete application layouts. A workspace contains open files/tabs plus sidebar width and visibility. Users manage via ribbon or command palette.

Takenotes relevance: **Later**.  
Dependencies: layout serialization, tab/pane IDs, workspace registry.

Sources: [Workspaces](https://help.obsidian.md/plugins/workspaces).

## Graph View

**Type:** `CORE_PLUGIN`  
**Platforms:** Desktop + Mobile

Graph view visualizes vault relationships:

- Nodes/circles are notes; lines/edges are internal links.
- More referenced nodes appear larger.
- Hover highlights connections; click opens note; right-click context menu.
- Pan/zoom via mouse/keyboard.
- Filters: search files using Search grammar, tags toggle, attachments toggle, existing files only, orphans toggle, excluded files hidden.
- Groups: search-term-based colored groups.
- Display: arrows, text fade threshold, node size, link thickness, time-lapse animation.
- Forces: center force, repel force, link force, link distance.
- Local Graph shows notes connected to active note and has all graph settings plus depth slider.

Takenotes relevance: **Later**.  
Dependencies: reliable link graph, tag/attachment index, graph rendering, search filters.

Sources: [Graph view](https://help.obsidian.md/plugins/graph), [Search](https://help.obsidian.md/plugins/search).

## Canvas

**Type:** `CORE_PLUGIN`

Canvas is Obsidian's visual note-taking space. It saves `.canvas` files using the open [JSON Canvas](https://jsoncanvas.org/) format.

Capabilities:

- Infinite 2D space.
- Text cards with Markdown, links, and code blocks; can convert text card to file.
- Note cards from vault; edit in place.
- Media cards (images, audio, PDFs, unrecognized files).
- Webpage cards via URL or dragged browser URL; open in browser.
- Add all files from a dragged folder.
- Select individual/multiple cards; shift-select; select all.
- Move, duplicate with Alt/Option-drag, axis constrain with Shift, disable snapping with Space.
- Resize cards; preserve aspect with Shift.
- Directed edges/connections, reconnect/disconnect, navigate to source/target, labels.
- Card/edge colors.
- Groups, group rename, group selected cards.
- Pan and zoom, zoom to fit, zoom to selection, reset zoom.
- Embed canvas in note; embeds show shapes only, not text inside cards.
- Changelog documents readonly mode, canvas settings, global search for text cards, background images for groups, jump to group, narrow to block, export as image improvements.

Takenotes relevance: **Later** or **External/plugin territory**.  
Dependencies: graph/canvas file model, embedded editor, file card resolver, renderer, spatial UI, JSON persistence.

Sources: [Canvas](https://help.obsidian.md/plugins/canvas), [Accepted file formats](https://help.obsidian.md/file-formats), [Canvas changelog 1.1](https://obsidian.md/changelog/2023-02-22-desktop-v1.1/).

## Bases

**Type:** `CORE_PLUGIN`  
**Public:** `.base` files, table/cards/list layouts in public 1.13 line.  
**Catalyst:** Kanban requires 1.14 early access. Map requires separate official community Maps plugin.

Bases create database-like views over Markdown notes and their properties. Source Markdown files remain the data; Bases view definitions are saved as `.base` files or embedded as `base` code blocks. This is not a traditional database taking ownership of content.

Capabilities:

- `.base` files.
- Multiple views per base.
- Toolbar: view menu, results, sort, filter, properties/formulas, search, new file.
- Filter all views or current view using properties, file properties, operators, values, functions, AND/OR/NOT groups, advanced raw syntax editor.
- Sort by one or more properties; group by one property.
- Results menu can limit, copy to clipboard, export CSV.
- Create new files from a view.
- Search displayed properties.
- Embed base file or default view via `![[File.base]]` / `![[File.base#View]]`; embed base syntax directly in code block.
- Formulas can compute values from note properties, file properties, and other formulas; support arithmetic, comparison, boolean ops, functions, strings, numbers, booleans, dates, lists, objects; can be used in views, filters, sort.
- Table view: rows are files, columns properties, row heights, summaries (empty/filled/unique; numeric/date/checkbox summaries; custom formula summaries), cell selection/copy/paste/undo/redo/navigation.
- Cards view: grid with optional cover image from property (local attachment, external URL, hex color), card size, image fit/aspect ratio.
- List view: bulleted/numbered/none markers, indented properties, separators.
- Kanban view (`CATALYST` 1.14): cards organized by grouped property; drag cards to update property; create note in column; drag column order; hide empty columns; cover images. Catalyst 1.14.2 adds folder-column movement when grouped by `file.folder` and error feedback.
- Map view: requires Obsidian 1.10 and official community Maps plugin; pins from coordinate properties, marker icons/colors, tile settings.
- Groups are collapsible in table/cards/list in Catalyst 1.14.

Takenotes relevance: **Later**; perhaps **Strong candidate** only for lightweight property table/search views.  
Dependencies: robust properties/YAML layer, metadata index, formula engine, query/filter language, editable table/grid UI, incremental updates.

Sources: [Introduction to Bases](https://help.obsidian.md/bases), [Create a base](https://help.obsidian.md/bases/create-base), [Views](https://help.obsidian.md/bases/views), [Formulas](https://help.obsidian.md/formulas), [Functions](https://help.obsidian.md/bases/functions), [Table view](https://help.obsidian.md/bases/views/table), [Cards view](https://help.obsidian.md/bases/views/cards), [List view](https://help.obsidian.md/bases/views/list), [Kanban view](https://help.obsidian.md/bases/views/kanban), [Map view](https://help.obsidian.md/bases/views/map), [Desktop 1.14.0 EA](https://obsidian.md/changelog/2026-09-02-desktop-v1.14.0/), [Desktop 1.14.2 EA](https://obsidian.md/changelog/2026-09-15-desktop-v1.14.2/).

## Daily Notes

**Type:** `CORE_PLUGIN`

Daily Notes opens or creates today's note, default `YYYY-MM-DD`. Users can set daily note folder, date format (including folder paths), and template. Daily note opens from ribbon, command, hotkey, URI `daily`, CLI, widgets/shortcuts. Date properties become links to corresponding daily notes when the plugin is active.

Takenotes relevance: **Strong candidate**.  
Dependencies: date naming policy, template insertion, folder creation, command/URI hooks.

Sources: [Daily notes](https://help.obsidian.md/plugins/daily-notes), [Obsidian URI](https://help.obsidian.md/uri), [Obsidian CLI](https://help.obsidian.md/cli).

## Templates

**Type:** `CORE_PLUGIN`

Built-in Templates inserts predefined text snippets from a configured template folder. Variables: `{{title}}`, `{{date}}`, `{{time}}`, with Moment.js date/time formats. Commands insert template/current date/current time at cursor/last cursor. Template properties merge into note properties. This is not the Templater community plugin.

Takenotes relevance: **Strong candidate**.  
Dependencies: template folder config, variable interpolation, insertion transaction, property merge semantics.

Sources: [Templates](https://help.obsidian.md/plugins/templates).

## Unique Note Creator

**Type:** `CORE_PLUGIN`

Creates Zettelkasten-style timestamp notes (example `202401010945`). If collision occurs, uses next available timestamp. Can use template file. Opens from ribbon/command/URI/CLI.

Takenotes relevance: **Later**.  
Dependencies: timestamp naming, collision strategy, template insertion.

Sources: [Unique note creator](https://help.obsidian.md/plugins/unique-note), [Obsidian URI](https://help.obsidian.md/uri).

## Note Composer

**Type:** `CORE_PLUGIN`

Merges notes or extracts selected text into another/new note. Merge adds source to destination and removes source; links are updated to destination. Extraction can append/prepend/create new note and replaces selection with link/embed/nothing depending on settings. Supports template with `{{content}}`, `{{fromTitle}}`, `{{newTitle}}`, `{{date:FORMAT}}`.

Takenotes relevance: **Later**.  
Dependencies: selection extraction, note create/merge, link rewrite, deletion/recovery safety, template variables.

Sources: [Note composer](https://help.obsidian.md/plugins/note-composer).

## Bookmarks

**Type:** `CORE_PLUGIN`

Bookmarks can target files, folders, graphs, searches, headings, blocks, and links (via Web viewer). They support optional title, groups, ordering via drag/drop, expand/collapse groups, edit/remove, multi-file bookmarking, and opening bookmarks.

Takenotes relevance: **Strong candidate** for files/searches/headings; **Later** for full target diversity.  
Dependencies: stable resource locator (file/subpath/search/url), sidebar UI, ordering persistence.

Sources: [Bookmarks](https://help.obsidian.md/plugins/bookmarks), [Web viewer](https://help.obsidian.md/plugins/web-viewer).

## Outline

**Type:** `CORE_PLUGIN`

Outline lists headings in the active note. Clicking navigates to heading. Dragging headings in the outline rearranges sections in the note.

Takenotes relevance: **Strong candidate**.  
Dependencies: heading parser, source-range tracking, editor transaction for section reorder.

Sources: [Outline](https://help.obsidian.md/plugins/outline).

## Attachments

**Type:** `CORE`

Attachments are regular files in the vault and can be embedded. Users can paste attachments into notes, drag external files into editor, or download/import directly into the vault. Default attachment location options: vault root, specified folder, same folder as current file, or subfolder under current folder. Supported formats are listed in Accepted file formats; other file types can be shown/linked with settings but not necessarily natively opened unless supported by plugins.

Takenotes relevance: **Essential** for images/PDFs; **Strong candidate** for audio/video.  
Dependencies: attachment import, naming/collision policy, folder config, embed syntax, file watcher.

Sources: [Attachments](https://help.obsidian.md/attachments), [Accepted file formats](https://help.obsidian.md/file-formats), [Settings](https://help.obsidian.md/settings).

## Images

**Type:** `CORE`

Images can be local attachments or external URLs, embedded with size syntax. Public 1.13 added a new image experience: easier resizing, full-screen image viewer, navigation between images in current file, pan within image, swipe down on mobile to dismiss zoomed image, keyboard selection in Live Preview, delete/copy/cut selected image embed, `+`/`-`/`0` resize/reset, Enter to edit, Tab to edit size. Context menu includes image operations; Live Preview avoids expanding filename automatically in current public.

Takenotes relevance: **Strong candidate**.  
Dependencies: image embed parser, attachment resolver, viewer/lightbox, editor widget selection/resizing.

Sources: [Embed files](https://help.obsidian.md/embeds), [Basic formatting syntax](https://help.obsidian.md/syntax), [Desktop 1.13 public](https://obsidian.md/changelog/2026-07-30-desktop-v1.13.4/), [Mobile 1.13 public](https://obsidian.md/changelog/2026-07-30-mobile-v1.13.4/).

## PDFs

**Type:** `CORE`

Official docs verify PDF accepted format, embedding with `![[Document.pdf]]`, page targeting via `#page=N`, embedded viewer height via `#height=400`, and opening media/PDF cards in Canvas. Current docs do not conclusively document built-in PDF annotation/highlight, search, or selection/copy features; treat those as unverified rather than core requirements.

Takenotes relevance: **Later** basic PDF embed/viewer.  
Dependencies: PDF viewer component, attachment resolver, page/hash routing.

Sources: [Accepted file formats](https://help.obsidian.md/file-formats), [Embed files](https://help.obsidian.md/embeds), [Canvas](https://help.obsidian.md/plugins/canvas).

## Audio / Video

**Type:** `CORE` embeds + `CORE_PLUGIN` Audio recorder

Audio/video accepted formats can be embedded and played subject to device codecs. Audio Recorder plugin records microphone audio into a file in the vault and embeds it at the end of the active note. Removing the embed does not delete the recording file.

Takenotes relevance: **Later**.  
Dependencies: media attachment support, recording permission/device APIs, embed playback UI.

Sources: [Accepted file formats](https://help.obsidian.md/file-formats), [Embed files](https://help.obsidian.md/embeds), [Audio recorder](https://help.obsidian.md/plugins/audio-recorder).

## Tables

**Type:** `CORE`

Markdown tables support GFM-style pipes, optional edge pipes, header separator, alignment with colons, inline Markdown/links/embeds in cells, escaped pipes for aliases/image sizes. Live Preview table context menu supports add/delete rows/columns, sorting, moving, and alignment. Public 1.13 includes fixes for table memory leaks and mobile row/column buttons.

Takenotes relevance: **Strong candidate** for Markdown; **Later** for visual editing.  
Dependencies: table parser, editor widget, source-preserving row/column operations.

Sources: [Advanced formatting syntax](https://help.obsidian.md/advanced-syntax), [Desktop 1.13.6 public](https://obsidian.md/changelog/2026-08-10-desktop-v1.13.6/).

## Tasks

**Type:** `CORE`

Built-in tasks are Markdown task list checkboxes: `- [ ] incomplete`, `- [x] complete`. Any character in brackets marks completed. Reading view checkboxes can be toggled. Search has `task:`, `task-todo:`, and `task-done:` operators. Obsidian core does not include advanced task scheduling/querying from the community Tasks plugin.

Takenotes relevance: **Strong candidate**.  
Dependencies: Markdown checkbox parser, toggle transaction, task search index.

Sources: [Basic formatting syntax](https://help.obsidian.md/syntax), [Search](https://help.obsidian.md/plugins/search).

## Callouts

**Type:** `CORE`

Syntax: blockquote first line `> [!type] Optional title`. Supports Markdown, wikilinks, embeds, title-only callouts, foldable callouts with `+`/`-`, nesting, insert-callout command, wrap selected content, Live Preview right-click to change type, custom CSS callouts. Built-in types: note, abstract/summary/tldr, info, todo, tip/hint/important, success/check/done, question/help/faq, warning/caution/attention, failure/fail/missing, danger/error, bug, example, quote/cite. Unsupported types default to note unless CSS customizes.

Takenotes relevance: **Later**.  
Dependencies: Markdown extension parser, renderer CSS, fold state.

Sources: [Callouts](https://help.obsidian.md/callouts).

## Math

**Type:** `CORE`

Public docs document MathJax/LaTeX inline `$...$` and block `$$...$$`, MathJax package references. Catalyst notes: 1.14.0 temporarily replaced MathJax with Temml; 1.14.1 says math rendering now uses MathJax 4.1.3, replacing MathJax 3 and Temml. This must be tracked as Catalyst-only until public.

Takenotes relevance: **Later**.  
Dependencies: math parser, renderer, Live Preview/Reading integration.

Sources: [Advanced formatting syntax](https://help.obsidian.md/advanced-syntax), [Desktop 1.14.0 EA](https://obsidian.md/changelog/2026-09-02-desktop-v1.14.0/), [Desktop 1.14.1 EA](https://obsidian.md/changelog/2026-09-08-desktop-v1.14.1/).

## Mermaid

**Type:** `CORE`

Mermaid diagrams use fenced `mermaid` code blocks. Docs show flow/sequence examples, link to Mermaid docs, and support creating internal links in diagrams by applying `internal-link` class to nodes. Diagram internal links do not appear in Graph view. Public 1.13 added a one-time banner confirming users want to render Mermaid code blocks; Catalyst/public changelogs include Mermaid security/rendering changes over time.

Takenotes relevance: **Later** or **External/plugin territory**.  
Dependencies: Mermaid renderer, security gating, link integration.

Sources: [Advanced formatting syntax](https://help.obsidian.md/advanced-syntax), [Desktop 1.13 public](https://obsidian.md/changelog/2026-07-30-desktop-v1.13.4/).

## Footnotes

**Type:** `CORE` + `CORE_PLUGIN` Footnotes view

Named footnotes `[^id]` and inline footnotes `^[text]` are supported. Named footnotes render numerically. Inline footnotes only work in Reading view, not Live Preview. Footnotes view lists all footnotes in active note; clicking edits text or navigates to position.

Takenotes relevance: **Later**.  
Dependencies: Markdown parser/renderer, note outline-like index.

Sources: [Basic formatting syntax](https://help.obsidian.md/syntax), [Footnotes view](https://help.obsidian.md/plugins/footnotes).

## File Recovery

**Type:** `CORE_PLUGIN`

File Recovery saves full local snapshots at intervals. Defaults: minimum 5 minutes between snapshots, retained 7 days. Snapshots are stored in global settings outside the vault, keyed by absolute path, device-local, not synced by Obsidian Sync. It can recover accidental deletion, corruption, unwanted changes; not a full backup. Restore flow: Settings → File recovery → Snapshots view, pick file and snapshot, Copy or Restore, optionally show changes. Limitations: unavailable on Apple Lockdown Mode unless Obsidian exempted; only `.md` and `.canvas`; moved vault paths may hide old snapshots.

Takenotes relevance: **Essential**.  
Dependencies: snapshot store outside workspace, debounce/interval policy, retention cleanup, restore/copy UI, path identity and moved-vault story.

Sources: [File recovery](https://help.obsidian.md/plugins/file-recovery).

## History and Recovery

Built-in layers:

- **Undo/redo:** editor/session-level editing history; not a durable backup.
- **File Recovery:** local device snapshots for `.md` and `.canvas`; outside vault; not synced.
- **Obsidian Sync version history:** optional paid service history for synced notes/attachments/settings/deleted files; retention by plan; can restore previous/deleted versions.

External layers:

- OS trash/system backups/cloud backups/Git/community plugins are outside core Obsidian except that Obsidian can use system trash and docs recommend backups.
- Git/versioning is community/external territory.

Takenotes relevance: **Essential** local recovery; **Later** sync history.  
Dependencies: snapshot architecture, diff UI optional, conflict handling, external backup guidance.

Sources: [File recovery](https://help.obsidian.md/plugins/file-recovery), [Sync version history](https://help.obsidian.md/sync/version-history), [Back up files](https://help.obsidian.md/backup).

## Appearance

**Type:** `CORE`

Appearance settings include system/light/dark color scheme, accent color, themes, interface/text/monospace fonts, base font size, quick font-size adjustment with modifier scroll/pinch, inline title, tab title bar, ribbon visibility/config, overall zoom level, native menus, window frame style, custom app icon, translucency (macOS primarily; not Linux; Windows translucency removed historically), hardware acceleration, CSS snippets.

Takenotes relevance: **Strong candidate** basic theme/font/zoom; **Later** custom themes/snippets.  
Dependencies: theming tokens, settings persistence, font picker, CSS variable model if web UI.

Sources: [Settings](https://help.obsidian.md/settings), [Appearance](https://help.obsidian.md/appearance).

## Themes

**Type:** `CORE` + `COMMUNITY_EXTENSION`

Community themes are browsed/installed from Settings → Appearance → Themes → Manage, can be updated individually or all at once, uninstalled, and used immediately. Themes do not auto-update. Developers can build themes using official CSS variables/docs.

Takenotes relevance: **Later**.  
Dependencies: style token architecture, marketplace if community-supported.

Sources: [Themes](https://help.obsidian.md/themes), [Developer CSS variables](https://docs.obsidian.md/Reference/CSS+variables/CSS+variables).

## CSS Snippets

**Type:** `CORE`

CSS snippets live in `.obsidian/snippets/`, can be reloaded/enabled from Appearance, and auto-detected when files change. On mobile/tablet, users must place snippets via file manager/sync. Snippets can use Obsidian CSS variables and note-level `cssclasses` property.

Takenotes relevance: **External/plugin territory** unless a web/CSS-based UI wants power-user styling.  
Dependencies: CSS injection sandboxing, config folder, safe reload.

Sources: [CSS snippets](https://help.obsidian.md/snippets), [Properties](https://help.obsidian.md/properties).

## Hotkeys

**Type:** `CORE`

Hotkeys are customizable keyboard shortcuts for commands. Settings → Hotkeys can search commands, filter to assigned hotkeys, assign multiple shortcuts per command, remove shortcuts, and show hotkeys in Command Palette. OS/framework editing shortcuts are separate and not customizable in Obsidian. Non-US keyboard layouts display as US but work based on actual keypresses. Plugin actions can expose hotkeys.

Takenotes relevance: **Essential**.  
Dependencies: command registry, keybinding resolver, conflict UI (not explicitly documented in current page), platform key labels.

Sources: [Hotkeys](https://help.obsidian.md/hotkeys), [Editing shortcuts](https://help.obsidian.md/editing-shortcuts), [Command palette](https://help.obsidian.md/plugins/command-palette).

## Vim Mode

**Type:** `CORE`

Vim key bindings are enabled in Settings → Editor → Advanced. Docs mention property editor Vim navigation and settings keyboard navigation supporting Vim keybindings. Mobile changelog historically notes Vim mode works on mobile per-device but is not useful without an external keyboard. Current docs do not provide a full Vim command compatibility list; treat support as CodeMirror Vim keybindings with Obsidian-specific caveats.

Takenotes relevance: **Later**.  
Dependencies: editor keymap abstraction, conflict handling with app hotkeys, mobile external keyboard support.

Sources: [Settings](https://help.obsidian.md/settings), [Properties](https://help.obsidian.md/properties), [Changelog mobile v1.2-era Vim note](https://obsidian.md/changelog/).

## Spellcheck

**Type:** `CORE`

Editor settings include Spellcheck toggle and custom dictionary gear. Windows/Linux can choose spellcheck languages; macOS uses native spellchecker and automatically detects OS language. Historic changelog documents user dictionary via right-click Add to dictionary.

Takenotes relevance: **Strong candidate**.  
Dependencies: platform spellcheck integration or editor spellcheck library, dictionary management.

Sources: [Settings](https://help.obsidian.md/settings), [Changelog](https://obsidian.md/changelog/).

## Community Plugins

**Type:** `COMMUNITY_EXTENSION`

Obsidian's extension model is a core product feature. Community plugins are third-party code installed from a directory after turning off Restricted Mode. They can add commands, views, settings, editor behavior, file format support, integrations, and broad workflows. Plugin settings and hotkeys are managed in Settings. Plugins do not auto-update; users update all or individually.

Security model:

- Restricted Mode is default and blocks third-party code execution.
- Installed plugins remain in vault if Restricted Mode is turned back on but are ignored.
- Obsidian cannot reliably restrict plugin permissions; plugins inherit Obsidian's access and can access files, connect to internet, install additional programs.
- Official process includes developer policies, automated scanning, safety scorecard, and manual reviews for popular/flagged plugins.

Common functionality users add via plugins (not necessarily core): advanced templating (Templater), Dataview/querying, task management, calendars, Kanban outside Bases, Git/versioning, spaced repetition, drawing, AI tools, advanced tables, advanced search, dashboards, publishing pipelines, custom file formats.

Takenotes relevance: **Later** / **External/plugin territory**.  
Dependencies: stable plugin API, sandbox/trust model, settings/commands/views APIs, package marketplace, security review story.

Sources: [Community plugins](https://help.obsidian.md/community-plugins), [Plugin security](https://help.obsidian.md/plugin-security), [Core plugins](https://help.obsidian.md/plugins).

## Plugin Platform

**Type:** `CORE` extensibility + `COMMUNITY_EXTENSION`

Official developer docs describe TypeScript/JavaScript plugins built by extending the `Plugin` class. Plugin APIs cover:

- Plugin lifecycle (`onload`, `onunload`), settings persistence.
- Commands and hotkeys.
- Ribbon actions, status bar items, modals.
- Custom views and workspace leaves.
- Vault/file APIs (`Vault`, `TFile`, `DataAdapter`).
- Metadata cache API.
- Workspace API.
- Markdown post-processing.
- CodeMirror/editor extensions.
- Events.
- Manifest.
- Theme/CSS variables.

Mobile plugin compatibility depends on plugin implementation; desktop-only APIs such as webviews/native filesystem assumptions may not work.

Takenotes relevance: **Later**.  
Dependencies: stable public API, plugin lifecycle, app object model, compatibility policy, security model.

Sources: [Developer docs home](https://docs.obsidian.md/), [Build a plugin](https://docs.obsidian.md/Plugins/Getting+started/Build+a+plugin), [Anatomy of a plugin](https://docs.obsidian.md/Plugins/Getting+started/Anatomy+of+a+plugin), [Commands API](https://docs.obsidian.md/Plugins/User+interface/Commands), [Views API](https://docs.obsidian.md/Plugins/User+interface/Views), [Editor extensions](https://docs.obsidian.md/Plugins/Editor/Editor+extensions), [Vault API](https://docs.obsidian.md/Plugins/Vault), [MetadataCache API](https://docs.obsidian.md/Reference/TypeScript+API/MetadataCache), [Workspace API](https://docs.obsidian.md/Reference/TypeScript+API/Workspace).

## Developer Extensibility

See Plugin Platform. Extensibility itself is a product feature and a major reason Obsidian can remain Markdown-first while supporting advanced workflows. For Takenotes, exposing extension points too early would freeze internal seams; implement after core filesystem/index/editor contracts stabilize.

## URI / Deep Linking

**Type:** `CORE`

`obsidian://` supports actions:

- `open`: open vault or file; supports `vault`, `file`, `path`, subpath heading/block via encoded `#`/`^`, `prepend`, `append`, `paneType` (`tab`, `split`, `window`).
- `new`: create note with `vault`, `name`, `file`, `path`, `content`, `clipboard`, `silent`, `append`, `overwrite`, `paneType`, `x-success`.
- `daily`: create/open daily note; same parameters as `new`; Daily Notes required.
- `unique`: create unique note; Unique Note Creator required.
- `search`: open Search with optional query.
- `choose-vault`: vault manager.
- `hook-get-address`: integration with Hook and x-callback.
- `x-success` / `x-error` callbacks where supported; can return name, obsidian URL, desktop file URL.
- Shorthand: `obsidian://vault/...` and `obsidian:///absolute/path`.

Public 1.13 added then 1.13.6 removed a confirmation dialog for URI actions; current public notes say it was removed due to confusion, but guardrails remain elsewhere.

Takenotes relevance: **Strong candidate**.  
Dependencies: URI router, vault/file resolver, command security policy, callback controls.

Sources: [Obsidian URI](https://help.obsidian.md/uri), [Desktop 1.13.6 public](https://obsidian.md/changelog/2026-08-10-desktop-v1.13.6/).

## CLI

**Type:** `CORE` / official automation  
**Requires:** Obsidian 1.12+ installer, user enables Command line interface, app running or first command launches app.

Obsidian CLI supports one-shot commands and a terminal UI with autocomplete, command history, reverse search. It targets current working directory vault, active vault, or explicit `vault=<name|id>`. File targeting supports `file=<name>` using wikilink resolution or exact `path=<vault path>`. `--copy` copies output.

Documented command areas include:

- General: help/version/reload/restart.
- Bases: list, views, create item, query base in JSON/CSV/TSV/Markdown/paths.
- Bookmarks, commands/hotkeys.
- Daily note read/append/prepend/path.
- File history (diff/history/read/restore/open).
- Files/folders: open/create/read/append/prepend/move/rename/delete.
- Links: backlinks/links/unresolved/orphans/deadends.
- Outline.
- Plugins: list/enable/disable/install/uninstall/reload/restricted mode.
- Properties/aliases.
- Publish operations.
- Random notes.
- Search and search context/open.
- Sync status/history/read/restore/deleted.
- Tags/tasks/templates/themes/snippets/unique/vault/web/wordcount/workspace/tabs/recents.
- Developer commands: devtools, debug, CDP, errors, screenshots, console, CSS, DOM, mobile, eval.

Takenotes relevance: **Later**, but useful for agent automation.  
Dependencies: command registry, app IPC/RPC, vault/file resolver, safe automation permissions.

Sources: [Obsidian CLI](https://help.obsidian.md/cli).

## Automation

Automation surfaces are CLI, URI, Apple Shortcuts/iOS Share Sheet, Android widgets/shortcuts/Quick Settings, Web Clipper, Sync Headless, plugin API, and external file editing due to normal filesystem storage.

Takenotes relevance: **Strong candidate** for URI/CLI after core stable.  
Dependencies: stable commands, noninteractive error reporting, security prompts.

Sources: [Obsidian URI](https://help.obsidian.md/uri), [Obsidian CLI](https://help.obsidian.md/cli), [iOS/iPadOS](https://help.obsidian.md/ios), [Android](https://help.obsidian.md/android), [Headless Sync](https://help.obsidian.md/sync/headless).

## Import

**Type:** official `COMMUNITY_EXTENSION` Importer plugin

Importer is an official community plugin by Obsidian. Current official import sources/formats listed:

- Notion.
- Airtable.
- Microsoft OneNote.
- Evernote.
- Apple Notes.
- Apple Journal.
- Google Keep.
- Bear.
- Craft.
- Roam Research.
- Logseq.
- Tomboy and Gnote.
- HTML files.
- CSV files.
- Markdown files.
- Textbundle files.

Importer templates can customize imported title/properties/content and reuse Web Clipper filters/logic.

Takenotes relevance: **Later**.  
Dependencies: importer pipeline, per-source converters, attachment mapping, link conversion, templates.

Sources: [Import notes](https://help.obsidian.md/import), [Importer](https://help.obsidian.md/plugins/importer), [Importer templates](https://help.obsidian.md/importer-templates).

## Export

**Type:** `CORE` + feature-specific

Verified export/copy capabilities:

- Export current note to PDF exists in app/changelog; PDF export settings include page size, landscape, margin, optional note title, light-mode export behavior, custom font fixes.
- Bases view can copy to clipboard and export CSV.
- Canvas has export-as-image improvements documented in changelog; Canvas docs do not currently detail the full command.
- Search can copy search results.
- Web Clipper templates can export `.json` templates.
- Normal Markdown files can be copied/exported through filesystem outside Obsidian.

Takenotes relevance: **Strong candidate** for Markdown/filesystem; **Later** for PDF/CSV/image exports.  
Dependencies: print/PDF renderer, query CSV serializer, canvas capture.

Sources: [Bases Views](https://help.obsidian.md/bases/views), [Search](https://help.obsidian.md/plugins/search), [Web Clipper Templates](https://help.obsidian.md/web-clipper/templates), [Changelog export to PDF references](https://obsidian.md/changelog/).

## Web Clipper

**Type:** official browser extension, separate from core local editor

Official Web Clipper is a free browser extension for Chrome/Chromium browsers, Firefox/Firefox Mobile, Safari on macOS/iOS/iPadOS, and Edge. It highlights pages and saves web content to a vault. It is open source, stores locally, and Obsidian says it collects no usage metrics.

Capabilities:

- Open via browser toolbar, hotkeys, context menu.
- Extract current page using template settings.
- Capture priority: custom template; selection; highlights; otherwise main content extraction.
- Add to Obsidian; select vault/folder.
- Web images are not automatically downloaded; links remain URLs. Obsidian has command to download attachments for current file.
- Interface: template switcher, highlighter, reader, embed popup into page, settings, properties preview, note content preview, vault/folder, Interpreter.
- Templates: create/duplicate/edit/import/export JSON; behavior create new note, add to existing note top/bottom, add to daily note top/bottom; trigger by URL prefixes, regex, schema.org; variables, filters, logic.
- Highlighter exports selected passages/elements.
- Reader view cleans page via Defuddle/Readability-like extraction.
- Interpreter uses natural language prompts and external/local language models to extract/summarize/translate/transform page data; supports providers like Anthropic/OpenAI/Gemini/Ollama/etc. Privacy warning: requests go to chosen provider; Obsidian does not store requests.

Takenotes relevance: **Later** or **External/plugin territory**.  
Dependencies: browser extension, note creation API, template engine, selection/highlight extraction, optional AI provider configuration.

Sources: [Web Clipper intro](https://help.obsidian.md/web-clipper), [Clip web pages](https://help.obsidian.md/web-clipper/capture), [Web Clipper Templates](https://help.obsidian.md/web-clipper/templates), [Variables](https://help.obsidian.md/web-clipper/variables), [Filters](https://help.obsidian.md/web-clipper/filters), [Logic](https://help.obsidian.md/web-clipper/logic), [Highlighter](https://help.obsidian.md/web-clipper/highlighter), [Reader](https://help.obsidian.md/web-clipper/reader), [Interpreter](https://help.obsidian.md/web-clipper/interpreter).

## Obsidian Sync

**Type:** `OPTIONAL_OFFICIAL_SERVICE` + Sync core plugin

Obsidian Sync is a paid add-on service for syncing notes across devices. It is separate from core local use.

Capabilities:

- Remote vaults and local/remote vault connection.
- Device sync with status, pause/resume, device names.
- Encryption: end-to-end encryption by default; standard encryption option; AES-256-GCM with scrypt for E2EE password-derived key. Local vault is not encrypted by Sync.
- Regional servers (automatic, Asia, Europe, North America, Oceania).
- Selective sync: images/audio/videos/PDFs default toggles; all other file types optional.
- Vault configuration sync: other file types, main settings, appearance, themes/snippets, hotkeys, active core plugin list, core plugin settings; community plugin lists must be manually enabled.
- Excluded folders.
- Hidden files/folders beginning with `.` excluded except `.obsidian`; `.git`, `.vscode`, etc. not synced.
- Sync settings are per-device and do not sync.
- Settings profiles: sync multiple config folders such as `.obsidian-mobile`.
- Conflict resolution per device: merge or create conflict files.
- Version history: synced notes/files/settings/deleted files; notes retention depends on plan (Standard 1 month, Plus 12 months); attachment old versions stored two weeks; deleted file restore; bulk restore.
- Sync history/sidebar: recently synced created/modified notes/attachments; desktop hover can show last editor for collaboration.
- Shared vault collaboration: all collaborators need Sync subscription; no fine-grained permissions; no realtime collaborative editing/cursors; concurrent edits merge via sync; max 20 collaborators.
- Storage limits verified in docs: Standard 1 vault, 1GB, 5MB max file; Plus 10 vaults, 10GB-100GB, 200MB max file, unlimited devices, shared vaults.
- Headless Sync open beta via `obsidian-headless` CLI for CI/agents/automation without desktop app; do not use desktop Sync and Headless Sync on same device.

Takenotes relevance: **Later**.  
Dependencies: sync protocol, conflict merge, remote storage, encryption/key management, version history, per-device config, collaboration permissions.

Sources: [Sync intro](https://help.obsidian.md/sync), [Sync settings/selective sync](https://help.obsidian.md/sync/settings), [Sync security](https://help.obsidian.md/sync/security), [Version history](https://help.obsidian.md/sync/version-history), [Collaboration](https://help.obsidian.md/sync/collaborate), [Plans and storage](https://help.obsidian.md/sync/plans), [Headless Sync](https://help.obsidian.md/sync/headless).

## Collaboration

**Type:** `OPTIONAL_OFFICIAL_SERVICE`

Obsidian collaboration exists through shared Sync vaults and Publish collaborators, not Google-Docs-style realtime co-editing. Sync shared vaults allow multiple users to sync the same vault but no live cursors; edits appear after sync and conflict/merge mechanisms apply. Publish collaborators can publish/unpublish/update site content but must separately sync local vault files to avoid overwriting.

Takenotes relevance: **Later**.  
Dependencies: account/identity, access control, sync conflict handling, version history, publish permissions.

Sources: [Sync collaboration](https://help.obsidian.md/sync/collaborate), [Publish collaboration](https://help.obsidian.md/publish/collaborate).

## Obsidian Publish

**Type:** `OPTIONAL_OFFICIAL_SERVICE` + Publish core plugin

Obsidian Publish is paid hosting for notes as a website/wiki/knowledge base/digital garden. Users select notes to publish from the Publish plugin; notes remain local.

Capabilities:

- Create/manage/switch/delete Publish sites.
- Publish/unpublish/update selected notes.
- Add linked data automatically to avoid broken links.
- Include/exclude folders; `publish: true/false` properties control selection.
- Site options: site name, homepage file, logo, collaboration, custom domain, disallow search indexing.
- Appearance: light/dark/adapt to system, light/dark toggle.
- Reading options: hover preview, hide page title, readable line length, strict line breaks, stacked pages.
- Components: navigation/file explorer, customized navigation ordering/hiding, search bar, graph view, table of contents, backlinks.
- Password protection for entire site.
- Google Analytics for custom domain URL only.
- Custom CSS/JS/favicons through published root files; custom JS requires custom domain.
- Community theme adaptation through `publish.css`.
- Permalinks and redirects via `permalink` and aliases.
- SEO: sitemaps/RSS, metadata properties (`description`, `image`, `cover`), search-index disallow.
- Social media link previews.
- Publish collaborators can publish changes; owner manages settings/permissions.
- Limitations documented separately.

Takenotes relevance: **Later** or external service.  
Dependencies: publishing pipeline, static/site renderer, access control, link validation, search/graph for published subset, custom domain support.

Sources: [Publish intro](https://help.obsidian.md/publish), [Publish your content](https://help.obsidian.md/publish/publish), [Manage sites](https://help.obsidian.md/publish/sites), [Customize site](https://help.obsidian.md/publish/customize), [Custom domains](https://help.obsidian.md/publish/domains), [Permalinks](https://help.obsidian.md/publish/permalinks), [SEO](https://help.obsidian.md/publish/seo), [Publish collaboration](https://help.obsidian.md/publish/collaborate), [Publish security](https://help.obsidian.md/publish/security).

## Mobile

**Type:** `MOBILE`

Mobile apps exist for iOS/iPadOS and Android. Obsidian works similarly to desktop but adds mobile toolbar, quick action, bottom navigation, widgets/shortcuts, sidebars via gestures, and OS-specific integrations.

### iOS

**Type:** `IOS_ONLY` + `MOBILE`

Current documented public iOS/iPadOS features:

- Widgets on iOS/iPadOS 18+: Lock Screen and Control Center widgets for new note, open specific note, daily note, search, open Obsidian; Home Screen widgets for create note, view note, daily note. Widgets unavailable when Require Face ID unlock is enabled.
- Widget customization: vault/note configuration.
- Apple Shortcuts: Open Bookmark, Open New Note, Open Daily Note, Capture to Daily Note, Capture to Bookmark, Get Bookmarked Note, Get Daily Note, Search Vault, Bookmark Link, Open Obsidian. Capture shortcuts can append/prepend without opening app.
- Share Sheet in Obsidian 1.13+ and iOS/iPadOS 18+: capture from Safari, YouTube, other apps; choose a Location; review/edit; save.
- Share Sheet Locations: New note, Daily note append/prepend, Bookmarked note append/prepend, existing note, New bookmark.
- Locations can configure vault, behavior, folder, template, bookmark group, append/prepend, full text vs URL.
- Share Sheet templates support placeholders: author, description, domain, favicon, image, published, site, title, url, wordCount, plus date/time placeholders.
- Siri phrases and Spotlight quick actions.

### Android

**Type:** `ANDROID_ONLY` + `MOBILE`

Current documented Android features:

- Android 5.1+.
- Vault location choice: device storage (recommended; shared, survives uninstall, works with external sync tools, requires all-files access) or app storage (private; deleted on uninstall; compatible with Obsidian Sync and some plugins but not Syncthing-like tools).
- Widgets: Open Note, New Note, Search, Daily Note, Open Obsidian; static/no previews; resizable; configurable.
- Quick Settings tiles on Android 7.0+: fast access from notification shade/lock screen; one tile per type.
- App shortcuts on Android 7.1+: Open note, Daily note; docs say 1.11 shortcuts are not configurable and planned for overhaul.

### Tablet

**Type:** `MOBILE`

Larger tablets have sidebars more like desktop. Public mobile 1.13 adds tablet press-and-hold to resize splits and pinned sidebars. iPad Split View/Stage Manager issues appear in Catalyst fixes.

### Quick Capture

**Type:** public pieces via iOS Shortcuts/Share Sheet; expanded `CATALYST` in 1.14 mobile

Public stable includes capture through iOS Shortcuts and Share Sheet Locations. Catalyst 1.14 mobile adds native Quick Capture on iOS 26 from Lock Screen, Control Center, or Shortcuts without waiting for vault load; Live Activity on Lock Screen/Dynamic Island; Locations to capture to new note/daily/bookmarked/any note; templates with `{{latitude}}`, `{{longitude}}`; 1.14.1 adds configurable Quick Capture Home Screen widget, Location parameter for widgets/Shortcuts, `{{openStreetMapLink}}`; 1.14.2 adds iOS 27 extra-large Quick Capture/View Note widgets and color scheme matching vault.

Takenotes relevance: **Later**.  
Dependencies: mobile app, OS widgets/intents/shortcuts, background-safe capture queue, templates, note append/prepend semantics.

Sources: [Mobile app](https://help.obsidian.md/mobile), [iOS/iPadOS](https://help.obsidian.md/ios), [Android](https://help.obsidian.md/android), [Mobile 1.13 public](https://obsidian.md/changelog/2026-07-30-mobile-v1.13.4/), [Mobile 1.14.0 EA](https://obsidian.md/changelog/2026-09-02-mobile-v1.14.0/), [Mobile 1.14.1 EA](https://obsidian.md/changelog/2026-09-08-mobile-v1.14.1/), [Mobile 1.14.2 EA](https://obsidian.md/changelog/2026-09-15-mobile-v1.14.2/).

## Accessibility

Documented accessibility-related features include keyboard navigation in settings (public 1.13), command palette/quick switcher/hotkeys, Vim mode, zoom level, font size and quick font size adjustment, mobile text/interface scaling with system preferred text size in **Catalyst 1.14.1**, settings focus behavior improvements, color/theme controls, and reduced motion/animations not clearly documented in official pages found. Do not claim WCAG compliance or certifications.

Takenotes relevance: **Essential** baseline keyboard/focus/text scaling; **Later** advanced accessibility audits.  
Dependencies: semantic UI, focus management, keyboard shortcuts, scalable typography, theme contrast.

Sources: [Settings](https://help.obsidian.md/settings), [Hotkeys](https://help.obsidian.md/hotkeys), [Desktop 1.13 public](https://obsidian.md/changelog/2026-07-30-desktop-v1.13.4/), [Mobile 1.14.1 EA](https://obsidian.md/changelog/2026-09-08-mobile-v1.14.1/).

## Internationalization / RTL

**Type:** `CORE`; some `CATALYST`

Obsidian interface is translated by volunteers; users can change interface language in Settings → General or during new-vault creation. Editor has Right-to-left (RTL) text direction setting for notes. Public 1.13 improves localized devices in fixes. Catalyst 1.14.0 flips the entire workspace, including sidebars, when Obsidian is set to an RTL language; Catalyst 1.14.1 adds RTL support to Bases table views and fixes RTL loading animation/mobile gestures.

Takenotes relevance: **Later**, but Unicode/RTL text correctness matters early.  
Dependencies: i18n framework, bidi-aware editor, layout mirroring, localized docs/strings.

Sources: [Language settings](https://help.obsidian.md/language), [Settings](https://help.obsidian.md/settings), [Desktop 1.14.0 EA](https://obsidian.md/changelog/2026-09-02-desktop-v1.14.0/), [Desktop 1.14.1 EA](https://obsidian.md/changelog/2026-09-08-desktop-v1.14.1/), [Mobile 1.14.1 EA](https://obsidian.md/changelog/2026-09-08-mobile-v1.14.1/).

## Privacy and Security

Obsidian local core:

- Basic local use stores notes locally and does not require Sync/Publish.
- Notes are plain local files; Obsidian can work offline.
- Local vault is not encrypted by Sync; use OS/disk encryption if needed.
- HTML in notes is sanitized to prevent script execution.
- Community plugins are not sandboxed; they inherit Obsidian access and can access files/network/install programs.
- Restricted Mode blocks community plugins until user enables them.
- URI actions are automation surface; current public removed confusing confirmation dialog but docs include URI callbacks setting.
- External/network HTML resources and Web viewer carry risk; public 1.13 added warnings before loading HTML resources from network drives and Web viewer docs recommend primary browser for sensitive sites if plugins installed.
- Sync adds encrypted remote storage, with E2EE default and standard encryption option.
- Publish intentionally uploads selected notes to public/password-protected site.
- Web Clipper can send page context to selected AI provider only when Interpreter is used; Obsidian says it does not store requests.

Takenotes relevance: **Essential**.  
Dependencies: local-first defaults, plugin trust model, URI safety, sanitized renderer, secret-free config, network isolation.

Sources: [How Obsidian stores data](https://help.obsidian.md/data-storage), [HTML content](https://help.obsidian.md/html), [Plugin security](https://help.obsidian.md/plugin-security), [Sync security](https://help.obsidian.md/sync/security), [Publish security](https://help.obsidian.md/publish/security), [Web viewer](https://help.obsidian.md/plugins/web-viewer), [Web Clipper Interpreter](https://help.obsidian.md/web-clipper/interpreter), [Desktop 1.13 public](https://obsidian.md/changelog/2026-07-30-desktop-v1.13.4/).

## Catalyst / Early Access Features

Do not treat these as public stable.

| Feature | Version/date | Platform | What it does |
| --- | --- | --- | --- |
| Open files outside vault | 1.14.2, 2026-09-15 | Desktop | Command and OS Open With integration for viewing files outside current vault. |
| Quick Switcher/link suggestions always fuzzy above 10k | 1.14.2 | Desktop | Removes simplified algorithm fallback in large vaults. |
| Bases Kanban folder grouping improvements | 1.14.2 | Desktop | Move cards between folder columns and create notes in corresponding folder with error feedback. |
| MathJax 4.1.3 | 1.14.1 | Desktop | Math rendering uses MathJax 4.1.3, replacing MathJax 3 and Temml. |
| RTL Bases table support | 1.14.1 | Desktop | RTL table views incl. keyboard nav, selection, horizontal scroll. |
| Color highlights | 1.14.0 | Desktop | Color emoji/swatch support for `==highlight==`. |
| Bases Kanban layout | 1.14.0 | Desktop | Grouped-property columns, drag cards, create note in columns. |
| Collapsible Bases groups | 1.14.0 | Desktop | Table/cards/list groups collapsible. |
| Full RTL workspace flip | 1.14.0 | Desktop | Entire workspace/sidebars flip for RTL language. |
| Native Quick Capture | 1.14.0 | iOS mobile | Lock Screen/Control Center/Shortcuts capture without waiting for vault load; Locations/templates/location variables. |
| Quick Capture widgets/Location parameters/OpenStreetMap variable | 1.14.1 | iOS mobile | Home Screen widget and Location params for widgets/Shortcuts; `{{openStreetMapLink}}`. |
| Extra-large Quick Capture/View Note widgets | 1.14.2 | iOS mobile | iOS 27 extra-large widgets; color scheme matches active vault. |
| Preferred text scaling | 1.14.1 | Mobile | Text/interface scale with system preferred text size. |

Sources: official 1.14.0/1.14.1/1.14.2 desktop/mobile changelog entries linked in Sources.

## Deprecated / Removed Features

- **Starred core plugin:** replaced by Bookmarks. Starred historical references should not be treated as current feature inventory.
- **Legacy editor / Preview mode terminology:** Preview mode renamed Reading view; modern editing modes are Live Preview and Source mode.
- **Deprecated properties:** `tag`, `alias`, `cssclass` deprecated in 1.4 and default support dropped in 1.9; use `tags`, `aliases`, `cssclasses`; Format Converter can migrate.
- **Format Converter old formats:** Catalyst 1.14.2 says old formats were removed from converter plugin; details need public confirmation before applying to stable.
- **Settings Search plugin:** public 1.13 deprecates it because settings search became core.
- **Windows translucency:** Appearance docs say Obsidian team removed translucency on Windows for version 1.15.11 due to Electron removal. This appears internally inconsistent with current public 1.13 version numbering; record as official doc text but verify when relevant.

Sources: [Bookmarks changelog](https://obsidian.md/changelog/2023-05-02-desktop-v1.2/), [Views and editing mode](https://help.obsidian.md/edit-and-read), [Properties](https://help.obsidian.md/properties), [Format converter](https://help.obsidian.md/plugins/format-converter), [Desktop 1.13 public](https://obsidian.md/changelog/2026-07-30-desktop-v1.13.4/), [Appearance](https://help.obsidian.md/appearance), [Desktop 1.14.2 EA](https://obsidian.md/changelog/2026-09-15-desktop-v1.14.2/).

## Full Feature Matrix

| Area | Feature | Obsidian support | Type | Desktop | Mobile | Public/Catalyst | Takenotes relevance | Dependencies |
| ---- | ------- | ---------------- | ---- | ------- | ------ | --------------- | ------------------- | ------------ |
| Storage | Vault folder | Local folder containing notes/config | CORE | Yes | Yes | Public | Essential | Workspace lifecycle, path safety |
| Storage | Markdown notes | `.md` normal files | CORE | Yes | Yes | Public | Essential | Note CRUD, editor |
| Storage | `.obsidian` config | Per-vault hidden config folder | CORE | Yes | Yes | Public | Strong candidate | Config store |
| Storage | Global metadata cache | IndexedDB/app-data metadata cache | CORE | Yes | Yes | Public | Essential | Parser/index persistence |
| Storage | External changes | Auto-refresh vault | CORE | Yes | Yes | Public | Essential | Watcher reconciliation |
| Storage | Symlinks | Allowed but discouraged with limits | CORE | Yes | Partial | Public | Later | Path realpath policy |
| Storage | Open outside vault | View files outside vault | CORE | Yes | No | Catalyst 1.14.2 | Probably unnecessary | External file safety |
| Files | File Explorer | CRUD, sort, auto-reveal, drag/drop | CORE_PLUGIN | Yes | Yes | Public | Essential | Tree, file ops |
| Files | Multi-select | Alt/Opt-click, Shift-click | CORE_PLUGIN | Yes | Likely touch variants | Public | Strong candidate | Selection state |
| Files | Trash modes | System, `.trash`, permanent | CORE | Yes | Yes | Public | Essential | Delete policy |
| Editor | Source mode | Raw Markdown editing | CORE | Yes | Yes | Public | Essential | Editor |
| Editor | Live Preview | Inline rendered editing | CORE | Yes | Yes | Public | Strong candidate | Parser widgets |
| Editor | Reading view | Rendered note view | CORE | Yes | Yes | Public | Strong candidate | Renderer |
| Editor | Markdown syntax | CommonMark/GFM/extensions | CORE | Yes | Yes | Public | Essential | Parser/renderer |
| Editor | Colored highlights | Emoji/swatch colored highlight | CORE | Yes | TBD | Catalyst 1.14 | Later | Markdown extension UI |
| Editor | Tables visual editing | Insert/edit rows/columns/sort/move | CORE | Yes | Yes | Public | Later | Table widget |
| Editor | Callouts | Built-in callout syntax/types | CORE | Yes | Yes | Public | Later | Markdown extension |
| Editor | Math | MathJax/LaTeX | CORE | Yes | Yes | Public; 4.1.3 Catalyst | Later | Math renderer |
| Editor | Mermaid | Diagrams in code blocks | CORE | Yes | Yes | Public | Later/plugin | Mermaid renderer/security |
| Links | Wikilinks | Notes/headings/blocks/aliases | CORE | Yes | Yes | Public | Essential | Link resolver |
| Links | Markdown links | Optional generated format | CORE | Yes | Yes | Public | Essential | Link serializer |
| Links | Auto link update | Rename updates internal links | CORE | Yes | Yes | Public | Essential | Link index/rewrite |
| Links | Link autocomplete | Files/headings/blocks/aliases | CORE | Yes | Yes | Public | Essential | Metadata index |
| Embeds | Note/head/block embeds | `![[...]]` transclusion | CORE | Yes | Yes | Public | Strong candidate | Renderer, block index |
| Embeds | Attachment embeds | Images/PDF/audio/video | CORE | Yes | Yes | Public | Strong candidate | Attachment resolver |
| Backlinks | Backlinks pane | Linked/unlinked mentions | CORE_PLUGIN | Yes | Limited/sidebar | Public | Essential | Link/full-text index |
| Outgoing | Outgoing links | Links and unlinked mentions | CORE_PLUGIN | Yes | Limited/sidebar | Public | Strong candidate | Per-note parser |
| Tags | Inline/property tags | Nested, counts, search | CORE/PLUGIN | Yes | Yes | Public | Strong candidate | Tag index |
| Properties | YAML property UI | Types/search/rename/view | CORE/PLUGIN | Yes | Yes | Public | Strong candidate | YAML roundtrip |
| Search | Global search | Grammar/operators/regex/properties | CORE_PLUGIN | Yes | Yes | Public | Essential | Search index/query parser |
| Search | Embedded query | `query` code block | CORE_PLUGIN | Yes | Yes | Public | Later | Query renderer |
| Switcher | Quick Switcher | Fuzzy note open/create | CORE_PLUGIN | Yes | Yes | Public | Essential | Fuzzy index |
| Commands | Command Palette | Fuzzy command runner/pins/recents | CORE_PLUGIN | Yes | Yes | Public | Essential | Command registry |
| Workspace | Tabs | Tab groups, splits, pin, history | CORE | Yes | Yes | Public | Strong candidate | Layout state |
| Workspace | Pop-out windows | Separate windows same vault | DESKTOP_ONLY | Yes | No | Public | Later | Multi-window model |
| Workspace | Saved workspaces | Save/load layouts | CORE_PLUGIN | Yes | No/limited | Public | Later | Layout serialization |
| Graph | Global graph | Filter/groups/display/forces | CORE_PLUGIN | Yes | Yes | Public | Later | Link graph |
| Graph | Local graph | Connected active-note graph/depth | CORE_PLUGIN | Yes | Yes | Public | Later | Link graph |
| Canvas | Canvas | JSON Canvas cards/edges/groups | CORE_PLUGIN | Yes | Yes | Public | Later/plugin | Canvas model/UI |
| Bases | Bases table/cards/list | Views over Markdown properties | CORE_PLUGIN | Yes | Yes | Public | Later | Properties/query engine |
| Bases | Kanban | Grouped property Kanban | CORE_PLUGIN | Yes | TBD | Catalyst 1.14 | Later | Editable grouped views |
| Bases | Map | Requires official Maps plugin | COMMUNITY_EXTENSION | Yes | TBD | Public plugin | External/plugin | Map plugin |
| Productivity | Daily Notes | Date-based note/template | CORE_PLUGIN | Yes | Yes | Public | Strong candidate | Date path/template |
| Productivity | Templates | Snippets with title/date/time | CORE_PLUGIN | Yes | Yes | Public | Strong candidate | Template engine |
| Productivity | Unique notes | Timestamp ZK notes | CORE_PLUGIN | Yes | Yes | Public | Later | Timestamp naming |
| Productivity | Note Composer | Merge/extract notes | CORE_PLUGIN | Yes | Yes | Public | Later | Link rewrite |
| Productivity | Bookmarks | Files/folders/search/head/block/url | CORE_PLUGIN | Yes | Yes | Public | Strong candidate | Stable locators |
| Productivity | Outline | Headings, drag reorder | CORE_PLUGIN | Yes | Yes | Public | Strong candidate | Heading index/ranges |
| Productivity | File Recovery | Local snapshots | CORE_PLUGIN | Yes | Yes | Public | Essential | Snapshot store |
| Productivity | Word count | Words/chars; CJK | CORE_PLUGIN | Yes | Yes | Public | Later | Token counting |
| Productivity | Slides | Markdown presentations with `---` | CORE_PLUGIN | Yes | Likely | Public | Probably unnecessary | Presentation view |
| Productivity | Audio Recorder | Records and embeds audio | CORE_PLUGIN | Yes | Platform-dependent | Public | Probably unnecessary | Recorder/media |
| Productivity | Random Note | Opens random note | CORE_PLUGIN | Yes | Yes | Public | Later | File selection |
| UI | Page Preview | Hover previews | CORE_PLUGIN | Yes | Yes | Public | Strong candidate | Preview renderer |
| UI | Sidebars/ribbon/status | Pane/ribbon/status architecture | CORE | Yes | Yes | Public | Strong candidate | Shell layout |
| Appearance | Themes | Community themes | CORE/community | Yes | Yes | Public | Later | Theme system |
| Appearance | CSS snippets | `.obsidian/snippets` CSS | CORE | Yes | Yes | Public | External/plugin | CSS injection |
| Input | Hotkeys | Custom command shortcuts | CORE | Yes | Keyboard | Public | Essential | Keymap |
| Input | Vim mode | Vim keybindings | CORE | Yes | External keyboard | Public | Later | Editor keymap |
| Input | Spellcheck | OS/language dictionaries | CORE | Yes | Yes | Public | Strong candidate | Spellcheck API |
| Extensibility | Community plugins | Marketplace, settings, updates | COMMUNITY_EXTENSION | Yes | Many | Public | Later | Plugin API/security |
| Automation | URI | `obsidian://` open/new/daily/search | CORE | Yes | Yes | Public | Strong candidate | URI router |
| Automation | CLI | Official command line automation | CORE | Yes | No | Public | Later | App command bridge |
| Automation | Headless Sync | CLI sync beta | OPTIONAL_SERVICE | Yes | No | Public beta | Later | Sync service |
| Import | Importer | Official community plugin sources | COMMUNITY_EXTENSION | Yes | Yes | Public | Later | Converters |
| Export | PDF export | App/changelog documented | CORE | Yes | Maybe share/print | Public | Later | Print/PDF |
| Export | Bases CSV | Export current view | CORE_PLUGIN | Yes | Yes | Public | Later | CSV serializer |
| Services | Sync | E2EE paid sync/history/shared vaults | OPTIONAL_SERVICE | Yes | Yes | Public | Later | Sync protocol |
| Services | Publish | Paid hosted sites | OPTIONAL_SERVICE | Yes | Yes | Public | Later/external | Publisher |
| Services | Web Clipper | Browser extension/templates/AI | OFFICIAL_EXTENSION | Browser | Browser/mobile Safari | Public | External/plugin | Extension/API |
| Mobile | iOS widgets/Shortcuts/Share Sheet | Capture/open/search/widgets | IOS_ONLY | No | iOS | Public | Later | Mobile intents |
| Mobile | Android widgets/tiles | Widgets/Quick Settings/shortcuts | ANDROID_ONLY | No | Android | Public | Later | Android intents |
| Mobile | Quick Capture | Native background capture | IOS_ONLY | No | iOS | Catalyst 1.14 | Later | Capture queue |
| I18n | Languages/RTL | UI languages, editor RTL | CORE | Yes | Yes | Public; full flip Catalyst | Later | i18n/bidi |

## Feature Dependency Map

```text
Filesystem / Vault
    │
    ├── Canonical paths, safe relative paths, case/Unicode policy
    │       ├── Note CRUD
    │       ├── Attachment CRUD
    │       ├── Trash / delete policy
    │       └── Symlink / external-change policy
    │
    ├── Watcher reconciliation
    │       ├── External editor detection
    │       ├── File Explorer refresh
    │       ├── Open tab stale/conflict handling
    │       └── Metadata reparse queue
    │
    ├── Atomic save + revision/conflict model
    │       ├── Undo/redo safety
    │       ├── File Recovery snapshots
    │       ├── Sync conflict resolution (future)
    │       └── External modification warnings
    │
    └── Workspace lifecycle
            ├── Recent vaults / vault switcher
            ├── Tabs and layouts
            └── Settings/config profile

Markdown editor / renderer
    │
    ├── Source editing
    │       ├── Hotkeys
    │       ├── Vim mode
    │       ├── Find/replace
    │       └── Tables/tasks/callouts/math/mermaid syntax
    │
    ├── Markdown parser
    │       ├── Headings
    │       ├── Blocks/block IDs
    │       ├── Links/embeds
    │       ├── Tags
    │       ├── Frontmatter/properties
    │       └── Tasks/footnotes/callouts
    │
    ├── Reading renderer
    │       ├── Internal link navigation
    │       ├── Embed rendering
    │       ├── Attachment viewers
    │       ├── Page preview
    │       └── Export/PDF
    │
    └── Live Preview widgets
            ├── Image resizing
            ├── Table editor
            ├── Property editor
            └── Inline syntax hiding

Metadata Index
    │
    ├── File identity index
    │       ├── Quick Switcher
    │       ├── Link autocomplete
    │       └── Duplicate-name resolution
    │
    ├── Link index
    │       ├── Outgoing Links
    │       ├── Backlinks
    │       ├── Unresolved links
    │       ├── Link-aware rename/move
    │       └── Graph View
    │
    ├── Heading/block index
    │       ├── Outline
    │       ├── Heading/block links
    │       ├── Heading/block embeds
    │       └── Bookmark subpaths
    │
    ├── Tag index
    │       ├── Tags view
    │       ├── Tag search
    │       ├── Graph filters/groups
    │       └── Bases filters
    │
    ├── Property index
    │       ├── Properties view
    │       ├── Property search
    │       ├── Bases
    │       ├── Aliases
    │       └── Publish metadata
    │
    └── Full-text index
            ├── Search
            ├── Unlinked mentions
            ├── Embedded queries
            └── Web/Publish search (future)

Higher-level Views
    │
    ├── File Explorer ← Filesystem + watcher
    ├── Search ← Full-text + metadata indexes
    ├── Backlinks/Outgoing ← Link + alias + text indexes
    ├── Graph ← Link graph + tags + filters
    ├── Bases ← Properties + formulas + query engine
    ├── Canvas ← File cards + embeds + spatial JSON model
    ├── Workspaces ← Tabs/panes/layout persistence
    └── Publish/Sync ← Stable files + metadata + accounts/services
```

## Important Feature Interactions

### Rename note

```text
rename note
→ validate new filename/path
→ perform filesystem rename atomically where possible
→ update internal links if enabled or prompt user
→ update aliases if alias matches file name (public changelog behavior)
→ watcher/index sees move
→ file explorer tree updates
→ open tabs preserve active note identity
→ backlink/outgoing indexes update
→ graph nodes/edges update
→ search path/file results update
→ bookmarks/workspace subpaths must remain valid or show broken state
→ recovery/sync/version history must account for rename
```

### Move note/folder

```text
move note/folder
→ check cross-device/symlink constraints
→ move in filesystem
→ rewrite links if possible
→ note identity should survive path change
→ file explorer/search/backlinks/graph/Bases update
→ external sync may see delete+create if move not observable
```

### Change property

```text
change property in visual UI
→ serialize YAML/frontmatter without damaging body
→ metadata cache reparses frontmatter
→ aliases/tags/properties indexes update
→ property search results update
→ Bases filters/sorts/formulas update
→ Publish metadata may change
→ Sync settings/history may record config/content change
```

### External filesystem edit

```text
external edit
→ watcher event
→ reload file or flag conflict if open dirty buffer
→ parser updates metadata cache
→ search/link/tag/property indexes update
→ backlinks/outgoing/graph/Bases/outline update
→ recovery may snapshot before overwrite depending policy
```

### Create note from nonexistent link

```text
follow [[Folder/Missing Note]]
→ resolve intended creation path from link, not default note location
→ create Markdown file
→ open tab
→ unresolved link becomes resolved
→ backlinks/outgoing/graph update
```

### Delete note

```text
delete note
→ confirm based on settings
→ system trash / .trash / permanent
→ close or mark open tabs
→ unresolved links/backlinks update
→ graph may show unresolved node if links remain
→ File Recovery may restore only snapshots, not full filesystem backup
→ Sync version history may restore if synced
```

### Embed source changes

```text
edit embedded block/source note
→ source file saved
→ embed renderers in other open notes refresh
→ backlinks may change if embed content has links
→ search/Bases/graph update through metadata index
```

### Sync conflict

```text
same file edited on two devices
→ Sync detects conflict
→ per-device conflict policy merges or creates conflict file
→ version history records changes
→ local metadata index reparses final files
→ open editor must reconcile changed bytes with buffer
```

## Edge Cases

| Edge case | Observed/documented Obsidian behavior | Problem Takenotes will also need to solve |
| --- | --- | --- |
| Duplicate filenames | Links can include folder paths; unlinked mentions may refer to different notes; full path shown on hover. | Canonical ID vs display name; disambiguating autocomplete. |
| Case sensitivity | Tags case-insensitive; changelog fixed lowercase `untitled.md` conflicts historically. | Cross-platform path case behavior, WSL/Windows mismatches. |
| Renamed notes | Automatic internal-link updates configurable. | Link rewrite transaction and failure handling. |
| Moved notes | Obsidian updates links for internal moves; symlink cross-device moves may appear delete+create and not update links. | Watcher move detection and link updates across filesystems. |
| Deleted notes | Trash modes; graph can include unresolved notes unless existing-only filter. | Broken links, recovery, open tabs. |
| Broken links | Nonexistent links are valid and can create notes; graph can show unresolved nodes. | Model unresolved notes explicitly. |
| Aliases | Stored in `aliases`; autocomplete inserts canonical link with alias display text. | Alias index and rename behavior. |
| Heading renames | Heading links can break; docs do not claim automatic heading-link update. | Decide whether to track heading identity or accept breakage. |
| Block references | Obsidian-specific `^id`, IDs limited to Latin letters/numbers/dashes; no specific parts of quotations/callouts/tables. | Block ID generation, range mapping, interoperability warning. |
| Unsupported attachments | Accepted formats only; setting can show all file types; plugins can extend support. | File display vs open/embed support. |
| Very large notes | Changelogs mention large-document rendering/search performance. | Incremental parser/render virtualization. |
| Very large vaults | Quick Switcher public simplification above 10k; Catalyst removes fallback; startup stats. | Scalable indexes/fuzzy search. |
| Unicode filenames | Public 1.13.7 fixed macOS special-character filenames not appearing. | Unicode normalization across OSes/WSL. |
| Special characters | Internal links warn `# | ^ : %% [[ ]]` may not work. | Filename validation and URL/link escaping. |
| Symlinks | Strongly discouraged; loops disallowed; overlapping targets ignored; file symlinks unsupported/watcher caveat. | Realpath confinement and watcher topology. |
| External editors | Obsidian refreshes external changes; historic fixes for atomic writes. | Conflict detection, preserving newline/encoding, dirty buffer reconciliation. |
| Simultaneous modifications | Sync has merge/conflict settings; local external edit conflicts need handling. | Revision tokens and conflict UI. |
| Invalid YAML | Nested properties not supported in UI; Source mode recommended. | YAML parse errors must not destroy content. |
| Empty Markdown files | Valid notes; metadata empty. | Index defaults and editor states. |
| Network drives | Public changelog fixed vaults on network drives. | Latency/disconnect/error handling. |
| Mobile app storage | Android app storage deletes local data on uninstall. | Mobile storage location education. |

## Takenotes Comparison

Takenotes identity: filesystem-first, Markdown-first, local-first, fast, desktop-first, WSL-aware, simple UI, notes remain normal files, no unnecessary database ownership of content.

| Obsidian capability | Takenotes fit | Rationale |
| --- | --- | --- |
| Vault as normal folder | Essential | Direct match. |
| `.obsidian`-style config | Strong candidate | Need config separation; name/format can differ. |
| Markdown source editor | Essential | Core product. |
| Live Preview | Strong candidate | Useful but can wait until source editing/index stable. |
| Reading view | Strong candidate | Needed for pleasant Markdown use. |
| Link-aware rename/move | Essential | Filesystem-first apps must preserve trust. |
| File Explorer | Essential | Workspace manipulation. |
| Search | Essential | Fast local knowledge retrieval. |
| Backlinks/outgoing | Essential/strong | Core knowledge-management layer. |
| Tags/properties | Strong candidate | Organization without owning content. |
| Graph | Later | Depends on robust link index; optional UI. |
| Bases | Later | Powerful but complex; ensure Markdown remains source. |
| Canvas | External/plugin territory | Large product surface. |
| Sync/Publish/Web Clipper | Later/external | Service/extension layers, not local desktop core. |
| Community plugins | Later | Premature before stable internal APIs. |
| CLI/URI | Strong candidate later | Useful for agents/automation. |
| Mobile Quick Capture | Later | Desktop-first Takenotes. |
| File Recovery | Essential | Local-first trust/safety. |

## Takenotes Candidate Features

### Essential

- Vault/workspace lifecycle over normal folders.
- Canonical path model (Windows/WSL/POSIX aware).
- Note CRUD and attachment basics.
- Atomic saves, conflict detection, local recovery snapshots.
- File Explorer with create/rename/move/delete/trash.
- Markdown source editor and Reading view.
- Internal link parsing/resolution and link-aware rename/move.
- Metadata index for files, links, headings, tags, properties.
- Search and Quick Switcher.
- Command palette and hotkeys.

### Strong candidate

- Live Preview.
- Backlinks/outgoing links/unlinked mentions.
- Tags view.
- Properties UI.
- Page preview.
- Outline.
- Bookmarks.
- Daily Notes/Templates.
- Basic image/PDF embeds.
- URI/CLI automation.

### Later

- Graph View.
- Bases-like property views.
- Advanced table editor.
- Callouts/math/Mermaid if demand supports.
- Workspaces/layout save.
- Note Composer.
- Importer/export PDF.
- Mobile/Quick Capture.
- Sync/Publish.

### Probably unnecessary

- Slides.
- Audio Recorder.
- Full Canvas clone.
- Full Obsidian community marketplace in early Takenotes.

### External/plugin territory

- Dataview-like programmable querying.
- Advanced templating/scripting.
- AI web clipping.
- Git/spaced repetition/advanced task management.
- Drawing/whiteboards beyond simple attachments.

## Suggested Takenotes Feature Layers

### Layer 0 — Filesystem Foundation

- Workspace/vault open/close.
- Canonical path and root confinement.
- WSL-aware path boundaries.
- Watcher reconciliation.
- Atomic saves and revision IDs.
- Trash/delete policy.
- Recovery snapshot store.

### Layer 1 — Reliable Editor

- Source Markdown editor.
- Dirty state and external-change conflict handling.
- Reading renderer.
- Basic embeds for images/PDFs.
- Undo/redo.
- Editor settings/hotkeys.

### Layer 2 — Organization

- File Explorer.
- Folders and nested folders.
- Quick Switcher.
- Command Palette.
- Tabs/splits.
- Bookmarks.

### Layer 3 — Metadata Index

- Markdown parser.
- Link extraction.
- Heading/block extraction.
- Tag extraction.
- YAML/properties extraction.
- Full-text index.
- Incremental updates from watcher/saves.

### Layer 4 — Knowledge Links

- Wikilinks and Markdown links.
- Link autocomplete.
- Link-aware rename/move.
- Backlinks/outgoing links.
- Unresolved links.
- Page preview.

### Layer 5 — Search

- Search grammar.
- Result context/collapse.
- Path/file/tag/property operators.
- Recent searches.
- Embedded searches optional later.

### Layer 6 — Advanced Views

- Graph view.
- Properties/Bases-like table views.
- Timeline/daily views.
- Optional Canvas/plugin views.

### Layer 7 — Productivity

- Daily Notes.
- Templates.
- Note Composer.
- Unique notes.
- Import/export.

### Layer 8 — Extensibility

- URI/CLI first.
- Internal command APIs.
- Later plugin API only after stable seams.

### Layer 9 — Sync / Multi-device

- Local recovery first.
- Then optional external sync compatibility guidance.
- Only later first-party sync/collaboration if product direction demands.

## Unverified / Uncertain Status Notes

The following items were ambiguous in official sources and should be rechecked before product decisions:

- Native PDF details beyond documented viewing/embedding/page links/height: official docs found did not conclusively verify built-in PDF annotations, highlights, search, or text selection/copy.
- Hotkey conflict detection: Hotkeys docs verify assignment, filtering, and multiple shortcuts, but did not clearly document conflict-detection behavior.
- Windows translucency: Appearance docs mention removal in version 1.15.11, which is ahead of the public/Catalyst versions found in the changelog snapshot. Treat as official-doc text needing date/version re-verification.
- Quick Switcher large-vault algorithm: public docs still mention fallback above 10,000 items; Catalyst 1.14.2 says this fallback is removed. Public stable remains the documented fallback until 1.14.x is public.

## Sources

Official Obsidian Help and docs used:

- [How Obsidian stores data](https://help.obsidian.md/data-storage)
- [Manage vaults](https://help.obsidian.md/manage-vaults)
- [Manage notes](https://help.obsidian.md/manage-notes)
- [Configuration folder](https://help.obsidian.md/configuration-folder)
- [Accepted file formats](https://help.obsidian.md/file-formats)
- [Symbolic links and junctions](https://help.obsidian.md/symlinks)
- [File explorer](https://help.obsidian.md/plugins/file-explorer)
- [Drag and drop](https://help.obsidian.md/drag-and-drop)
- [Views and editing mode](https://help.obsidian.md/edit-and-read)
- [Basic formatting syntax](https://help.obsidian.md/syntax)
- [Advanced formatting syntax](https://help.obsidian.md/advanced-syntax)
- [Obsidian Flavored Markdown](https://help.obsidian.md/obsidian-flavored-markdown)
- [HTML content](https://help.obsidian.md/html)
- [Internal links](https://help.obsidian.md/links)
- [Aliases](https://help.obsidian.md/aliases)
- [Embed files](https://help.obsidian.md/embeds)
- [Attachments](https://help.obsidian.md/attachments)
- [Backlinks](https://help.obsidian.md/plugins/backlinks)
- [Outgoing links](https://help.obsidian.md/plugins/outgoing-links)
- [Graph view](https://help.obsidian.md/plugins/graph)
- [Search](https://help.obsidian.md/plugins/search)
- [Command palette](https://help.obsidian.md/plugins/command-palette)
- [Quick switcher](https://help.obsidian.md/plugins/quick-switcher)
- [Tabs](https://help.obsidian.md/tabs)
- [Workspace](https://help.obsidian.md/workspace)
- [Sidebar](https://help.obsidian.md/sidebar)
- [Ribbon](https://help.obsidian.md/ribbon)
- [Status bar](https://help.obsidian.md/status-bar)
- [Pop-out windows](https://help.obsidian.md/pop-out-windows)
- [Workspaces](https://help.obsidian.md/plugins/workspaces)
- [Properties](https://help.obsidian.md/properties)
- [Properties view](https://help.obsidian.md/plugins/properties)
- [Tags](https://help.obsidian.md/tags)
- [Tags view](https://help.obsidian.md/plugins/tags)
- [Bases](https://help.obsidian.md/bases)
- [Create a base](https://help.obsidian.md/bases/create-base)
- [Bases views](https://help.obsidian.md/bases/views)
- [Bases formulas](https://help.obsidian.md/formulas)
- [Bases functions](https://help.obsidian.md/bases/functions)
- [Table view](https://help.obsidian.md/bases/views/table)
- [Cards view](https://help.obsidian.md/bases/views/cards)
- [List view](https://help.obsidian.md/bases/views/list)
- [Kanban view](https://help.obsidian.md/bases/views/kanban)
- [Map view](https://help.obsidian.md/bases/views/map)
- [Canvas](https://help.obsidian.md/plugins/canvas)
- [Daily notes](https://help.obsidian.md/plugins/daily-notes)
- [Templates](https://help.obsidian.md/plugins/templates)
- [Unique note creator](https://help.obsidian.md/plugins/unique-note)
- [Note composer](https://help.obsidian.md/plugins/note-composer)
- [Bookmarks](https://help.obsidian.md/plugins/bookmarks)
- [Outline](https://help.obsidian.md/plugins/outline)
- [File recovery](https://help.obsidian.md/plugins/file-recovery)
- [Word count](https://help.obsidian.md/plugins/word-count)
- [Slides](https://help.obsidian.md/plugins/slides)
- [Audio recorder](https://help.obsidian.md/plugins/audio-recorder)
- [Random note](https://help.obsidian.md/plugins/random-note)
- [Footnotes view](https://help.obsidian.md/plugins/footnotes)
- [Format converter](https://help.obsidian.md/plugins/format-converter)
- [Slash commands](https://help.obsidian.md/plugins/slash-commands)
- [Page preview](https://help.obsidian.md/plugins/page-preview)
- [Callouts](https://help.obsidian.md/callouts)
- [Folding](https://help.obsidian.md/folding)
- [Embed web pages](https://help.obsidian.md/embed-web-pages)
- [Settings](https://help.obsidian.md/settings)
- [Appearance](https://help.obsidian.md/appearance)
- [Themes](https://help.obsidian.md/themes)
- [CSS snippets](https://help.obsidian.md/snippets)
- [Hotkeys](https://help.obsidian.md/hotkeys)
- [Editing shortcuts](https://help.obsidian.md/editing-shortcuts)
- [Community plugins](https://help.obsidian.md/community-plugins)
- [Plugin security](https://help.obsidian.md/plugin-security)
- [Core plugins](https://help.obsidian.md/plugins)
- [Obsidian URI](https://help.obsidian.md/uri)
- [Obsidian CLI](https://help.obsidian.md/cli)
- [Importer](https://help.obsidian.md/plugins/importer)
- [Import notes](https://help.obsidian.md/import)
- [Web viewer](https://help.obsidian.md/plugins/web-viewer)
- [Obsidian Sync](https://help.obsidian.md/sync)
- [Sync settings](https://help.obsidian.md/sync/settings)
- [Sync security](https://help.obsidian.md/sync/security)
- [Sync version history](https://help.obsidian.md/sync/version-history)
- [Sync collaboration](https://help.obsidian.md/sync/collaborate)
- [Sync plans](https://help.obsidian.md/sync/plans)
- [Headless Sync](https://help.obsidian.md/sync/headless)
- [Obsidian Publish](https://help.obsidian.md/publish)
- [Publish your content](https://help.obsidian.md/publish/publish)
- [Manage Publish sites](https://help.obsidian.md/publish/sites)
- [Customize Publish site](https://help.obsidian.md/publish/customize)
- [Publish custom domains](https://help.obsidian.md/publish/domains)
- [Publish permalinks](https://help.obsidian.md/publish/permalinks)
- [Publish SEO](https://help.obsidian.md/publish/seo)
- [Publish collaboration](https://help.obsidian.md/publish/collaborate)
- [Web Clipper](https://help.obsidian.md/web-clipper)
- [Clip web pages](https://help.obsidian.md/web-clipper/capture)
- [Web Clipper templates](https://help.obsidian.md/web-clipper/templates)
- [Web Clipper Interpreter](https://help.obsidian.md/web-clipper/interpreter)
- [Mobile app](https://help.obsidian.md/mobile)
- [iOS and iPadOS](https://help.obsidian.md/ios)
- [Android](https://help.obsidian.md/android)
- [Language settings](https://help.obsidian.md/language)

Official developer/API docs used:

- [Obsidian Developer Docs](https://docs.obsidian.md/)
- [Build a plugin](https://docs.obsidian.md/Plugins/Getting+started/Build+a+plugin)
- [Anatomy of a plugin](https://docs.obsidian.md/Plugins/Getting+started/Anatomy+of+a+plugin)
- [Commands](https://docs.obsidian.md/Plugins/User+interface/Commands)
- [Views](https://docs.obsidian.md/Plugins/User+interface/Views)
- [Editor extensions](https://docs.obsidian.md/Plugins/Editor/Editor+extensions)
- [Vault API](https://docs.obsidian.md/Plugins/Vault)
- [MetadataCache API](https://docs.obsidian.md/Reference/TypeScript+API/MetadataCache)
- [Workspace API](https://docs.obsidian.md/Reference/TypeScript+API/Workspace)
- [CSS variables](https://docs.obsidian.md/Reference/CSS+variables/CSS+variables)

Official changelog entries used heavily:

- [Obsidian changelog](https://obsidian.md/changelog/)
- [Changelog JSON feed](https://obsidian.md/changelog.json)
- [Desktop 1.13 public](https://obsidian.md/changelog/2026-07-30-desktop-v1.13.4/)
- [Mobile 1.13 public](https://obsidian.md/changelog/2026-07-30-mobile-v1.13.4/)
- [Desktop 1.13.6 public](https://obsidian.md/changelog/2026-08-10-desktop-v1.13.6/)
- [Mobile 1.13.8 public](https://obsidian.md/changelog/2026-08-20-mobile-v1.13.8/)
- [Desktop 1.14.0 early access](https://obsidian.md/changelog/2026-09-02-desktop-v1.14.0/)
- [Mobile 1.14.0 early access](https://obsidian.md/changelog/2026-09-02-mobile-v1.14.0/)
- [Desktop 1.14.1 early access](https://obsidian.md/changelog/2026-09-08-desktop-v1.14.1/)
- [Mobile 1.14.1 early access](https://obsidian.md/changelog/2026-09-08-mobile-v1.14.1/)
- [Desktop 1.14.2 early access](https://obsidian.md/changelog/2026-09-15-desktop-v1.14.2/)
- [Mobile 1.14.2 early access](https://obsidian.md/changelog/2026-09-15-mobile-v1.14.2/)

## Completeness Check

- Current core plugins documented: yes, via Core plugins and individual sections.
- Editor documented comprehensively: yes.
- Properties: yes.
- Bases: yes, with public/Catalyst distinctions.
- Canvas: yes.
- Graph: yes.
- Linking/backlinks/outgoing: yes.
- Search grammar: yes.
- Workspace/tabs/windows: yes.
- Attachments/images/PDF/audio/video: yes, with PDF uncertainty marked.
- Mobile and Quick Capture: yes, with Catalyst distinctions.
- Sync/Publish/Web Clipper: yes as separate official services/extensions.
- CLI/URI automation: yes.
- Community plugins distinguished from core: yes.
- Catalyst-only features identified: yes.
- Deprecated/replaced features identified: yes.
- Feature interactions and filesystem edge cases included: yes.
- Takenotes prerequisites and feature layers included: yes.
