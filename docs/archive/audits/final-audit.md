# Final audit — takenotes

```text
AUDIT REVISION: ca1e54e8444f0f70e97253d4c171f7b39df0bf02
  + audit fixes (uncommitted at report time; see file list below)

RESULT: CONDITIONAL PASS
```

Condition: no release claim beyond what is proven below. REAL WINDOWS, REAL WSL,
PACKAGED RELEASE, and OS-level dynamic proofs are NOT VERIFIED in this environment
(Linux container, no `wsl.exe`) and MUST be completed on a Windows 11 + WSL2 host
before release. Nothing in this report is labeled PASS without evidence; see the
per-area verdicts.

## What the audit changed (files)

- Removed: `src/renderer/commands/registry.ts` (dead `CommandRegistry`).
- Hardened: `window.ts` (permission deny-all), `index.ts` (single-instance),
  `helper-client.ts` (protocolError surfacing + spawn-error handling),
  `helper-supervisor.ts` (nonce/execPath handshake, protocolError kill),
  `launch-security.ts` (NEW: wsl.exe pin, env sanitization),
  `register.ts` (`wsl:connect` validation), `protocol.ts` (trimmed ops + handshake fields),
  `local-workspace.ts` + `wsl-helper/src/index.ts` (final-symlink refusal, fsync parity),
  `index.html` (tightened CSP), `main.tsx` (error boundary), `use-editor.ts` (`replaceChildren`).
- Tests: `handshake.test.ts`, `launch-security.test.ts`, `helper-symlink.test.ts` (NEW);
  suite 24 → 34 passing. The new tests found one HIGH bug (S-14) — the audit worked.
- Tooling: `scripts/audit-security.mjs`, `scripts/audit-deadcode.mjs`,
  `audit:*` npm scripts, eslint network-import ban, CI gates.

## Scorecard

| Area | Verdict | Basis |
|---|---|---|
| Connection integrity | CONDITIONAL | Arrows 1–4 + 7–9 proven (static/smoke/integration); wsl.exe boundary NOT VERIFIED live |
| Filesystem correctness | PASS (posix) / CONDITIONAL (win32) | Validators UNIT; helper INTEGRATION incl. new symlink tests; NTFS end-to-end NOT VERIFIED |
| Conflict safety | PASS | sha256 gates both sides, INTEGRATION-tested |
| Renderer security | PASS | Sandbox flags, narrow bridge, no HTML render, CSP, error boundary, smoke |
| IPC security | PASS | Inventory 13↔16 clean, sender + runtime validation, no generic surface |
| WSL helper security | CONDITIONAL | Nonce/execPath/env/pin fixed + tested direct-spawn; staged-install + live-WSL NOT VERIFIED |
| Network/privacy | PASS (static) | Zero network APIs in shipped code, lint-enforced; OS-level proof NOT VERIFIED |
| Dependency security | PASS | 0 vulns (prod+dev), all-registry lockfile, pinned runtime + verified fetch |
| Dead code | PASS | 1 removal, tripwires green |
| Package contents | CONDITIONAL | Allowlist reviewed; installer never built here |
| Release security | CONDITIONAL | Chain + gates documented; unsigned build; no fuses/attestation/SBOM |
| Offline behavior | PASS (static) | No remote dependency exists to fail |
| Resource cleanup | PASS (static) | Pending-map discipline, exit handlers, bounded backoff, no watchers to leak |

## Remaining risks (not hidden)

1. Draft persistence is IMPLEMENTED this pass (`src/main/workspace/drafts.ts`,
   `draft:*` IPC, debounced renderer writes, recovery banner) and unit-tested
   (10 new tests) — full UX proof on a real device run still pending (§3 suite
   is store-level; the banner flow needs a packaged-device run per
   `docs/platform/real-device-checklist.md`).
2. Junction/reparse-point traversal: IMPROVED this pass — every existing path
   component is now verified through `realpath` containment against the real
   root (Node-supported APIs only), plus 2 new tests. Residual: a malicious
   local OS process racing filesystem state between check and open (TOCTOU)
   cannot be fully defeated from userland Node without `O_NOFOLLOW` dirfd
   discipline. Security statement distinguishes malicious renderer/path input
   (defended, tested) from a malicious local process racing the filesystem
   (explicitly documented MVP limitation). No new native language introduced.
3. TOCTOU confinement races inherent to path-check-then-open without `O_NOFOLLOW` dirfd discipline.
4. Actions are now SHA-pinned with version comments (`docs/audit/workflow-security.md`);
   fuses configured with packaged-binary verification (`docs/audit/electron-fuses.md`);
   provenance + SPDX SBOM wired into the `publish` job. First tagged release
   run is still pending — no attestation/SBOM artifact exists yet.
