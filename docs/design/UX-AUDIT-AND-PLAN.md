# Takenotes — UX Audit & Component Design Plan

**Branch:** `design/takenotes-ux-improvements` (created from `main` @ `fc1394e`)
**Date:** 2026-10-11 · **Scope:** audit + plan only. No application code modified.
**Authority order:** `CONTEXT.md` → `docs/roadmap.md` → `docs/decisions/` (ADRs) → implementation + tests as evidence.
`docs/design/MASTER-DESIGN-PROMPT.md` was followed as the workflow spec.

---

## 1. Branch & working-tree safety

Pre-branch inspection (on `main`):

- `git branch --show-current` → `main`, tracking `origin/main`, in sync (`fc1394e`).
- `git status`: **22 modified + 18 untracked paths** (user WIP), plus one stash (`pre-step4-6 WIP`). Nothing committed, reset, or cleaned.
- No `design/*` branch existed, so `design/takenotes-ux-improvements` was created with no suffix collision.
- Branch creation used `git checkout -b` (working tree carried over untouched). Post-checkout `git status` shows the identical 22 modified + 18 untracked set. **All user work intact.**

### Uncommitted work preserved on this branch (do not overwrite)

| Change | Files | Assessment |
|---|---|---|
| Media-preview crash fix (block widgets moved to `StateField`) | `apps/desktop/src/renderer/editor/wysiwyg.ts` | Critical correctness fix; PaneView crashed on any note with an image line |
| Backlinks row: `<button>` → `<div role="button">` (nested-button validity) | `components/backlinks.tsx`, `styles/app.css` | Genuine a11y-HTML fix, **but breaks** `tests/ui/semantics.test.ts` → “link-pane actions are native buttons” (see §5.7, §9) |
| TitleBar declutter (welcome Open-folder buttons moved to `EmptyState` actions) | `components/chrome.tsx`, `App.tsx` | Safe; welcome entry points verified still present (`App.tsx:1030-1033`) |
| Note-service / platform / mobile / icon / packaging WIP | `packages/*`, `apps/mobile/*`, `build/*`, `tests/*` | Out of UX-audit scope; left untouched |

---

## 2. Architecture & design-system summary

### 2.1 Product architecture (as built)

Electron 44 + React 19 + Vite renderer (`apps/desktop/src/renderer/`, `App.tsx` 1554 lines as composition root), CodeMirror 6 single-surface WYSIWYG editor (`editor/wysiwyg.ts`, `create-editor.ts`, `format.ts`), one `CommandRegistry` (`packages/core/src/commands/registry.ts`, 58 `id:` hits, single source — no second ad-hoc table found in `App.tsx`/`use-commands.ts`), service-layer seam (`Workspace/Note/Search/Command/RecoveryService`), per-workspace in-memory index (`renderer/index/workspace-index.ts` over `packages/core/src/index/`), token pipeline `packages/ui/src/theme.ts` → `packages/ui/src/tokens.css` → `apps/desktop/src/renderer/styles/tokens.css` (alias layer) → `styles/app.css` (567 lines, all semantic vars). Tests: **111 files** across 30+ suites.

### 2.2 Hallmark preflight (read-only, first run — no `.hallmark/log.json` exists)

```
Pre-flight findings:
· Font stack: system stacks only (--font-ui/editor/mono, styles/tokens.css:17-19). No webfonts/next-font. Nothing to preserve beyond stacks.
· Palette: --tn-* warm paper (theme.ts; light app #faf6ee/accent #4f41d6, dark app #151310/accent #ad9fff) + accent switcher (violet/blue/graphite, drift-tested).
· Motion: motion-cut — zero animation deps (framer-motion/gsap/motion/lottie absent from all manifests). CSS 100/150/180ms ease cubic-bezier(0.2,0,0,1); global reduced-motion kill-switch (tokens.css). Palette/menus/dialogs render instantly (no enter transitions found).
· Spacing: 4pt scale via --tn-space-*. Framework: Electron + React 19 + Vite + CodeMirror 6.
· Genre: Operate (Today/tasks/calendar/collections) + Read (editor). No Persuade surface in desktop scope.

Hallmark will preserve: token pipeline, system fonts, motion-cut restraint, single-surface editor.
Hallmark will introduce (only with approval, per-component): macrostructure-equivalent layout decisions, state completeness, worst-case robustness.
```

