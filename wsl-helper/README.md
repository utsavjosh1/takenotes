# WSL helper

TypeScript stdio helper executed inside WSL by the bundled Linux Node runtime.

- Entry: `wsl-helper/src/index.ts` → bundled to single `helper.cjs` via esbuild.
- Transport: 4-byte big-endian length + UTF-8 JSON frames on stdout.
- Diagnostics: stderr only (JSON lines). Never `console.log` to stdout.
- No dependencies on user shell profiles, nvm, or system Node.

Build: `npm run build:helper` (see `scripts/build-helper.mjs`).
Protocol: see `docs/protocol.md` and `src/shared/protocol.ts`.
