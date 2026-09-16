# Packaging — takenotes

One version, one tag (`vX.Y.Z` = Windows = macOS = Linux, §187–§188).
`tag → version-check → shared tests → per-OS build/test/sign →
checksums → attestations → notes → one GitHub Release` (§190). A release
is not complete until every Tier 1 artifact succeeds — no silent partial
releases (§189).

## Artifact names (§124)

```text
takenotes-0.0.1-windows-x64-setup.exe
takenotes-0.0.1-macos-arm64.dmg
takenotes-0.0.1-macos-x64.dmg
takenotes-0.0.1-linux-x64.AppImage
takenotes-0.0.1-linux-x64.deb
takenotes-0.0.1-linux-x64.rpm
```

## Per-OS content (§16, §198)

Windows NSIS x64 may bundle `resources/wsl/linux-x64` (Node runtime +
`helper.cjs`), staged by the release workflow's `stage-wsl` step only for
that target. macOS/Linux packages must NOT contain WSL resources,
tests, secrets, `.env`, git history, or prototype code. `files` excludes
enforce this; `npm run release:verify` audits content.

## Signing / trust (§125–§133, §192–§193)

| OS | Stable requirement |
|---|---|
| Windows | Authenticode (`WIN_CSC_LINK`) |
| macOS | Developer ID + hardened runtime + notarization + stapled ticket |
| Linux | SHA-256 + release provenance/attestation |

Credentials live in CI secrets only. Checksums detect changed bytes;
signing/provenance establishes trust — documented as distinct (§193).

## Updates (§194–§195)

Manual GitHub-Releases updates for MVP. No auto-update until signing,
channels, and Linux package-manager differences are deliberately designed.

## Uninstall guarantee (§140–§143)

Uninstalling on ANY OS never deletes user Markdown: NSIS
`deleteAppDataOnUninstall: false`, macOS drag-to-Trash leaves notes,
DEB/RPM/AppImage removal touches no workspaces. Verified per release
(§211–§214): install → open → read → save → shortcuts → theme → quit →
uninstall → notes intact.
