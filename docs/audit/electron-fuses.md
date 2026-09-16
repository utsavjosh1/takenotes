# Electron fuses — takenotes

Hook: `scripts/after-pack-fuses.mjs` (wired via `afterPack` in `electron-builder.yml`).
Package: `@electron/fuses` 1.8.0 (direct devDependency). Target: Electron 44.
Semantics verified against the Electron fuses tutorial + the installed
`@electron/fuses` README before setting each fuse (§8: confirm → verify use →
document → packaged-app verification).

## Expected fuse state (every packaged binary, all Tier-1 OSes)

| Fuse | Expected | Why |
|---|---|---|
| RunAsNode | false | App must never run as a Node runtime (`ELECTRON_RUN_AS_NODE`). Nothing relies on it. |
| EnableCookieEncryption | true | No cookies exist (no network, lint + static audit enforced). Strictest option, zero cost. |
| EnableNodeOptionsEnvironmentVariable | false | `NODE_OPTIONS` injection into the packaged runtime is disabled. No feature reads it. |
| EnableNodeCliInspectArguments | false | `--inspect` family disabled in packaged app. Dev DevTools come from `--dev` + `openDevTools`, not CLI flags. |
| EnableEmbeddedAsarIntegrityValidation | true | Validates `app.asar` on launch (enforced on Windows/macOS). Nothing modifies asar at runtime. |
| OnlyLoadAppFromAsar | true | App loads only from `app.asar`. Build emits a bundled asar; dev (`--dev`/Vite URL) is unaffected — fuses apply to packaged binaries only. |
| LoadBrowserProcessSpecificV8Snapshot | true | Default; set explicitly so upgrades notice it. |
| GrantFileProtocolExtraPrivileges | false | Renderer loads via `file://` (`loadFile` in production) with no need for extra file-protocol privileges. Revisit with a documented reason if a custom protocol ever needs them. |

`strictlyRequireAllFuses: true` — future Electron upgrades fail loudly if a
new fuse appears that has not been evaluated. No fuse was disabled blindly.

## Actual (measured on final binaries)

| Artifact | Expected | Actual |
|---|---|---|
| Windows `takenotes-*.exe` (NSIS) | table above | NOT VERIFIED — no packaged build has been produced in this environment; CI `Verify Electron fuses` step reads the unpacked binary (`release/win-unpacked/takenotes.exe`) on every release build. First green read pending. |
| macOS `takenotes-*.dmg` arm64/x64 | table above | NOT VERIFIED — same; CI reads `release/mac-arm64/takenotes.app` (+ `mac/` for x64). |
| Linux `AppImage`/`deb`/`rpm` | table above | NOT VERIFIED — same; CI reads `release/linux-unpacked/takenotes`. |

## Verification command (per artifact, after `npm run package:*`)

```bash
# Windows (PowerShell or CI step)
npx --no-install @electron/fuses read --app "release/win-unpacked/takenotes.exe"
# macOS
npx --no-install @electron/fuses read --app "release/mac-arm64/takenotes.app"
# Linux
npx --no-install @electron/fuses read --app "release/linux-unpacked/takenotes"
```

Compare each line against the Expected column. Any mismatch blocks the release:
the hook must be fixed, not the expectation edited. Record the measured output
in the release notes for the tag.
