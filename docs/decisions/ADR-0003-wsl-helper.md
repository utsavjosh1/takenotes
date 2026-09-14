# ADR-0003 — WSL helper: TypeScript + bundled Node, no second language

Date: 2026-09-14 · Status: accepted

## Decision

- Helper is TypeScript bundled to one `helper.cjs`, executed by a pinned
  official Linux Node binary shipped in the release (`node` + `helper.cjs` +
  `manifest.json` under `resources/wsl/linux-x64/`).
- No Rust/Go/Cargo, no single-executable Node experiments, no system-Node or
  sudo requirement. Install target: `~/.local/share/desktop-notes/`
  (versioned runtime + helper dirs).
- Byte transfer through owned `wsl.exe` stdin with a FIXED bootstrap shell
  fragment; destinations passed as app-controlled argv. Never
  `\\wsl$` mounts as the install mechanism, never `wsl --shutdown`.

## Rationale

One language family / one package manager keeps the project approachable.
Shipping the runtime trades installer size for predictability, debuggability,
and zero WSL prerequisites.

## Consequences

- `build-config.json` pins `wslRuntime.nodeVersion`; release verifies the
  official SHA-256 and fails on mismatch.
- Framed stdio protocol (`PROTOCOL_VERSION = 1`), stdout = frames only.
