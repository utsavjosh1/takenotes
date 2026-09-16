# Support matrix — takenotes (§6–§9)

`tested` = executed, not inferred. Architecture support ≠ tested support
(§9): Electron shipping an `arm64` binary never counts as product support.

## Tier 1 — tested before stable (§7)

| OS | Version | Arch | Desktop / display | Package | Tested | Supported | Notes |
|---|---|---|---|---|---|---|---|
| Windows | 11 | x64 | Explorer / native | NSIS setup | PARTIAL | YES (target) | Needs Win11 host: NTFS + `wsl.exe` round-trip |
| macOS | 13+ | arm64 | Aqua | DMG | NOT TESTED | YES (target) | Needs Mac CI + hardware: signing, notarization, Gatekeeper |
| macOS | 13+ | x64 | Aqua | DMG | NOT TESTED | YES (target) | Intel proof independent of Apple Silicon (§133) |
| Linux | Ubuntu 24.04 LTS | x64 | GNOME / Wayland | AppImage, DEB, RPM | PARTIAL | YES (target) | Container-verified logic; needs desktop session test |
| Linux | Ubuntu 24.04 LTS | x64 | GNOME / X11 | AppImage, DEB, RPM | NOT TESTED | YES (target) | X11 fallback path |
| Windows WSL | Ubuntu 22.04 / 24.04 (WSL2) | x64 | — | bundled runtime | PARTIAL | YES (target) | Helper logic INTEGRATION-tested on Ubuntu Node; `wsl.exe` leg needs Windows |

## Tier 2 — best-effort (§8)

| OS | Version | Arch | Status |
|---|---|---|---|
| Windows | 11 | ARM64 | NOT TESTED — no release until hardware-tested (§126) |
| Linux | Ubuntu newer / Fedora | x64 | NOT TESTED |
| Linux | KDE Plasma | x64 | NOT TESTED — smoke-test before claims (§94) |
| Linux | any | ARM64 | NOT TESTED |

Unsupported-by-policy for MVP: WSL1, non-Ubuntu WSL distros (best-effort),
Snap/Flatpak (until portal access is designed, §134), macOS < 13.
Unsupported configurations are reported precisely
(“This configuration hasn't been tested yet: …”), never with
platform-shaming (§179).
