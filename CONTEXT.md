# CONTEXT.md — takenotes (Windows-first)

Glossary only. No implementation details.

## Terms

- **update-check**: fetch the latest stable release tag and compare SemVer
  with the running version. Pure logic, unit-tested, silent when offline.
- **update-download / update-install**: fetch the `.exe` + `SHA256SUMS.txt`,
  verify SHA-256 (mandatory gate), launch the installer, quit the app.
- **release channel**: `stable` (`vX.Y.Z`, offered by the updater) vs
  `prerelease` (`-beta`/`-rc`, never auto-offered).

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
- **install-failure**: Installer itself is blocked or aborts (SmartScreen
  publisher-warning, browser block, NSIS error) — app files never land
  on disk.
- **publisher-warning**: Windows SmartScreen "Unknown publisher" on an
  unsigned build. Expected until Authenticode signing lands; bypass via
  More info → Run anyway. _Avoid_: publisher error.
- **download-failure**: Browser/GitHub fetch blocked or hash mismatch —
  distinct from install-failure (blocked at run) and launch-failure
  (installed but no window).
- **logic test**: Pure protocol/filesystem test that runs on any OS with no
  real Windows/WSL desktop: framing, handshake, path validation,
  helper direct round-trip, search, drafts.
- **parked**: Code stays in the repo but is not a priority and never blocks
  Windows work (macOS/Linux adapters, their installers, non-logic tests).

## Decisions

- Windows 11 x64 + WSL2 Ubuntu is the only priority target.
- The app must open with WSL absent (dormant WSL, no startup errors).
- Uninstall never deletes user Markdown.
