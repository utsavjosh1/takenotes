# Docs — takenotes

Start here. This folder is tracked in git and is the single place for
product, architecture, and process documentation.

```txt
docs/
  README.md            ← you are here (index)
  architecture.md      core system design (renderer → main → WSL helper)
  security.md          threat model + filesystem safety rules
  protocol.md          helper IPC / framing contract
  roadmap.md           phases + what is next
  guides/              how to work with the repo (dev, test, release, deploy)
  specs/               frozen implementation specs
  decisions/           ADRs 0001–0015 (accepted, historical — do not edit)
  design/              active product + UI design notes
  platform/            per-OS behavior (Windows-first, WSL, macOS, Linux)
  archive/             point-in-time evidence — read-only history
```

## Active docs

| Doc | Read when you… |
|---|---|
| [architecture.md](architecture.md) | need the end-to-end mental model |
| [security.md](security.md) | touch filesystem, IPC, WSL, or auth |
| [protocol.md](protocol.md) | touch helper framing or add an op |
| [roadmap.md](roadmap.md) | want scope / sequencing |
| [guides/development.md](guides/development.md) | set up or run the app locally |
| [guides/testing.md](guides/testing.md) | add or run tests |
| [guides/release.md](guides/release.md) | cut a release |
| [guides/server-deploy.md](guides/server-deploy.md) | deploy the self-hosted server |
| [guides/benchmarks.md](guides/benchmarks.md) | record perf numbers (none yet) |
| [specs/phase1-foundation-spec.md](specs/phase1-foundation-spec.md) | implement Phase 1 scope |

## Decisions (ADRs)

Accepted and frozen. Link them, don't rewrite them:

`decisions/ADR-0001` desktop shell · `0002` build system ·
`0003` WSL helper · `0004` filesystem safety · `0005` versioning ·
`0006` in-app updates · `0007` workspace identity ·
`0008` filesystem truth · `0009` service layer / MCP ·
`0010` markdown tasks · `0011` daily / today / events ·
`0012` MCP stdio · `0013` recovery · `0014` dual-host service layer ·
`0015` single-surface WYSIWYG.

Superseding an ADR means writing a **new** ADR, never editing history.

## Design (active)

**Start with the [cross-platform UI/UX design guide](design/ui-ux/README.md)** for the proposed desktop, mobile, and web experience based on `apps/web/`. It includes implementation-ready layouts, semantic tokens, interaction states, accessibility requirements, code ownership, and acceptance gates. The shorter notes below describe the earlier desktop direction; the guide explains how to migrate without implying unfinished features already ship.

| Doc | About |
|---|---|
| [design/ui-ux/README.md](design/ui-ux/README.md) | design direction, current capabilities, and reading order |
| [design/ui-ux/foundations.md](design/ui-ux/foundations.md) | shared light/dark palette, type, spacing, density, and accessibility |
| [design/ui-ux/components-and-states.md](design/ui-ux/components-and-states.md) | component contracts, save/conflict/recovery states, and copy |
| [design/ui-ux/desktop.md](design/ui-ux/desktop.md) | Electron layouts and screen-by-screen behavior |
| [design/ui-ux/mobile.md](design/ui-ux/mobile.md) | phone/tablet screens, native interactions, and storage gates |
| [design/ui-ux/web.md](design/ui-ux/web.md) | public website, interactive concept, and future browser notebook |
| [design/ui-ux/implementation.md](design/ui-ux/implementation.md) | file mapping, delivery slices, test cases, and definition of done |
| [design/principles.md](design/principles.md) | product principles |
| [design/layout.md](design/layout.md) | window / pane layout |
| [design/interactions.md](design/interactions.md) | core interactions |
| [design/states.md](design/states.md) | empty / loading / error states |
| [design/keyboard.md](design/keyboard.md) | user-facing shortcuts |
| [design/tokens.md](design/tokens.md) | design tokens (source: `tokens.css`) |
| [design/wsl-runtime-restructure.md](design/wsl-runtime-restructure.md) | **proposal**: WSL as first-class runtime host |
| [design/client-stack-state-validation-ui.md](design/client-stack-state-validation-ui.md) | client stack picks (zustand + valibot + RHF) |

## Platform

| Doc | About |
|---|---|
| [platform/overview.md](platform/overview.md) | one product, native on each OS |
| [platform/support-matrix.md](platform/support-matrix.md) | canonical Tier 1 / Tier 2 matrix |
| [platform/windows.md](platform/windows.md) | Windows 11 + NTFS behavior |
| [platform/macos.md](platform/macos.md) | macOS behavior |
| [platform/linux.md](platform/linux.md) | Linux behavior |
| [platform/filesystem.md](platform/filesystem.md) | workspace adapters + path rules |
| [platform/keyboard.md](platform/keyboard.md) | keymap source of truth (`keymap.ts`) |
| [platform/packaging.md](platform/packaging.md) | one tag → all installers |

## Archive (read-only)

Historical evidence. Do not update — write a new doc and link back.

- `archive/audits/` — connection proof, dead-code, dependency, fuses,
  failure matrix, filesystem, final, network, release, security,
  workflow-security audits.
- `archive/tickets/` — P1-01…P1-11 work tickets plus the
  `p1-05-windows-conflict-script.md` manual Windows demo script.
- `archive/status/` — `mvp-status.md`, `mvp-design-status.md`,
  `platform-support.md` (pointer, superseded by `platform/overview.md`),
  `final-platform-audit.md`, `test-matrix.md`,
  `keyboard-test-matrix.md`, `real-device-checklist.md`.

## Rules

1. Active docs guide current work. Archive docs explain past work.
2. Moving a doc? Use `git mv` and fix inbound links.
3. New proposal? Put it in `design/` with `Status: proposal` + date.
4. New decision? Add `decisions/ADR-NNNN-*.md`, never edit an old ADR.
5. Status snapshot? Put it in `archive/status/` with evidence + date.
