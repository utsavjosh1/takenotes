# Security

## Baseline

- Renderer: `nodeIntegration: false`, `contextIsolation: true`, `sandbox: true`.
- Preload exposes one named function per operation; no `ipcRenderer`, `fs`,
  `shell`, `child_process`, or `require` reaches React.
- Every privileged IPC handler validates sender, arguments, workspace id,
  relative path, then operates and returns a structured `{ ok, result|error }`.

## Path confinement

- Renderer paths are workspace-relative only. Absolute paths, NUL bytes, `..`
  traversal, and illegal components are rejected.
- Windows workspaces use `path.win32` semantics; WSL workspaces use
  `path.posix`. Never mixed.
- MVP symlink policy: do not traverse symlinked directories; reject operations
  through symlink paths (`lstat` walk + realpath containment check).
  Windows reparse/junction escapes are rejected where detectable.

## Honest limitation (MVP)

This implementation uses ordinary Node filesystem APIs, not handle-relative
native filesystem code. It protects against accidental renderer escape,
malformed relative paths, and symlink/reparse traversal, with real-path
validation — but it does NOT claim resistance to every concurrent filesystem
race caused by a malicious local process. If the product ever executes
untrusted plugins, remote code, or adversarial content, revisit confinement
(see ADR-0004) before shipping that.

## Content

- Markdown preview (when built) disables raw HTML, sanitizes URLs, blocks
  remote images by default. No `javascript:`/`file:`/`data:` from note content.
- External links: allow `https:`, `mailto:` only, via `shell.openExternal`
  after explicit user action. Navigation and new windows are otherwise blocked.
- Drafts/settings live under `app.getPath("userData")`, never inside notes.
- Helper stdout carries only protocol frames; diagnostics go to stderr.
- Application shutdown never runs `wsl --shutdown`.
