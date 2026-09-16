# Test matrix (§149)

Only `PASS / FAIL / NOT TESTED / PARTIAL / N/A` (§220). Environment for
every result: OS version, arch, desktop/display, Electron + app version
(§176–§177). Results below reflect the Linux-container CI plus honest
gaps — nothing is marked PASS without execution (§218).

| Feature | Windows x64 | Windows WSL | macOS arm64 | macOS x64 | Linux Wayland | Linux X11 |
|---|---|---|---|---|---|---|
| Launch | NOT TESTED | N/A | NOT TESTED | NOT TESTED | PARTIAL¹ | NOT TESTED |
| Workspace open (native dialog) | NOT TESTED | N/A | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED |
| WSL connect (hello → open) | NOT TESTED | PARTIAL² | N/A | N/A | N/A | N/A |
| File read / save | NOT TESTED | PARTIAL² | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED |
| Conflict detection | NOT TESTED | PASS² | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED |
| Watch / external change | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED |
| Search | NOT TESTED | PARTIAL² | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED |
| Trash (native semantics) | NOT TESTED | N/A³ | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED |
| Quick open / palette | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | PARTIAL¹ | NOT TESTED |
| Menus (native roles) | NOT TESTED | N/A | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED |
| Shortcuts (collision suite) | PASS⁴ | N/A | PASS⁴ | PASS⁴ | PASS⁴ | PASS⁴ |
| IME / composition guard | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED |
| Theme (system ↔ dark) | NOT TESTED | N/A | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED |
| Window state / multi-monitor | NOT TESTED | N/A | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED |
| Installer | NOT TESTED | N/A | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED |
| Uninstall leaves notes | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED |
| Offline | PARTIAL⁵ | PARTIAL⁵ | PARTIAL⁵ | PARTIAL⁵ | PARTIAL⁵ | PARTIAL⁵ |

1. Linux Electron smoke (`scripts/smoke-linux.mjs`): window opens, bridge
   keys exact, zero renderer console errors — WSLg display, not a Tier 1
   desktop session.
2. Real bundled-helper INTEGRATION tests on Ubuntu Node
   (`tests/integration/helper-roundtrip.test.ts`, symlink, handshake):
   protocol + filesystem logic proven; the Windows→`wsl.exe` boundary is
   not executed here.
3. WSL trash/rename/reveal report precise “not supported in this version”
   by design.
4. `tests/platform/keymap.test.ts` builds all three maps in CI (Linux +
   Windows runners; macOS runner added).
5. Static: no telemetry, no startup requests, no network in helper
   (`docs/audit/network-audit.md`); on-device offline runs per OS are
   NOT TESTED.
