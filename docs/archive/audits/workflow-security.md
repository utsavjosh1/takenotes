# Workflow security review — takenotes

Scope: `.github/workflows/ci.yml` + `.github/workflows/release.yml` after SHA
pinning (§10–§11). All third-party actions are pinned to immutable full commit
SHAs with the human-readable release version kept as a trailing comment.

## Pins (resolved 2026-09-16 via `git ls-remote` against upstream tags)

| Action | Pin (commit SHA) | Comment |
|---|---|---|
| actions/checkout | `11bd71901bbe5b1630ceea73d27597364c9af683` | v4.2.2 |
| actions/setup-node | `49933ea5288caeca8642d1e84afbd3f7d6820020` | v4.4.0 |
| actions/upload-artifact | `ea165f8d65b6e75b540449e92b4886f43607fa02` | v4.6.2 |
| actions/download-artifact | `d3f86a106a0bac45b974a628896c90dbdf5c8093` | v4.3.0 |
| softprops/action-gh-release | `72f2c25fcb47643c292f7107632f7a47c1df5cd8` | v2.3.2 |
| actions/attest-build-provenance | `e8998f949152b193b063cb0ec769d69d929409be` | v2.4.0 |

No hashes invented: each SHA is the tagged release commit from the legitimate
upstream repository. Re-verify with `git ls-remote <url> refs/tags/<tag>` when
bumping; update SHA + comment together.

## Review verdicts

| Check | Verdict | Basis |
|---|---|---|
| `pull_request_target` | PASS — absent | Workflows trigger on `pull_request`, `push: branches [main]`, and `push: tags v*.*.*` only. Untrusted PR code never runs with write credentials. |
| Untrusted event interpolation | PASS | No `${{ github.event.* }}` inside any `run:` block. The sole event use is `github.ref_name` in `with:`/`run:` filename contexts (`prerelease:` boolean expression, SBOM filename) — not shell interpolation. |
| `write-all` / excessive permissions | PASS | Top-level default `contents: read` in both workflows; every CI/build job re-declares `contents: read`. Only `publish` elevates, to exactly `contents: write` (GitHub Release) + `id-token: write` + `attestations: write` (provenance). |
| Shell interpolation | PASS | `run:` blocks use fixed commands and static paths. Secrets appear only in `env:` (`WIN_CSC_LINK`, `MAC_*`, `APPLE_*`) — never echoed or interpolated into scripts. |
| Artifact poisoning between jobs | PASS (by construction) | Release triggers on tags, not PRs. `publish` downloads artifacts only from `needs: [windows, macos, linux]` jobs in the SAME run; no cross-run or PR-supplied artifacts are merged. `wsl-runtime` is built from the same commit in-run. |

## Provenance (§12) and SBOM (§13)

- Provenance: `actions/attest-build-provenance` in `publish` over `*.exe, *.dmg, *.AppImage, *.deb, *.rpm`. Verify: `gh attestation verify <artifact> --repo <owner/repo>`. Requires public repo / supported tier — if attestation is unavailable, the release still ships with `SHA256SUMS.txt` + SBOM and the gap stays documented, never silently claimed. Local MVP development is never blocked by this.
- SBOM: `npm sbom --sbom-format spdx` in `publish`, attached as `takenotes-<tag>.spdx.json`. Scope is honest: locked Node dependency tree + Electron runtime version. Native installer binaries are checksummed, not inventoried. No new runtime dependency was introduced (npm CLI built-in).

## Signing (§14, §18)

- Windows: unsigned dev builds accepted; stable public release requires `WIN_CSC_LINK` / `WIN_CSC_KEY_PASSWORD` secrets (Authenticode). Never commit credentials.
- macOS: stable public release requires Developer ID signing + hardened runtime + notarization + stapling (`MAC_CSC_LINK`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`), verified through a Gatekeeper test on the downloaded final artifact — an unsigned local build is never equivalent.
