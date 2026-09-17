# Testing (Windows-first, logic-only)

```bash
npm test           # vitest run (logic tests only)
npm run typecheck
npm run lint
```

Windows is the priority gate (`windows-latest` CI + Windows 11 host).
macOS/Linux files stay in the repo (parked) but never block Windows work.

## Coverage map — logic tests only

| Area | Test | Runs on |
|---|---|---|
| Protocol framing (partial/multiple/zero/oversized/bad JSON) | `tests/protocol/framing.test.ts` | any OS |
| Handshake (nonce/protocol/execPath) | `tests/protocol/handshake.test.ts` | any OS |
| Path validation (traversal/absolute/NUL/illegal) | `tests/filesystem/paths.test.ts` | any OS |
| Helper direct round-trip (handshake/open/list/read/write/conflict) | `tests/integration/helper-roundtrip.test.ts` | Linux/CI Ubuntu + Windows (direct spawn, no `wsl.exe`) |
| Search (filenames/content/exclusions/maxResults/cancel) | `tests/integration/search.test.ts` | any OS |
| Drafts (save/load/stale/clear) | `tests/workspace/drafts.test.ts` | any OS |

Removed (not logic, parked): `keymap`, `platform`, `wsl-output` decoder,
`launch-security`, win32-only NTFS `files`, `helper-symlink`, `audit:*`,
`test:platform`, `smoke-linux`. Re-add only with a Windows-host bug to prove.

## Requires real Windows 11 + WSL2 (NOT covered by CI)

Distro discovery via `wsl.exe`, runtime install into WSL, helper launch
through `wsl.exe`, browse/read/write round-trip, disconnect/reconnect,
Unicode/spaces/permission failures, stopped distros.
Manual check on a Windows 11 host:

```powershell
wsl --list --verbose
npm ci; npm test; npm run build; npm run package:win
# install release/*.exe, double-click → window must open even with WSL absent
# Open WSL folder… → pick distro → browse Linux files → edit + save
```
