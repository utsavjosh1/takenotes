# v2 Verification — proof that Pin → Elephant works

> Gate language from `docs/roadmap.md`: logic tests (any OS) + Linux integration + manual Windows/Mac/Linux. No WSL two-user gate blocks MVP ship. Evidence over invention: every "works" below names a test or a manual step.

## 1. Automated (run these)

```bash
# Pin + existing renderer suite
npx vitest run tests/renderer/panes.test.ts

# Import incl. Elephant (.enex)
npx vitest run tests/import/import.test.ts tests/import/enex.test.ts

# Full logic gate (any OS)
npm test
```

### 1.1 Pin evidence (`tests/renderer/panes.test.ts`)

- Open two notes → active switches, per-tab dirty preserved.
- Close records `closedTabs` (max 20) for `Ctrl+Shift+T` reopen.
- `togglePinned` flips boolean without touching dirty/revision.
- **v2 new:** `closeOtherTabs` keeps active + all pinned, drops the rest; `closeUnpinnedTabs` ("Close all" parity) keeps every pinned tab and closes the rest (all-pinned → selection empties, pins never force-closed); rename preserves pin; delete drops pins for removed paths.

### 1.2 Elephant evidence (`tests/import/enex.test.ts` + `import.test.ts`)

- `parseEnex`: titles → stems, HTML content preserved for `htmlToMarkdown`, `<tag>` → frontmatter `tags:`, created/updated → frontmatter, `<resource>` (base64 + mime + filename) extracted, malformed XML → skip + warn (never throw, bounded output).
- `planEnexImport` → `planImport`: collision-proof `name 1.md`, attachments under policy dir, remote images kept + warned (no fetch), missing refs in `unmapped`, over-cap in `skipped`, `warnings` surfaced.
- Existing Markdown/HTML/Textbundle vectors in `import.test.ts` still pass (no regression).

### 1.3 Regression

`npm test` (vitest) must stay green: explorer sort/reveal, Quick Open vectors, registry uniqueness, hotkey collision, favorites YAML round-trip, index lifecycle, search operators + `INVALID_REQUEST`, revision/`CONFLICT`, recovery throttle/retention/restore-snapshots-current (fake clock), link-rename rewrite.

## 2. Manual checklist (real devices)

- [ ] Windows 11 + macOS + Linux: open workspace, create/rename/move/delete (+folders), reserved-name rejection, symlink-escape rejection, atomic-write `CONFLICT` (two-actor edit), watcher refresh.
- [ ] Pin: pin tab → open another file (pinned stays, target opens/activates) → `Close others` (pinned survive) → `Close all` (pinned survive) → unpin → close works → `Ctrl+Shift+T` reopens.
- [ ] Palette: pin a command (persists ≤20, above recents) → collision shows `⚠` + Settings warning → Reset restores defaults.
- [ ] Search: each operator family returns/correctly errors (`INVALID_REQUEST` names the operator); empty = recents; selection seeds query.
- [ ] Daily: missing Daily shows `[ Create Today's Note ]` (never auto-created); create writes `Daily/YYYY/MM/YYYY-MM-DD.md` with `type:daily`.
- [ ] Calendar drag on a `@scheduled` task rewrites `@scheduled` in place, `@due` byte-identical.
- [ ] Import: Markdown + Textbundle + HTML + **`.enex`** each show confirm screen (notes/attachments/unmapped/warnings/skipped); collisions become `name 1.md`; remote images stay remote + warned; nothing overwritten/merged.
- [ ] Recovery: edit → snapshot throttle (≤1/5min) → save/close snapshot → list/restore (current snapshotted first)/copy → 7-day janitor → "recovery is not a backup" visible.
- [ ] Appearance: light/dark/system + accent + font-size + zoom; focus visible; keyboard-only pass Quick Open/Palette/Explorer/Editor; reduced-motion respected; narrow window usable.

## 3. Known verification gaps (explicit, not hidden)

- Palette-pin persistence UI polish: logic implemented, cross-restart UX check pending on real Windows/Mac.
- Backlinks/Outgoing right-pane wiring: parser + model tested, pane placement check pending.
- Calendar touch-drag + `@scheduled` rewrite on mobile: logic tested, gesture check pending.
- REA bundle trace of Obsidian (`analyze_javascript_application` + `trace_application_feature`) and live Help probes: **not run** (no target on host) — v2 makes no claim requiring them. Reproducer commands in `REA-METHOD.md` §3.

## 4. v2 drop record

- Date: 2026-10-11. Scope: docs/v2 (5 files) + pin bulk-close semantics + `.enex` import + tests.
- Files added: `docs/v2/*`, `packages/core/src/import/enex.ts`, `tests/import/enex.test.ts`.
- Files touched: `apps/desktop/src/renderer/panes.ts`, `packages/core/package.json` (export), `tests/renderer/panes.test.ts`, `docs/README.md` (v2 link).
- Tests: `tests/renderer/panes.test.ts`, `tests/import/enex.test.ts`, `tests/import/import.test.ts` green; full `npm test` to confirm before merge.
