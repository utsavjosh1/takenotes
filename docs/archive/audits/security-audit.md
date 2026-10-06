# Security audit — takenotes

AUDIT REVISION: ca1e54e… (see final-audit.md). Severity: BLOCKER / HIGH / MEDIUM / LOW / INFO.

## Findings (pre-fix → status)

| ID | Description | Location | Severity | Status |
|---|---|---|---|---|
| S-01 | No `setPermissionRequestHandler` / `setPermissionCheckHandler` — Chromium defaults govern camera/mic/etc. | `src/main/window.ts` | HIGH | FIXED: explicit deny-all both handlers |
| S-02 | `protocolError` from FrameDecoder emitted but nobody listens → stdout-garbage helper stays "connected", pending requests hang until 30s timeout | `helper-client.ts` / `helper-supervisor.ts` | HIGH | FIXED: supervisor kills child on protocolError; unit test added |
| S-03 | Hello has no nonce; handshake doesn't verify runtime path → a substituted helper/Node would be trusted | `helper-supervisor.ts`, `wsl-helper/src/index.ts` | MEDIUM | FIXED: nonce echo + execPath equality enforced + uid/home reported |
| S-04 | Helper child inherits full parent env (`NODE_OPTIONS`, proxies, `NODE_EXTRA_CA_CERTS`) | all `spawn` sites | MEDIUM | FIXED: dangerous vars stripped, minimal allowlist documented |
| S-05 | `wsl.exe` resolved via PATH — hijackable | `distributions.ts`, `helper-supervisor.ts`, `runtime-installer.ts` | MEDIUM | FIXED: `%SystemRoot%\System32\wsl.exe` pinned when present |
| S-06 | `wsl:connect` accepted any string distro/linuxPath (only typeof-checked) | `register.ts` | MEDIUM | FIXED: length/charset/NUL validation |
| S-07 | `HELPER_OPERATIONS` advertises 14 ops; helper implements 7 — dead privileged surface (`file.trash/restore`, `search.*`, `watch.*`) | `src/shared/protocol.ts` | MEDIUM | FIXED: trimmed to implemented ops |
| S-08 | Helper `file.write` lacks fsync + tmp cleanup that Windows path has — crash window loses new data (original still safe via atomic rename) | `wsl-helper/src/index.ts` | LOW | FIXED: fsync parity + tmp cleanup |
| S-09 | No single-instance lock — two instances could edit the same files, undermining conflict revisions | `src/main/index.ts` | MEDIUM | FIXED: `requestSingleInstanceLock`, second instance focuses existing window |
| S-10 | No renderer error boundary — a render crash wipes editor state (drafts live in tab state) | `src/renderer/main.tsx` | MEDIUM | FIXED: boundary keeps chrome + recovery note |
| S-11 | `el.innerHTML = ""` in editor mount (benign — empty container — but a dangerous-DOM-API instance) | `hooks/use-editor.ts` | LOW | FIXED: `replaceChildren()` |
| S-12 | CSP missing `object-src/frame-src/base-uri/img-src/connect-src` — object/frame injection not explicitly barred | `index.html` | LOW | FIXED: tightened; `style-src 'unsafe-inline'` retained (CodeMirror/React inline styles — documented exception) |
| S-13 | Final-component symlink followed: `resolveInside*` checked parent dirs only, then `stat` followed a symlinked file | `local-workspace.ts`, `wsl-helper/src/index.ts` | MEDIUM | FIXED: `lstat` refusal on the target itself, both sides; posix side INTEGRATION-tested |
| S-14 | Child `error` event (missing binary, EACCES) unhandled → uncaught exception instead of clean disconnect (found BY this audit's own new test) | `helper-client.ts` | HIGH | FIXED: `error` listener rejects pendings + emits exit; regression test added |

## Verified secure (with evidence)

- **BrowserWindow**: `nodeIntegration:false, contextIsolation:true, sandbox:true`; no insecure flags. Navigation intercepted (`will-navigate` + `setWindowOpenHandler` deny; only `https:`/`mailto:` via one validated `shell.openExternal` wrapper). No `file:/javascript:/data:` acceptance.
- **Preload**: exactly one `exposeInMainWorld("takenotes")`, 16 narrow methods; no generic send/invoke/on. All 13 handlers have callers; all bridge methods have handlers or documented dev-only use; no dynamic channels.
- **Path security**: renderer sends relative paths only; absolute (`C:\…`, `/etc/passwd`), traversal (`../`), NUL, Windows-reserved chars rejected by validators (unit-tested `tests/filesystem/paths.test.ts`; win32-gated fs tests run in Windows CI). Symlink/junction escape refused via lstat-walk + realpath containment on BOTH Windows (`resolveInsideRoot`) and helper (`resolveInside`).
- **Revisions**: sha256 content hash on read+write; same-mtime/same-size content change detected; CONFLICT leaves disk + draft intact (integration-tested).
- **Writes**: tmp(`wx`)+fsync+rename on Windows; tmp+rename on WSL (fsync added); ENOSPC/permission errors mapped, draft retained in renderer state.
- **Markdown**: source-only editor (CodeMirror), no HTML preview → `<script>`/onerror/iframe payloads are inert text. No `dangerouslySetInnerHTML`, no `eval`/`new Function`.
- **Renderer-compromise assumption**: worst case = 16 validated IPC methods; no shell, no arbitrary read (workspace-relative + validated), no URI launch (only main's allowlist, and renderer never passes URLs).
- **Secrets**: none found in repo/history surface scan; no `.env`; no tokens in workflows.
- **Workflows**: `contents:read` defaults; no `pull_request_target`; no `github.event.*` interpolation. Actions pinned to major tags (`@v4`), NOT SHAs — recorded risk (LOW), SHAs not invented.
- **Fuses**: not configured — recorded limitation; defaults retained deliberately (no blind flips).
