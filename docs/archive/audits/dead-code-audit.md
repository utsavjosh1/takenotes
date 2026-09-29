# Dead-code audit — takenotes

AUDIT REVISION: ca1e54e… Method: importer graph via grep + `tsc`/`eslint` unused checks.
(Knip is not installed; the importer-graph pass below is the evidence. RECOMMENDATION:
add Knip before release — see final-audit remaining risks.)

## Removed this audit

| File/export | Proof of death | Verification after removal |
|---|---|---|
| `src/renderer/commands/registry.ts` (`CommandRegistry`) | Zero importers: `grep -rn 'CommandRegistry\|commands/registry' src` → only the file itself. Renderer commands live in `App.tsx` palette. | `typecheck` + `lint` + `test` + `build` clean |

## Classified KEPT (audited, not dead)

| Item | Reason |
|---|---|
| `HELPER_OPERATIONS` trimmed members | Moved to protocol plan, not deleted silently (security-audit S-07) |
| `runtime-installer.ts` bootstrap transport | Placeholder orchestration BUT already fixes the argv contract used by Stage 5/6; deleting would remove the reviewed transport. Marked PLACEHOLDER, not dead. |
| `connectDirect` (supervisor) | Used by tests + Linux dev; documented non-production path |
| `scripts/*` console usage | CLI tooling; eslint override already scoped to scripts |
| `catch {}` blocks (7 sites) | Each justified: best-effort stat, target-free probe, ENOENT branches. No silent security-error swallow. |
| `resources/wsl/.gitkeep` | Only tracked file under resources; keeps staged-runtime dir in git |
| `dist/`, `dist-electron/`, `dist-helper/`, `smoke-artifacts/`, `.dev-libs/` | Present on disk, ALL git-ignored/untracked — not packaged |

## Dependency verdict (see dependency-audit.md)

`@lezer/highlight` moved to direct deps (imported by editor theme — was transitive).
No other unused production deps found. No native addons in shipped code path
(`.node` binaries exist only inside electron-builder tooling, dev-only).
