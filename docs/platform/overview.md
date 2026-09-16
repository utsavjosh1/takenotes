# Platform overview — takenotes

One coherent product, native-feeling on each OS:

```text
shared product semantics
+
platform-native interaction
+
platform-specific implementation where necessary
```

A Mac user should feel they are using a Mac application; Windows and Linux
users likewise — while all three recognize the same files, editor, commands
and mental model (§222).

## Architecture

```text
                 React Renderer (no Node)
                         │
                    Preload API (narrow, typed)
                         │
                    Electron Main
                         │
       ┌─────────────────┼──────────────────┐
       ▼                 ▼                  ▼
 Windows Adapter    macOS Adapter      Linux Adapter
       │                 │                  │
  Windows FS          macOS FS           Linux FS
       │
       └──── optional WSL Adapter (Windows-only)
                    ▼
              wsl.exe → private Node → helper.cjs → WSL FS
```

WSL is a **Windows-only capability** (§2). It never appears as a macOS/Linux
dependency, UI entry, or bundled resource (§16, §184–§185).

## Where platform decisions live

| Concern | Source of truth |
|---|---|
| OS identity | `src/shared/platform/platform.ts` (`currentDesktopPlatform()` / `usePlatform()` hook) |
| Capabilities | `src/shared/platform/capabilities.ts` (`getCapabilities`) — branch on capabilities, not OS |
| Commands + accelerators | `src/shared/platform/keymap.ts` (single registry, §33) |
| Shortcut display | `src/shared/platform/shortcut-labels.ts` (one formatter, §37) |
| Window policy | `src/shared/platform/window.ts` + `src/main/platform/{windows,macos,linux}.ts` |
| Menus | `src/main/platform/menus.ts` (semantic commands + native roles) |
| Filesystem | `src/main/workspace/` (native) + `wsl-helper/` (WSL only) |

The renderer never sniffs `navigator.platform` / user-agent strings (§10);
the platform arrives via the controlled `app:platform` IPC.

## Support tiers

- **Tier 1** (tested before stable): Windows 11 x64 · macOS 13+ arm64 + x64 ·
  Ubuntu 24.04 LTS x64 (Wayland + X11 smoke).
- **Tier 2** (best-effort): Windows ARM64 · newer Ubuntu/Fedora · KDE Plasma ·
  Linux ARM64. Never marketed as fully supported until tested (§8–§9).

Full matrix: `support-matrix.md`. Test results: `test-matrix.md`,
`keyboard-test-matrix.md`, `final-platform-audit.md`.

## Product invariants (all platforms, §221)

Markdown is the source of truth · no proprietary database · offline-first,
no telemetry · renderer has no Node · main owns the filesystem · revision
checks + conflict protection + draft recovery · no local server · notes
survive uninstall · native keyboard/window conventions · irrelevant-OS UI
stays hidden.
