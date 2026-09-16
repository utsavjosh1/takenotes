# Keyboard — takenotes

Source of truth: `src/shared/platform/keymap.ts` (registry),
`src/shared/platform/shortcut-labels.ts` (display), menus in
`src/main/platform/menus.ts`, dispatch in `src/renderer/App.tsx` +
`src/renderer/editor/create-editor.ts`.

## Model (§33–§36)

Identity is the command (`file.save`); `Ctrl+S` / `⌘S` are platform
bindings. Nothing outside `keymap.ts` invents a shortcut. Ordinary
cross-platform bindings use Electron's `CommandOrControl`, which maps to
⌘ on macOS and Ctrl elsewhere — but that token never reaches the user
(§37).

## Initial keymap (§40)

| Command | macOS | Windows / Linux |
|---|---|---|
| New note | ⌘N | Ctrl+N |
| Save | ⌘S | Ctrl+S |
| Quick open | ⌘P | Ctrl+P |
| Command palette | ⇧⌘P | Ctrl+Shift+P |
| Find in note | ⌘F | Ctrl+F |
| Workspace search | ⇧⌘F | Ctrl+Shift+F |
| Close tab | ⌘W | Ctrl+W |
| Close window | ⇧⌘W | Ctrl+Shift+W |
| Settings | ⌘, | Ctrl+, |
| Next / prev tab | ⌃⇥ family | Ctrl+Tab / Ctrl+Shift+Tab |
| Rename (tree) | menu/palette only | F2 |
| Trash (tree) | ⌘⌫ | Delete |
| Undo/redo/editing | native roles | native roles |
| Quit / fullscreen / zoom | native roles | native roles |

Redo is `⇧⌘Z` on macOS via the native role — never hard-coded `Ctrl+Y`
(§42). Fullscreen is `Control+Command+F` on macOS, `F11`-convention on
Windows/Linux, both via roles (§45). Quit/close stay distinct per OS
(§46).

## Display (§37–§39, §117–§119)

One formatter. macOS glyphs (`⌘ ⇧ ⌥ ⌃ ↩ ⌫ ⎋ ⇥ ↑↓←→`); word labels
(`Ctrl+Shift+P`, `Alt+…`) on Windows/Linux. Tooltips, palette rows and the
settings screen all call `shortcutLabel(id)` — no duplicated strings (§118).

## Dispatch (§58–§59)

```text
accelerator/menu/click
        ↓
  command registry (CommandId)
        ↓
  command execution (one function)
```

Mouse and keyboard share the path. CodeMirror owns editor-find; the app
does not double-handle it. Menu accelerators are the primary keyboard
surface; the renderer keydown handler is the fallback — both converge on
the same command functions.

## Scope + modality (§53–§55)

Scopes: `application | workspace | editor | fileTree | modal`. While the
command palette / quick-open is open it owns Arrows/Enter/Escape (capture
phase); app shortcuts stand down except Save. Escape closes the topmost
layer only (tooltip → menu → palette → dialog → rename) and never discards
a dirty note.

## Input protection (§47–§51, §154)

- `e.isComposing` / `key === "Process"` guard: no commands mid-composition
  (CJK, Indic IMEs).
- No `Option+letter` (macOS) and no `Ctrl+Alt+letter` (AltGr) bindings —
  by construction: the registry contains none.
- Dead keys and non-QWERTY layouts (AZERTY/QWERTZ): commands match on
  `e.key`, never bare `event.code` position assumptions.
- No `globalShortcut` for MVP commands (§52).

## Collisions + reserved (§56–§57)

`npm run keymap:check` (`tests/platform/keymap.test.ts`) fails on any
same-scope duplicate per platform and on any binding that shadows
`Cmd+Q/H/M`, `Alt+F4`, Spotlight or IME-switch keys. Questionable mappings
(`Ctrl+Tab` next-tab on macOS) ship only with this test green.
