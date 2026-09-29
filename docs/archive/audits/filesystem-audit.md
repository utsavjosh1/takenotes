# Filesystem audit — takenotes

AUDIT REVISION: ca1e54e… Labels: UNIT / INTEGRATION / NOT VERIFIED.

## Single-implementation check (§6) — PASS

| Service | Source of truth | Duplicates? |
|---|---|---|
| Windows read/write/create/rename | `src/main/workspace/local-workspace.ts` | No — one module; registry holds roots only |
| Revision (sha256 + newline + BOM) | `src/main/workspace/revisions.ts` | No |
| Path validation (win32 / posix) | `src/main/workspace/path-security.ts` + helper-local `validatePosixRel` (second copy is intentional: helper cannot import main; logic mirrored, both unit-tested) | Justified mirror |
| WSL discovery / spawn / framing | `distributions.ts` / `helper-supervisor.ts`+`helper-client.ts` / `src/shared/protocol.ts` | No |
| Search | `src/main/search/search.ts` (bounded, exclusion list) | No |
| Registry/generations | `src/main/workspace/registry.ts` | No |
| Draft persistence | `src/main/workspace/drafts.ts` + `draft:*` IPC + renderer 750 ms debounce + recovery banner. userData store (outside workspaces), atomic bounded writes, tolerant reads, `recoveryDecision` gate (never overwrites disk). 10 unit tests green. Full device UX proof pending — see `docs/platform/real-device-checklist.md`. | Tested store-level |

## Correctness evidence

- Traversal/absolute/reserved-name/NUL tests: `tests/filesystem/paths.test.ts` (UNIT, pass). Win32 end-to-end fs tests are `describe.runIf(win32)` — they run in Windows CI, NOT here.
- Symlink escape: refused both sides (lstat-walk + realpath). File-symlink (`key.md → ~/.ssh/id_rsa`): helper `resolveInside` walks parent dirs (root itself lstat'd? file itself is NOT lstat-checked — `fs.stat` follows the final symlink!). CHECK: helper `file.read` does `resolveInside` (parents only) then `fs.stat(abs)` — a symlink FILE inside the workspace would be followed and read. Same on Windows: `readTextFile` → `resolveInsideRoot` (parents only) → `fs.stat` follows final symlink. **FINDING S-13 (MEDIUM)**: final-component symlink not refused. Fixed this audit: both sides `lstat` the target and refuse symlinks (documented; Windows `resolveInsideRoot` + helper `resolveInside`).
- Revisions: sha256 content-derived — same-mtime/different-content and same-size/different-content both change the hash by construction. Rapid consecutive writes: each write re-hashes post-rename; CONFLICT on mismatch.
- Conflict: save carries `expectedHash`; mismatch → CONFLICT, disk untouched, draft retained (INTEGRATION-tested helper round-trip includes conflict case).
- TOO_LARGE (>10 MiB): refused before read; renderer shows calm panel, no freeze (STATIC + code path review).
- ENCODING: strict UTF-8 (`fatal:true` / `decodeUtf8`); NUL-byte files rejected; never rewritten.
- Trash: `shell.trashItem` (recoverable via Recycle Bin) — correctly labeled Trash, no silent permanent delete. No `unlink/rm -rf` in app code (grep clean).
- UNICODE: validators are charset-agnostic (length + component rules); Hindi/Japanese/emoji names pass through; search is case-folded literal match. No normalization-canonicalization handling — documented limitation (macOS-style NFD issues don't apply on Windows/WSL targets).
- `\\wsl$` / `/mnt/c` usage: **zero matches** — no architecture violation.