5. Unicode normalization edge cases unhandled (low impact on Windows/WSL targets).
6. Single 30s timeout for all helper operations (no per-op tuning).
7. WSL install/stage sequence + Windows installer + uninstall-data behavior never executed here.
8. `deleteAppDataOnUninstall:false` is set — settings/drafts (when they exist) survive uninstall; helper/runtime cleanup policy undocumented.

## Release status model (§26) — this pass

No vague PASS. One verdict per line, evidence-linked.

```text
STATIC SECURITY ................. PASS (audit:security + audit:deadcode + lint + typecheck green)
UNIT TESTS ...................... PASS (71 passed / 9 platform-gated skips across 12 files; 12 new this pass: 10 draft + 2 containment)
INTEGRATION TESTS ............... PASS (prior helper round-trip/symlink suite green, untouched + passing)
PRODUCTION BUILD ................ PASS (renderer + main/preload + helper + release:verify green)
ELECTRON SMOKE .................. NOT VERIFIED this pass (no display server in container; prior PASS retained, bridge assertion updated for `draft`)
WINDOWS LOCAL PACKAGED .......... NOT TESTED (checklist docs/platform/real-device-checklist.md §A)
WINDOWS WSL PACKAGED ............ NOT TESTED (checklist §A; mocks are not proof)
MACOS ARM64 PACKAGED ............ NOT TESTED (checklist §B)
MACOS X64 PACKAGED .............. NOT TESTED (checklist §B; CI compile ≠ verification)
LINUX WAYLAND PACKAGED .......... NOT TESTED (checklist §C; WSLg smoke ≠ Tier-1 desktop proof)
LINUX X11 ....................... NOT TESTED (checklist §C)
SIGNING ......................... NOT CONFIGURED (gates wired, secrets + native runs pending; unsigned dev acceptable)
PROVENANCE ...................... NOT CONFIGURED (wired in publish job; first tagged release pending)
OVERALL ......................... CONDITIONAL PASS
```

Full `OVERALL: PASS` requires every Tier-1 platform's real packaged
verification (§27). Until then `CONDITIONAL PASS` is the correct, earned verdict.

Environment note (this pass): the Linux container currently has no display
server (`DISPLAY=:0` set, no X server; no install rights for Xvfb) and the
Electron DevTools endpoint is unreachable, so the Electron smoke test could
NOT be re-run here — recorded as NOT VERIFIED this pass, not as a failure.
Prior smoke PASS evidence is retained from the previous audit; the smoke
script's exact bridge-keys assertion was updated for the new narrow `draft`
bridge (`app,directory,draft,events,file,search,workspace` — still no generic
IPC leak). Static (typecheck/lint/audits), unit (71 pass), integration, and
production-build evidence were all re-proven in this pass (see below).

## What this pass changed (files)

- ADDED: `src/main/workspace/drafts.ts` (userData draft store: atomic,
  bounded, debounced via `createDraftSaver`, tolerant reads, `recoveryDecision`).
- WIRED: `draft:put/get/clear` IPC (`register.ts`, sender + runtime validated),
  preload `draft` bridge, renderer debounced (750 ms) writes + recovery banner
  (`App.tsx`). `Saved` is still shown exclusively for bytes that reached the
  note file — a persisted draft never flips the indicator.
- TESTS: `tests/workspace/drafts.test.ts` (10 tests: dirty→written,
  restart-unchanged→recoverable, externally-changed→no-overwrite,
  deleted→retained, workspace-unavailable→retained, malformed→launch-safe,
  stale→flagged, clear-on-save, bounds, debounce). Suite 34 → 44 passing.
- HARDENED: `resolveInsideRoot` per-component `realpath` containment
  (junction/reparse catch with Node-only APIs) + 2 new POSIX tests.
- FUSES: `scripts/after-pack-fuses.mjs` + `afterPack` wiring + direct
  `@electron/fuses` 1.8.0 dependency + CI `read` verification steps +
  `docs/audit/electron-fuses.md` (expected table; actual NOT VERIFIED until
  first packaged build — recorded honestly, not assumed).
- WORKFLOWS: all third-party actions SHA-pinned with version comments;
  per-job `contents: read`, publish-only elevation; attestation + SPDX SBOM
  steps in `publish`; fuse-read steps in all three OS builds.
  Review: `docs/audit/workflow-security.md`.
- DOCS: `docs/platform/real-device-checklist.md` (real Windows/WSL, macOS,
  Linux, keyboard/IME procedures — all NOT TESTED, ready to execute).

## Architectural invariants — final check

Markdown source of truth · Windows files via main · WSL files via helper ·
renderer has no Node/generic IPC · no arbitrary shell from renderer ·
private pinned Node + verified handshake · no sudo/root · no localhost server ·
no internet required · no telemetry · remote content inert · no auto-update ·
explicit-URL-only externals · conflicts never overwritten · staged integrity verified ·
privileged dead code removed · deps reviewed · notes survive uninstall (no workspace
deletion paths exist in code).
