# Final platform audit (§219–§220)

Revision: working tree post-stabilization (see `git status`). Values:
`PASS / FAIL / NOT TESTED / PARTIAL / N/A` only.

## Windows (Tier 1 target)

| Area | Result | Limitations |
|---|---|---|
| Local workspace + NTFS semantics | PARTIAL | Logic unit-tested; NTFS on-device run NOT TESTED |
| Keyboard map (Ctrl, F2/Del, roles) | PARTIAL | Collision suite PASS; hardware NOT TESTED |
| Window controls / overlay / Snap | NOT TESTED | Needs Win11 host |
| NSIS installer + signing gate | PARTIAL | Config + SHA256SUMS wired; signature needs cert + host run |
| WSL optional, works without | PARTIAL | Capability-gated UI; `wsl.exe` leg needs Windows |
| Offline | PARTIAL | Static audit PASS; on-device NOT TESTED |
| Security audit | PASS | `docs/audit/` (this container) |

## Windows WSL

| Area | Result | Limitations |
|---|---|---|
| hello → workspace.open → ops | PARTIAL | Helper INTEGRATION-tested on Ubuntu Node; `wsl.exe` boundary NOT TESTED |
| Conflict / symlink containment | PASS | Round-trip + symlink tests green |
| Search via helper primitives | PARTIAL | Integration-tested pattern;needs Windows run |

## macOS arm64 / x64 (Tier 1 target)

| Area | Result | Limitations |
|---|---|---|
| Lifecycle (close≠quit, activate) | PARTIAL | Implemented + unit-tested (`window.ts` policy); device NOT TESTED |
| Menu (app menu, roles) | PARTIAL | Template builds from registry; on-Mac render NOT TESTED |
| Keyboard (⌘, ⌘⌫, glyphs) | PARTIAL | Collision + label tests PASS; hardware NOT TESTED |
| Traffic lights / inset | NOT TESTED | Needs Mac + fullscreen check |
| Signing / notarization / Gatekeeper | NOT TESTED | Secrets + clean-Mac run required |
| Filesystem tests | NOT TESTED | APFS run required |

## Linux Wayland / X11 (Tier 1 target)

| Area | Result | Limitations |
|---|---|---|
| Launch + bridge smoke | PARTIAL | `smoke-linux.mjs` under WSLg; Tier 1 desktop session NOT TESTED |
| Wayland matrix (§92) | NOT TESTED | Needs GNOME/Wayland + X11 sessions |
| Packages (AppImage/DEB/RPM) | NOT TESTED | Install/`.desktop`/icon/uninstall per §214 |
| Keyboard / IME on device | NOT TESTED | See keyboard-test-matrix |
| No-root / sandbox | PARTIAL | No elevation code paths; install-time proof pending |

## Release status model (§26) — this pass

```text
STATIC SECURITY ................. PASS (static audit, all OSes identical)
UNIT TESTS ...................... PASS (71 passed / 9 platform-gated skips; 12 new this pass: 10 draft + 2 containment)
INTEGRATION TESTS ............... PASS (helper round-trip/symlink suite green)
PRODUCTION BUILD ................ PASS (renderer + main/preload + helper + release:verify green)
ELECTRON SMOKE .................. NOT VERIFIED this pass (no display server in container; prior WSLg evidence retained, bridge assertion updated for `draft`)
WINDOWS LOCAL PACKAGED .......... NOT TESTED (checklist §A)
WINDOWS WSL PACKAGED ............ NOT TESTED (checklist §A)
MACOS ARM64 PACKAGED ............ NOT TESTED (checklist §B)
MACOS X64 PACKAGED .............. NOT TESTED (checklist §B; compile ≠ verification)
LINUX WAYLAND PACKAGED .......... NOT TESTED (checklist §C)
LINUX X11 ....................... NOT TESTED (checklist §C)
SIGNING ......................... NOT CONFIGURED (secrets + native runs pending)
PROVENANCE ...................... NOT CONFIGURED (wired; first tagged release pending)
OVERALL ......................... CONDITIONAL PASS
```

Draft recovery is store-tested and wired end-to-end (userData drafts,
750 ms debounce, recovery banner that never displays `Saved` for a draft);
device-level UX proof stays NOT TESTED until a packaged run. Fuses, action
pins, provenance, and SBOM are configured with verification steps; measured
binary evidence is pending the first packaged build — recorded, not assumed.

## Cross-cutting

| Area | Result |
|---|---|
| Keyboard collisions + reserved (3 maps) | PASS (`npm run keymap:check`) |
| Filesystem contract (native adapters) | PARTIAL (Windows-gated suite + WSL integration; macOS/Linux native runs pending) |
| Packaging content (no WSL outside win) | PASS (config STATIC; artifact inspection pending first full release) |
| Signing | PARTIAL (gates wired, secrets + native runs pending) |
| Security (renderer isolation, CSP-equivalent) | PASS (static audit, all OSes identical) |
| Network/offline posture | PASS (static audit) |

## Known issues (honest, §218)

1. No Tier 1 OS has completed the §224 end-to-end workflow on hardware.
   Executable procedures now live in `docs/platform/real-device-checklist.md`
   (§A Windows/WSL proof + failure matrix + packaged independence, §B macOS
   arm64/x64 + signing/Gatekeeper, §C Linux Wayland/X11 + packages, §D
   keyboard/IME) — all marked NOT TESTED until run.
2. `openDevTools` was unconditional — FIXED (dev-flag gated).
3. `keymap:check` pointed at a non-existent file — FIXED.
4. `file.save` had no menu entry — FIXED (File → Save).
5. Tree Delete/Backspace ignored macOS Finder convention — FIXED (⌘⌫ on mac).
6. App shortcuts fired with palette open — FIXED (modal owns keyboard).
7. Undocumented `mod+O` binding — REMOVED (single-registry truth).
8. Release was Windows-only — FIXED (macos + linux jobs, merged SHA256SUMS,
   all-Tier-1 gate). First green full-matrix release still pending.
9. `docs/platform/` did not exist — ADDED (this set).
