# Release

Single version source: `package.json` (+ `package-lock.json` root version).

```bash
npm run version:set -- 0.2.0
# update CHANGELOG.md ([0.2.0] section)
npm run version:check
git add package.json package-lock.json CHANGELOG.md
git commit -m "chore(release): prepare v0.2.0"
# CI green, then:
git tag -a v0.2.0 -m "takenotes v0.2.0"
git push origin main
git push origin v0.2.0
```

Tag push triggers `.github/workflows/release.yml`:

1. **WSL runtime (ubuntu-latest)**: build `helper.cjs`, download pinned
   official Node linux-x64, verify SHA-256 against official metadata (fail on
   mismatch), stage `node` + `helper.cjs` + `manifest.json` with real hashes,
   upload artifact.
2. **Windows (windows-latest)**: download runtime artifact, `version:check`,
   typecheck, tests, build, `release:verify`, `electron-builder --win nsis
   --publish never`, generate `SHA256SUMS.txt`.
3. **Publish**: validate tag/version, verify checksums, extract CHANGELOG
   section via `scripts/release-notes.mjs`, create GitHub Release, upload
   `takenotes-<v>-windows-x64-setup.exe` + `SHA256SUMS.txt`.

Never let electron-builder auto-publish. No auto-update in MVP (manual
installer updates from GitHub Releases). Early builds are unsigned; SmartScreen
warnings are expected and documented.