### 2.3 Design-system health: strong foundation, three leaks

1. **Token pipeline is exemplary.** `theme.ts` is genuine truth; desktop alias layer maps `--sp-*`/`--surface-*`/`--text-*` to `--tn-*`; `app.css` contains no scattered hex except documented `[data-accent]` overrides (drift-tested in `tests/appearance/`) and `color-mix()` derivations. Contrast/keyboard/semantics suites exist (`tests/ui/contrast|keyboard|semantics`, `tests/appearance/`).
2. **Leak 1 — hardcoded graph group colors** (`components/graph.tsx:23`, `GROUP_COLORS` 6 raw hexes). They cannot adapt to dark theme or accent switches. Highest-value token fix in the repo.
3. **Leak 2 — canvas SVG fallbacks** (`styles/app.css`: `var(--surface-subtle, transparent)`, `var(--border-strong, #999)`, `#fff` in `.c-card`). Cosmetic fallbacks, but `--surface-subtle` is not a defined token — dead reference.
4. **Leak 3 — stale `docs/design/tokens.md`** documents a superseded palette (`#18191c` dark) and says so itself. Historical; superseded by `theme.ts` + `ui-ux/foundations.md`. Do not delete (history), but never design from it.

---

## 3. Feature inventory (evidence labels)

Label key: **V** = implemented & verified · **VI** = implemented, verification incomplete · **P** = partial · **PL** = planned · **D** = deferred · **?** = unclear/conflicting.

