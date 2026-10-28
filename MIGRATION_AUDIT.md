# MIGRATION_AUDIT.md

M0 output. Read-only audit of the repo against `design/prototype/assets/app.css` and `ui.js`. Counts come from grep over `apps/**` and `packages/**` (excluding `node_modules`). They are approximate and good enough to order the work. Generated 2026-10-28.

## Key finding: the guide's M1 and M2 are partly done already

The migration guide assumes there is no shared token package and no shared component library. This repo already has both, in a different shape:

| Guide says | Repo today |
| --- | --- |
| Create `packages/design-tokens/tokens.css` | `packages/ui/src/tokens.css`, **generated** from `packages/ui/src/theme.ts` (`npm run ui:tokens`, CI runs `ui:tokens:check`). Prefix is `--tn-*`, not `--app/--side/...`. |
| Dark under `@media (prefers-color-scheme)` and `[data-theme="dark"]` | Dark is `[data-theme="dark"]` only. No `@media (prefers-color-scheme: dark)` block, so "System" depends on JS setting `data-theme` (`resolveTheme`). |
| `setTheme` / `setAccent` API | Accent is `[data-accent="violet\|blue\|graphite"]` presets in `apps/desktop/.../tokens.css`, sourced from `packages/core/src/appearance/appearance.ts`. No free hex accent, no derived soft/hover. |
| New `packages/ui` with ~25 components | `packages/ui/src/dom` has 8: `Button`, `IconButton`, `TextField`, `SelectField`, `SettingRow`, `Notice`, `EmptyState`, `Dialog` (plus 4 marketing effects). Desktop-only. |

**Decision needed before M1** (see "Decisions" at the end): do not create a second token package. Extend `packages/ui` and keep `theme.ts` as the one source. Otherwise there will be two sources of truth, which is the exact failure the guide warns about. The repo's own `CLAUDE.md` also says tokens live in `packages/ui/src/theme.ts`.

The repo's token values are already almost identical to the target (see section 3), so the visible change from migrating is small. Most of the work is components, not colour.

## 1. Map

| Workspace | Framework | Styling | Notes |
| --- | --- | --- | --- |
| `apps/desktop` | Electron 44, React 19 | Plain CSS: `styles/app.css` (995 lines, ~593 rules), `styles/tokens.css` (140). Tailwind 4 loaded (`@takenotes/ui/tailwind.css`) but barely used (`rounded-tn`, `text-sm`: ~7 uses). | The real product. 30 component files, `App.tsx` is 2083 lines. CodeMirror 6 editor styled by `.cm-*` rules with `!important`. |
| `apps/web` | React 19, Vite | Plain CSS: `App.css` (387), `theme.css` (184), `blog.css` (117). Own `ThemeToggle`, own `Icon`. | **Marketing site and blog, not the product.** Has its own palette (`--paper`, `--ink`, `--violet`, `--mint`, `--art-*`). Has a notebook preview component. |
| `apps/server` | Node, HTTP + MCP | `src/web-ui.ts` returns an inline HTML string with its own `<style>` (218 lines). | Raw hex (`#fde8e8`, `#e6f6e6`, `#eef`, `#ddd`). Tiny admin/status page, not React. |
| `apps/mobile` | Expo 58, React Native 0.88 | React Native. 8 screen files, 1 shared `rows.tsx`. Almost no styling yet; `rows.tsx` has `TODO: map tone → theme color`. | Cannot use CSS tokens. Needs `packages/ui/native` (currently re-exports neutral modules only). |
| `packages/ui` | React DOM + neutral TS | `tokens.css` (generated), `tailwind.css`, `dom/styles.css` (94). | Neutral entry (`theme.ts`, `behavior.ts`) is shared with mobile. |
| `packages/core`, `contracts`, `platform`, `test-support` | TS only | None. | `core/src/appearance/appearance.ts` holds the accent hex pairs (8 hex). |
| `design/prototype` | HTML/JS/CSS | Reference. Read-only per `CLAUDE.md`. | 709-line `app.css`, 12 JS files. |

Two stylelint/eslint facts: ESLint exists (`eslint.config.mjs`). **No stylelint, no Storybook, no Playwright, no axe** are installed.

