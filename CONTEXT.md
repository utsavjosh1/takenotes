# CONTEXT.md — takenotes (Windows-first)

Glossary only. No implementation details.

## Terms

- **windows-local workspace**: Markdown folder on NTFS/ReFS opened via the
  native Explorer picker. Works with no WSL installed. The default.
- **wsl-remote workspace**: Linux folder inside a WSL2 distro, accessed as
  `<distro>:<absolute-posix-path>` (e.g. `Ubuntu-24.04:/home/u/notes`)
  through `wsl.exe` → app-owned Linux Node → `helper.cjs`. Opened via the
  **distro picker** (list distros → type Linux path → connect).
- **distro picker**: The "Open WSL folder…" dialog: distro dropdown +
  Linux path field + connect. Reports precise errors
  (`WSL not available`, `distro stopped`, `path not found`), never a
  generic failure.
- **launch-failure**: Installer runs but no window opens after double-click
  (distinct from install-failure and connect-failure).
- **logic test**: Pure protocol/filesystem test that runs on any OS with no
  real Windows/WSL desktop: framing, handshake, path validation,
  helper direct round-trip, search, drafts.
- **parked**: Code stays in the repo but is not a priority and never blocks
  Windows work (macOS/Linux adapters, their installers, non-logic tests).

## Decisions

- Windows 11 x64 + WSL2 Ubuntu is the only priority target.
- The app must open with WSL absent (dormant WSL, no startup errors).
- Uninstall never deletes user Markdown.
