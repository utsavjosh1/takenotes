# Implementation plan and acceptance gates

Part of the [UI/UX guide](README.md). This is a delivery plan, not a completed-work report. **All slices start as not implemented/not verified by this guide.** Existing functionality is preserved unless a separately reviewed behavior change is specified.

## 1. Map the design to the current repository

| Design responsibility | Existing file(s) / directory | Intended change |
|---|---|---|
| Shared primitive tokens | `packages/ui/src/tokens.css`, `packages/ui/src/index.ts` | Expand semantic tokens; later expose a matching native theme representation |
| Desktop theme / dimensions | `apps/desktop/src/renderer/styles/tokens.css` | Bridge legacy variables to shared semantic tokens; retain platform layout ownership |
| Desktop styles | `apps/desktop/src/renderer/styles/app.css` | Paper/ink theme, density, responsive layout, focus and state styles |
| Shell / status | `apps/desktop/src/renderer/components/chrome.tsx` | Titlebar, rail, status hierarchy; separate live announcements from counters |
| Files | `components/tree.tsx`, `hooks/use-file-tree.ts` under the renderer | Row presentation, keyboard/menu alternatives, scoped loading/error states |
| Tabs / overlays | `components/overlays.tsx`, `components/palette.tsx`, `components/menus.ts` | Tab/focus semantics, palette behavior, modal/menu consistency |
| Editor | `components/pane-view.tsx`, `editor/create-editor.ts`, `hooks/use-editor.ts` | Theme/selection visibility; protect cursor/undo/scroll across appearance updates |
| Documents / panes | `hooks/use-documents.ts`, `panes.ts` | Preserve revision-aware state and pane identity; test any necessary behavior fixes separately |
| Search | `components/search.tsx`, `hooks/use-search.ts`, `index/workspace-index.ts` | Result hierarchy, accessible search states, partial-index disclosure |
| Workspace / WSL | `components/wsl-dialog.tsx`, `hooks/use-workspace.ts`, `hooks/use-wsl-connect.ts` | Progressive setup, exact host/user identity, error handling |
| Settings | `components/settings.tsx`, `stores/settings.ts` | Target dimensions/theme controls; honor saved preferences |
| Recovery / updates | `components/history-dialog.tsx`, `components/update-dialog.tsx`, `hooks/use-updates.ts` | Data-state-specific notices and reachable actions |
| App composition | `apps/desktop/src/renderer/App.tsx` | Connect improved components to existing controllers, not a new parallel state model |
| Website shell and content | `apps/web/src/App.tsx`, `App.css`, `site-content.ts` | Responsive/accessibility hardening; preserve truthful feature status |
| Website sample | `apps/web/src/components/NotebookPreview.tsx` | Compact controls, theme coverage, reset confirmation, explicit demo persistence |
| Mobile entry | `apps/mobile/src/App.tsx`, `apps/mobile/README.md` | Implement only after capability gates; native screens/themes, not shared DOM markup |
| Platform behavior | `packages/platform/src/` | Existing capabilities, keymaps, shortcut labels; consume rather than duplicate |
| Note behavior / contracts | `packages/core/`, `packages/contracts/` | Keep shared policy and validation authoritative; do not implement file rules in components |
| Server/browser integration | `apps/server/src/` | Separate authenticated access work if a real browser/mobile notebook is approved |

Paths abbreviated in the table are relative to `apps/desktop/src/renderer/`. Exact new filenames below are suggestions, not existing exports.

## 2. Shared-theme migration without a rewrite

### Target ownership

```text
packages/ui/src/
  tokens.css             DOM semantic tokens and theme selectors
  theme.ts               proposed native/token value representation
  index.ts               explicit public exports

apps/desktop/src/renderer/
  styles/tokens.css      desktop dimensions + temporary compatibility aliases
  styles/app.css         desktop components/layout
  components/            desktop DOM primitives and product components

apps/web/src/
  App.css                marketing-only composition and decoration
  components/            web components; selectively shared DOM primitives later

apps/mobile/src/
  theme/                 proposed native theme adapter
  components/            proposed native controls
  screens/               proposed Workspace / Search / Editor / Settings screens
```

Do not move every existing component into `packages/ui` just because its name is Button. Shared semantic values are the first seam. Native and DOM controls have different accessibility/navigation requirements; share behavior contracts rather than attempting one universal component framework.

### Migration sequence

1. Inventory existing `--surface-*`, `--text-*`, `--accent`, spacing, and radius variables. Separate color tokens from size tokens.
2. Add canonical `--tn-*` values under explicit light/dark theme selectors, with a deterministic initial theme.
3. Add scoped desktop aliases so existing CSS migrates incrementally. Example target:

   ```css
   /* Example only; implement in the desktop theme layer. */
   [data-theme] {
     --surface-editor: var(--tn-surface-editor);
     --surface-sidebar: var(--tn-surface-sidebar);
     --text-primary: var(--tn-text-primary);
     --accent: var(--tn-accent);
   }
   ```