## 2. Values in use

### Colours (raw literals outside the token files)

Total distinct hex literals in code ≈ 90. Where they live:

| File | Hex count | Verdict |
| --- | --- | --- |
| `packages/ui/src/tokens.css`, `theme.ts` | 70 each | Token source. Fine. |
| `apps/web/src/App.css` | **102** | Site-specific art/gradients. Biggest offender. |
| `apps/web/src/theme.css` | 60 | Parallel palette, many duplicates of target tokens. |
| `apps/desktop/.../tokens.css` | 18 | Accent presets (mirrors `appearance.ts`). Duplicated in 2 places, guarded by a drift test. |
| `packages/core/.../appearance.ts` | 8 | Accent source. |
| `apps/server/src/web-ui.ts` | 4 | Off-palette (`#fde8e8` ≈ `--bad-bg`, `#e6f6e6` ≈ `--ok-bg`, `#eef` ≈ `--selected`, `#ddd` ≈ `--line`). |
| `apps/desktop/.../app.css` | 3 (`#999` ×5 lines 587–605) | Off-palette grey. Maps to `--faint`. |
| `canvas.tsx` | 2 | Canvas drawing colours; need the TS token export. |
| `windows.ts`, `index.html` ×2 | 1–2 | Window background colour before CSS loads. Acceptable, but should come from the token file. |

Most-repeated values: `#fff` (31, mostly web), `#191817` (19, = `--text`), `#fffdf7` (13, = `--editor`), `#ffdf8e` (13, = `--highlight`), `#f4ecd9` (12, = dark `--text`). **The palette is already the target palette.** Only the `#999`, the server colours and web's `--art-*` / `--workflow-*` / `--neutral-*` families are not.

`rgb()/rgba()`: web `App.css` 23, web `theme.css` 7, desktop 6 (shadows and selection), ui 5.

### Radii

| Value | Count | Target token |
| --- | --- | --- |
| `999px` | 33 | pill (99px). Exact. |
| `var(--radius-control)` 29, `--radius-input` 12 | 41 | 6px = `--r-in`. Exact. |
| `var(--radius-tiny)` / `--radius-row` | 19 | 4px = `--r-ctl`. Exact. |
| `6px` | 9 | `--r-in`. Exact. |
| `8px` / `--radius-dialog` / `--radius-menu` | 7 | `--r-dlg`. Note: `--tn-radius-menu` is **6px**, target is 8px. Small shift. |
| `10px` | 4 | `--r-max`. Exact. |
| `12px` ×9, `14px` ×5, `16px` ×3, `18px` ×4, `20px` ×3, `22px` ×3, `24px` ×3 | 30 | **No target.** All in `apps/web` (marketing). Target says nothing is rounder than 10px except pills. |
| `5px` | 2 | Checkbox radius per guide (5px). Keep as a named exception. |
| `50%` | 7 | Circles (avatars, dots). Allowed. |

Desktop alone is clean: 4/6/8/pill/50%. The off-scale radii are all in the website.

### Font sizes

| Value | Count | Mapping |
| --- | --- | --- |
| `12px` | 98 | Small text. Exact. |
| `13px` | 54 | Data table/small. Exact. |
| `14px` | 24 | UI text. Exact. |
| `12.5px` | 15 | Prototype uses it too (`.btn.sm`, `.hint`). Keep or snap to 13. |
| `13.5px` ×8, `14.5px` ×3, `15px` ×6, `11.5px` ×2 | 19 | Small shifts; snap to 13/14/12. |
| `11px` ×9, `10px` ×3 | 12 | `11px` chip/kbd is in target. `10px` is below the 11px floor. |
| `16px`–`30px`, `clamp(...)` | ~25 | Web only (hero, blog). Desktop uses `--editor-font-size`. |

Desktop: 89× 12px, 40× 13px, 13× 14px. Consistent with the target scale.

### Shadows, z-index, `!important`

