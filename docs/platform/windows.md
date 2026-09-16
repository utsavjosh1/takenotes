# Windows — takenotes

## Workspaces

- **windows-local**: Renderer → preload → main → Windows adapter →
  `fs/promises` with `path.win32` semantics → NTFS/ReFS (§12, §21).
- **windows-wsl** (optional, first-class): main → WSL adapter → `wsl.exe`
  (`shell: false`, pinned `%SystemRoot%\System32\wsl.exe`) → bundled
  Linux Node → `helper.cjs` → Linux filesystem (§13). The app works
  perfectly with WSL absent — no startup errors, dormant resources (§184).

Folder choice uses the native Explorer picker (`dialog.showOpenDialog`
+ `openDirectory`, §17). Only WSL needs a custom directory browser, and it
is shown on Windows only (§18).

## Window chrome (§68–§69)

Native controls + Window Controls Overlay (`titleBarStyle: "hidden"`).
Never fake min/max/close buttons — Snap Layouts, maximize/restore,
high-DPI and multi-monitor behavior must keep working.

## Menus + keyboard

Top-level `File · Edit · View · Window · Help` with `&` mnemonics (§62).
Standard editing is native roles (undo/redo/cut/copy/paste/select-all),
so redo follows Windows conventions natively (§41–§42). Quit lives under
File as `E&xit` (role `quit`, §61); `Alt+F4` is never overridden (§57).
Tree: `F2` rename, `Delete` trash (§43–§44); palette + context menu are
universal fallbacks.

## Paths + files (§21–§25)

`path.win32` for Windows semantics; WSL paths never pass through Windows
path functions. Reserved names (`CON`, `PRN`, `AUX`, `NUL`, `COM1`…,
`LPT1`…) and reserved characters are rejected for Windows workspaces only —
never leaked into macOS/Linux validation. Case-insensitive behavior is
assumed nowhere in identity logic.

## Trash / reveal (§30–§32)

`shell.trashItem` → Recycle Bin; labels read “Move to Recycle Bin” /
“Reveal in File Explorer” (`filesystem.ts`: `trashName`, `revealLabel`).
WSL paths cannot go through host trash — rename/trash/reveal there report
“not supported in this version” precisely.

## Permissions, data (§89, §19–§20)

Runs as an ordinary user; no UAC elevation for notes. Mutable state lives
under `app.getPath("userData")` — never beside the installed app
(`Program Files` may be read-only).

## Release (§125)

NSIS x64 named `takenotes-<version>-windows-x64-setup.exe`. Stable builds
are Authenticode-signed via `WIN_CSC_LINK` / `WIN_CSC_KEY_PASSWORD` CI
secrets; unsigned dev builds are acceptable but never called stable.
Uninstall never deletes user Markdown (NSIS `deleteAppDataOnUninstall:
false`, §140–§142).

## Known limitations

- Windows ARM64: not released until build + installer + tests pass on hardware (§126).
- Real NTFS + `wsl.exe` round-trip validation needs a Windows 11 host
  (see `docs/mvp-status.md`).
