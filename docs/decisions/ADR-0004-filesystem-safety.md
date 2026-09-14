# ADR-0004 — Filesystem safety without native code

Date: 2026-09-14 · Status: accepted

## Decision

MVP uses ordinary Node `fs/promises` APIs with layered validation:

1. Renderer supplies `workspaceId` + relative path only.
2. Strict validators (`path.win32` / `path.posix`, never mixed) reject
   absolute paths, NUL, `..` traversal, illegal components.
3. `lstat` walk refuses symlinked directory components; realpath containment
   re-checks the resolved parent against the workspace root.
4. Saves are atomic (temp sibling + fsync + rename) with SHA-256
   `expectedRevision`; mismatch → `CONFLICT`, never silent overwrite.

## Honest limitation

This does NOT claim resistance to every TOCTOU race from a malicious local
process — that would need handle-relative native code. The model protects
against renderer escape, malformed paths, and symlink/reparse traversal
(see `docs/security.md`). Revisit before plugins, remote code, or adversarial
content.

## Consequences

- No native addons in MVP (avoids Electron ABI rebuild pain).
- Adversarial tests in `tests/filesystem/`; Windows NTFS + WSL ext4 behavior
  verified separately before release claims.