- Shadows: desktop has `--shadow-menu`, `--shadow-overlay`, plus one raw `0 8px 24px rgba(0,0,0,.28)` (toast?). Target has one `--shadow`. Web has `--shadow-soft`, `--shadow-card`.
- z-index: desktop uses a token scale (`--z-sticky/popover/command/dialog/toast/tooltip`) except two raw values (`30`, `60`). Web has `30`, `60`, `100`, `2`, `1`.
- `!important`: desktop 7 (all `.cm-editor` overrides of CodeMirror, plus 4 in the reduced-motion block), web 7 (3 `theme.css`, 4 `App.css`). The guide's "no `!important`" rule needs two documented exceptions: CodeMirror theme overrides and the global reduced-motion reset.

### Spacing

Desktop `tokens.css` has two overlapping scales: `--tn-space-*` (4,8,12,16,20,24,32,40,48,64) and `--sp-*` aliases (adds `2px` and `6px`). Prototype uses ad hoc px. No change needed beyond picking one name.

### Fonts

Desktop: `system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`. Target lists Segoe UI Variable first and Roboto last. Small shift, no visible change on Windows. Mono stack is close to target.

## 3. Token mapping (repo → target)

Light and dark hex values were compared one by one against the guide's table.

| Target | Repo token | Light match | Dark match |
| --- | --- | --- | --- |
| `--app` | `--tn-surface-app` | exact | exact |
| `--side` | `--tn-surface-sidebar` | exact | exact |
| `--editor` | `--tn-surface-editor` (+`-input`) | exact | exact (`-input` = editor) |
| `--panel` | `--tn-surface-panel` | exact | exact |
| `--overlay` | `--tn-surface-overlay` | exact | exact |
| `--hover` | `--tn-surface-hover` | exact | exact |
| `--selected` | `--tn-surface-selected` | exact | exact |
| `--code` | `--tn-code-surface` | exact | exact |
| `--highlight` | `--tn-highlight-surface` | exact | exact |
| `--text` / `--text2` | `--tn-text-primary` / `-secondary` | exact | exact |
| `--muted` | `--tn-text-muted` | **small shift**: repo `#6c6558`, target `#70695c` | exact |
| `--faint` | `--tn-text-faint` | exact | exact |
| `--line` | `--tn-border-subtle` | exact | exact |
| `--control` | `--tn-border-control` | exact | exact |
| `--accent`, `-hover`, `-soft` | `--tn-accent*` | exact | exact |
| `--on-accent` | none | **missing** | **missing** |
| `--btn` / `--btn-text` | `--tn-action-fill` / `-text` | exact | exact |
| `--ok`, `--warn`, `--bad` + `-bg` | `--tn-success-*`, `-warning-*`, `-danger-*` | exact | exact |
| `--shadow` | `--tn-shadow-overlay` + `--shadow-menu` | exact | exact |
| `--measure` 720 | `--readable-width: 760px`, `--editor-max-width: 760px` | **visible change**: prototype CSS says 760, guide says 720 | |
| `--sb` 248 | `--sidebar-width: 256px` | small shift | |
| status bar 26 | `--statusbar-height: 28px` | small shift | |
| title bar 40, rail 48, tab strip 36 | same | exact | |
| tree row 28 | `--tn-target-row: 32px`; tree indent `16px` (target 14) | small shift | |
| control height 30 | `--tn-target-control: 36px` | **visible change** | |
| icon button 28 | `--tn-target-icon: 32px` | **visible change** | |
| radii 4/6/8/10 | 4/6/6(menu)/8(dialog)/10 | menu is 6, target 8: small shift | |
| icons 20px, 1.5px stroke | `icons.tsx`: Lucide, **2px stroke**, 24-grid | **visible change** | |

No match for: `--tn-graph-1..6` (graph view colours; keep, add to token set), `--tn-scrollbar`, `--tn-selection` (dark differs from `--selected`: `#493968` vs `#342b50`, intentional for text selection), web's `--art-*`, `--workflow-*`, `--mint-*`, `--neutral-*` (illustration colours).

**Conflicts between the guide and the prototype itself:** guide says `--measure: 720px`, prototype `app.css` says `760px` (and `--rp` is 300 in both). Also guide says tab 32px in a 36px strip; confirm against `.tab` in the prototype. Recommend the prototype wins, since `CLAUDE.md` calls it the reference.

## 4. Components

Counts for `apps/desktop` (the only app with a real component layer).

