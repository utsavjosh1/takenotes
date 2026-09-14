# Testing

```bash
npm test           # vitest run (unit + node integration)
npm run typecheck
npm run lint
```

## Coverage map

| Area | Test | Runs on |
|---|---|---|
| Protocol framing (partial/multiple/zero/oversized/bad JSON) | `tests/protocol/framing.test.ts` | any OS |
| WSL `--list --quiet` decoder (UTF-8/16LE/BOM/NUL/unicode) | `tests/protocol/wsl-output.test.ts` | any OS |
| Path validation (traversal/absolute/NUL/illegal) | `tests/filesystem/paths.test.ts` | any OS |
| Safe write + conflict + CRLF/BOM/binary/symlink (Windows NTFS) | `tests/filesystem/files.test.ts` | Windows only (`describe.runIf(win32)`; win32 path semantics can't execute on Linux) |
| Helper direct round-trip (handshake/open/list/read/write/conflict) | `tests/integration/helper-roundtrip.test.ts` | Linux/CI Ubuntu |
| Search (filenames/content/exclusions/maxResults/cancel) | `tests/integration/search.test.ts` | any OS |

## Requires real Windows + WSL (NOT covered by CI)

Distro discovery via `wsl.exe`, runtime install into WSL, helper launch
through `wsl.exe`, browse/read/write/watch round-trip, Vim cross-edit,
disconnect/reconnect, Unicode/spaces/permission failures, stopped distros.
These are recorded as NOT VERIFIED in `docs/mvp-status.md` until performed.
