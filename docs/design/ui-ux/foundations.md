# Visual foundations

Part of the [UI/UX guide](README.md). All token values here are **target values**, not descriptions of the current shared package.

## 1. Art direction: warm paper, precise controls

Use warm neutral surfaces, readable ink, and violet as a restrained identity color. Amber is a highlight/warning family, not a second primary action color. Green belongs to verified successful states, not an always-on decorative promise of safety.

In the working notebook:

- The editor is an uninterrupted paper surface, with no exterior card shadow.
- Sidebar and shell are one small tonal step away from the editor.
- Dividers are 1px; important controls have stronger boundaries than panel separators.
- Selected rows use a soft violet fill and a non-color indicator; do not add a drop shadow to each selected note.
- Shadows explain elevation: menus and dialogs float, files do not.
- Avoid glassmorphism, gradients behind text, background textures, rainbow tags, pulsing connection dots, and decorative illustrations beside every empty result.

## 2. Semantic color contract

Proposed canonical CSS prefix: `--tn-`. Components must consume semantic names rather than website primitives such as `--paper` or hardcoded colors.

| Token suffix (`--tn-…`) | Light | Dark | Intended use |
|---|---|---|---|
| `surface-app` | `#faf6ee` | `#151310` | Outer application shell |
| `surface-sidebar` | `#f3ecdd` | `#201c16` | File/search navigation |
| `surface-editor` | `#fffdf7` | `#191613` | Main writing/reading area |
| `surface-overlay` | `#fffdf7` | `#26211a` | Menu, dialog, sheet |
| `surface-input` | `#fffdf7` | `#191613` | Input fill |
| `surface-hover` | `#ece4d1` | `#322b22` | Hover over neutral surfaces |
| `surface-selected` | `#ece8ff` | `#342b50` | Selected note/tab option |
| `text-primary` | `#191817` | `#f4ecd9` | Content, labels, titles |
| `text-secondary` | `#4c4a45` | `#d9cfae` | Supporting copy and paths |
| `text-muted` | `#70695c` | `#b7ad9b` | Timestamps, hints; still readable |
| `border-subtle` | `#e5dcc8` | `#38322a` | Decorative section separation only |
| `border-control` | `#8a806d` | `#887d69` | Required field/control boundaries |
| `accent` | `#4f41d6` | `#ad9fff` | Links, focus, active indicators |
| `accent-hover` | `#4032ba` | `#c3b9ff` | Hovered accent action |
| `action-fill` | `#1d1c1a` | `#f4ecd9` | Primary button fill |
| `action-text` | `#fffdf7` | `#191817` | Text on primary action |
| `success-text` | `#356b2f` | `#b9e5a8` | Confirmed success text/icon |
| `success-surface` | `#e7f4df` | `#20321f` | Success notice fill |
| `warning-text` | `#805500` | `#ffdf8e` | Conflict/warning text/icon |
| `warning-surface` | `#fff3d1` | `#352a14` | Warning notice fill |
| `danger-text` | `#a53240` | `#ffadb5` | Error/destructive text/icon |
| `danger-surface` | `#fcebed` | `#3b2025` | Error notice fill |
| `selection` | `#e3dcff` | `#493968` | Editor text selection background |
| `code-surface` | `#f3ecdd` | `#26211a` | Inline code / fenced code background |
| `highlight-surface` | `#ffdf8e` | `#59451b` | Search match or editorial highlight |

### Usage rules

- `border-subtle` is intentionally quiet; it must not be the only way to identify an input, checkbox, selected control, or keyboard focus.
- Focus uses `accent`, 2px outline, 2px offset; ensure it is not clipped by overflow.
- Use primary text on `selection` and `highlight-surface`; never retain low-contrast syntax colors over selected text without checking them.
- Links are underlined within prose. A violet word alone is not sufficiently identifiable as a link.
- Primary actions use ink/cream, matching the website. Reserve violet fills for selected controls, not every “Save” button.
- Disabled controls keep a readable label and a clear reason nearby when important. Do not reduce opacity on an entire form or error panel.
- On system forced-colors/high-contrast mode, permit system colors, retain visible borders, and avoid relying on background fills alone.