| Component | Defined | Copies | Uses | Behaviour to preserve |
| --- | --- | --- | --- | --- |
| Button | `ui/dom/button.tsx` | 1 shared + raw `<button>` | 6 `.btn` class uses; **107 raw `<button>`** in desktop | `actionState` (blocked/pending), disabled reasons |
| IconButton | `ui/dom/button.tsx` | 1 shared + ad hoc (`.icon-btn`, `.rail-btn`, `.tab-close`) | ~5 shared | aria-label, tooltip |
| Input / Select / Textarea | `ui/dom/field.tsx` (`TextField`, `SelectField`) | 1 shared; **67 raw `<input/select/textarea>`** | 8 shared | `fieldState` error text, `aria-invalid`. No Textarea component. |
| Switch / Checkbox | none | raw inputs + CodeMirror task checkbox (`wysiwyg.ts`) | settings, tasks | Space toggles; CM task widget writes back to the note |
| Chip / Badge / Pill | none | CSS classes per view (`.chip`, `.tag-pill`, `.status-pill`, task chips in `wysiwyg.ts`) | many | Task chips are editor widgets; must stay clickable |
| Menu / MenuItem | `overlays.tsx` `ContextMenu` | 1, plus ws-switcher menu and the "Actions" menu | context menus, tab menu | `role="menu"`, `moveItemFocus` arrows, Esc. **No typeahead, no shortcut hints, no disabled-with-reason.** |
| Dialog | `ui/dom/dialog.tsx` | 1 shared; `welcome`, `palette`, `overlays` roll their own `role="dialog"` | 12 dialogs use shared | Focus trap, `canDismissDialog`, backdrop never confirms destructive |
| ErrorDialog / ConfirmDialog | none | each dialog hand-builds it | workspace-dialogs, wsl-dialog, update-dialog, import-dialog | Errors: cause plain, Details collapsed, one action (rule in `CLAUDE.md`; `tests/renderer/error-text.test.ts`) |
| Toast | `overlays.tsx` `Toasts` + `stores/toasts.ts` | 1 | global | `role="status"`. Check: one at a time and a real Undo |
| Banner / Notice | `ui/dom/feedback.tsx` `Notice` | 1 shared; **~9 hand-made `role="alert"` blocks** | settings, dialogs | `role="alert"` for warn/danger |
| Tabs | `overlays.tsx` `TabStrip` | 1 | editor panes | `tablist`, dirty marker, close, middle-click, overflow |
| Tree row | `tree.tsx` (+ `favorites.tsx` rows) | 2 variants (`.tree-row` 31 rules) | file tree | Drag/drop, rename input validation, roving focus |
| Rail | `chrome.tsx` `ActivityRail` | 1 | shell | |
| Title bar / Status bar | `chrome.tsx` | 1 each | shell | Status bar holds save state, counts |
| Card | none | `.card`-like divs per page (`pages.tsx`, `today-pane`, `collections`) | | |
| EmptyState | `ui/dom/feedback.tsx` | 1 shared, 8 uses | all lists | No line illustrations yet (`art()` not ported) |
| Skeleton | none | text-only `role="status"` "Loading…" in ~6 places | | Needs shimmer |
| Command palette | `palette.tsx` | 1 (220 lines) | Ctrl+K | `combobox` + `listbox` roles |
| Data table | none | properties-view and collections build their own | | |
| Progress / Stepper | none | import-dialog and update-dialog have inline progress | | |
| Kbd | none | `.kbd` spans in shortcuts-dialog | | |
| Icon set | `icons.tsx` (56 lines, ~35 icons) | desktop; web has its own `Icon.tsx` | all | Stroke 2 vs target 1.5; prototype `ICONS` has more glyphs |
| Block menu / selection toolbar | `editor/` (CodeMirror) | 1 | editor | `tests/renderer/slash-menu.test.ts` |

Web, server and mobile share **none** of these. Web has `ThemeToggle` and `Icon`; server uses inline HTML; mobile has `rows.tsx` only.

## 5. Screens

Desktop (`App.tsx` + `components/`). States: L loading, E empty, X error, O offline, R read-only. `-` = not found in code.