4. Migrate components by slice, then remove unused aliases. Do not combine the website's global resets with the renderer's CSS.
5. Keep font sizes explicitly named (`--tn-font-size-secondary`) and colors explicitly named (`--tn-text-secondary`). The current desktop token file uses `--text-secondary` for both a base size and theme color; remove that ambiguity when migrating.
6. Map marketing primitives to shared semantics where they mean the same thing. Keep marketing-only display sizes, gradients, card shadows, and handwritten decoration local.
7. For native theming, choose one authoritative value representation and either generate CSS/native outputs through existing tools or test equality of a small explicit mapping. Do not manually maintain untested drifting palettes in three apps.
8. Avoid a new design-system compiler/framework just for these tokens. Audit package exports and consumer imports before declaring the shared package integrated.

### Theme implementation checks

- Effective theme resolved on startup; existing preferences honored.
- One theme update applies to all mounted overlays and the editor.
- Selection/caret/syntax/read-only states stay legible in light and dark.
- No appearance-only update remounts editors or clears undo/selection.
- Fonts and assets needed for desktop editing work with networking disabled.

## 3. Delivery slices

Deliver each slice as a reviewable change with its own before/after screenshots and interaction evidence. Do not mix a UI redesign with WSL transport replacement, a sync engine, a new editor, and mobile storage in one change.

| Slice | Work | Exit gate |
|---|---|---|
| UI-01 — tokens and theme | Shared semantic values, desktop aliases, theme resolution, light/dark fixtures | Contrast checks; unchanged editor content/undo during theme changes; no remote font dependency |
| UI-02 — desktop shell | Titlebar, rail, sidebar sizing, rows/tabs, status hierarchy | 800×520 through wide monitor; keyboard flow and native window controls intact |
| UI-03 — desktop decisions | WSL setup, search/palette, settings, conflicts/recovery, modal focus | End-to-end success/failure paths; no data-loss or focus traps |
| UI-04 — public website | Contrast/focus, responsive header and preview, demo disclosures/reset | Keyboard/touch/320px/reduced-motion checks; release claims remain accurate |
| UI-05 — mobile feasibility gates | Choose/test storage, editor, navigation, permissions, durable drafts | Real-device evidence for text fidelity, process death, provider access, and recovery |
| UI-06 — native mobile UI | Workspace/search/editor/settings per the mobile spec | Phone/tablet, large text, keyboard, safe areas, save/leave behavior verified |
| UI-07 — browser notebook (optional) | Separate real app boundary, authorized workspace access, history/drafts | Auth expiry, permission revocation, offline behavior, conflicts tested; not just a prettier demo |

UI-04 can proceed independently after shared token intent is agreed. UI-05 can investigate risks while desktop work proceeds. UI-06 is blocked on UI-05, and UI-07 is not automatically part of the website polish task.

### Implement each screen in this order

1. Semantic structure, source-of-truth state, and keyboard/navigation behavior.
2. All required states using deterministic fixtures.
3. Layout and responsive rules.
4. Theme/type/spacing, then icon polish.
5. Focus, screen-reader announcements, contrast, touch, and large text.
6. Real controller/service integration, including failure/stale-response paths.
7. Screenshot and interaction regression evidence.

Do not start with shadows and then discover there is no place to show a conflict.

## 4. Fixtures for design and interaction tests

Use generated/non-sensitive notes. Every screenshot must identify viewport, theme, text scale, state, and whether it uses fixtures or real application data.

| Fixture | Coverage |
|---|---|
| No workspace / no recent entries | Welcome hierarchy and capability-gated actions |
| Empty workspace / empty folder | Creation flow, not a false loading result |
| 30 notes across 3 nested folders | Scanning, indentation, keyboard tree navigation |
| Duplicate basenames in different folders | Path disambiguation and stable identity |
| Very long filename, Unicode, emoji, spaces, RTL text | Overflow, labels, validation fidelity |
| Long Markdown with headings, tasks, links, code, tables | Editor line width, theme, selection, safe rendering |
| Dirty note, pending save, newer edit during save | Correct unsaved state and stale response handling |
| External revision conflict | Version choices, confirmations, persistent notice |
| Disconnected WSL/remote host, expired authentication | Identity and actual save/draft availability |
| Recovery available / recovery persistence failure | Honest durability messaging |
| Partial search index / no results / failed search | Distinct result states |
| Missing file, permission error, unsupported encoding, oversized file | Content-preserving error surface |

A fixture route/story, if added, must stay development/test-only and must not ship real workspace roots or privileged APIs to a public preview.

## 5. Test layers and existing commands

### Existing commands (run from repository root during implementation)

```bash
npm run typecheck
npm run lint
npm test
npm run build:renderer
npm --workspace @takenotes/web run build
```

`npm run build` covers the broader desktop/server/helper build. `npm run dev:desktop` and `npm run dev:web` launch the relevant surfaces. These commands are listed as future implementation checks; this documentation change does not claim they have been run or passed.

Existing tests under `tests/renderer/`, `tests/workspace/`, `tests/integration/`, and `tests/contracts/` cover important state/service behavior. Examples include `panes.test.ts`, `status.test.ts`, `save-conflict.test.ts`, `drafts.test.ts`, and `recovery-reopen.test.ts`. Keep them; they do not by themselves prove the rendered UI's keyboard or screen-reader behavior.