### Contrast verification

Targets: WCAG 2.2 AA, at least **4.5:1** for normal text, **3:1** for large text and necessary non-text controls. Focus indicators must remain clearly distinguishable on adjacent surfaces.

Computed opaque sRGB examples (not a certification of the rendered app):

| Foreground / background | Ratio |
|---|---:|
| `#191817` / `#fffdf7` | 17.43:1 |
| `#70695c` / `#faf6ee` | 5.04:1 |
| `#4f41d6` / `#ece8ff` | 5.74:1 |
| `#8a806d` / `#fffdf7` | 3.83:1 |
| `#b7ad9b` / `#201c16` | 7.64:1 |
| `#ad9fff` / `#191613` | 7.88:1 |
| `#805500` / `#fff3d1` | 5.90:1 |

Verify every actual text/background pair, including hover, selection, banners, syntax highlighting, and opacity, before shipping. Website `--muted: #837d70` and pale decorative borders must not be copied blindly into functional text and control boundaries.

## 3. Typography

### Font roles

| Role | Target | Constraints |
|---|---|---|
| App UI | OS-native system sans stack | Windows Segoe UI; Apple system font; native Android font. No remote font request. |
| Editor | Existing system sans default; optional existing monospace preference only where supported | Preserve CodeMirror behavior. Default desktop 16px, mobile 17sp/pt. |
| Code and paths requiring alignment | Platform monospace stack | Paths in lists can remain sans; never use mono for all chrome. |
| Public website headings | Existing Fraunces with Georgia fallback | Brand/display role, not navigation or dense controls. |
| Public website body | Existing Inter with system fallback | Bundle/self-host appropriately licensed fonts before relying on them. |
| Handwritten decoration | Existing Caveat, website only | Decorative content; not instructions, buttons, or errors. |

App reading view headings may use a **bundled** display face in a later slice, but the first migration uses system fonts and adds no font dependency. A serif title is not a requirement to add a reading-mode feature.

### Type scale

| Role | Desktop / browser workspace | Native mobile | Weight / line height |
|---|---|---|---|
| Supporting metadata | 12px | 13 scalable units | 400–500 / 1.4 |
| Row label / control | 14px | 16 scalable units | 400–500 / 1.4 |
| Section / dialog heading | 18–20px | 20–22 scalable units | 600 / 1.3 |
| Note body | 16px | 17 scalable units | 400 / 1.65 |
| Note H1, if rendered | 32px | 28 scalable units | 600 / 1.2 |
| Note H2, if rendered | 24px | 23 scalable units | 600 / 1.3 |
| Empty-state title | 20px | 22 scalable units | 600 / 1.3 |

Use `rem` for DOM text where practical; numeric native font sizes must allow system font scaling. Sizes are defaults, not fixed ceilings. Do not set an artificially low `maxFontSizeMultiplier` to protect a layout.

- Prose width: default desktop max **760px**; reading text approximately 60–80 characters per line depending on font. Existing width preferences remain supported.
- Mobile content gutters: **20** logical units, **16** at narrow widths. Do not justify text.
- Metadata is not an excuse for 10px essential instructions.
- Product labels use sentence case. Small uppercase marketing eyebrows are not the app's section-heading style.
- Long note names may truncate in rows, with full accessible names and a details/menu path. Error messages and user-entered form values must not be truncated.

## 4. Spacing, sizing, and shape

Spacing tokens: `space-1=4`, `space-2=8`, `space-3=12`, `space-4=16`, `space-5=20`, `space-6=24`, `space-8=32`, `space-10=40`, `space-12=48`, `space-16=64` (CSS px / native logical units).

A 2px optical adjustment is permitted for an icon or baseline, not as a substitute for layout tokens.