| Screen | Component | L | E | X | O | R |
| --- | --- | --- | --- | --- | --- | --- |
| Welcome / open workspace | `welcome.tsx` | ✓ | ✓ | ✓ | - | - |
| Workspace switcher | `ws-switcher.tsx` | - | ✓ | ✓ | - | - |
| WSL setup | `wsl-dialog.tsx` | ✓ | - | ✓ | ✓ (WSL down) | - |
| Files (tree) | `tree.tsx` | text only | ✓ | ✓ | - | - |
| Search | `search.tsx` | ✓ (`role=status`) | ✓ | ✓ | - | - |
| Note editor | `pane-view.tsx`, `editor/` | text only | ✓ | ✓ (CONFLICT banner) | - | **partial** |
| Today | `today-pane.tsx` | - | ✓ | - | - | - |
| Tasks | `pages.tsx` | - | ✓ | - | - | - |
| Calendar | `calendar-pane.tsx` | - | ✓ | - | - | - |
| Tags | `tags.tsx` | - | ✓ | - | - | - |
| Properties | `properties-view.tsx` | - | ✓ | - | - | - |
| Collections | `collections.tsx` | - | ✓ | - | - | - |
| Graph | `graph.tsx` | - | ✓ | - | - | - |
| Canvas | `canvas.tsx` | - | - | - | - | - |
| Linked-from panel | `backlinks.tsx` | - | ✓ | - | - | - |
| On this page | `outline.tsx` | - | ✓ | - | - | - |
| Settings | `settings.tsx` | - | n/a | ✓ | - | - |
| Command palette | `palette.tsx` | - | ✓ | - | - | - |
| History, Import, Update, Shortcuts, Template picker, Task dialog | own files | partial | partial | ✓ (update, import) | - | - |

Missing everywhere: a proper **offline** state and a **read-only** state beyond the editor's; skeleton loading on Today/Tasks/Calendar/Tags.

Web: Home (hero, workflow, notebook preview), Download, Blog index, Blog post. No loading/error states (static).
Server: status page, auth. Inline styles only.
Mobile: Tabs: Browse (`index`), Capture, Search, Settings. All unstyled stubs.

## 6. Jargon in interface text

`CLAUDE.md` bans: backlinks, outline, properties, frontmatter, markdown, vault, wikilink. Hits found in user-visible strings:

| Where | Text | Replacement |
| --- | --- | --- |
| `chrome.tsx:74` | sidebar view title "Outline" | "On this page" |
| `chrome.tsx:75` / `core/commands/registry.ts:141` | "Properties" (view title and command) | "Details" |
| `properties-view.tsx:80,117,118` | "File properties", "All properties" (+ aria-labels) | "Details", "All details" |
| `properties-view.tsx:82,84,129` | "Open a note to see its properties." / "No properties in this note" / "Frontmatter properties you add here..." | "Open a note to see its details." / "No details in this note" / "Details you add show up here." |
| `settings.tsx:129` | "Render markdown in place; the cursor line shows raw source." | "Show formatting as you type; the line you are on shows plain text." |
| `outline.tsx`, `backlinks.tsx` | check aria-labels and empty-state copy (identifiers fine) | "On this page", "Linked from" |
| `apps/web` site/blog content | uses "Markdown" in marketing copy | Product copy should say "plain text notes" or ".md files"; confirm with owner. The ban is for the interface; marketing may need to name the format. |

Not found in UI text: "vault", "wikilink", "regex". The search panel may show a "regex" option label; verify when M4 touches `search.tsx`. Many other hits are code identifiers (`fileClass === "markdown"`, `"properties.open"`) and are allowed.

## 7. Risks and order

### Recommended order

1. **Packages first (no app change):** extend `packages/ui` (M1–M3). Add the missing tokens (`--on-accent`, panel/overlay already there, z-scale, free accent) to `theme.ts`, regenerate.
2. **`apps/server` web-ui.ts:** smallest and least risky. One inline HTML page, 4 raw colours, no framework, can import the generated token CSS as a string. Good proving ground for tokens alone.
3. **`apps/web`:** isolated marketing site, no behaviour. But it is the largest hex/radius offender and has its own palette, so decide first whether it follows the product tokens or keeps a brand layer (see Decisions).
4. **`apps/mobile`:** nearly unstyled, so it is a greenfield build on `ui/native`, not a restyle. Low risk, but needs the native component layer designed. Can run in parallel after step 1.
5. **`apps/desktop`:** last and in slices, because it holds all the behaviour. Suggested slices: (a) shell (rail, title, status, tabs), (b) overlays (menu, dialog, toast, palette), (c) sidebar views, (d) pages (Today/Tasks/Calendar), (e) settings and rare dialogs, (f) editor chrome.

