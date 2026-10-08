# Phase 6 — Appearance + a11y baseline (Roadmap Step 9)

Status: implemented, logic-verified. Manual checks on real Windows/macOS,
200% OS text-scaling pass, and screen-reader walkthroughs (NVDA/VoiceOver)
remain not executed in this environment — no WCAG-cert claim is made.

## Slice 6a — Appearance foundation

- Settings: `accent` (violet/blue/graphite), `editorFont`
  (system/serif/mono, bundled stacks only), `zoomLevel` (0.8–2, persisted),
  `inlineTitle`. Schema-validated, field-by-field fallback, boot never breaks.
- Pure core module `packages/core/src/appearance/appearance.ts`: accent token
  table, font stacks, zoom clamp/step, `appearanceVars`, WCAG contrast helper.
- Appearance tab: Accent / Editor font / Zoom (−/+%/Reset) / Inline title.
- `App` effect owns all DOM writes (theme, accent attr, font/size/width vars,
  CSS zoom, `document.title` = active note → workspace → app) with no editor
  remount; `app.zoomIn/Out/Reset` dispatch into settings via CustomEvents.
- `[data-accent]` light/dark CSS overrides + drift tripwire test.
- 29 tests: settings round-trip/reject, zoom vectors, font mapping +
  no-remote-font guard, per-accent link AA on the editor surface.

## Slice 6b — Shell/chrome

- Zoom is one path: View-menu items dispatch commands into the persisted
  factor (Chromium native roles removed — they compounded invisibly).
  `Ctrl+=/-/0` (`Cmd` on mac) are ordinary, rebindable accelerators.
- Frame style (`auto`/`native`): pure merge module, profile-file persistence
  (`frame-style.json` under userData, outside workspaces), `app:frameStyle` /
  `app:setFrameStyle` sender-guarded IPC (inventory updated), restart-to-apply
  said honestly in Settings.
- Window floor 800×520 from pure `platform/window.ts`, applied at creation.
- 12 tests: keymap defaults, key→command matching, collision freedom, menu
  source audit, frame parse/read/merge, min-size pin.

## Slice 6c — Settings/dialog keyboard + focus

- Shared pure `moveRovingIndex` (arrows wrap, Home/End jump, axis-gated).
- Settings nav is a vertical tablist/tabpanel with roving tabindex.
- TabStrip tabs pattern: roving, auto-activation, Enter/Space, Delete closes.
- Context menu: arrows/Home/End, first-item focus, focus return to opener.
- File tree keyboard-reachable: selected/first row is the Tab stop, arrows
  move selection + focus together (incl. ←-to-parent); inputs keep keys.
- Skip-to-editor link + labelled `main` region. Dialog audited (no change:
  showModal layer, Tab-edge wrap, Escape policy, focus return present).
- 10 tests: mapping vectors + wiring tripwires.

## Slice 6d — Result-state semantics + live regions

- Status strip announces save/connection only (cursor/word chatter removed).
- Search announces once per settled query (`"2 files · 5 matches"`); grouped
  results, errors stay `alert`.
- Palette follows the combobox pattern (expanded/controls/activedescendant,
  disabled options marked, Home/End).
- Outline roves with Enter-to-navigate; backlinks actions are native buttons.
- 6 tests: summary vectors + wiring tripwires.

## Slice 6e — Contrast/typography/motion verification (this slice)

- Full-matrix contrast test (`tests/ui/contrast.test.ts`, 203 cases): every
  text token ≥ 4.5 on every surface it can sit on, all three accents as link
  text and focus indicators, scrollbar + input boundary ≥ 3:1.
- Fixes the matrix forced: scrollbar thumbs re-toned both themes
  (`#8a7d63` / `#857861`), editor find matches use the verified
  highlight pair (CodeMirror's default wash was near-invisible in dark mode).
- Typography floor: all DOM text ≥ 12px (14 rules bumped; exempt: SVG canvas
  labels, decorative pin glyph with labelled parent, scrollbar chrome).
- Reduced motion: global collapse audited (no animations, no smooth-scroll
  outside the guard). `mark` pins primary text in search results.

## Verification performed here

```bash
npm test        # 98 files passed, 3 skipped; 1119 passed, 6 skipped
npm run typecheck
npm run lint
npm run ui:tokens:check
```

Results: full suite green, typecheck clean, eslint clean, generated tokens
in sync. Manual platform/AT checks outstanding (see header) — recorded, not
claimed.

## Known gaps / deferred (per roadmap)

- Community themes marketplace, CSS snippets, translucency, custom icons,
  hardware-acceleration toggle: deferred, unchanged.
- Full i18n/RTL workspace flip: deferred (Unicode/RTL text correctness was
  already required and is unaffected).
- macOS in-window key matcher quirk (defaults resolve `cmd`, events
  `ctrlcmd`; menus cover mac natively): pre-existing, documented in 6b
  tests, untouched.
