# docs/v2 — Obsidian rebuild via REA (takenotes)

> Status: active. Date: 2026-10-11. Owner: takenotes.
> Method: REA (`../REA/`) evidence-led reverse engineering of Obsidian 1.13.x public stable.
> Vocabulary: Workspace (never Vault), Collection (never Base), Favorite (never Bookmark), Quick Open, Command Palette — per `CONTEXT.md`. Violations are bugs.

## What v2 is

v2 rebuilds **every Obsidian public-stable feature — from Pin (pinned tabs / pinned commands) to Elephant (Evernote `.enex` import)** — as:

1. a described behavior (what Obsidian does),
2. a takenotes design (how it looks/behaves here, in our tokens and language),
3. an implementation mapping (which service/file owns it, status: implemented / partial / planned),
4. verification (which test or manual check proves it).

v2 does **not** replace `CONTEXT.md`, `docs/roadmap.md`, or `docs/decisions/`. Those remain binding. When v2 and the roadmap disagree, the roadmap wins and v2 records the conflict explicitly.

## Reading order

| # | Doc | Read when you… |
|---|-----|----------------|
| 0 | [REA-METHOD.md](REA-METHOD.md) | want to know how Obsidian was investigated with REA, what counts as evidence, and what is still unknown |
| 1 | [OBSIDIAN-FEATURES.md](OBSIDIAN-FEATURES.md) | want the exhaustive feature-by-feature rebuild spec (Pin → Elephant) |
| 2 | [DESIGN-GUIDE.md](DESIGN-GUIDE.md) | are designing or implementing any UI — tokens, shell, components, states, copy |
| 3 | [IMPLEMENTATION-MAP.md](IMPLEMENTATION-MAP.md) | want file-by-file ownership: which service/component owns each feature and its status |
| 4 | [VERIFICATION.md](VERIFICATION.md) | want to prove something works — tests, commands, manual checklist |

## Base evidence

- `docs/research/OBSIDIAN_FEATURES_CURRENT.md` (2026-09-22 snapshot of Obsidian 1.13.7 desktop / 1.13.8 mobile public stable + marked Catalyst items). This is the **primary static evidence** for v2. Catalyst-only items are labeled and never treated as stable.
- Obsidian Help (`help.obsidian.md`), changelog (`obsidian.md/changelog.json`), developer docs — cited per feature in `OBSIDIAN-FEATURES.md`.
- REA guides used: `../REA/docs/javascript-application-workflows.md` (feature tracing), `../REA/docs/browser-observation.md` (website observation), `../REA/docs/tool-design.md` (tool shape), skill `../REA/.agents/skills/reverse-engineer-anything/SKILL.md` (routing + evidence discipline).
- takenotes source of truth at v2 write time: `CONTEXT.md`, `docs/roadmap.md` Steps 0–9, `packages/ui/src/theme.ts`, `packages/core/src/*`, `apps/desktop/src/renderer/*`.

## "Pin to Elephant" scope definition

"Pin to Elephant" is the completeness bar for v2:

- **Pin** = pinned tabs (`Tabs: Pin tab; links from pinned tab open separately`), pinned commands in Command Palette (max 20, above recents), pane pinning where implemented. Lower bound: no pinned state may be silently dropped.
- **Elephant** = Evernote import (`.enex`, elephant logo). Upper bound: Evernote import must at least plan, convert, and report — the same bar as Markdown/Textbundle/HTML in Step 8. v2 ships `packages/core/src/import/enex.ts` (pure `.enex` → Markdown + attachments) so Elephant is **implemented**, not deferred.
- **Everything between** = every public-stable Obsidian feature in `OBSIDIAN_FEATURES_CURRENT.md`: vault/workspace model, file explorer, editor (CommonMark+GFM+Obsidian-flavored extensions), live preview/reading view policy, internal links/embeds, backlinks/outgoing, tags, properties, search grammar, quick switcher, command palette, tabs/workspace, sidebars, navigation, workspaces plugin, graph, canvas, bases/collections, daily notes, templates, unique-note creator, note composer, bookmarks/favorites, outline, attachments, images, PDFs, audio/video, tables, tasks, callouts, math, mermaid, footnotes, file recovery, appearance/themes/snippets, hotkeys, vim, spellcheck, community plugins, sync/publish (as external-service boundary), web clipper, URI, CLI, import/export, mobile capture.

Catalyst-only items (outside-vault files, colored highlights, Bases Kanban, folder-column drag, full RTL flip, Quick Capture widgets, MathJax 4.1.3) are documented as **planned/deferred**, never claimed as shipped.

## Status labels (same as CONTEXT.md audit discipline)

- **Implemented and verified** — code + passing test/manual evidence in `VERIFICATION.md`.
- **Implemented, verification incomplete** — code exists, test or platform check missing (named).
- **Partial** — some behavior exists, gap named with file/line.
- **Planned** — roadmap intent only, no code.
- **Deferred / out of scope** — explicitly not in MVP (Step 9+ / Post-MVP).
- **Unclear / conflicting** — sources disagree; conflict recorded, no silent redefinition.

## Rules for v2 writers

1. Never rename canonical terms. Never describe roadmap intent as shipped.
2. Every behavior claim cites: Obsidian source (Help/changelog URL or research-doc section) + takenotes file/line or test.
3. REA evidence taxonomy preserved: **observation** (seen in artifact/docs), **derivation** (mechanical transform of observation), **inference** (best explanation, marked with confidence), **unknown** (explicitly not established).
4. Design changes reuse `packages/ui/src/theme.ts` tokens (`--tn-*`). No inline hex in components.
5. Service boundaries intact: UI never bypasses `WorkspaceService / NoteService / SearchService / CommandService / RecoveryService` (renderer `workspaceId + relativePath` identity only).
6. New decisions become new ADRs; v2 never edits `docs/decisions/`.