The guide says "smallest first" and desktop is the biggest, but it is also the app that already matches the tokens best, so its risk is behaviour, not looks. Do it last.

### What could break

- **CodeMirror styling:** 7 `!important` rules in `.cm-editor` fight CM's own theme. `wysiwyg.ts` renders task checkboxes and chips. Restyling must not touch the byte-for-byte save guarantee (`tests/renderer/wysiwyg.test.ts`, `conformance.test.ts`). Chips in the editor are CM widgets and cannot be React components.
- **Two parallel variable families in desktop:** `--tn-*` plus ~40 aliases (`--surface-*`, `--text-*`, `--border-*`, `--sp-*`, `--radius-*`). These are the "legacy aliases" already. Deleting them needs a codemod across 593 CSS rules.
- **Accent drift test:** `tests/appearance/` asserts the accent hexes in `tokens.css` match `appearance.ts`. Changing accents to free-colour must update that test deliberately.
- **Web theme collision:** `apps/web/src/theme.css` defines `--muted`, `--line`, `--focus` with different meanings from the target tokens of the same name. Loading target tokens into web would silently change them.
- **Radius scale:** web's 12–24px radii contradict "nothing rounder than 10px". Decide before touching the site.
- **Icon stroke change (2px → 1.5px, 24-grid → 20px)** touches every screen at once and shifts optical size. Do it in one commit with screenshots.
- **Control height change (36px → 30px)** and icon button (32 → 28) conflicts with the 44px touch-target rule on mobile and the repo's `--tn-target-*` scale. Desktop only; mobile keeps touch sizes.
- **Perf budgets:** `tests/index/scale.test.ts` and `tests/renderer/conformance.test.ts` can miss under full-suite load (noted in `CLAUDE.md`). Don't read these as regressions.
- **Unrelated typecheck errors** in `wsl/helper-client.ts`, `wsl/launch-security.ts`, `tools/mcp-sidecar/src/index.ts` will muddy "typecheck still passes" checks. Capture the baseline first.
- **Dirty working tree:** `git status` shows 140+ changed files on branch `skill/takenote-meaningful-design`, including `apps/desktop/**` and `packages/ui`. Commit or stash before M1, or before/after screenshots will not mean anything.

## 8. Test coverage

- **Unit (Vitest):** ~35 test folders. UI-relevant: `tests/ui/` (calendar, collections, contrast, deferred-states, editor-chrome, keyboard, semantics, today-aggregate), `tests/renderer/` (wysiwyg, slash-menu, status, panes, conformance, error-text), `tests/design/` (dirty-prompt, close/discard contract), `tests/appearance/` (accent drift), `tests/web/` (site, notebook-preview), `tests/mobile/` (m0–m3).
- **Contrast:** `tests/ui/contrast.test.ts` exists, which covers the "accent on editor ≥ 4.5:1" rule for presets.
- **Visual regression:** none. No screenshot tests, no Storybook, no Playwright config. `smoke-artifacts/window.png` is a one-off.
- **Accessibility automation:** none (no axe). Roles and keyboard are covered by hand-written tests in `tests/ui/keyboard.test.ts` and `semantics.test.ts`.
- **End-to-end:** none found beyond `tools/scripts/verify-packaged.mjs`.
- **CI:** one workflow, `windows-latest`, runs `npm test`. No lint-for-CSS, no visual job.

M2 and M6 in the guide (snapshots, axe, CI jobs) therefore mean **adding the tooling from scratch**, not extending it.

## Summary

