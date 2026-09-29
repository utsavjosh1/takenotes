# Release (Windows-only)

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

Tag push triggers `.github/workflows/release.yml` (Windows-only):

1. **WSL runtime (windows-latest)**: build `helper.cjs`, download pinned
   official Node linux-x64, verify SHA-256 against official metadata (fail on
   mismatch), stage `node` + `helper.cjs` + `manifest.json` with real hashes,
   upload artifact.
2. **Windows (windows-latest)**: download runtime artifact, `version:check`,
   typecheck, tests, build, `release:verify`, `electron-builder --win nsis zip
   --publish never` → `takenotes-<v>-win-x64.exe` (NSIS installer — the
   in-app updater target, ADR-0006) + `takenotes-<v>-win-x64.zip` (portable
   fallback) + `SHA256SUMS.txt`.
3. **Publish**: validate tag/version, extract CHANGELOG section via
   `scripts/release-notes.mjs`, generate SPDX SBOM, attest artifacts, create
   GitHub Release with `*.exe` + `*.zip` + `SHA256SUMS.txt` + `*.spdx.json`.

macOS/Linux releases were removed: no DMG/AppImage/deb/rpm jobs, no
`mac:`/`linux:` builder config, no `package:mac*`/`package:linux` scripts.
The OS adapters stay in `src/` (parked) but ship nothing.

Why a tag can show only "Source code (zip/tar.gz)": GitHub always attaches
source archives to a tag. Real installers appear only after the Release
workflow's `publish` job succeeds. If `windows` fails, `publish` is skipped
and no installers are uploaded — check the failed job log, fix, move the
tag, and push again.

Never let electron-builder auto-publish. In-app updates are served by the
lightweight updater (ADR-0006: check GitHub Releases, verified download,
launch installer) — no `latest.yml` metadata needed, so `publish: null`
stays. Early builds are unsigned; SmartScreen warnings are expected and
documented in the release notes.

Packaging notes:
- `build/` icons are not yet branded — installers currently use the default
  Electron icon (TODO: add `build/icon.ico`).