| Element | Default |
|---|---|
| Icon / row corner | 6px radius |
| Button / input / selected row | 8px radius |
| Menu | 12px radius |
| Dialog / mobile sheet top corners | 16px radius |
| Website card | 20–28px radius; 34px download section allowed |
| Badge | Pill, only for short status/category text |
| Divider | 1px |
| Icon stroke | 1.75–2px at 20px viewbox-equivalent size |

**Density:** desktop rows 32px minimum in pointer layouts (legacy is 28px); controls 36px default; icon buttons at least 32×32px. Pointer targets never below 24×24px. Touch controls have at least **48×48** logical-unit hit areas, even when their visible icon is only 20–24px. Dense desktop controls expand in touch/coarse-pointer layouts. No overlapping invisible hit areas.

List rows with multi-line text or increased text size grow vertically. Do not center overflowing text inside a fixed-height row.

### Elevation and layering

| Layer | DOM z-index | Treatment |
|---|---:|---|
| Main panes | 0 | No shadow |
| Sticky toolbar | 10 | Border only |
| Menu / popover | 100 / 200 | Light: `0 4px 16px rgb(62 52 25 / .12)`; dark: `0 4px 16px rgb(0 0 0 / .32)` |
| Command palette | 300 | Overlay shadow + scrim |
| Dialog / modal sheet | 400 | Light: `0 16px 48px rgb(62 52 25 / .18)`; dark: `0 16px 48px rgb(0 0 0 / .45)` |
| Toast / tooltip | 500 / 600 | Must not cover the active decision controls |

Within a dialog, render its menu/popover inside the same modal layer or managed overlay root; a global z-index of 200 must not put its select menu behind a 400 dialog. Prefer one active modal. Native elevation follows visual intent, not literal CSS z-index copying.

## 5. Theme behavior

Settings offers **System / Light / Dark**. System is the default for a new installation. Honor an existing saved preference during migration; do not reset everyone to paper light.

- Resolve the effective theme before the first visible app frame where feasible.
- Update chrome, controls, CodeMirror theme, dialogs, selections, and scrollbars together.
- System changes apply only while System is selected.
- Theme changes preserve cursor, scroll, selection, content, and undo history.
- Website remains warm light by default; preview-only dark mode must not imply that the entire website changed theme.
- No remote resources are necessary to display either application theme.

## 6. Motion and feedback

| Event | Timing | Treatment |
|---|---|---|
| Hover / pressed color | 100ms | Color/opacity only; no row movement |
| Popover / dialog | 150ms | Fade; maximum 4px travel |
| Native sheet / navigation | Platform transition | Respect native reduced-motion settings |
| Sidebar resize | Direct manipulation | No animated lag |
| Save status | Immediate state update | No bounce, confetti, or success toast |
| Delayed loading hint | After ~200ms pending | Reserve space; do not flash a spinner for instant actions |

Reduced motion removes nonessential transitions, blinking cursors in decorative art, shimmer, parallax, and smooth scrolling. Never introduce a mandatory delay so a loading animation is visible.

## 7. Accessibility foundations

- Every icon action has a programmatic name; tooltips supplement labels, not replace them.
- Keyboard focus is visible on all interactive elements. Focus order follows the visual/reading order.
- Dialogs have an accessible title, modal semantics, contained focus, a close/cancel path, and focus return to the opener.
- Announce important save/error transitions, not word count and cursor position on every keystroke.
- Touch alternatives exist for hover, right-click, drag/reorder, and swipes.
- Test DOM UI at 200% zoom and reflow at 320 CSS px where applicable; code/table regions may scroll horizontally, page chrome must not.
- Test native Dynamic Type / Android font scaling at 200%, including dialog actions and the on-screen keyboard.
- Use logical CSS properties (`padding-inline`, `inset-inline-start`) and layout mirroring; user filenames and code remain directionally safe. Test long translated labels before claiming localization support.
- Decorative artwork is excluded from the accessibility tree; useful screenshots have concise descriptions and surrounding textual equivalents.