The repo is further along than the migration guide assumes. A generated token package (`packages/ui`) already carries a palette that matches the target almost value for value, and desktop CSS already uses it with a proper z-scale, a reduced-motion rule and a 4/6/8/pill radius set. What is missing is the component layer (8 of ~25 components exist, ~107 raw buttons and ~67 raw inputs still sit in desktop), a free accent colour, an `--on-accent` token, a System-theme media query, 1.5px 20px icons, and all of the testing tooling (visual, a11y, stylelint). The other apps are not alike: `web` is a marketing site with its own palette and off-scale radii, `server` is one inline HTML string, and `mobile` is an unstyled React Native stub that cannot consume CSS. A literal five-pass plan would create a second token package and fight the first one; the better plan is to extend `packages/ui`, then migrate server, web, mobile and desktop in that order.

## Top 5 risks

1. **Second source of truth.** Creating `packages/design-tokens` as written duplicates `packages/ui/src/theme.ts` and the `ui:tokens:check` CI gate. Mitigation: extend `packages/ui`.
2. **Editor regressions.** CodeMirror widgets and `!important` overrides carry the "save without edits changes nothing" guarantee. Mitigation: editor chrome last, run `wysiwyg` and `conformance` tests per slice.
3. **Prototype and guide disagree** (measure 720 vs 760, tab height, 30px controls vs the repo's 36px/44px touch rules). Mitigation: get an explicit ruling before M1 so five slices don't each pick differently.
4. **Dirty tree and no visual baseline.** 140+ uncommitted files and zero screenshot tooling mean "before" images are unreliable. Mitigation: commit first, add Playwright screenshots before changing any component.
5. **Mobile and server cannot take CSS components.** The guide's single `packages/ui` of React DOM components does not apply. Mitigation: share tokens and behaviour (neutral entry), build `ui/native` for mobile, and have server import generated CSS only.

## Decisions needed before M1

1. Extend `packages/ui` and keep `--tn-*` plus a short alias layer for the target names, or rename to `--app/--side/...` and keep `--tn-*` as deprecated aliases? Recommended: extend `packages/ui`, add the target names as the public tokens, keep `--tn-*` only until M6.
2. Does `apps/web` (marketing) adopt the product tokens and radii, or keep a brand layer (illustration colours, large radii)? Recommended: adopt product tokens for UI chrome, allow a documented `--art-*` set for illustrations.
3. Measure: 720 (guide) or 760 (prototype and repo)? Control height: 30 (guide) or 36 (repo)? Recommended: follow the prototype; keep 44px minimum on touch.
4. Should the working tree be committed first? Recommended yes, on this branch, before any M1 change.

---

## Re-run after M6 (2026-10-28)

`npm run audit:ui` (also pinned by `tests/ui/audit.test.ts`):

| Measure | Before (M0) | After |
| --- | --- | --- |
| Raw hex colours in CSS outside token and brand files | ~170 (web 162, server 4, desktop 3) | **0** |
| Raw `rgb()`/`hsl()` in CSS | 43 | **0** |
| Raw hex colours in TS/TSX (renderer, web, mobile, ui) | a handful (canvas colours, theme-color meta) | **0** |
| One-off px `border-radius` | 30 off-scale (web 12-34px) | **0** |
| Numeric `z-index` | 5 raw values in web, 2 in desktop | **0** |
| `!important` | 18 | 0 outside CodeMirror and the two reduced-motion resets (marked, enforced by stylelint) |
| Local copies of shared components in apps | Button/Dialog/Menu/Toast/Tabs/Palette/Notice/Card/Chip/ErrorDialog x ~10 | **0** (ESLint blocks new ones) |
| Interface strings with banned words | about 25 (see section 6) | **0** (`tests/ui/jargon.test.ts`) |
| Old UI libraries / CSS-in-JS / Tailwind | Tailwind 4, clsx, cva, tailwind-merge | **removed** |

What the checks do not cover, and why: marketing copy in `apps/web` still says "Markdown" when it names the file format; the desktop file tree rows, canvas inline editors and the note title input are app-specific controls and still use their own markup (they style with tokens); raw `<button>` rows in lists remain where a row, not a button, is the right element.

Verification is logic-only by decision: no screenshots, no browser-driven accessibility scan. Accessibility is covered by markup/ARIA assertions, keyboard-logic tests and contrast tests on every colour pair.