### Add or extend during implementation

- Unit/integration tests for save state with concurrent edits, workspace-switch stale replies, and theme/setting state transitions.
- Rendered component tests for accessible names, modal focus return, input validation, row selection, and state-specific actions.
- Browser/Electron interaction and screenshot tests using an explicitly selected harness; no such coverage is assumed merely because Vitest exists.
- Native editor/storage/navigation tests once mobile dependencies are selected.
- Automated accessibility checks plus manual NVDA on Windows, VoiceOver on Apple platforms, and TalkBack on Android for the surfaces actually supported.

Do not choose/install a new E2E or UI framework as part of writing this guide. Select test tooling in the implementation slice and document the real command when it exists.

## 6. Required interaction acceptance scenarios

| ID | Steps | Pass condition |
|---|---|---|
| A01 | Keyboard open workspace → create note → type → Save | Focus flows predictably; file contains text; Saved reflects completed write |
| A02 | Start save, type more before response | Newer text remains dirty after the older revision succeeds |
| A03 | Edit locally; edit same file externally; save | Conflict shown; neither revision overwritten without explicit guarded resolution |
| A04 | Edit; make recovery persistence fail; close/back | No false “draft safe” message; data-loss guard retains an actionable way to keep text |
| A05 | Open palette/settings; navigate with keyboard; Escape | Focus is contained while modal; return to original trigger/editor without cursor loss |
| A06 | Switch theme, resize sidebar, toggle focus mode | Content, selection, scroll, and undo remain intact |
| A07 | Request search/open on workspace A; switch to B before response | A's response cannot replace B's state or save to B's path |
| A08 | Disconnect WSL/remote host while editing | Identity and failure notice persist; buffer retained; save/draft truth remains accurate |
| A09 | Mobile type → background/process kill → reopen | Last acknowledged durable draft recovers; acknowledged save status matches actual file |
| A10 | Use mobile Back gesture during unsaved/pending save | Same leave decision as explicit Back; no bypass or dropped text |
| A11 | Edit public demo → toggle Read/theme → reset/cancel → refresh | Edits survive view/theme; cancel preserves them; reset/refresh restores samples; never Saved |
| A12 | Navigate browser app back/forward or expire session, if implemented | Authorized note state restored; dirty content protected; no credentials in URL/history |
| A13 | Zoom/text scale 200%; operate conflict/settings actions | No clipping/overlap; all controls reachable and legible |
| A14 | Use IME, emoji, dictation, undo/redo, paste multiline Markdown | No partial composition saves/submits, corrupted text, or lost selection |

## 7. Visual review matrix

Minimum captures:

- **Desktop:** 800×520, 1280×800, 1920×1080; light/dark; files, search, settings, conflict, split panes.
- **Website:** 320×740, 390×844, 768×1024, 1440×900; default page and light/dark concept preview; navigation open and sample no-results state.
- **Mobile:** 360×800, 390×844, 768×1024, 1024×768 logical viewports; light/dark; keyboard shown/hidden; large text; modal/sheet and long filename.
- **Browser notebook, if built:** wide sidebar and compact single-pane layouts, auth/session failure, offline/draft distinction.

Check alignment and spacing, but also check that important state is visible without opening a tooltip. A beautiful screenshot with clipped Cancel or invisible unsaved state is a failure.

## 8. Performance and usability budgets

These are proposed test targets, not recorded measurements:

- A click/key selection gets visible feedback within roughly **100ms** on reference hardware. File/network operations may take longer; acknowledge pending work without blocking typing.
- New visual styling should add no main-thread task over **50ms** during routine typing/navigation on the reference fixture. Profile before adding virtualization or another state layer.
- No layout shift when dirty/save indicators change. Reserve icon/status space.
- Long lists use bounded rendering/virtualization when measured necessary, while retaining accessible navigation and selection. Never mount an editor per result row.
- Theme/layout updates must not cause full editor content reinitialization.
- Public web targets: LCP ≤2.5s, INP ≤200ms, CLS ≤0.1 at the 75th percentile when field data exists. Until then, record lab device/network conditions and do not claim field compliance.
- No remote font request or animated backdrop is necessary to open a desktop note. Public-site font loading must not obscure the CTA or shift the preview excessively.

## 9. Definition of done and evidence record

A slice is complete only when its implementation, interaction tests, accessibility review, and supported-platform evidence agree. Screenshots alone are not enough, and Linux logic tests do not prove real Windows/WSL behavior.

Use this record per slice:

```text
Slice:
Commit / build:
Status: not started | in progress | implemented, unverified | verified
Platforms / OS versions:
Viewport / device / text scale / input method:
Theme states checked:
Fixtures and real-host scenarios checked:
Commands + actual results:
Keyboard / screen reader / touch results:
Screenshots or recordings:
Known gaps / blocked scenarios:
Reviewer:
```

Finally, update the older short design notes to match the implemented slice, without rewriting historical ADR decisions or claiming unfinished capabilities. Keep this guide's target/current distinction until the migration actually lands.
