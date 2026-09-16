# Design tokens — takenotes

Single source: `src/renderer/styles/tokens.css`. All components use semantic
variables; no scattered hex values.

## Surfaces

| Token | Dark | Light | Use |
|---|---|---|---|
| `--surface-app` | `#18191c` | `#f7f7f8` | title bar, status bar, rail |
| `--surface-sidebar` | `#1b1c20` | `#f1f2f4` | sidebar, tab strip inactive |
| `--surface-editor` | `#1e1f23` | `#fcfcfd` | editor canvas, active tab |
| `--surface-hover` | `#25262b` | `#ecedef` | row hover |
| `--surface-active` | `#2a2c32` | `#e5e7eb` | selected row |
| `--surface-overlay` | `#232429` | `#ffffff` | menus, palette, dialog |

## Borders / text

`--border-subtle` (`#303238` / `#d9dbdf`), `--border-strong`, `--text-primary`
(`#e7e8ea` / `#202124`), `--text-secondary` (`#a3a6ad` / `#5f636b`),
`--text-muted` (`#737780` / `#858a93`).

## Accent / status

Accent `#8b7cf6` dark, `#5b4fd6` light (AA on surfaces). Danger `#e06c75`,
warning `#d8a657`, success `#70b88b`. Accent is reserved for links, focus,
selection, active controls.

## Type / spacing / radius / motion / z-index

- UI font: `"Segoe UI Variable", "Segoe UI", system-ui, sans-serif`. UI 14/20,
  secondary 12/16. Editor body 16/26 (`--editor-font-size`, `--editor-line-height`
  user-configurable). Mono: `"Cascadia Code", "Cascadia Mono", Consolas, monospace`.
- Spacing base 4px: 2·4·6·8·12·16·20·24·32·40. Radius: 2 tiny, 4 controls,
  6 inputs/menus, 8 dialogs, 10 overlay max.
- Motion 100–180ms ease; `prefers-reduced-motion` disables. Z-index:
  base 0, sticky 10, dropdown 100, popover 200, command 300, dialog 400,
  toast 500, tooltip 600.
- Layout: title bar 40px, rail 44px, sidebar 240 (180–360), tabs 35px,
  rows 28px, indent 14px/level, status 24px, readable width 760px.