| # | Feature | Status | Sources |
|---|---|---|---|
| 1 | Workspace welcome + recents | **V** | `App.tsx:1025-1055` (EmptyState + direct `openRecent`), `mvp-status.md` Step 1 |
| 2 | App shell (titlebar/rail/sidebar/statusbar/focus) | **V** | `components/chrome.tsx`, `app.css` (rail 48px, sidebar 256, statusbar 28), `tests/appearance/shell-chrome.test.ts` |
| 3 | File Explorer (sort/reveal/drag/drop/rename/delete) | **V** | `components/tree.tsx` (roving tabindex), `use-file-tree.ts`, `tests/explorer/step2-explorer.test.ts` |
| 4 | Single-surface WYSIWYG editor | **V–VI** | `components/pane-view.tsx`, `editor/wysiwyg.ts`, `tests/renderer/single-surface.test.ts`, `wysiwyg.test.ts`; OS-level visual checks outstanding per `mvp-status.md` |
| 5 | Tabs (pin/reopen/numbered/reorder, no splits) | **V** | `components/overlays.tsx` (TabStrip), `panes.ts`, Step 1 status |
| 6 | Quick Open (fuzzy/create/recents/disambiguation) | **V** | `components/palette.tsx:commit` (Enter/Shift+Enter/Ctrl+Enter), `packages/core/src/commands/palette.ts`, `tests/commands/quick-open.test.ts` |
| 7 | Command Palette (single registry, recents+pins, disabled states) | **V** | `hooks/use-commands.ts` (`whenFor`), `registry.ts`; `workspace.switch` hard-disabled (`use-commands.ts:160-161`, see §5.1) |
| 8 | Hotkeys (`hotkeys.json`, multi-bind, collision warnings) | **V** | `hooks/use-hotkeys.ts` (collisions memod), `packages/platform/src/keymap.ts`, `tests/commands/*hotkeys*` |
| 9 | Search (grammar + `INVALID_REQUEST`, debounce, caps, recents) | **V** | `components/search.tsx` (+H-04 `notice`), `packages/core/src/search/query.ts:402,462`, `tests/search/` |
| 10 | Favorites (groups/order/aliases/unresolved-retain) | **V** | `components/favorites.tsx` (`isFavoriteResolved`), `tests/favorites/` |
| 11 | Outline (live ATX, roving tabindex) + hover PreviewCard | **V** | `components/outline.tsx`, `components/pane-view.tsx` (400ms hover report) |
| 12 | Links/backlinks/outgoing (autocomplete, follow-to-create, rename rewrite) | **V** | `components/backlinks.tsx`, `packages/core/src/links/`, `tests/workspace/link-rename.test.ts` |
| 13 | Attachments/embeds (policy naming, audio/video/PDF/note embeds) | **VI** | `pane-view.tsx` insert-at-cursor, `wysiwyg.ts` media previews (WIP fix), Step 1 “desktop file-URL plumbing” follow-up open |
| 14 | Properties (registry, lossless round-trip, malformed-YAML safe) | **VI** | `index/property-registry.ts`, `components/properties-view.tsx:147`; UI depth vs Step 6 unverified on-host |
| 15 | Today (aggregate) | **P** | `components/today-pane.tsx:59` — overdue/due/scheduled only; **no Daily embed, recents, or quick actions** (ADR-0011 gap, §4-F1) |
| 16 | Tasks + Quick Capture (explicit dates, no NLP) | **V–VI** | `components/task-dialog.tsx` (inline date errors), `packages/core/src/productivity/tasks.ts` |
| 17 | Calendar (event-notes + `@scheduled`, drag) | **V–VI** | `components/calendar-pane.tsx:28-105` (drag payload + drop); `@due`-untouched invariant service-tested, UI-path reverification pending |
| 18 | Tags (tree/flat, counts, click-to-search) | **VI** | `components/tags.tsx:99`, `packages/core/src/tags/` |
| 19 | Collections/Views (YAML, table+list only) | **P** | `components/collections.tsx:91-117`; UI creates **list views only** (`collections.tsx:135-140`, §4-F3) |
| 20 | Graph (global/local, filters/groups/depth/orphans) | **VI** | `components/graph.tsx` (toggles all present); hardcoded `GROUP_COLORS` (§2.3); keyboard alternative = list-adjacent nav only |
| 21 | Canvas (cards/edges/groups, deferred items honestly labeled) | **VI** | `components/canvas.tsx:766` (“web cards open in a browser post-MVP”, `:586`) |
| 22 | Recovery/history (snapshot-before-restore, 7-day, not-backup copy) | **V** | `components/history-dialog.tsx` (honest copy verbatim), `tests/workspace/recovery*.test.ts` |
| 23 | Settings (7 tabs, roving tablist, Automation/MCP, Shortcuts, About) | **V–VI** | `components/settings.tsx:334` (7 tabs incl. Automation); no settings search (accepted, 15 settings) |
| 24 | Import (Markdown/HTML picker + preview; Textbundle unclear) | **P–?** | `components/import-dialog.tsx` (30-row cap, phased), `packages/core/src/import/{html,plan}.ts` — no Textbundle module found (§5.4) |
| 25 | Updates (stable-only check, verified download, honest SmartScreen copy) | **V–VI** | `components/update-dialog.tsx`, `hooks/use-updates.ts`, ADR-0006; live-Windows path unexecuted here |
| 26 | WSL connect (distro→user→path, precise errors, maintenance-only) | **VI** | `components/wsl-dialog.tsx` (RHF + valibot, default-user preselect), `use-wsl-connect.ts`; live `wsl.exe` path BLOCKED in this env |
| 27 | MCP/agent surface (stdio sidecar, grants, activity log) | **VI** | `main/services/mcp-{host,pipe,store}.ts`, Settings Automation tab; renderer **approval-screen flow not traced** in this pass |

Not invented, not assumed: every row above was read in source or tests. OS-gated items (13, 25, 26) are **VI**, not **V** — no Windows/macOS host exists in this environment.

---

## 4. Prioritized findings

`Priority | Finding | Evidence | User impact | Recommendation | Confidence`

