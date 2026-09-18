# Release audit — takenotes

AUDIT REVISION: ca1e54e…

## Artifact integrity chain (§20)

| Stage | Mechanism | Verified |
|---|---|---|
| Official Node archive | `fetch-wsl-runtime.mjs` vs official `SHASUMS256.txt`, throws on mismatch | STATIC (code review; download never run here) |
| Packaged runtime/helper/manifest | `stage-wsl-runtime.mjs` writes real-hash `manifest.json` | STATIC (never executed here — NOT VERIFIED end-to-end) |
| Install-time verify | `verifyLocalFileSha256` exists; installer is placeholder-orchestrated | PARTIAL — helper install full sequence NOT VERIFIED |
| Connect-time verify | NEW this audit: handshake enforces protocol + nonce + execPath | UNIT/INTEGRATION (round-trip test) |
| Version match | `version:check` + `verify-release.mjs` (tag/package/CHANGELOG/artifact) | PASS in CI |

## Package contents

- Builder `files` allowlist: `dist-electron`, `dist/renderer`, `package.json` only; `extraResources`: staged `node/helper.cjs/manifest.json`. **Excluded by construction**: `.git`, `tests`, `docs`, `scripts`, `resources/wsl/generated` (source archive), `dist-helper` (dev bundle).
- Source maps: renderer build sets `sourcemap:false`; main/helper via esbuild scripts — verified no `.map` emission flags. Decision: no production source maps (documented).
- Signing: **unsigned early build** (no cert configured) — must be disclosed at release; SmartScreen warning is expected, not malware evidence.
- Fuses/attestations/SBOM: not configured — recorded limitations; provenance = tag + lockfile + CI logs.

## Gates (§194–195)

CI runs `npm ci / version:check / typecheck / lint / test / build` on ubuntu + windows.
This audit ADDS `audit:security` + `audit:deadcode` to the ubuntu job (script-enforced
invariants, not vibes). Release requires: clean CI, zero BLOCKER/HIGH, connection proof
on real WSL, offline proof, package audit, tag/version match.
