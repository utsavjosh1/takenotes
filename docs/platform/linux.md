# Linux — takenotes

Tier 1 target: **Ubuntu 24.04 LTS x64** plus a modern Wayland session;
a second desktop (e.g. KDE Plasma) is smoke-tested before broad claims
(§7, §94). No `sudo`/`root`, no `--no-sandbox` workarounds — sandbox
failures are packaging bugs (§90).

## Workspaces (§15)

Linux-local only: main → Linux adapter → Node filesystem → ext4/Btrfs/XFS.
The WSL helper is **never** run locally for symmetry — that would be pure
complexity (§15). Native desktop file picker via `dialog.showOpenDialog`
(§17). NFS/FUSE locations are best-effort unless tested (§171).

## Wayland-first (§91–§93)

Never force `--ozone-platform=x11` globally; test native Wayland first and
scope any workaround to the affected session with reason + issue + removal
condition (§181–§182). Wayland matrix per release: launch, window ops,
titlebar controls, menus, clipboard, file dialog, shortcuts, IME, HiDPI,
multi-monitor, focus, suspend/resume (§92). X11/XWayland is a diagnostic
fallback, documented when used.

## Window chrome (§72, §159)

Native system frame (`frame: true`) — stability outranks identical
appearance. The layout must work with a system titlebar above the app
chrome; frameless mode is never mandatory. `detectWayland()` reports
`WAYLAND_DISPLAY` presence to the renderer; behavior never branches on
assumed DE rendering.

## Desktop integration (§134–§139)

AppImage + DEB + RPM (no Snap/Flatpak until portal/filesystem access is
designed, §134). `.desktop` entry (`Name`, `Exec`, `Icon`, `Categories`,
`StartupWMClass=takenotes`), standard icon sizes, launcher/task-switcher
verified per release (§211–§214). Uninstall never removes workspaces (§143).

## Keyboard, fonts, scrolling

`Ctrl`-word labels; `F2` rename / `Delete` trash with palette + context
menu fallbacks. Compose key sequences and IME composition are never stolen
by shortcuts (§49, §154). System font stack (no forced Segoe UI, §83);
layouts tolerate wider labels, variable metrics and overlay-vs-fixed
scrollbars (§164–§166). Middle-click tab close supported where available,
never required (§96).

## Paths (§21–§24)

Native `node:path` semantics; `note.md` / `Note.md` / `NOTE.md` are three
files — identity never lower-cases. Unicode names (NFC/NFD, CJK, RTL,
emoji) are preserved byte-exact, never rewritten (§24).

## Known limitations

- Tier 2 distros/desktops are best-effort until tested (see
  `support-matrix.md`).
- Real Wayland/X11 + DEB/RPM validation needs Linux desktop hardware or
  VMs with GPU-accelerated sessions (`final-platform-audit.md`).