| P | Finding | Evidence | Impact | Recommendation | Conf |
|---|---|---|---|---|---|
| F1 | **Today is task-list-only, not the ADR-0011 aggregate.** No Daily embed, recent notes, or quick actions; missing Daily Note has no explicit `[ Create Today's Note ]` in-pane. | `today-pane.tsx:1-59` (zero hits for daily/recent/quick); ADR-0011; roadmap Step 6 | High — Today is the flagship productivity view and currently under-delivers its contract | First component brief (§8): define aggregate hierarchy (scheduled → overdue/due → Daily state + create action → recent → quick actions), reuse `cmd-item` rows + `EmptyState`; prototype 3 density variants | High |
| F2 | **Graph group colors are raw hex, invisible to themes.** | `graph.tsx:23` `GROUP_COLORS` | Med — wrong/chalky swatches in dark mode; breaks token contract | Add `--tn-graph-*` categorical tokens (light/dark pairs, contrast-checked) or derive via `color-mix` from accent + neutrals; cheapest shared-system win | High |
| F3 | **Collections UI can only create `list` views.** | `collections.tsx:135-140` (`kind: "list"` hardcoded, “New list view…”) | Med — table views require hand-written YAML; discoverability gap | Add kind selector (table/list) to the add-view row; empty/error/loading parity per view | High |
| F4 | **`workspace.switch` permanently disabled while Recent-switching ships.** | `use-commands.ts:160-161` vs `App.tsx:1040-1051` (`openRecent` works) | Med — palette promises less than the app does; keyboard users detour via welcome screen | Owner call (§5.1): enable with recent-workspace source or remove the ID; do not leave a dead command | High |
| F5 | **Quick Open `Ctrl+Enter` semantics vs roadmap.** Roadmap Step 2: open-in-new-tab; code: keep-palette-open multi-open, comment claims new-tab “would be a behavioral no-op” though tabs exist. | `palette.tsx:commit` + comment; roadmap Step 2 | Med — power-user friction + doc/code conflict | Owner call (§5.2): pick one, fix code or roadmap | High |
| F6 | **Canvas/Graph SVG uses undefined `--surface-subtle` + `#999` fallbacks.** | `app.css` (`.graph-svg`, `.canvas-svg`, `.c-card`, `.g-link`) | Low-Med — fallbacks render, but off-palette grays in both themes | Map to `--tn-code-surface`/`--tn-border-control`; delete dead token ref | High |
| F7 | **Search result keyboard model is button-only.** Rows are `<button class=search-result>` with no roving tabindex or arrow-key handling (unlike tree/outline/menus). | `search.tsx:SearchRow`; cf. `tree.tsx` roving pattern | Med — search is high-frequency; mouse-only result walk is a keyboard-first violation | Adopt shared `moveRovingIndex` list pattern; Enter opens at line | High |
| F8 | **Today/Calendar/Collections/Graph panes lack `EmptyState` parity.** Outline/Favorites/History use `EmptyState`; Today uses inline `.cmd-section` text; Calendar/Collections/Graph empties unconfirmed in this pass. | `today-pane.tsx:29`, `outline.tsx`, `favorites.tsx`, `history-dialog.tsx` | Low-Med — inconsistent first-run voice | Shared empty-state pass as part of system plan (§6.2) | Med |
| F9 | **Command-menu has no visible shortcut hints for its own keys** (Enter/Shift+Enter/Ctrl+Enter shown only when results exist; nothing on empty query). | `palette.tsx` (`query.trim() !== "" && quickItems.length > 0` gate) | Low — discoverability of create semantics | Always show the hint row in Quick Open mode | High |
| F10 | **Hover-preview cards are mouse-only** (400ms editor hover, tree hover) with no focus-equivalent for keyboard users. | `pane-view.tsx` hover effect; `tree.tsx:onHoverFile` | Low-Med — preview is enhancement, but keyboard parity is a stated Step 9 goal | Focus-triggered preview (e.g. `Ctrl+Hover` equivalent on focused link) as enhancement backlog, not MVP gate | Med |
| F11 | **Settings has 7 tabs and no search** (accepted), Automation/MCP tab discoverability untested with real clients. | `settings.tsx:TABS`, `mvp-design-status.md` gaps | Low — fine at 15 settings; revisit past ~25 | No action now; log trigger threshold | High |

Deliberately **not** filed: color/typography restyles (system is coherent), new animations (frequency gate forbids them on all high-traffic surfaces), Edit/Read toggle (banned by ADR-0015), split panes / cards-board views / recurrence / NLP (deferred by roadmap).

---

## 5. Contradictions & owner decisions (do not resolve unilaterally)

