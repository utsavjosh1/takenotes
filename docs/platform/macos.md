# macOS — takenotes

Minimum: **macOS 13+** (Electron 44 requirement), **arm64 + x64** as
separate DMGs initially (§127–§128). Apple Silicon validation never stands
in for Intel (§133).

## Workspaces (§14)

macOS-local only: main → macOS adapter → Node filesystem → APFS. No
helper, no private Node, no WSL components anywhere — not in code paths,
not in UI, not in the package (§16, §185).

`dialog.showOpenDialog` gives the Finder-style picker (§17). Files may live
on iCloud Drive, external disks or network volumes: treat them as ordinary
locations, keep conflict semantics, promise no extra atomicity (§169).

## Lifecycle (§76, §78)

Closing the last window does **not** quit; the Dock icon stays and
`activate` re-creates the window. `Cmd+Q` performs a real quit with
draft handling. Implemented in `src/main/index.ts` via
`shouldQuitOnAllWindowsClosed()` — never `File → Exit` on Mac (§60).

## Window chrome (§70–§71, §157)

Native traffic lights via `hiddenInset` + `trafficLightPosition {12,12}`;
the renderer reserves the top-left safe area (`data-platform="macos"`).
Drag regions use `-webkit-app-region: drag` with `no-drag` on every
control. Fullscreen via the native role (`Control+Command+F`, §45).

## Menus (§60, §63–§65)

Real application menu first: About · Settings… (`⌘,`) · Services · Hide ·
Quit. Edit menu is native roles (redo is `⇧⌘Z` natively, §42). Window menu
uses native roles (`minimize`, `zoom`, `front`).

## Keyboard (§37–§38)

Glyph labels (`⌘ ⇧ ⌥ ⌃ ↩ ⌫`) from the single formatter — never
`CommandOrControl` or `CMD + SHIFT` text. Tree trash is `Command+Backspace`
(Finder convention, §43); rename via context menu / palette / menu, no
F2-only path (§44). No `Option+letter` bindings (alternate-character
typing, §47); no `globalShortcut` usage (§52).

## Permissions (§88)

No camera/mic/location/contacts/calendar/disk-access requests for notes.
A blocked folder surfaces its real permission error — never a demand for
Full Disk Access.

## Release (§129–§133, §192)

Built on macOS CI (`package:mac` → arm64 + x64 DMGs). Stable releases are
Developer ID signed (secure CI secrets, `MAC_CSC_LINK`), hardened-runtime
configured, notarized with stapled ticket, then Gatekeeper-tested on a
clean Mac (drag-to-Applications, launch, Dock, `Cmd+Q`, traffic lights,
Finder reveal, §212). Uninstall (drag to Trash) never touches notes (§141).

## Known limitations

- Notarization + clean-Mac Gatekeeper test are NOT TESTED in this Linux
  container (see `final-platform-audit.md`).
- Case-sensitive APFS volumes: covered by unit-tested case-independent
  identity logic, not yet by on-volume CI (§108).
