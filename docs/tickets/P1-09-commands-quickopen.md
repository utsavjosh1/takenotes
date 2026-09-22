# P1-09 — Unified Command Registry + Quick Open

Phase: 1 Foundation. Blocked by: P1-01 (registry lives in `CommandService`),
  P1-08 (Quick Open lists indexed files).

## Observable result

One main-owned `CommandService` registry
`{id,title,category,scope,when?,defaultHotkey?}` drives palette, menus, and
hotkeys; the ad-hoc renderer table merges into it (`keymap.ts` stays the
accelerator source). Palette: `>` = commands, bare text = Quick Open fuzzy
over indexed filenames. Fixed P1 defaults only
(`Ctrl+P` quick/palette, `Ctrl+Shift+P` commands, `Ctrl+N`, `Ctrl+S`,
`Ctrl+Shift+F`); no customization UI, no slash, no MCP `command_execute`.

## Constraints

- ADR-0009 (commands are services-first consumers). Minimum P1 IDs:
  `note.new/open`, `workspace.open/switch/close`, `editor.save`,
  `search.open`, `quickOpen.open`, `palette.open`, `view.toggleSidebar`,
  `settings.open`.

## Acceptance (must fail on starting commit)

1. Registry test: every P1 ID listed with unique id + title; executing
   `editor.save` via service == Ctrl+S path (single code path).
2. Palette tests: `>` filters commands; bare text fuzzy-matches filenames
   (keep existing `fuzzyScore` behavior); no duplicate command sources.