1. **`workspace.switch` (§4-F4).** Roadmap: “registered-but-disabled until recent-switch lands.” Recent-switch *has* landed via `workspaceApi.openRecent` (`App.tsx:1045`). Either enable the command or delete it. **Ask owner.**
2. **Quick Open `Ctrl+Enter` (§4-F5).** Roadmap says new-tab; code does keep-open. Tabs exist, so the code comment’s rationale looks stale. **Ask owner.**
3. **Stale read-mode history.** `docs/archive/status/mvp-status.md` Step 1 sections record `readMode`/`toggleReadMode`/`Ctrl+E` as shipped; ADR-0015 (accepted, later) removed all of it, and source confirms zero remnants. Status docs are append-only history — **left untouched per instructions** — but future readers will misread Step 1 as “has reading view.” Recommend a dated addendum pointer, owner-approved.
4. **Import scope: Textbundle?** Roadmap MVP: “Markdown + Textbundle/HTML.” Code has `import/html.ts` + `plan.ts`; no Textbundle module found. Either scope doc or implementation is behind. **Ask owner** which is true before designing Import states.
5. **`docs/design/tokens.md` vs `theme.ts`.** Stale palette doc is self-marked superseded — no action except: never cite it in future briefs. Noted here so it stops resurfacing.
6. **`livePreview` prop naming.** `PaneView`/`wysiwyg.ts` use `livePreview` as the *decoration kill-switch*; roadmap defers “Live Preview widgets” as a *feature*. Same words, different meanings — rename the prop (`wysiwygDecorations`) at the next editor touch to avoid re-introducing scope confusion. Suggestion only.
7. **Working-tree vs test: backlinks rows.** Uncommitted `backlinks.tsx` (div+role=button, fixes real nested-`<button>` invalidity) contradicts `tests/ui/semantics.test.ts` (“link-pane actions are native buttons”), now failing 1/1233. Both sides have merit (valid HTML vs native semantics). **Owner call after this audit:** either amend the test to accept `role=button` rows with native inner actions, or rework rows to keep outer native buttons with non-button inner actions. **Do not “fix” by deleting the test.**

---

## 6. Shared design-system improvement plan (before any component)

1. **Token completion (small, safe).** Add categorical graph tokens + canvas surface/border mappings (§4-F2/F6) through `theme.ts` → regenerate → alias. No component restyle.
2. **Empty-state voice parity (§4-F8).** One `EmptyState` pattern (title + description + optional action) for Today/Calendar/Collections/Graph/Canvas/Search-empty, reusing existing component. Copy rule: state what’s missing, what to do next, never fake data.
3. **Command-list keyboard contract (§4-F7/F10).** Promote the tree/outline roving-index + focus-visible pattern to Search results and all `cmd-item` lists; document the shared pattern in `docs/design/ui-ux/components-and-states.md` (append-only addition, not rewrite).
4. **Dialog/form consistency spot-check.** Task/Template/Import/WSL/Update/History dialogs already share `Dialog/Button/Notice/TextField` — verify error-copy tone (`inline-error` vs `Notice`) once, during first component implementation.
5. **Motion charter (one paragraph, enforce in reviews).** Motion-cut stands: instant for Quick Open/palette/tabs/tree/search; 100–180ms `var(--motion-*)` only for dialogs/menus/toasts; `prefers-reduced-motion` already global. Any future `animate` proposal must pass the frequency gate in review.
6. **Prototype harness convention.** Isolated `/prototypes/<slug>` route (or static preview where no dev server), dev-only worst-case toggle per `break-ui`, real copy from `demo-workspace/`, delete after promotion. Establish on first prototype (Today), reuse after.

---

## 7. Component roadmap (leverage order; dependencies noted)

| Order | Component | Why here | Depends on | Prototype? |
|---|---|---|---|---|
| 1 | **Today aggregate** | Biggest contract gap (§4-F1); daily-use surface; unlocks Daily/Tasks/Calendar coherence | §6.1–6.2 | **Yes — 3 densities** (compact list / grouped sections / calm editorial) |
| 2 | **Graph tokens + readability** | Cheapest shared win (§4-F2); zero behavior risk | §6.1 | No (token-only) |
| 3 | **Search results keyboard** | High-frequency a11y fix (§4-F7); pattern reuses tree/outline code | §6.3 | No |
| 4 | **Collections view creation** | Closes MVP discoverability gap (§4-F3) | §6.2 | Only if kind-selector placement is contested (2 variants max) |
| 5 | **Quick Open hint + Ctrl+Enter** | Needs owner call first (§5.1–5.2); then trivial | Owner decision | No |
| 6 | **Calendar event rendering/density** | Builds on Today decisions; drag already works | 1 | Yes if density contested |
| 7 | **Editor chrome (title/tab/conflict bar)** | Highest-risk surface — touch last among core; current implementation is strong | 1–6 learnings | Only for conflict-bar copy variants |
| 8 | **Properties/Tags/Backlinks polish** | Stable, tested; empty-state + keyboard parity only | §6.2–6.3 | No |
| 9 | **Canvas/Import/WSL/MCP surfaces** | VI-status or deferred hosts; design states, don’t restyle working flows | Owner scope calls | Per-surface if uncertain |
| 10 | **Settings growth** | Fine as-is; revisit past ~25 settings or with real MCP clients | — | No |

