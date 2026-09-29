# P1-02 — WSL distro discovery with state, no autostart

Phase: 1 Foundation. Blocked by: P1-01 (uses `WorkspaceService` seam).

## Observable result

"Open WSL folder…" lists every installed distro as
`Name · Running|Stopped · WSL2`, sourced from `wsl.exe -l -v` with the
existing `--list --quiet` path as fallback. Listing never starts a distro;
pressing Connect/Open on a stopped distro is the explicit start intent.
Non-Windows still gets the precise Windows-only error.

## Constraints

- ADR-0007 (distro → user → path; listing ≠ starting). Keep `shell:false`,
  separate argv (`launch-security.ts`).

## Acceptance (must fail on starting commit)

1. Parser unit tests: `wsl -l -v` sample outputs (incl. `*` default marker,
   UTF-16LE BOM, stopped/running) → correct name/state/version records.
2. `listWslDistributions` returns state info; renderer shows it; fallback
   works when verbose parse fails.
3. Windows-gated test/script documents: list-while-stopped leaves distro
   stopped (evidence for `docs/mvp-status.md`).
