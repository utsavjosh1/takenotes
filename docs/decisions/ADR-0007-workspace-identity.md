# ADR-0007 — Workspace identity and Connection separation

Date: 2026-09-19 · Status: accepted

## Decision

A **Connection** (how we reach Linux: distro + Linux user + status) is distinct
from a **Workspace** (what the user opens: connection + rootPath + settings +
grants). Every workspace carries an opaque `workspaceId`; MCP, plugins, and
future CLI operate through that ID, never raw WSL paths by default.

## Rationale / deviation

WSL user separation is a product differentiator: `Ubuntu / utsav / ~/Notes`
and `Ubuntu / work / ~/company/private` are different identities even on the
same distro. Raw-path APIs would leak personal-vs-company boundaries and make
per-workspace MCP grants unenforceable. Discovery is distro → user → path;
filesystem work runs as the selected Linux user with no privilege escalation.

## Consequences

- `CONTEXT.md` canonical terms: Workspace, Connection. Avoid: Vault.
- Service layer resolves `workspaceId → {distro, linuxUser, rootPath}`.
- Distro picker collects distro + user + path; `~` expands in the helper.
- Listing distros never auto-starts them; Connect/Open is explicit intent.