Each component brief (Phase C) must still define: user job, hierarchy/density, primary/secondary/destructive actions, keyboard/focus model, full state matrix (incl. 8-state wrapper where Hallmark component-scope fires), light/dark + narrow behavior, tokens reused, constraints, acceptance tests, open questions.

---

## 8. Recommended first component: Today aggregate

**Why Today:** it is the only flagship view in **Partial** status against an accepted ADR; it is seen daily (maximum leverage per unit of change); its fix is additive (Daily embed + create action + recents + quick actions around the existing task groups), so regression risk is low and the change is verifiable with existing index fixtures; and its density/hierarchy decisions cascade into Calendar, Tasks, and Collections.

**Scope (post-approval):** `components/today-pane.tsx` + data selector (`productivity/today.ts`) + empty/create states only. Exact file list and 3-variant prototype plan to be presented for approval before any production edit. No shell, editor, or service changes.

---

## 9. Skills, verification & limitations

### Skills inventory (local `~/.agents/skills/`)

| Skill | Status this run | Contribution |
|---|---|---|
| `hallmark` (SKILL.md + references read) | Applied manually (preflight §2.2, component-scope rules, audit/redesign verbs) | Preflight block, token-lock discipline, 8-state requirement for Phase C |
| `impeccable` (SKILL.md read; `scripts/impeccable context` launcher **not run** — repo-wide audit scope, no single `--target`; will run per-component in Phase C) | Applied manually (Operate/Read modes, critique/audit lens) | Mode classification, finishing-pass checklist (§6) |
| `emil-design-eng` | Read; Before/After/Why table format adopted for Phase D | Interaction-quality bar, frequency gate |
| `find-animation-opportunities`, `review-animations` | Read; read-only scan applied (§2.2 motion stance) | Confirmed motion-cut correct; nothing to animate on high-traffic surfaces |
| `animate`, `improve-animations`, `mobile-native`, `apple-design`, `pick-ui-library`, `ask-sonner` | Read; deemed not applicable (no new motion, no new deps, desktop-first audit) | — |
| `prototype`, `break-ui` | Read; **not executed** (correct per workflow: no implementation in audit run) | Harness convention defined (§6.6) for Phase C/E |
| Missing | None for this phase | — |

No tool execution fabricated: no skill runner, browser, or OS check was claimed beyond what ran below.

### Verification actually run (on this branch, with user WIP present)

- `npm run typecheck` → **clean**.
- `npm test` (full, 111 files) → **107 passed, 3 skipped, 1 failed** (`tests/ui/semantics.test.ts` → “link-pane actions are native buttons”, caused by the uncommitted `backlinks.tsx` change documented in §1/§5.7). 1224 passed, 8 skipped, 1 failed of 1233.
- `npm run lint` / `npm run build` → **not run** (no code changed by this audit; build evidence already recorded in `mvp-status.md` for prior commits).

### Limitations (honest)

- Linux container: no Windows/macOS/WSL host — items marked **VI** stay VI; no manual OS verification claimed.
- No prototype or worst-case harness executed (audit-only scope).
- Frequency/impact rankings mix verified code facts with reviewer judgment where telemetry doesn’t exist — Confidence column marks the difference.
- Audit read ~40 source/test/doc files directly; remaining `packages/core` depth was sampled via targeted grep, not line-by-line.

---

*Only intended change of this run: this document. Left uncommitted on `design/takenotes-ux-improvements` for review. No app code, context, roadmap, ADR, or status record was edited.*
